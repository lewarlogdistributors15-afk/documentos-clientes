import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeStockHandler} from './handler.mjs';

const key='ab'.repeat(32);
const keyHash=createHash('sha256').update(key).digest('hex');
const origin='https://lewarlogdistributors15-afk.github.io';
const fixture={as_of:'2026-11-09',items:[{sku:'MODEL-1',available:0,cost:12000},{sku:'MODEL-2',available:12}]};
function setup(row=fixture){
  const calls=[];
  const handler=makeStockHandler({url:'https://supabase.example',serviceKey:'fixture-service-key',
    request:async(url,init)=>{
      assert.equal(init.headers.apikey,'fixture-service-key');
      calls.push(url);
      if(url.includes('portal_access_bootstrap')){
        const token=JSON.parse(init.body).p_session_token;
        return Response.json(token==='c'.repeat(32)?{ok:true,actor:{type:'client'}}:{ok:false});
      }
      return Response.json([url.endsWith('key_hash')?{key_hash:keyHash}:row]);
    }});
  return {handler,calls};
}
const client=token=>new Request('https://stock.example/',{method:'POST',headers:{Origin:origin},body:JSON.stringify({sessionToken:token,deviceId:'test-device'})});
const erp=value=>new Request('https://stock.example/',{method:'POST',headers:{'X-Lewar-Stock-Key':value}});
test('portal PIN and ERP key see the same stock and zero remains zero',async()=>{
  const {handler}=setup();
  const b2b=await handler(client('c'.repeat(32))),internal=await handler(erp(key));
  assert.equal(b2b.status,200);
  assert.equal(b2b.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(internal.status,200);
  const expected={schema:1,asOf:'2026-11-09',items:[{sku:'MODEL-1',available:0},{sku:'MODEL-2',available:12}]};
  assert.deepEqual(await b2b.json(),expected);
  assert.deepEqual(await internal.json(),expected);
});
test('unauthorized requests cannot read snapshot and writes are rejected',async()=>{
  const {handler,calls}=setup();
  assert.equal((await handler(erp('dc'.repeat(32)))).status,403);
  assert.equal((await handler(client('f'.repeat(32)))).status,401);
  assert.equal((await handler(new Request('https://stock.example/',{method:'PUT'}))).status,405);
  assert.ok(calls.every(url=>!url.endsWith('as_of,items')));
});
test('missing source is distinguishable from verified zero and malformed rows fail closed',async()=>{
  const empty=await setup({as_of:null,items:null}).handler(erp(key));
  assert.deepEqual(await empty.json(),{schema:1,asOf:null,items:[]});
  assert.equal((await setup({...fixture,items:[...fixture.items,fixture.items[0]]}).handler(erp(key))).status,503);
});
test('SAP on-hand stock stays distinct from availability and only catalog SKUs reach customers',async()=>{
  const {handler}=setup({as_of:'2026-11-10',items:[
    {sku:'AC8820 (110) F',onHand:11,portal:true,cost:999},
    {sku:'DETERGENTE ENSUEÑO',onHand:164,portal:false}
  ]});
  const b2b=await handler(client('c'.repeat(32))),internal=await handler(erp(key));
  assert.deepEqual(await b2b.json(),{schema:2,asOf:'2026-11-10',items:[{sku:'AC8820 (110) F',onHand:11}]});
  assert.equal((await internal.json()).items.length,2);
});
test('SAP price columns are returned only to the ERP, including items without stock',async()=>{
  const price={sku:'MODEL-NO-STOCK',description:'Fixture',evaluation:null,lastPurchase:1222,sale2:1800,purchase:1300,sale1:2000};
  const {handler,calls}=setup({as_of:'2026-11-10',items:fixture.items,price_items:[price]});
  const external=await handler(client('c'.repeat(32)));
  assert.equal((await external.json()).prices,undefined);
  assert.ok(calls.every(url=>!url.includes('price_items')));
  const internal=await handler(erp(key));
  assert.deepEqual((await internal.json()).prices,[price]);
  assert.ok(calls.some(url=>url.includes('price_items')));
});

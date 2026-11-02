import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hash,makeHandler} from '../../supabase/functions/aging-management/handler.ts';
const writer='w'.repeat(43),reader='r'.repeat(43),newReader='n'.repeat(43);
let row={writer_hash:await hash(writer),readers:[],revision:0,snapshot:null};let financialReads=0;
const handler=makeHandler({url:'https://private.test',serviceKey:'server-only',request:async(url,init)=>{const u=new URL(url);assert.equal(init.headers.apikey,'server-only');if(init.method==='PATCH'){const expected=Number(u.searchParams.get('revision').split('.')[1]);if(row.revision<expected)row={...row,...JSON.parse(init.body)};return new Response(null,{status:204});}const fields=u.searchParams.get('select').split(',');if(fields.includes('snapshot'))financialReads++;return Response.json([Object.fromEntries(fields.map(x=>[x,row[x]]))]);}});
const call=(method,key,body,origin='https://lewarlogdistributors15-afk.github.io')=>handler(new Request('https://private.test/functions/v1/aging-management',{method,headers:{...(key?{[method==='POST'?'X-Sync-Key':'Authorization']:method==='POST'?key:'Bearer '+key}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})}));
const payload=async(revision,key=reader)=>({revision,readers:[{email:'boss@example.test',name:'Test Manager',keyHash:await hash(key)}],snapshot:{aging:{date:'2026-10-30',name:'test.xlsx',uploadedAt:'2026-10-30T15:00:00Z'},invoices:[{key:'QA|1',clientCode:'QA',clientName:'Synthetic test client',number:'1',installment:'',posting:'2026-10-01',due:'2026-10-30',term:'NET 30',original:10000,balance:7000,agingBalance:7000,needsReview:false,privateContact:'MUST NOT LEAVE SOURCE'}],privateNotes:'DO NOT EXPORT'}});
test('public reads need no credential and writes still require the server key',async()=>{
 assert.equal((await call('GET')).status,503);assert.equal((await call('GET','z'.repeat(43))).status,503);assert.equal((await call('GET',null,null,'https://evil.test')).status,403);assert.equal((await call('DELETE')).status,405);assert.equal((await call('POST',null,await payload(1))).status,401);assert.equal((await call('POST',reader,await payload(1))).status,401);assert.equal(row.revision,0);
});
test('anonymous visitors receive only the minimal aging projection without viewer identities or secrets',async()=>{
 assert.equal((await call('POST',writer,await payload(1),null)).status,200);const response=await call('GET');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('access-control-allow-origin'),'https://lewarlogdistributors15-afk.github.io');const data=await response.json();assert.equal(data.invoices[0].balance,7000);assert.ok(!data.viewer);for(const privateValue of ['MUST NOT','writer_hash','readers','keyHash','boss@example.test'])assert.ok(!JSON.stringify(data).includes(privateValue));
 assert.equal((await call('GET',null,null,null)).status,200);assert.equal((await call('GET','z'.repeat(43))).status,200);
});
test('newer revisions win and updates are visible without a personal key',async()=>{
 const second=await payload(2,newReader);second.snapshot.invoices[0].balance=5000;assert.equal((await call('POST',writer,second,null)).status,200);assert.equal((await call('POST',writer,await payload(1),null)).status,200);assert.equal(row.revision,2);assert.equal((await (await call('GET')).json()).invoices[0].balance,5000);assert.equal((await call('POST',reader,await payload(3),null)).status,401);assert.equal(row.revision,2);
});
test('invalid payloads cannot replace the last valid aging',async()=>{
 const bad=await payload(3);bad.snapshot.invoices[0].balance=-1;assert.equal((await call('POST',writer,bad,null)).status,400);assert.equal(row.revision,2);
});

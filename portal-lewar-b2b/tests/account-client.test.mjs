import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../account.js', import.meta.url), 'utf8');
const sessionKey = 'lewar-client-session-v1';
const saleCatalog = {schema:3, items:[], salePrices:[{sku:'FIXTURE-1',cents:45000}]};
const flush = () => new Promise(resolve => setImmediate(resolve));

function openPortal(href) {
  const nodes = new Map();
  const location = new URL(href);
  const storage = new Map([[sessionKey,'fixture-session']]);
  const requests = new Map();
  const snapshots = [];
  const redirects = [];
  const document = {
    cookie:'',
    hidden:false,
    addEventListener(){},
    getElementById(id){
      if(!nodes.has(id))nodes.set(id,{addEventListener(){},classList:{contains(){return false},toggle(){}}});
      return nodes.get(id);
    }
  };
  const window = {
    URL, location, addEventListener(){}, enterAccountPortal(){},
    setPortalStock(snapshot){snapshots.push(snapshot);}
  };
  location.replace = destination => redirects.push(destination);
  runInNewContext(source,{
    window, document, navigator:{},
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    sessionStorage:{getItem:key=>storage.get(key),removeItem:key=>storage.delete(key)},
    setInterval(){}, AbortSignal,
    fetch(url){
      const endpoint = url.split('/').at(-1);
      return new Promise(resolve => requests.set(endpoint,resolve));
    }
  });
  return {storage, snapshots, redirects, nodes, requests,
    respond(endpoint, body, status=200){requests.get(endpoint)(Response.json(body,{status}));}};
}

test('Lewar HTTP pages redirect before requesting any portal data',()=>{
  for(const host of ['lewardistributors.com','www.lewardistributors.com']){
    const portal = openPortal('http://'+host+'/?source=old#catalogo');
    assert.deepEqual(portal.redirects,['https://www.lewardistributors.com/?source=old#catalogo']);
    assert.equal(portal.requests.size,0);
  }
});

for(const accountFirst of [true,false]){
  test('account 403 preserves the seller catalog session, account first: '+accountFirst,async()=>{
    const portal = openPortal('https://www.lewardistributors.com/');
    const rejectAccount = () => portal.respond('portal-account',{error:'Tu acceso no permite consultar estados de cuenta.'},403);
    const loadPrices = () => portal.respond('lewar-stock',saleCatalog);
    (accountFirst ? rejectAccount : loadPrices)();
    await flush();
    (accountFirst ? loadPrices : rejectAccount)();
    await flush();
    assert.deepEqual(portal.snapshots,[saleCatalog]);
    assert.equal(portal.storage.get(sessionKey),'fixture-session');
    assert.equal(portal.nodes.get('accountLogout').hidden,false);
    assert.match(portal.nodes.get('accountStatus').textContent,/no permite consultar/);
  });
}

test('account 401 clears an expired session and ignores in-flight prices',async()=>{
  const portal = openPortal('https://www.lewardistributors.com/');
  portal.respond('portal-account',{error:'Sesión vencida.'},401);
  await flush();
  portal.respond('lewar-stock',saleCatalog);
  await flush();
  assert.deepEqual(portal.snapshots,[null]);
  assert.equal(portal.storage.has(sessionKey),false);
});

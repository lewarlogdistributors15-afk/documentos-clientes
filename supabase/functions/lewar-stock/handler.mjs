import {masterAction,portalCustomization} from './portal-master.mjs';
import {replaceProductPhoto} from './product-photo.mjs';
const PORTAL_ORIGIN = 'https://lewarlogdistributors15-afk.github.io';
const ALLOWED_ORIGINS = new Set([PORTAL_ORIGIN, 'https://www.lewardistributors.com']);
const MAX_ITEMS = 10000;
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const validSku = value => typeof value === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}._ /+()"'-]{0,79}$/u.test(value);
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
function sameHash(left, right) {
  if (typeof right !== 'string' || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
function snapshot(row, internal) {
  if (row.as_of === null && row.items === null) return {schema:1,asOf:null,items:[]};
  if (!isoDate(row.as_of) || !Array.isArray(row.items) || row.items.length > MAX_ITEMS) throw Error('snapshot');
  const seen = new Set();
  const onHand = row.items.some(item => item.onHand !== undefined);
  const items = row.items.filter(item => internal || !onHand || item.portal === true).map(item => {
    const {sku}=item;
    const quantity=onHand?item.onHand:item.available;
    if (!validSku(sku) || sku !== sku.trim() || seen.has(sku) || !Number.isSafeInteger(quantity) || quantity < 0) throw Error('item');
    seen.add(sku);
    return onHand?{sku,onHand:quantity}:{sku,available:quantity};
  });
  const result={schema:onHand?2:1,asOf:row.as_of,items};
  if(internal&&row.price_items!=null){
    if(!Array.isArray(row.price_items)||row.price_items.length>MAX_ITEMS)throw Error('prices');
    result.prices=row.price_items.map(({sku,description,evaluation,lastPurchase,sale2,purchase,sale1})=>{
      if(!validSku(sku)||typeof description!=='string'||
        ![evaluation,lastPurchase,sale2,purchase,sale1].every(value=>value===null||Number.isSafeInteger(value)&&value>=0))throw Error('price');
      return {sku,description,evaluation,lastPurchase,sale2,purchase,sale1};
    });
  }
  if(!internal&&row.portal_sale_items!=null){
    if(!Array.isArray(row.portal_sale_items)||row.portal_sale_items.length>MAX_ITEMS)throw Error('sale prices');
    result.salePrices=row.portal_sale_items.map(({sku,cents})=>{
      if(!validSku(sku)||!Number.isSafeInteger(cents)||cents<=0)throw Error('sale price');
      return {sku,cents};
    });
  }
  return result;
}
export function makeStockHandler({url, serviceKey, request = fetch}) {
  return async req => {
    const origin = req.headers.get('Origin');
    const cors = ALLOWED_ORIGINS.has(origin) ? {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type, x-lewar-photo-sku, x-lewar-device'} : {};
    const headers = {'Cache-Control':'private, no-store', 'Content-Type':'application/json', 'Vary':'Origin', ...cors};
    const json = (value, status=200) => new Response(JSON.stringify(value),{status,headers});
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({error:'Origen no permitido.'},403);
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (req.method !== 'POST') return json({error:'Método no permitido.'},405);
    const key = req.headers.get('X-Lewar-Stock-Key');
    const service = {apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
    const rpc = (path, init={}) => request(url+'/rest/v1/'+path,{...init,headers:{...service,...init.headers},redirect:'error',signal:AbortSignal.timeout(10000)});
    const storage = (path,init) => request(url+'/storage/v1/'+path,{...init,headers:{...service,...init.headers},redirect:'error',signal:AbortSignal.timeout(20000)});
    const photoSku=req.headers.get('X-Lewar-Photo-Sku');
    try {
      let actor;
      if (key !== null) {
        if (origin || !/^[0-9a-f]{64}$/.test(key)) return json({error:'Acceso denegado.'},403);
        const settings = await rpc('lewar_stock_snapshot?id=eq.1&select=key_hash');
        if (!settings.ok) throw Error('settings');
        const [row] = await settings.json();
        if (!sameHash(await hash(key),row?.key_hash)) return json({error:'Acceso denegado.'},403);
      } else {
        let body,sku;
        if(photoSku!==null){
          try{
            sku=decodeURIComponent(photoSku);
            body={sessionToken:/^Bearer (\S+)$/.exec(req.headers.get('Authorization')||'')?.[1],deviceId:decodeURIComponent(req.headers.get('X-Lewar-Device')||'')};
          }catch{return json({error:'Solicitud inválida.'},400)}
        }else{
          const raw = await req.text();
          if (raw.length > 4096) return json({error:'Solicitud demasiado grande.'},413);
          try {body=JSON.parse(raw)} catch {return json({error:'Solicitud inválida.'},400)}
        }
        if (!body || typeof body.sessionToken !== 'string' || !/^[A-Za-z0-9_-]{32,200}$/.test(body.sessionToken) ||
          typeof body.deviceId !== 'string' || !body.deviceId || body.deviceId.length > 1000) return json({error:'Entra con tu PIN autorizado.'},401);
        const auth = await rpc('rpc/portal_access_bootstrap',{method:'POST',body:JSON.stringify({p_session_token:body.sessionToken,p_device_id:body.deviceId,p_customer_id:null})});
        if (!auth.ok) throw Error('auth');
        const access = await auth.json();
        if (!access.ok) return json({error:'Sesión inválida o vencida.'},401);
        const sellerCatalogRead = access.actor?.type === 'staff' && access.actor.role === 'seller' &&
          photoSku === null && !body.action;
        if (access.actor?.type !== 'client' && !['admin','billing'].includes(access.actor?.role) && !sellerCatalogRead) {
          return json({error:'Acceso denegado.'},403);
        }
        if(photoSku!==null)return await replaceProductPhoto({req,sku,actor:access.actor,rpc,json,url,storage});
        if(body.action)return await masterAction(rpc,json,access,body);
        actor=access.actor;
      }
      const columns=key===null?'as_of,items,portal_sale_items':'as_of,items,price_items';
      const response = await rpc('lewar_stock_snapshot?id=eq.1&select='+columns);
      if (!response.ok) throw Error('stock');
      const [row] = await response.json();
      const data=snapshot(row,key!==null);
      if(actor)Object.assign(data,await portalCustomization(rpc,actor).catch(()=>({})));
      // El inventario numérico es exclusivamente interno. A cuentas cliente
      // solo se envía el estado calculado; nunca cantidades ni ajustes de stock.
      if(actor && !['owner','admin'].includes(data.managementRole)){
        const overrides=new Map((data.productEdits||[])
          .filter(edit=>Number.isSafeInteger(edit.available_qty)&&edit.available_qty>=0)
          .map(edit=>[String(edit.sku).trim().toUpperCase(),edit.available_qty]));
        data.items=data.items.map(item=>{
          const actual=overrides.get(String(item.sku).trim().toUpperCase());
          const quantity=actual===undefined?(item.onHand??item.available):actual;
          return {sku:item.sku,status:quantity===0?'out':quantity<5?'low':'available'};
        });
        data.schema=3;
        data.productEdits=(data.productEdits||[]).map(({sku,sale_cents,photo_url})=>({
          sku,sale_cents,photo_url
        }));
      }
      return json(data);
    } catch {
      return json({error:photoSku!==null?'No se pudo guardar la foto. Intenta nuevamente.':'No se pudo consultar el inventario de Lewar.'},503);
    }
  };
}

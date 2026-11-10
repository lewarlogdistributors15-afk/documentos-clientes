const PORTAL_ORIGIN = 'https://lewarlogdistributors15-afk.github.io';
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
  return result;
}
export function makeStockHandler({url, serviceKey, request = fetch}) {
  return async req => {
    const origin = req.headers.get('Origin');
    const cors = origin === PORTAL_ORIGIN ? {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type'} : {};
    const headers = {'Cache-Control':'private, no-store', 'Content-Type':'application/json', 'Vary':'Origin', ...cors};
    const json = (value, status=200) => new Response(JSON.stringify(value),{status,headers});
    if (origin && origin !== PORTAL_ORIGIN) return json({error:'Origen no permitido.'},403);
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (req.method !== 'POST') return json({error:'Método no permitido.'},405);
    const key = req.headers.get('X-Lewar-Stock-Key');
    const service = {apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
    const rpc = (path, init={}) => request(url+'/rest/v1/'+path,{...init,headers:service,redirect:'error',signal:AbortSignal.timeout(10000)});
    try {
      if (key !== null) {
        if (origin || !/^[0-9a-f]{64}$/.test(key)) return json({error:'Acceso denegado.'},403);
        const settings = await rpc('lewar_stock_snapshot?id=eq.1&select=key_hash');
        if (!settings.ok) throw Error('settings');
        const [row] = await settings.json();
        if (!sameHash(await hash(key),row?.key_hash)) return json({error:'Acceso denegado.'},403);
      } else {
        const raw = await req.text();
        if (raw.length > 4096) return json({error:'Solicitud demasiado grande.'},413);
        let body; try {body=JSON.parse(raw)} catch {return json({error:'Solicitud inválida.'},400)}
        if (!body || typeof body.sessionToken !== 'string' || !/^[A-Za-z0-9_-]{32,200}$/.test(body.sessionToken) ||
          typeof body.deviceId !== 'string' || !body.deviceId || body.deviceId.length > 1000) return json({error:'Entra con tu PIN autorizado.'},401);
        const auth = await rpc('rpc/portal_access_bootstrap',{method:'POST',body:JSON.stringify({p_session_token:body.sessionToken,p_device_id:body.deviceId,p_customer_id:null})});
        if (!auth.ok) throw Error('auth');
        const access = await auth.json();
        if (!access.ok) return json({error:'Sesión inválida o vencida.'},401);
        if (access.actor?.type !== 'client' && !['admin','billing'].includes(access.actor?.role)) return json({error:'Acceso denegado.'},403);
      }
      const columns=key===null?'as_of,items':'as_of,items,price_items';
      const response = await rpc('lewar_stock_snapshot?id=eq.1&select='+columns);
      if (!response.ok) throw Error('stock');
      const [row] = await response.json();
      return json(snapshot(row,key!==null));
    } catch {
      return json({error:'No se pudo consultar el inventario de Lewar.'},503);
    }
  };
}

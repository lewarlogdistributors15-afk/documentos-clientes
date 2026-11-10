const skuPattern=/^[\p{L}\p{N}][\p{L}\p{N}._ /+()"'\-]{0,79}$/u;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const saveHeaders={'Prefer':'resolution=merge-duplicates,return=minimal'};
async function read(rpc,path){
  const response=await rpc(path);
  if(!response.ok)throw Error('master read');
  return response.json();
}
async function save(rpc,table,record){
  const response=await rpc(table,{method:'POST',headers:saveHeaders,body:JSON.stringify(record)});
  if(!response.ok)throw Error('master write');
}
export async function isMaster(rpc,actor){
  if(actor?.type!=='staff'||actor.role!=='admin'||!actor.id)return false;
  const [owner]=await read(rpc,'lewar_b2b_owner?id=eq.true&select=staff_id');
  return owner?.staff_id===actor.id;
}
export async function isCatalogSku(rpc,sku){
  if(typeof sku!=='string'||!skuPattern.test(sku))return false;
  const params=new URLSearchParams({sku:'eq.'+sku,visible:'eq.true',select:'sku',limit:'1'});
  return (await read(rpc,'b2b_inventory?'+params)).length>0;
}
function photo(value){
  if(value===null)return null;
  if(typeof value!=='string'||value.length>2048)throw Error('photo');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.')||
    /^[\d.]+$/.test(url.hostname)||/\.(?:localhost|local|internal|test)$/i.test(url.hostname))throw Error('photo');
  return url.href;
}
export async function masterAction(rpc,json,access,body){
  if(!await isMaster(rpc,access.actor))return json({error:'Solo la cuenta maestra puede editar el portal.'},403);
  const products='lewar_b2b_product_edits';
  const customers='lewar_b2b_customer_edits';
  const choices=Array.isArray(access.customers)?access.customers:[];
  if(body.action==='masterRead'){
    const [productEdits,customerEdits]=await Promise.all([
      read(rpc,products+'?select=sku,sale_cents,photo_url&limit=1000'),
      read(rpc,customers+'?select=customer_id,display_name,contact_email&limit=1000'),
    ]);
    return json({ok:true,products:productEdits,customers:choices.map(({id,name,clientCode})=>({id,name,clientCode})),customerEdits});
  }
  const audit={updated_by:access.actor.id,updated_at:new Date().toISOString()};
  if(body.action==='masterProduct'){
    const {sku,saleCents,photoUrl}=body;
    if(typeof sku!=='string'||!skuPattern.test(sku)||
      saleCents!==null&&(!Number.isSafeInteger(saleCents)||saleCents<=0||saleCents>100000000))return json({error:'Revisa el modelo y el precio.'},400);
    let photo_url;
    try{photo_url=photo(photoUrl)}catch{return json({error:'Usa un enlace HTTPS válido para la foto.'},400)}
    if(!await isCatalogSku(rpc,sku))return json({error:'El modelo no está en el catálogo B2B.'},404);
    await save(rpc,products,{sku,sale_cents:saleCents,photo_url,...audit});
    return json({ok:true});
  }
  if(body.action==='masterCustomer'){
    const {customerId,displayName,contactEmail}=body;
    if(!choices.some(customer=>customer.id===customerId))return json({error:'Selecciona un cliente activo.'},404);
    if(displayName!==null&&(typeof displayName!=='string'||!displayName.trim()||displayName.length>150)||
      contactEmail!==null&&(typeof contactEmail!=='string'||contactEmail.length>254||!emailPattern.test(contactEmail)))
      return json({error:'Revisa el nombre visible y el correo.'},400);
    await save(rpc,customers,{customer_id:customerId,display_name:displayName?.trim()??null,contact_email:contactEmail,...audit});
    return json({ok:true});
  }
  return json({error:'Acción no válida.'},400);
}
export async function portalCustomization(rpc,actor){
  const products=read(rpc,'lewar_b2b_product_edits?select=sku,sale_cents,photo_url&limit=1000');
  const owner=isMaster(rpc,actor);
  const profile=actor.type==='client'?read(rpc,'lewar_b2b_customer_edits?'+new URLSearchParams({customer_id:'eq.'+actor.id,select:'display_name',limit:'1'})):Promise.resolve([]);
  const [productEdits,master,[customer]]=await Promise.all([products,owner,profile]);
  return {productEdits:productEdits.map(({sku,sale_cents,photo_url})=>({sku,sale_cents,photo_url})),master,customerDisplayName:customer?.display_name??null};
}

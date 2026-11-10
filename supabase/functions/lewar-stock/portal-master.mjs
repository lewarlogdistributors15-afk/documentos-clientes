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
async function managementRole(rpc,actor){
  if(actor?.type!=='staff'||!actor.id||!['admin','billing'].includes(actor.role))return null;
  if(await isMaster(rpc,actor))return 'owner';
  const [access]=await read(rpc,'lewar_b2b_staff_access?'+new URLSearchParams({staff_id:'eq.'+actor.id,select:'portal_role',limit:'1'}));
  if(access?.portal_role==='admin'&&actor.role==='admin')return 'admin';
  if(access?.portal_role==='catalog'&&actor.role==='billing')return 'catalog';
  return null;
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
  const role=await managementRole(rpc,access.actor);
  if(!role)return json({error:'Esta cuenta no tiene permiso para editar el Portal General.'},403);
  const products='lewar_b2b_product_edits';
  const customers='lewar_b2b_customer_edits';
  const choices=role==='catalog'?[]:Array.isArray(access.customers)?access.customers:[];
  if(body.action==='masterRead'){
    const fields=role==='owner'?'sku,sale_cents,available_qty,photo_url':'sku,sale_cents,available_qty';
    const [productEdits,customerEdits]=await Promise.all([
      read(rpc,products+'?select='+fields+'&limit=1000'),
      role==='catalog'?[]:read(rpc,customers+'?select=customer_id,display_name,contact_email&limit=1000'),
    ]);
    return json({ok:true,products:productEdits,customers:choices.map(({id,name,clientCode})=>({id,name,clientCode})),customerEdits});
  }
  if(body.action==='masterProduct'){
    const {sku,saleCents,availableQty,photoUrl}=body;
    const setAvailable=Object.hasOwn(body,'availableQty'),setPhoto=Object.hasOwn(body,'photoUrl');
    if(setPhoto&&role!=='owner')return json({error:'Solo la cuenta maestra puede sustituir fotos.'},403);
    if(typeof sku!=='string'||!skuPattern.test(sku)||
      saleCents!==null&&(!Number.isSafeInteger(saleCents)||saleCents<=0||saleCents>100000000)||
      setAvailable&&availableQty!==null&&(!Number.isSafeInteger(availableQty)||availableQty<0||availableQty>1000000))
      return json({error:'Revisa el modelo, el precio y las unidades disponibles.'},400);
    let photo_url=null;
    try{if(setPhoto)photo_url=photo(photoUrl)}catch{return json({error:'Usa un enlace HTTPS válido para la foto.'},400)}
    if(!await isCatalogSku(rpc,sku))return json({error:'El modelo no está en el catálogo B2B.'},404);
    const response=await rpc('rpc/lewar_b2b_set_product_offer',{method:'POST',body:JSON.stringify({
      p_sku:sku,p_sale_cents:saleCents,p_available_qty:availableQty??null,p_set_available:setAvailable,
      p_photo_url:photo_url,p_set_photo:setPhoto,p_staff_id:access.actor.id,
    })});
    if(!response.ok)throw Error('product offer');
    if(await response.json()!==true)return json({error:'No se pudo guardar el modelo con este acceso.'},403);
    return json({ok:true});
  }
  if(body.action==='masterCustomer'){
    if(role==='catalog')return json({error:'Tu cuenta solo puede editar precios y disponibilidad.'},403);
    const {customerId,displayName,contactEmail}=body;
    if(!choices.some(customer=>customer.id===customerId))return json({error:'Selecciona un cliente activo.'},404);
    if(displayName!==null&&(typeof displayName!=='string'||!displayName.trim()||displayName.length>150)||
      contactEmail!==null&&(typeof contactEmail!=='string'||contactEmail.length>254||!emailPattern.test(contactEmail)))
      return json({error:'Revisa el nombre visible y el correo.'},400);
    await save(rpc,customers,{customer_id:customerId,display_name:displayName?.trim()??null,contact_email:contactEmail,
      updated_by:access.actor.id,updated_at:new Date().toISOString()});
    return json({ok:true});
  }
  return json({error:'Acción no válida.'},400);
}
export async function portalCustomization(rpc,actor){
  const products=read(rpc,'lewar_b2b_product_edits?select=sku,sale_cents,available_qty,photo_url&limit=1000');
  const role=managementRole(rpc,actor);
  const profile=actor.type==='client'?read(rpc,'lewar_b2b_customer_edits?'+new URLSearchParams({customer_id:'eq.'+actor.id,select:'display_name',limit:'1'})):Promise.resolve([]);
  const [productEdits,managementRoleName,[customer]]=await Promise.all([products,role,profile]);
  return {productEdits:productEdits.map(({sku,sale_cents,available_qty,photo_url})=>({sku,sale_cents,available_qty,photo_url})),master:managementRoleName==='owner',...(managementRoleName?{managementRole:managementRoleName}:{}),customerDisplayName:customer?.display_name??null};
}

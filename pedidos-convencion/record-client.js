const RECORD_API='https://lewar-convencion-whirlpool.emmatowwerz15.chatgpt.site/api/registro';
const LOCAL_ORDERS_KEY='lewar-convencion-orders-v1';
const LOCAL_EVENTS_KEY='lewar-convencion-events-v1';

function jsonClone(value){return JSON.parse(JSON.stringify(value))}
function localOrders(){try{return JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY)||'[]')}catch{return []}}
function saveLocalOrders(orders){localStorage.setItem(LOCAL_ORDERS_KEY,JSON.stringify(orders))}
function localEvents(){try{return JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY)||'[]')}catch{return []}}
function saveLocalEvents(events){localStorage.setItem(LOCAL_EVENTS_KEY,JSON.stringify(events))}
function localRegistryHasOrders(){return localOrders().length>0}
function addLocalEvent(order,action,actor='Registro local de este navegador'){
 const events=localEvents();
 events.push({id:order.id,version:order.version,action,created_at:order.updatedAt||order.createdAt||new Date().toISOString(),actor,data:jsonClone(order)});
 saveLocalEvents(events);
}
function upsertLocalOrder(order){
 const orders=localOrders(),i=orders.findIndex(o=>o.id===order.id);
 if(i>=0)orders[i]=order;else orders.push(order);
 saveLocalOrders(orders);
}
function localRecordRequest(action,body){
 const now=new Date().toISOString(),orders=localOrders();
 if(action==='create'){
  const prior=orders.find(o=>o.requestKey&&o.requestKey===body.requestKey)||orders.find(o=>o.id===body.order?.id);
  if(prior)return {order:prior,receipt:body.receipt||prior.receipt||crypto.randomUUID(),local:true};
  const order={...jsonClone(body.order),version:1,status:'activa',createdAt:now,updatedAt:now,emailState:'guardado_local',requestKey:body.requestKey};
  upsertLocalOrder(order);addLocalEvent(order,'creada');
  return {order,receipt:body.receipt||crypto.randomUUID(),local:true};
 }
 if(action==='edit'){
  const previous=orders.find(o=>o.id===body.id);
  const order={...jsonClone(body.order),id:body.id,version:(Number(body.version)||previous?.version||0)+1,status:'activa',createdAt:previous?.createdAt||body.order?.createdAt||now,updatedAt:now,changeReason:body.reason||'',emailState:'guardado_local'};
  upsertLocalOrder(order);addLocalEvent(order,'modificada');
  return {order,receipt:crypto.randomUUID(),local:true};
 }
 if(action==='cancel'){
  const previous=orders.find(o=>o.id===body.id);
  if(!previous)throw Error('No se encontró una copia local de esta orden.');
  const order={...previous,version:(Number(body.version)||previous.version||0)+1,status:'cancelada',updatedAt:now,changeReason:body.reason||'',emailState:'guardado_local'};
  upsertLocalOrder(order);addLocalEvent(order,'cancelada');
  return {order,receipt:crypto.randomUUID(),local:true};
 }
 throw Error('Acción de registro no disponible.');
}
async function recordRequest(action,body){
 const token=sessionStorage.getItem('lewar-session');
 if(token==='local')return localRecordRequest(action,body);
 try{
  const res=await fetch(RECORD_API,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(8000)});
  let result={};try{result=await res.json()}catch{}
  if(!res.ok)throw Object.assign(Error(result.error||('Error del registro ('+res.status+')')),{status:res.status});
  return result;
 }catch(error){
  if(['create','edit','cancel'].includes(action)){
   console.warn('Registro central no disponible; usando respaldo local.',error);
   return localRecordRequest(action,body);
  }
  throw error;
 }
}
function localRegistryQuery(params={}){
 const q=String(params.id||params.q||'').toLowerCase().trim();
 if(params.id){
  const order=localOrders().find(o=>o.id===params.id);
  if(!order)throw Error('No se encontró la orden en el registro local.');
  const events=localEvents().filter(e=>e.id===params.id).sort((a,b)=>a.version-b.version);
  return {order,events,email:'Registro local de este navegador'};
 }
 const offset=Math.max(0,Number(params.offset)||0);
 const filtered=localOrders().filter(o=>!q||[o.id,o.cliente,o.vendedor,o.contacto,o.correo].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)));
 return {orders:filtered.slice(offset,offset+100),more:filtered.length>offset+100,email:'Registro local de este navegador'};
}
async function orderPdf(data){const res=await fetch('./lewar-logo.png');if(!res.ok)throw Error('No se pudo cargar el logo');return createOrderPdf(data,await res.arrayBuffer())}
const PENDING_EMAIL_KEY='lewar-pending-order-emails-v1';
function pendingEmails(){try{return JSON.parse(localStorage.getItem(PENDING_EMAIL_KEY)||'[]')}catch{return []}}
function savePendingEmails(items){localStorage.setItem(PENDING_EMAIL_KEY,JSON.stringify(items))}
function pendingEmailFor(id){return pendingEmails().some(x=>x.data?.id===id)}
function queuePendingEmail(data,receipt){
 const items=pendingEmails();
 if(!items.some(x=>x.data?.id===data.id&&x.data?.version===data.version)){
  items.push({data:jsonClone(data),receipt,queuedAt:new Date().toISOString(),attempts:0});
  savePendingEmails(items);
 }
}
function buildEmailPayload(data){
 const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
 const kind=data.status==='cancelada'?'CANCELACIÓN':data.version>1?'MODIFICACIÓN':'PEDIDO';
 const subject=kind+' '+data.id+' | Versión '+data.version+' | '+data.cliente;
 const fields={
  _subject:subject,_template:'table',_captcha:'false',_replyto:data.correo,_url:location.href,
  'Número de orden':data.id,'Versión':data.version,'Estado':data.status,'Fecha':data.date,'Último cambio':data.updatedAt,
  'Cliente':data.cliente,'Tipo':data.tipo,'Contacto':data.contacto,'Teléfono':data.telefono,'Correo del cliente':data.correo,
  'Vendedor':data.vendedor,
  'Artículos':data.lines.map(l=>`${l.quantity} x ${l.product.modelo} | ${money(l.unit)} c/u | ${money(l.total/100)}${l.manual?' | PRECIO MANUAL':''}`).join('\n'),
  'Subtotal':money(data.total/100),'Motivo del cambio':data.changeReason||'No aplica','Notas':data.nota||'Ninguna',
  'Condiciones':data.status==='cancelada'?'ORDEN CANCELADA. No procesar.':'Sujeto a disponibilidad y confirmación. Impuestos, entrega y términos por confirmar.'
 };
 return {subject,fields,money};
}
async function sendOrderEmailNow(data,bytes){
 const {fields}=buildEmailPayload(data);
 const formData=new FormData();
 for(const [name,value] of Object.entries(fields))formData.append(name,String(value??''));
 formData.append('attachment',new Blob([bytes],{type:'application/pdf'}),data.id+'-v'+data.version+'.pdf');
 const res=await fetch('https://formsubmit.co/ajax/invoice@lewardistributors.com',{method:'POST',headers:{Accept:'application/json'},body:formData,signal:AbortSignal.timeout(12000)});
 let payload=null;try{payload=await res.json()}catch{}
 if(!res.ok||payload?.success===false)throw Error(payload?.message||('FormSubmit '+res.status));
 return true;
}
async function submitOrderEmail(data,bytes,receipt){
 const {money}=buildEmailPayload(data);
 sessionStorage.setItem('ultimo-pedido',JSON.stringify({id:data.id,total:money(data.total/100)}));
 sessionStorage.setItem('order-receipt',JSON.stringify({id:data.id,version:data.version,receipt}));
 try{let binary='';for(const b of bytes)binary+=String.fromCharCode(b);sessionStorage.setItem('ultimo-pedido-pdf',btoa(binary))}catch{sessionStorage.removeItem('ultimo-pedido-pdf')}
 try{
  await sendOrderEmailNow(data,bytes);
  const remaining=pendingEmails().filter(x=>!(x.data?.id===data.id&&x.data?.version===data.version));
  savePendingEmails(remaining);
  return {sent:true};
 }catch(error){
  console.warn('Correo automático pendiente; se reintentará.',error);
  queuePendingEmail(data,receipt);
  return {sent:false,queued:true,error:String(error?.message||error)};
 }
}
let retryingPendingEmails=false;
async function retryPendingEmails(){
 if(retryingPendingEmails||!navigator.onLine)return;
 const items=pendingEmails();if(!items.length)return;
 retryingPendingEmails=true;
 const keep=[];
 for(const item of items){
  try{
   const bytes=await orderPdf(item.data);
   await sendOrderEmailNow(item.data,bytes);
  }catch(error){
   keep.push({...item,attempts:(item.attempts||0)+1,lastAttempt:new Date().toISOString(),lastError:String(error?.message||error)});
  }
 }
 savePendingEmails(keep);
 retryingPendingEmails=false;
}
window.addEventListener('online',retryPendingEmails);
setTimeout(retryPendingEmails,1500);
setInterval(retryPendingEmails,60000);

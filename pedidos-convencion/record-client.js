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
function submitOrderEmail(data,bytes,receipt){const pdf=new Blob([bytes],{type:'application/pdf'}),money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);const form=document.createElement('form');form.method='POST';form.action='https://formsubmit.co/invoice@lewardistributors.com';form.enctype='multipart/form-data';form.style.display='none';const kind=data.status==='cancelada'?'CANCELACIÓN':data.version>1?'MODIFICACIÓN':'PEDIDO';const fields={_subject:kind+' '+data.id+' | Versión '+data.version+' | '+data.cliente,_template:'table',_captcha:'false',_replyto:data.correo,_next:new URL('./pedido-recibido.html',location.href).href,'Número de orden':data.id,'Versión':data.version,'Estado':data.status,'Fecha':data.date,'Último cambio':data.updatedAt,'Cliente':data.cliente,'Tipo':data.tipo,'Contacto':data.contacto,'Teléfono':data.telefono,'Correo del cliente':data.correo,'Vendedor':data.vendedor,'Artículos':data.lines.map(l=>`${l.quantity} x ${l.product.modelo} | ${money(l.unit)} c/u | ${money(l.total/100)}${l.manual?' | PRECIO MANUAL':''}`).join('\n'),'Subtotal':money(data.total/100),'Motivo del cambio':data.changeReason||'No aplica','Notas':data.nota||'Ninguna','Condiciones':data.status==='cancelada'?'ORDEN CANCELADA. No procesar.':'Sujeto a disponibilidad y confirmación. Impuestos, entrega y términos por confirmar.'};for(const [name,value]of Object.entries(fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(value??'');form.append(input)}const file=document.createElement('input');file.type='file';file.name='attachment';const transfer=new DataTransfer();transfer.items.add(new File([pdf],data.id+'-v'+data.version+'.pdf',{type:'application/pdf'}));file.files=transfer.files;form.append(file);if(file.files.length!==1)throw Error('No se pudo adjuntar el PDF');sessionStorage.setItem('ultimo-pedido',JSON.stringify({id:data.id,total:money(data.total/100)}));sessionStorage.setItem('order-receipt',JSON.stringify({id:data.id,version:data.version,receipt}));try{let binary='';for(const b of bytes)binary+=String.fromCharCode(b);sessionStorage.setItem('ultimo-pedido-pdf',btoa(binary))}catch{sessionStorage.removeItem('ultimo-pedido-pdf')}document.body.append(form);form.submit();}

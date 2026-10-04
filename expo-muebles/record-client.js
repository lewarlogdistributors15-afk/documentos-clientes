const RECORD_API='https://aznoakixjklsxuwuyshw.supabase.co/functions/v1/registro';
async function fetchWithTimeout(url,options,ms){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
 try{return await fetch(url,{...(options||{}),signal:controller.signal})}finally{clearTimeout(timer)}
}
async function recordRequest(action,body){const pin=sessionStorage.getItem('lewar-pin');const res=await fetchWithTimeout(RECORD_API,{method:'POST',headers:{'Content-Type':'application/json',...(pin?{'x-lewar-pin':pin}:{})},body:JSON.stringify({action,...body})},25000);const result=await res.json();if(!res.ok)throw Error(result.error||'No se pudo guardar la orden');return result;}
async function orderPdf(data){const res=await fetch('./lewar-logo.png');if(!res.ok)throw Error('No se pudo cargar el logo');return createOrderPdf(data,await res.arrayBuffer())}
const orderMoney=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
function bytesToBase64(bytes){let binary='';const step=0x8000;for(let i=0;i<bytes.length;i+=step)binary+=String.fromCharCode(...bytes.subarray(i,i+step));return btoa(binary)}
function base64ToBytes(b64){return Uint8Array.from(atob(b64),c=>c.charCodeAt(0))}
function durableSet(key,value){try{localStorage.setItem(key,value);return true}catch{}try{sessionStorage.setItem(key,value);return true}catch{}return false}
function durableGet(key){try{const value=localStorage.getItem(key);if(value!==null)return value}catch{}try{return sessionStorage.getItem(key)}catch{}return null}
function durableRemove(key){try{localStorage.removeItem(key)}catch{}try{sessionStorage.removeItem(key)}catch{}}
function hasQueuedOrderEmail(){return !!durableGet('queued-order-email')}
function queueOrderEmail(data,bytes,receipt){
 const pdfBase64=bytesToBase64(bytes);
 sessionStorage.setItem('ultimo-pedido',JSON.stringify({id:data.id,total:orderMoney(data.total/100)}));
 sessionStorage.setItem('ultimo-pedido-pdf',pdfBase64);
 sessionStorage.setItem('order-receipt',JSON.stringify({id:data.id,version:data.version,receipt}));
 durableSet('queued-order-email',JSON.stringify({data,receipt}));
 durableSet('queued-order-pdf',pdfBase64);
}
async function submitOrderEmail(data,bytes,receipt){
 const kind=data.status==='cancelada'?'CANCELACIÓN':data.version>1?'MODIFICACIÓN':'PEDIDO';
 const form=new FormData();
 const fields={
  access_key:'67cf9021716b4ded9462e1ca4b7c6c42',
  subject:kind+' '+data.id+' | Versión '+data.version+' | '+data.cliente,
  from_name:'Lewar LogDistributors · Expo Muebles',
  reply_to:data.correo,
  email:data.correo,
  cc:'rolivencia@lewardistributors.com,lewarcorpcredito@lewardistributors.com,invoice@lewardistributors.com',
  'Número de orden':data.id,
  'Versión':data.version,
  'Estado':data.status,
  'Fecha':data.date,
  'Último cambio':data.updatedAt,
  'Cliente':data.cliente,
  'Tipo':data.tipo,
  'Contacto':data.contacto,
  'Teléfono':data.telefono,
  'Correo del cliente':data.correo,
  'Vendedor':data.vendedor,
  'Artículos':data.lines.map(l=>`${l.quantity} x ${l.product.modelo} | ${orderMoney(l.unit)} c/u | ${orderMoney(l.total/100)}${l.manual?' | PRECIO MANUAL':''}${l.manualEntry?' | ENTRADA MANUAL'+(l.product.descripcion?' | '+l.product.descripcion:''):''}`).join('\n'),
  'Subtotal':orderMoney(data.total/100),
  'Motivo del cambio':data.changeReason||'No aplica',
  'Notas':data.nota||'Ninguna',
  'Condiciones':data.status==='cancelada'?'ORDEN CANCELADA. No procesar.':'Sujeto a disponibilidad y confirmación. Impuestos, entrega y términos por confirmar.',
  honeypot:'website',website:''
 };
 for(const [name,value] of Object.entries(fields))form.append(name,String(value??''));
 form.append('attachment',new File([new Blob([bytes],{type:'application/pdf'})],data.id+'-v'+data.version+'.pdf',{type:'application/pdf'}));
 const res=await fetchWithTimeout('https://formly.email/submit',{method:'POST',body:form},30000);
 let result={};try{result=await res.json()}catch{}
 if(!res.ok||result.success===false)throw Error(result.message||'El servicio de correo no confirmó el envío');
 durableSet('queued-order-receipt',JSON.stringify({id:data.id,version:data.version,receipt}));
 try{
  await recordRequest('receipt',{id:data.id,version:data.version,receipt});
  durableRemove('queued-order-receipt');
  sessionStorage.removeItem('order-receipt');
 }catch{}
 durableRemove('queued-order-email');
 durableRemove('queued-order-pdf');
 return result;
}
async function retryQueuedReceipt(){
 const raw=durableGet('queued-order-receipt');
 if(!raw)return {skipped:true};
 if(!sessionStorage.getItem('lewar-pin'))return {skipped:true,reason:'no-pin'};
 const receipt=JSON.parse(raw);
 await recordRequest('receipt',receipt);
 durableRemove('queued-order-receipt');
 sessionStorage.removeItem('order-receipt');
 return {success:true};
}
async function sendQueuedOrderEmail(){
 const queued=JSON.parse(durableGet('queued-order-email')||'null');
 let b64=durableGet('queued-order-pdf')||sessionStorage.getItem('ultimo-pedido-pdf');
 if(!queued)return {skipped:true};
 if(!b64&&typeof orderPdf==='function'){
  const bytes=await orderPdf(queued.data);
  b64=bytesToBase64(bytes);
  durableSet('queued-order-pdf',b64);
 }
 if(!b64)throw Error('No se pudo recuperar el PDF pendiente para reenviarlo');
 const result=await submitOrderEmail(queued.data,base64ToBytes(b64),queued.receipt);
 durableRemove('queued-order-email');
 durableRemove('queued-order-pdf');
 return result;
}
async function recoverPendingDelivery(){
 const out={receipt:null,email:null};
 try{out.receipt=await retryQueuedReceipt()}catch(error){out.receipt={error:String(error&&error.message||error)}}
 if(hasQueuedOrderEmail()){
  try{out.email=await sendQueuedOrderEmail()}catch(error){out.email={error:String(error&&error.message||error)}}
 }
 return out;
}

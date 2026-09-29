const RECORD_API='https://lewar-convencion-whirlpool.emmatowwerz15.chatgpt.site/api/registro';
async function recordRequest(action,body){const token=sessionStorage.getItem('lewar-session');const res=await fetch(RECORD_API,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(25000)});const result=await res.json();if(!res.ok)throw Error(result.error||'No se pudo guardar la orden');return result;}
async function orderPdf(data){const res=await fetch('./lewar-logo.png');if(!res.ok)throw Error('No se pudo cargar el logo');return createOrderPdf(data,await res.arrayBuffer())}
async function submitOrderEmail(data,bytes,receipt){
 const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n),kind=data.status==='cancelada'?'CANCELACIÓN':data.version>1?'MODIFICACIÓN':'PEDIDO';
 const form=new FormData();
 const fields={
  access_key:'67cf9021716b4ded9462e1ca4b7c6c42',
  subject:kind+' '+data.id+' | Versión '+data.version+' | '+data.cliente,
  from_name:'Lewar LogDistributors · Expo Muebles',
  reply_to:data.correo,
  email:data.correo,
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
  'Artículos':data.lines.map(l=>`${l.quantity} x ${l.product.modelo} | ${money(l.unit)} c/u | ${money(l.total/100)}${l.manual?' | PRECIO MANUAL':''}`).join('\n'),
  'Subtotal':money(data.total/100),
  'Motivo del cambio':data.changeReason||'No aplica',
  'Notas':data.nota||'Ninguna',
  'Condiciones':data.status==='cancelada'?'ORDEN CANCELADA. No procesar.':'Sujeto a disponibilidad y confirmación. Impuestos, entrega y términos por confirmar.',
  honeypot:'website',
  website:''
 };
 for(const [name,value] of Object.entries(fields))form.append(name,String(value??''));
 const pdf=new File([new Blob([bytes],{type:'application/pdf'})],data.id+'-v'+data.version+'.pdf',{type:'application/pdf'});
 form.append('attachment',pdf);
 sessionStorage.setItem('ultimo-pedido',JSON.stringify({id:data.id,total:money(data.total/100)}));
 sessionStorage.setItem('order-receipt',JSON.stringify({id:data.id,version:data.version,receipt}));
 try{let binary='';for(const b of bytes)binary+=String.fromCharCode(b);sessionStorage.setItem('ultimo-pedido-pdf',btoa(binary))}catch{sessionStorage.removeItem('ultimo-pedido-pdf')}
 const res=await fetch('https://formly.email/submit',{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
 let result={};try{result=await res.json()}catch{}
 if(!res.ok||result.success===false)throw Error(result.message||'El servicio de correo no confirmó el envío');
 try{await recordRequest('receipt',{id:data.id,version:data.version,receipt});sessionStorage.removeItem('order-receipt')}catch{}
 return result;
}

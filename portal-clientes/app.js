const SUPABASE_URL='https://aznoakixjklsxuwuyshw.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6bm9ha2l4amtsc3h1d3V5c2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3OTgxNjIsImV4cCI6MjEwNjM3NDE2Mn0.yFIUmArDTliai9JhLtVtxGdGU5Y6U6bVZGYzJEFHe14';
const SESSION_KEY='lewar-client-session-v1';
const DEVICE_KEY='lewar-client-device-v1';
const $=id=>document.getElementById(id);
const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);

let catalog=[],customer=null,currentOrder=null,sessionToken='',saving=false;
const quantities={};
const memoryStore={};

function safeGet(key){
  try{const v=localStorage.getItem(key);if(v!==null)return v}catch{}
  try{const v=sessionStorage.getItem(key);if(v!==null)return v}catch{}
  return Object.prototype.hasOwnProperty.call(memoryStore,key)?memoryStore[key]:null;
}
function safeSet(key,value,persistent=false){
  memoryStore[key]=String(value);
  try{(persistent?localStorage:sessionStorage).setItem(key,String(value));return}catch{}
  try{document.cookie=encodeURIComponent(key)+'='+encodeURIComponent(String(value))+'; Path=/; SameSite=Lax; Secure'+(persistent?'; Max-Age=31536000':'')}catch{}
}
function safeRemove(key){
  delete memoryStore[key];
  try{localStorage.removeItem(key)}catch{}
  try{sessionStorage.removeItem(key)}catch{}
  try{document.cookie=encodeURIComponent(key)+'=; Path=/; Max-Age=0; SameSite=Lax; Secure'}catch{}
}
function cookieGet(key){
  try{
    const wanted=encodeURIComponent(key)+'=';
    for(const part of document.cookie.split(';')){
      const p=part.trim();
      if(p.startsWith(wanted))return decodeURIComponent(p.slice(wanted.length));
    }
  }catch{}
  return null;
}
function deviceFingerprint(){
  const s=window.screen||{};
  const parts=[
    navigator.userAgent||'ua',
    navigator.platform||'platform',
    navigator.language||'lang',
    String(s.width||0)+'x'+String(s.height||0),
    String(navigator.hardwareConcurrency||0),
    String(navigator.deviceMemory||0),
    Intl.DateTimeFormat().resolvedOptions().timeZone||'tz'
  ];
  return 'fp-'+parts.join('|').replace(/[^a-zA-Z0-9|._:-]/g,'').slice(0,500);
}
function deviceId(){
  let id=safeGet(DEVICE_KEY)||cookieGet(DEVICE_KEY);
  if(!id){
    id=deviceFingerprint();
    safeSet(DEVICE_KEY,id,true);
  }
  return id;
}
function deviceInfo(){
  const s=window.screen||{};
  const ua=navigator.userAgent||'';
  let browser='Navegador';
  if(/Edg\//.test(ua))browser='Microsoft Edge';
  else if(/OPR\//.test(ua))browser='Opera';
  else if(/Chrome\//.test(ua))browser='Chrome';
  else if(/Firefox\//.test(ua))browser='Firefox';
  else if(/Safari\//.test(ua))browser='Safari';
  const mobile=!!(navigator.userAgentData?.mobile||/Mobi|Android|iPhone|iPad/i.test(ua));
  return {
    browser,
    platform:navigator.userAgentData?.platform||navigator.platform||'',
    mobile,
    language:navigator.language||'',
    screen:String(s.width||0)+'x'+String(s.height||0),
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'',
    userAgent:ua.slice(0,500)
  };
}
function setStatus(message,error=false){
  $('estado').textContent=message;
  $('estado').className='status'+(error?' error':'');
}
function gateStatus(message,error=false){
  $('gate-status').textContent=message;
  $('gate-status').className='gate-status status'+(error?' error':'');
}
async function rpc(name,payload){
  const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify(payload),
    cache:'no-store'
  });
  let data={};try{data=await res.json()}catch{}
  if(!res.ok)throw new Error(data.message||data.error||'No se pudo conectar con el portal.');
  return data;
}
function storeSession(token){
  sessionToken=token||'';
  if(token)safeSet(SESSION_KEY,token,false);
  else safeRemove(SESSION_KEY);
}
function showGate(){
  $('gate').hidden=false;$('portal').hidden=true;$('footer').hidden=true;
  $('pin').focus();
}
function showPortal(){
  $('gate').hidden=true;$('portal').hidden=false;$('footer').hidden=false;
}
async function login(){
  const pin=$('pin').value.trim();
  if(!/^\d{6}$/.test(pin)){gateStatus('Ingresa el PIN de 6 dígitos asignado a tu comercio.',true);$('pin').focus();return}
  $('login').disabled=true;gateStatus('Verificando acceso…');
  try{
    const data=await rpc('portal_client_login_v2',{p_pin:pin,p_device_id:deviceId(),p_device_info:deviceInfo()});
    if(!data.ok)throw new Error(data.error||'PIN incorrecto.');
    storeSession(data.sessionToken);
    $('pin').value='';
    await bootstrap();
  }catch(e){
    storeSession('');
    gateStatus(e.message,true);
    showGate();
  }finally{$('login').disabled=false}
}
async function bootstrap(){
  if(!sessionToken){showGate();return}
  try{
    const data=await rpc('portal_client_bootstrap',{p_session_token:sessionToken,p_device_id:deviceId()});
    if(!data.ok)throw new Error(data.error||'Sesión inválida.');
    customer=data.customer;catalog=data.catalog.productos||[];currentOrder=data.order||null;
    showPortal();hydrate();
  }catch(e){
    storeSession('');gateStatus(e.message,true);showGate();
  }
}
function hydrate(){
  $('customer-name').textContent=customer.name;
  $('cliente').value=customer.name;
  $('vigencia').textContent=(catalog.length||0)+' modelos';
  for(const key of Object.keys(quantities))delete quantities[key];
  for(const p of catalog)quantities[p.modelo]=0;

  if(currentOrder){
    $('page-title').textContent='Modificar '+currentOrder.id;
    $('summary-title').textContent='Orden activa';
    $('guardar').textContent='Guardar cambios';
    $('contacto').value=currentOrder.contacto||'';
    $('telefono').value=currentOrder.telefono||'';
    $('correo').value=currentOrder.correo||'';
    $('vendedor').value=currentOrder.vendedor||'';
    $('nota').value=currentOrder.nota||'';
    for(const line of currentOrder.lines||[]){
      if(Object.prototype.hasOwnProperty.call(quantities,line.product?.modelo))quantities[line.product.modelo]=Number(line.quantity)||0;
    }
    setStatus('Puedes añadir, reducir o eliminar productos de tu orden activa.');
  }else{
    $('page-title').textContent='Preparar pedido';
    $('summary-title').textContent='Resumen del pedido';
    $('guardar').textContent='Enviar pedido';
    for(const id of ['contacto','telefono','correo','vendedor','nota'])$(id).value='';
    setStatus('Selecciona los equipos y cantidades.');
  }
  renderCatalog();calculate();
}
function categoryLabel(raw){
  return String(raw||'OTROS').replace(/^T-\d+\s*/,'').trim()||'OTROS';
}
function renderCatalog(){
  const root=$('catalogo');root.className='';root.replaceChildren();
  const groups=new Map();
  for(const p of catalog){
    const label=categoryLabel(p.categoria);
    if(!groups.has(label))groups.set(label,[]);
    groups.get(label).push(p);
  }
  const select=$('categoria');select.replaceChildren();
  const all=document.createElement('option');all.value='';all.textContent='Todas las categorías';select.append(all);
  for(const label of [...groups.keys()].sort()){
    const opt=document.createElement('option');opt.value=label.toLowerCase();opt.textContent=label;select.append(opt);
  }
  for(const label of [...groups.keys()].sort()){
    const section=document.createElement('section');section.className='catalog-category';section.dataset.category=label.toLowerCase();
    const head=document.createElement('div');head.className='category-heading';
    const h=document.createElement('h3');h.textContent=label;
    const count=document.createElement('span');count.textContent=groups.get(label).length+' modelos';
    head.append(h,count);section.append(head);
    const body=document.createElement('div');body.className='category-items';
    for(const p of groups.get(label)){
      const row=document.createElement('div');row.className='item';
      row.dataset.search=[p.modelo,p.marca,p.descripcion,p.categoria,label].join(' ').toLowerCase();

      const photo=document.createElement('div');photo.className='product-photo';
      const src=typeof productPhotos!=='undefined'?(productPhotos[p.modelo]||(p.modelo==='LWMC30309LB'?productPhotos['WMC30309LB']:'')):'';
      if(src){const img=document.createElement('img');img.src=src;img.alt=p.marca+' '+p.modelo;img.loading='lazy';img.decoding='async';photo.append(img)}
      else{const no=document.createElement('span');no.className='no-photo';no.textContent='Sin foto';photo.append(no)}

      const info=document.createElement('div');info.className='product-info';
      const strong=document.createElement('strong');strong.textContent=p.modelo;
      const desc=document.createElement('small');desc.textContent=p.marca+' · '+p.descripcion;
      const chips=document.createElement('div');chips.className='catalog-prices';
      if(p.agotado){const sold=document.createElement('span');sold.className='price-chip special';sold.textContent='AGOTADO';chips.append(sold)}
      const regular=document.createElement('span');regular.className='price-chip';regular.textContent='Precio 1 unidad '+usd(p.precio);chips.append(regular);
      if(Number.isFinite(Number(p.precio_volumen))){
        const special=document.createElement('span');special.className='price-chip special';
        special.textContent='Precio 3+ '+usd(p.precio_volumen);chips.append(special);
      }
      const rule=document.createElement('p');rule.className='hint';
      rule.textContent=(p.precio_volumen!==null?('Precio de volumen desde 3 '+(p.regla==='mismo_modelo'?'del mismo modelo':'unidades combinadas')):'Sin precio especial por volumen')+(p.nota?' · '+p.nota:'');
      info.append(strong,desc,chips,rule);

      const qbox=document.createElement('div');qbox.className='quantity-box';
      const qlabel=document.createElement('span');qlabel.className='qty-label';qlabel.textContent='Cantidad';
      const step=document.createElement('div');step.className='stepper';
      const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.setAttribute('aria-label','Restar '+p.modelo);
      const input=document.createElement('input');input.type='number';input.min='0';input.max='999';input.step='1';input.value=String(quantities[p.modelo]||0);input.id='qty-'+p.modelo;input.setAttribute('aria-label','Cantidad de '+p.modelo);if(p.agotado){input.value='0';quantities[p.modelo]=0;input.disabled=true;}
      const plus=document.createElement('button');plus.type='button';plus.textContent='+';plus.setAttribute('aria-label','Añadir '+p.modelo);
      if(p.agotado){minus.disabled=true;plus.disabled=true}else{minus.onclick=()=>{input.value=String(Math.max(0,(Number(input.value)||0)-1));quantityChanged(p.modelo,input)};plus.onclick=()=>{input.value=String(Math.min(999,(Number(input.value)||0)+1));quantityChanged(p.modelo,input)}}
      input.oninput=()=>quantityChanged(p.modelo,input);
      step.append(minus,input,plus);qbox.append(qlabel,step);

      const price=document.createElement('div');price.className='money';price.id='price-'+p.modelo;
      row.append(photo,info,qbox,price);body.append(row);
    }
    section.append(body);root.append(section);
  }
  filterCatalog();
}
function quantityChanged(model,input){
  let q=Math.trunc(Number(input.value)||0);
  if(q<0)q=0;if(q>999)q=999;
  quantities[model]=q;input.value=String(q);calculate();
}
function localPricing(){
  const combinable=catalog.filter(p=>p.regla==='combinable').reduce((n,p)=>n+(quantities[p.modelo]||0),0);
  const lines=[];
  for(const p of catalog){
    const q=p.agotado?0:(quantities[p.modelo]||0);
    const regular=Math.ceil(Number(p.precio)||0);
    const volumePrice=p.precio_volumen===null?null:Math.ceil(Number(p.precio_volumen));
    const volume=volumePrice!==null&&(p.regla==='mismo_modelo'?q>=3:combinable>=3);
    const unit=volume?volumePrice:regular;
    lines.push({product:p,quantity:q,unit,volume,total:q*unit*100});
  }
  return {lines,units:lines.reduce((n,l)=>n+l.quantity,0),total:lines.reduce((n,l)=>n+l.total,0)};
}
function calculate(){
  const order=localPricing(),detail=$('detalle');detail.replaceChildren();
  let models=0;
  for(const l of order.lines){
    const el=$('price-'+l.product.modelo);
    if(el)el.textContent=usd(l.unit)+' c/u'+(l.volume?' · Volumen':'')+(l.quantity?'\n'+usd(l.total/100):'');
    if(l.quantity){
      models++;
      const p=document.createElement('p');p.style.margin='9px 0';
      p.textContent=l.quantity+' × '+l.product.modelo+' · '+usd(l.total/100);detail.append(p);
    }
  }
  $('modelos').textContent=String(models);$('unidades').textContent=String(order.units);
  $('subtotal').textContent=order.units?usd(order.total/100):'—';
  $('guardar').disabled=saving||!order.units;
  if(!saving)setStatus(order.units?(currentOrder?'Guarda los cambios cuando termines.':'Pedido listo para enviar.'):'Selecciona los equipos y cantidades.');
}
function filterCatalog(){
  const cat=$('categoria').value.toLowerCase(),term=$('buscar').value.trim().toLowerCase();
  for(const section of document.querySelectorAll('.catalog-category')){
    const catOk=!cat||section.dataset.category===cat;
    let visible=0;
    for(const row of section.querySelectorAll('.item')){
      const ok=catOk&&(!term||row.dataset.search.includes(term));row.hidden=!ok;if(ok)visible++;
    }
    section.hidden=!visible;
  }
}
function selectedItems(){
  return catalog.map(p=>({model:p.modelo,quantity:quantities[p.modelo]||0})).filter(x=>x.quantity>0);
}
async function createPdf(order){
  if(typeof createOrderPdf!=='function')return null;
  const logo=await fetch('../expo-muebles/lewar-logo.png');
  if(!logo.ok)return null;
  return createOrderPdf(order,await logo.arrayBuffer());
}
function pdfLink(order,bytes){
  if(!bytes)return;
  const old=$('descargar').dataset.url;if(old)URL.revokeObjectURL(old);
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  $('descargar').href=url;$('descargar').download=order.id+'-v'+order.version+'.pdf';
  $('descargar').dataset.url=url;$('descargar').style.display='block';
}
function bytesToBase64(bytes){
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  }
  return btoa(binary);
}
async function deliveryUpdate(order,bytes,state,error=''){
  try{
    const data=await rpc('portal_client_delivery_update',{
      p_session_token:sessionToken,
      p_device_id:deviceId(),
      p_order_id:order.id,
      p_pdf_base64:bytes?bytesToBase64(bytes):null,
      p_pdf_filename:bytes?(order.id+'-v'+order.version+'.pdf'):null,
      p_email_state:state,
      p_error:error||null
    });
    if(!data.ok)throw new Error(data.error||'No se pudo registrar la entrega.');
    return data;
  }catch(e){
    console.error('Delivery tracking error',e);
    return {ok:false,error:e.message};
  }
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function sendEmail(order,bytes){
  if(!bytes)return {skipped:true};
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
  const form=new FormData();
  const kind=order.version>1?'MODIFICACIÓN':'PEDIDO';
  const fields={
    access_key:'67cf9021716b4ded9462e1ca4b7c6c42',
    subject:kind+' '+order.id+' | Versión '+order.version+' | '+order.cliente,
    from_name:'Lewar LogDistributors · Portal Clientes',
    reply_to:order.correo,email:order.correo,
    cc:'rolivencia@lewardistributors.com,lewarcorpcredito@lewardistributors.com,invoice@lewardistributors.com',
    'Número de orden':order.id,'Versión':order.version,'Estado':order.status,'Fecha':order.date,
    'Cliente':order.cliente,'Contacto':order.contacto,'Teléfono':order.telefono,'Correo del cliente':order.correo,
    'Vendedor':order.vendedor,
    'Artículos':(order.lines||[]).map(l=>l.quantity+' x '+l.product.modelo+' | '+money(l.unit)+' c/u | '+money(l.total/100)).join('\n'),
    'Subtotal':money(order.total/100),'Notas':order.nota||'Ninguna',
    'Condiciones':'Sujeto a disponibilidad y confirmación de Lewar. Precios calculados por el portal protegido.',
    honeypot:'website',website:''
  };
  for(const [k,v] of Object.entries(fields))form.append(k,String(v??''));
  form.append('attachment',new File([new Blob([bytes],{type:'application/pdf'})],order.id+'-v'+order.version+'.pdf',{type:'application/pdf'}));
  const res=await fetch('https://formly.email/submit',{method:'POST',body:form});
  let result={};try{result=await res.json()}catch{}
  if(!res.ok||result.success===false)throw new Error(result.message||'El correo no confirmó el envío.');
  return result;
}
async function sendEmailWithRetry(order,bytes){
  let lastError=null;
  for(let attempt=1;attempt<=3;attempt++){
    await deliveryUpdate(order,null,'sending',lastError?.message||'');
    try{
      const result=await sendEmail(order,bytes);
      await deliveryUpdate(order,null,'sent','');
      return result;
    }catch(e){
      lastError=e;
      const finalAttempt=attempt===3;
      await deliveryUpdate(order,null,finalAttempt?'failed':'retrying',e.message||'Error de envío');
      if(!finalAttempt)await wait(1200*attempt);
    }
  }
  throw lastError||new Error('No se pudo confirmar el envío del correo.');
}
async function saveOrder(){
  if(saving)return;
  const ids=['contacto','telefono','correo','vendedor'];
  for(const id of ids){if(!$(id).value.trim()||!$(id).reportValidity()){$(id).focus();setStatus('Completa los datos de contacto antes de guardar.',true);return}}
  if(!selectedItems().length)return;
  saving=true;$('guardar').disabled=true;setStatus('Calculando precios oficiales y guardando la orden…');
  try{
    const data=await rpc('portal_client_save',{
      p_session_token:sessionToken,p_device_id:deviceId(),
      p_contacto:$('contacto').value,p_telefono:$('telefono').value,p_correo:$('correo').value,
      p_vendedor:$('vendedor').value,p_nota:$('nota').value,p_items:selectedItems()
    });
    if(!data.ok)throw new Error(data.error||'No se pudo guardar la orden.');
    currentOrder=data.order;
    const bytes=await createPdf(currentOrder);pdfLink(currentOrder,bytes);
    if(!bytes)throw new Error('La orden quedó guardada, pero no se pudo generar el PDF automático.');
    const backup=await deliveryUpdate(currentOrder,bytes,'pdf_saved','');
    if(!backup.ok)throw new Error('La orden quedó guardada, pero no se pudo respaldar el PDF automático. '+(backup.error||''));
    $('page-title').textContent='Modificar '+currentOrder.id;
    $('summary-title').textContent='Orden activa';$('guardar').textContent='Guardar cambios';
    setStatus('Orden '+currentOrder.id+' guardada. PDF respaldado. Enviando confirmación…');
    try{await sendEmailWithRetry(currentOrder,bytes);setStatus('Orden '+currentOrder.id+' guardada, PDF respaldado y confirmación enviada.')}
    catch(emailError){setStatus('La orden y el PDF quedaron guardados. El correo falló después de 3 intentos: '+emailError.message+'. Comunícate con Lewar para reenviarlo.',true)}
  }catch(e){
    if(/sesión/i.test(e.message)){storeSession('');gateStatus(e.message,true);showGate()}
    else setStatus(e.message,true);
  }finally{saving=false;calculate()}
}
async function logout(){
  try{if(sessionToken)await rpc('portal_client_logout',{p_session_token:sessionToken,p_device_id:deviceId()})}catch{}
  storeSession('');customer=null;currentOrder=null;catalog=[];showGate();gateStatus('Sesión cerrada.');
}

$('login').addEventListener('click',login);
$('pin').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();login()}});
$('guardar').addEventListener('click',saveOrder);
$('logout').addEventListener('click',logout);
$('categoria').addEventListener('change',filterCatalog);
$('buscar').addEventListener('input',filterCatalog);

sessionToken=safeGet(SESSION_KEY)||cookieGet(SESSION_KEY)||'';
gateStatus('Sistema listo · acceso seguro activo.');
if(sessionToken)bootstrap();else showGate();

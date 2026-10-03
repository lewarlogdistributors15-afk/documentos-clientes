const EMAIL_SERVICE_ENABLED=true;
const $=id=>document.getElementById(id),usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
let products=[],order,invalid=false,sending=false,submitted=false,pendingOrder=null,editOrder=null,manualEntries=[];try{editOrder=JSON.parse(sessionStorage.getItem('lewar-edit-order'))}catch{}
function newUuid(){
 if(window.crypto&&typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID();
 const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}

function manualLine(entry){
 const unit=Math.round(Number(entry.price)*100)/100;
 return {
  product:{modelo:entry.modelo,marca:'MANUAL',categoria:'MANUAL',descripcion:entry.note||'Artículo añadido manualmente',nota:entry.note||'',manualEntry:true},
  quantity:Number(entry.quantity),unit,volume:false,manual:false,manualEntry:true,automaticUnit:null,total:Number(entry.quantity)*Math.round(unit*100)
 };
}
function renderManualEntries(){
 const list=$('manual-list');if(!list)return;list.replaceChildren();
 if(!manualEntries.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='No hay artículos manuales añadidos.';list.append(empty);return}
 for(const entry of manualEntries){
  const row=document.createElement('div');row.className='manual-order-row';
  const info=document.createElement('div');const strong=document.createElement('strong');strong.textContent=entry.modelo;
  const detail=document.createElement('span');detail.textContent=entry.quantity+' × '+usd(entry.price)+(entry.note?' · '+entry.note:'');
  info.append(strong,detail);
  const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Eliminar';remove.onclick=()=>{manualEntries=manualEntries.filter(x=>x.id!==entry.id);renderManualEntries();calculate()};
  row.append(info,remove);list.append(row);
 }
}
function addManualEntry(){
 const model=$('manual-modelo').value.trim().toUpperCase(),quantity=Number($('manual-cantidad').value),price=Number($('manual-precio').value),note=$('manual-nota').value.trim();
 if(!model){$('manual-modelo').focus();$('estado').textContent='Escribe el modelo del artículo manual.';return}
 if(!Number.isInteger(quantity)||quantity<1||quantity>999){$('manual-cantidad').focus();$('estado').textContent='La cantidad manual debe ser entre 1 y 999.';return}
 if(!Number.isFinite(price)||price<0||price>999999.99){$('manual-precio').focus();$('estado').textContent='Escribe un precio unitario manual válido.';return}
 manualEntries.push({id:newUuid(),modelo:model,quantity,price:Math.round(price*100)/100,note});
 $('manual-modelo').value='';$('manual-cantidad').value='1';$('manual-precio').value='';$('manual-nota').value='';
 renderManualEntries();calculate();$('manual-modelo').focus();
}
function calculate(){
 const quantities={},overrides={};invalid=false;
 for(const p of products){
  const el=$('qty-'+p.modelo),manual=$('manual-'+p.modelo);
  if(manual.value!==''||manual.validity.badInput){if(!manual.checkValidity())invalid=true;else overrides[p.modelo]=Number(manual.value)}
  el.disabled=!Number.isFinite(p.precio)&&!Number.isFinite(overrides[p.modelo]);
  if(!el.disabled&&!el.checkValidity())invalid=true;
  quantities[p.modelo]=Number(el.value)
 }
 const automatic=priceOrder(products,quantities,overrides),manualLines=manualEntries.map(manualLine);
 order={...automatic,lines:[...automatic.lines,...manualLines],units:automatic.units+manualLines.reduce((n,l)=>n+l.quantity,0),total:automatic.total+manualLines.reduce((n,l)=>n+l.total,0)};
 $('detalle').replaceChildren();
 for(const line of order.lines){
  const {product:p,quantity:q,unit,volume,manual,total,manualEntry}=line;
  if(!manualEntry){
   $('price-'+p.modelo).textContent=unit===null?'Precio pendiente':usd(unit)+' c/u'+(manual?' · Manual':volume?' · Volumen':'')+(q?'\n'+usd(total/100):'');
  }
  if(q){
   const row=document.createElement('p');
   row.textContent=`${q} × ${p.modelo} · ${usd(total/100)}${manualEntry?' · Entrada manual':''}`;
   $('detalle').append(row)
  }
 }
 $('modelos').textContent=order.lines.filter(l=>l.quantity).length;
 $('unidades').textContent=order.units;
 $('subtotal').textContent=usd(order.total/100);
 $('enviar').disabled=sending||submitted||invalid||!order.units;
 if(!sending&&!submitted)$('estado').textContent=invalid?'Revisa las cantidades (0 a 999) y los precios manuales (máximo 2 decimales, sin negativos).':order.units?'Al procesar, la orden se guardará primero y el correo con PDF se enviará sin hacerte esperar.':'Agrega artículos para preparar el pedido.'
}
async function load(){try{
 const response=await fetch('./catalogo.json?v=20261003-live',{cache:'no-store'});if(!response.ok)throw Error();
 const data=await response.json();products=data.productos;$('catalogo').className='';$('catalogo').replaceChildren();
 const groups=new Map();
 for(const p of products){
  const [sort,label]=categoryInfo(p.categoria),key=sort+'|'+label;
  if(!groups.has(key))groups.set(key,{sort,label,products:[]});
  groups.get(key).products.push(p);
 }
 const groupList=[...groups.values()].sort((a,b)=>a.sort.localeCompare(b.sort)||a.label.localeCompare(b.label));
 const categorySelect=$('categoria');categorySelect.replaceChildren();
 const allOption=document.createElement('option');allOption.value='';allOption.textContent='Todas las categorías';categorySelect.append(allOption);
 for(const group of groupList){const option=document.createElement('option');option.value=group.label.toLowerCase();option.textContent=group.label;categorySelect.append(option)}
 for(const group of groupList){
  const section=document.createElement('section');section.className='catalog-category';section.dataset.category=group.label.toLowerCase();
  const heading=document.createElement('div');heading.className='category-heading';
  const title=document.createElement('h3');title.textContent=group.label;
  const count=document.createElement('span');count.textContent=group.products.length+' modelos';
  heading.append(title,count);section.append(heading);
  const body=document.createElement('div');body.className='category-items';
  for(const p of group.products){
   const row=document.createElement('div');row.className='item';row.dataset.search=[p.modelo,p.marca,p.descripcion,p.categoria,group.label].join(' ').toLowerCase();
   const info=document.createElement('div'),strong=document.createElement('strong'),desc=document.createElement('small'),rule=document.createElement('p'),priceList=document.createElement('div');
   strong.textContent=p.modelo;desc.textContent=p.marca+' · '+p.descripcion;priceList.className='catalog-prices';
   const regular=document.createElement('span');regular.className='price-chip';regular.textContent=Number.isFinite(p.precio)?'Precio 1 unidad '+usd(p.precio):'Precio por confirmar';priceList.append(regular);
   if(Number.isFinite(p.precio_volumen)){const special=document.createElement('span');special.className='price-chip special';special.textContent='Precio 3+ '+usd(p.precio_volumen);priceList.append(special)}
   rule.className='hint';rule.textContent=(Number.isFinite(p.precio_volumen)?`Precio de volumen desde 3 ${p.regla==='mismo_modelo'?'del mismo modelo':'unidades combinadas'}`:'Sin precio especial por volumen')+(p.nota?' · '+p.nota:'');
   info.className='product-info';info.append(strong,desc,priceList,rule);
   const photo=document.createElement('div');photo.className='product-photo';
   const src=typeof productPhotos!=='undefined'?productPhotos[p.modelo]:'';
   if(src){const img=document.createElement('img');img.src=src;img.alt=p.marca+' '+p.modelo;img.loading='lazy';img.decoding='async';img.width=120;img.height=140;photo.append(img)}
   else{const noPhoto=document.createElement('span');noPhoto.className='no-photo';noPhoto.textContent='Sin foto';photo.append(noPhoto)}
   const input=document.createElement('input');input.type='number';input.min='0';input.max='999';input.step='1';input.value='0';input.id='qty-'+p.modelo;input.disabled=!Number.isFinite(p.precio);input.setAttribute('aria-label','Cantidad de '+p.modelo);input.addEventListener('input',calculate);
   const price=document.createElement('div');price.className='money';price.style.whiteSpace='pre-line';price.id='price-'+p.modelo;
   const manualBox=document.createElement('div');manualBox.className='manual-price';const label=document.createElement('label');label.htmlFor='manual-'+p.modelo;label.textContent='Precio unitario manual ($)';label.style.fontSize='14px';
   const manualInput=document.createElement('input');manualInput.type='number';manualInput.min='0';manualInput.max='999999.99';manualInput.step='0.01';manualInput.placeholder='Vacío = automático';manualInput.id='manual-'+p.modelo;manualInput.setAttribute('aria-label','Precio unitario manual de '+p.modelo);manualInput.addEventListener('input',calculate);manualBox.append(label,manualInput);
   const quantityBox=document.createElement('div');quantityBox.className='quantity-box';const quantityLabel=document.createElement('label');quantityLabel.htmlFor=input.id;quantityLabel.textContent='Cantidad';quantityBox.append(quantityLabel,input);
   row.append(photo,info,quantityBox,price,manualBox);body.append(row);
  }
  section.append(body);$('catalogo').append(section);
 }
 $('vigencia').textContent=data.vigencia+' · catálogo por categorías';
 if(editOrder){
  document.querySelector('h1').textContent='Modificar '+editOrder.id;
  for(const id of ['cliente','tipo','contacto','telefono','correo','vendedor','nota'])$(id).value=editOrder[id]||'';
  for(const line of editOrder.lines){
   const qty=$('qty-'+line.product.modelo);
   if(line.manualEntry||!qty){
    manualEntries.push({id:newUuid(),modelo:line.product.modelo,quantity:line.quantity,price:line.unit,note:line.product.descripcion==='Artículo añadido manualmente'?'':(line.product.descripcion||'')});
   }else{
    qty.value=line.quantity;
    if(line.manual)$('manual-'+line.product.modelo).value=line.unit
   }
  }
  $('edit-reason-box').hidden=false
 }
 renderManualEntries();calculate()
}catch(e){$('catalogo').textContent='No se pudo cargar el catálogo. Recarga la página.';$('enviar').disabled=true}}
function filterCatalog(){
 const query=$('buscar').value.toLowerCase().trim(),category=$('categoria').value;
 for(const section of $('catalogo').querySelectorAll('.catalog-category')){
  const categoryMatch=!category||section.dataset.category===category;let visible=0;
  for(const row of section.querySelectorAll('.item')){const show=categoryMatch&&row.dataset.search.includes(query);row.style.display=show?'':'none';if(show)visible++}
  section.style.display=visible?'':'none';
 }
}
$('buscar').addEventListener('input',filterCatalog);
$('categoria').addEventListener('change',filterCatalog);
$('add-manual').addEventListener('click',addManualEntry);
for(const id of ['manual-modelo','manual-cantidad','manual-precio','manual-nota'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addManualEntry()}});
function field(id){return $(id).value.trim()}
function companyRef(name){return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,28)||'CLIENTE'}
const categoryMeta={
 'T-01 WASHERS':['01','Lavadoras'],
 'T-07 DRYERS':['02','Secadoras'],
 'DRYERS':['02','Secadoras'],
 'T-02 RANGES':['03','Estufas'],
 'RANGES':['03','Estufas'],
 'T-03 REFRIGERATION':['04','Neveras y refrigeración'],
 'REFRIGERATORS':['04','Neveras y refrigeración'],
 'T-04 MWO':['05','Microondas'],
 'COOKTOPS':['06','Cooktops'],
 'COOKTOPS INDUCTION':['07','Cooktops de inducción'],
 'HOODS':['08','Campanas'],
 'OVENS':['09','Hornos'],
 'ICE MAKER':['10','Máquinas de hielo'],
 'ACCESORIES':['11','Accesorios']
};
function categoryInfo(raw){return categoryMeta[raw]||['99',raw||'Otros']}
$('enviar').addEventListener('click',async()=>{
 if(sending||submitted)return;calculate();if(invalid||!order.units)return;
 const requiredLabels={cliente:'Nombre comercial',contacto:'Persona de contacto',telefono:'Teléfono',correo:'Correo electrónico',vendedor:'Vendedor'};
 for(const id of ['cliente','contacto','telefono','correo','vendedor']){if(!field(id)||!$(id).reportValidity()){$(id).focus();$('estado').textContent='Completa correctamente el campo: '+requiredLabels[id]+'.';return}}
 const data={cliente:field('cliente'),tipo:field('tipo'),contacto:field('contacto'),telefono:field('telefono'),correo:field('correo'),vendedor:field('vendedor'),nota:field('nota'),lines:order.lines.filter(l=>l.quantity),total:order.total};
 const fingerprint=JSON.stringify(data);
 if(!pendingOrder||pendingOrder.fingerprint!==fingerprint){const now=new Date();pendingOrder={fingerprint,id:editOrder?editOrder.id:'EXPO26-'+companyRef(field('cliente'))+'-'+newUuid().replace(/-/g,'').slice(0,8).toUpperCase(),date:editOrder?.date||now.toLocaleString('es-PR',{timeZone:'America/Puerto_Rico'})}}
 if(editOrder&&!field('edit-reason')){$('edit-reason').focus();$('estado').textContent='Indica el motivo de la modificación.';return}
 Object.assign(data,{id:pendingOrder.id,date:pendingOrder.date});sending=true;$('enviar').disabled=true;$('estado').textContent='Guardando pedido '+data.id+'…';
 const controls=[...document.querySelectorAll('input,select,textarea,button')].filter(el=>!el.disabled&&el.id!=='enviar');controls.forEach(el=>el.disabled=true);
 try{
  if(!pendingOrder.requestKey){pendingOrder.requestKey=newUuid();pendingOrder.receipt=newUuid()+newUuid()}
  if(!pendingOrder.saved){pendingOrder.saved=await recordRequest(editOrder?'edit':'create',editOrder?{id:editOrder.id,version:editOrder.version,order:data,reason:field('edit-reason')}:{requestKey:pendingOrder.requestKey,receipt:pendingOrder.receipt,order:data});if(pendingOrder.saved.receipt)pendingOrder.receipt=pendingOrder.saved.receipt}
  const saved=pendingOrder.saved.order;Object.assign(data,saved);
  $('estado').textContent='Orden guardada. Preparando comprobante…';
  const bytes=await orderPdf(saved);
  const download=$('descargar-pedido');if(download.href.startsWith('blob:'))URL.revokeObjectURL(download.href);download.href=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));download.download=saved.id+'-v'+saved.version+'.pdf';download.style.display='block';
  queueOrderEmail(saved,bytes,pendingOrder.receipt);
  sessionStorage.removeItem('lewar-edit-order');submitted=true;$('enviar').textContent='Pedido guardado';$('estado').textContent='Pedido confirmado. El correo con PDF se enviará aparte.';
  location.href='./pedido-recibido.html';
 }catch(error){submitted=false;$('estado').textContent=(pendingOrder?.saved?'La orden está guardada, pero no se pudo preparar el comprobante: ':'No se guardó el pedido: ')+error.message;controls.forEach(el=>el.disabled=false)}
 finally{sending=false;$('enviar').disabled=submitted}
});load();

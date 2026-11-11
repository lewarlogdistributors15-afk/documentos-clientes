(() => {
  const byId=id=>document.getElementById(id);
  const productForm=byId('masterProductForm'), customerForm=byId('masterCustomerForm');
  const photoInput=productForm.elements.photoFile, uploadButton=byId('masterPhotoUpload'), preview=byId('masterPhotoPreview');
  const photoTypes=['image/jpeg','image/png','image/webp'];
  const photoLimit=5*1024*1024;
  let previewUrl='';
  let data=null, sequence=0, pending=false, role=null;
  const report=(message,error=false)=>{
    byId('masterStatus').textContent=message;
    byId('masterStatus').classList.toggle('accountError',error);
  };
  function buttons(){
    const noProduct=pending||!data||!role||!productForm.elements.sku.value;
    productForm.querySelector('button[type="submit"]').disabled=noProduct;
    photoInput.disabled=noProduct||role!=='owner';
    uploadButton.disabled=photoInput.disabled||!photoInput.files.length;
    customerForm.querySelector('button').disabled=pending||!data||!['owner','admin'].includes(role)||!customerForm.elements.customer.value;
  }
  function options(select,items){
    const prior=select.value;
    select.replaceChildren(new Option('Seleccionar',''),...items.map(([value,label])=>new Option(label,value)));
    select.value=items.some(([value])=>value===prior)?prior:'';
  }
  function fillProduct(){
    const sku=productForm.elements.sku.value;
    const row=data?.products.find(row=>row.sku===sku);
    productForm.elements.price.value=row?.sale_cents==null?'':(row.sale_cents/100).toFixed(2);
    productForm.elements.price.placeholder=sku&&sapSaleBySku.has(sku)?(sapSaleBySku.get(sku)/100).toFixed(2):'Precio SAP por confirmar';
    productForm.elements.available.value=row?.available_qty??'';
    productForm.elements.photo.value=row?.photo_url??'';
    photoInput.value='';
    const product=ALL_PRODUCTS.find(product=>stockSku(product.sku)===sku);
    showPreview(row?.photo_url||(product&&productImageSources(product)[0]));
    buttons();
  }
  function showPreview(src,file){
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=file?URL.createObjectURL(file):'';
    const source=previewUrl||src;
    preview.hidden=!source;
    if(source)preview.src=source;
    else preview.removeAttribute('src');
  }
  function fillCustomer(){
    const id=customerForm.elements.customer.value;
    const row=data?.customerEdits.find(row=>row.customer_id===id);
    customerForm.elements.displayName.value=row?.display_name??'';
    customerForm.elements.displayName.placeholder=data?.customers.find(row=>row.id===id)?.name??'';
    customerForm.elements.contactEmail.value=row?.contact_email??'';
    buttons();
  }
  async function open(message=''){
    if(!role)return;
    const current=++sequence;
    data=null;buttons();
    report('Cargando catálogo y clientes…');
    try{
      const result=await window.LewarAccount.master('masterRead');
      if(current!==sequence)return;
      data=result;
      const products=[...new Map(ALL_PRODUCTS.map(product=>[stockSku(product.sku),product])).entries()]
        .sort(([left],[right])=>left.localeCompare(right));
      options(productForm.elements.sku,products.map(([sku,product])=>[sku,sku+' · '+desc(product)]));
      options(customerForm.elements.customer,data.customers.map(({id,name,clientCode})=>[id,name+(clientCode?' · '+clientCode:'')]));
      fillProduct();fillCustomer();
      report(message||(role==='catalog'?'Selecciona un modelo para editar su precio o disponibilidad.':'Selecciona un modelo o un cliente para editar.'));
    }catch(error){
      if(current===sequence)report(error.message,true);
    }
  }
  async function submit(action,fields,message){
    if(!data||pending)return;
    pending=true;buttons();report('Guardando…');
    try{
      await window.LewarAccount.master(action,fields);
      await open(message);
    }catch(error){report(error.message,true)}
    finally{pending=false;buttons()}
  }
  productForm.elements.sku.addEventListener('change',fillProduct);
  customerForm.elements.customer.addEventListener('change',fillCustomer);
  photoInput.addEventListener('change',()=>{
    const file=photoInput.files[0];
    if(file&&(!photoTypes.includes(file.type)||!file.size||file.size>photoLimit)){
      photoInput.value='';
      report('Selecciona una foto JPG, PNG o WebP de hasta 5 MB.',true);
    }
    const product=ALL_PRODUCTS.find(product=>stockSku(product.sku)===productForm.elements.sku.value);
    showPreview(productForm.elements.photo.value||(product&&productImageSources(product)[0]),photoInput.files[0]);
    buttons();
  });
  uploadButton.addEventListener('click',async()=>{
    const sku=productForm.elements.sku.value,file=photoInput.files[0];
    if(!data||pending||role!=='owner'||!sku||!file)return;
    pending=true;buttons();report('Subiendo la foto…');
    try{
      const {photoUrl}=await window.LewarAccount.uploadProductPhoto(sku,file);
      const previous=data?.products.find(row=>row.sku===sku);
      if(previous)previous.photo_url=photoUrl;
      else data?.products.push({sku,photo_url:photoUrl});
      if(productForm.elements.sku.value===sku){
        productForm.elements.photo.value=photoUrl;
        photoInput.value='';
        showPreview(photoUrl);
      }
      report('Foto sustituida en el Portal General.');
    }catch(error){report(error.message,true)}
    finally{pending=false;buttons()}
  });
  productForm.addEventListener('submit',event=>{
    event.preventDefault();
    const {sku,price,available,photo}=productForm.elements;
    const saleCents=price.value===''?null:Math.round(price.valueAsNumber*100);
    const fields={sku:sku.value,saleCents,availableQty:available.value===''?null:available.valueAsNumber};
    if(role==='owner')fields.photoUrl=photo.value.trim()||null;
    submit('masterProduct',fields,'Producto guardado en el Portal General.');
  });
  customerForm.addEventListener('submit',event=>{
    event.preventDefault();
    const {customer,displayName,contactEmail}=customerForm.elements;
    submit('masterCustomer',{customerId:customer.value,displayName:displayName.value.trim()||null,contactEmail:contactEmail.value.trim()||null},'Cliente guardado en el Portal General.');
  });
  function permissions(next){
    if(role===next)return;
    role=next;
    byId('masterPhotoControls').classList.toggle('hidden',role!=='owner');
    customerForm.classList.toggle('hidden',!['owner','admin'].includes(role));
    byId('managementProductTitle').textContent=role==='owner'?'Fotos, precios y disponibilidad':'Precios y disponibilidad';
    if(!role){sequence++;data=null;}
    buttons();
  }
  // Archivo Maestro: importación, comparación y publicación explícita de precios generales.
  const excelFile=byId('masterExcelFile');
  const reviewBtn=byId('masterExcelReview');
  const driveDraftBtn=byId('masterDriveDraftRefresh');
  const publishBtn=byId('masterExcelPublish');
  const excelStatus=byId('masterExcelStatus');
  const excelPreview=byId('masterExcelPreview');
  const bridgeIndicator=byId('masterBridgeIndicator');
  const bridgeSetup=byId('masterBridgeSetup');
  const bridgeInstructions=byId('masterBridgeInstructions');
  const bridgeToken=byId('masterBridgeToken');
  const bridgeUrl=byId('masterBridgeUrl');
  const bridgeGenerate=byId('masterBridgeGenerate');
  const bridgeCopy=byId('masterBridgeCopy');
  const bridgeConnect=byId('masterBridgeConnect');
  const bridgeStatus=byId('masterBridgeStatus');
  const endpoint='https://aznoakixjklsxuwuyshw.supabase.co/functions/v1/lewar-master-publicar';
  let activeBatch=null,reviewChanges=[],reviewWarnings=[],importPending=false,activeMode='master',validThrough=null;
  const canPublish=()=>['owner','admin'].includes(role);
  const canConfigure=()=>role==='owner';
  const scriptUrlPattern=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;
  const bridgeSecretPattern=/^[a-f0-9]{64}$/;
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const moneyValue=cents=>cents==null?'Sin precio':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
  function excelButtons(){
    reviewBtn.disabled=!canPublish()||importPending||!excelFile.files.length;
    driveDraftBtn.disabled=!canPublish()||importPending;
    publishBtn.disabled=!canPublish()||importPending||!activeBatch||reviewChanges.length===0;
    bridgeGenerate.disabled=!canConfigure()||importPending;
    bridgeCopy.disabled=!canConfigure()||!bridgeSecretPattern.test(bridgeToken.value);
    bridgeConnect.disabled=!canConfigure()||importPending||
      !scriptUrlPattern.test(bridgeUrl.value.trim())||
      !bridgeSecretPattern.test(bridgeToken.value);
  }
  function excelMessage(message,failed=false){
    excelStatus.textContent=message;
    excelStatus.classList.toggle('accountError',failed);
  }
  function authInput(){
    // Reuse the same storage fallbacks as the PIN login in account.js.
    const sessionKey='lewar-client-session-v1';
    const deviceKey='lewar-client-device-v1';
    const cookieValue=key=>{
      const encoded=encodeURIComponent(key)+'=';
      const entry=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(encoded));
      return entry?decodeURIComponent(entry.slice(encoded.length)):'';
    };
    const sessionToken=sessionStorage.getItem(sessionKey)||localStorage.getItem(sessionKey)||cookieValue(sessionKey);
    const deviceId=localStorage.getItem(deviceKey)||sessionStorage.getItem(deviceKey)||cookieValue(deviceKey);
    if(!sessionToken||!deviceId)
      throw Error('La sesión de Karla no está disponible en esta pestaña. Cierra sesión y entra nuevamente con su PIN.');
    return {sessionToken,deviceId};
  }
  async function excelRpc(payload){
    const response=await fetch(endpoint,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,...authInput()}),
      cache:'no-store',signal:AbortSignal.timeout(65000)
    });
    const body=await response.json().catch(()=>({error:'No se recibió una respuesta válida.'}));
    if(!response.ok||!body.ok){
      if(response.status===401||response.status===403){
        throw Error('El servidor rechazó la sesión de esta pestaña. Cierra sesión y vuelve a ingresar con el PIN de Karla. Si tienes varias pestañas abiertas, utiliza la que tenga el inicio de sesión más reciente.');
      }
      throw Error(body.error||'No se pudo completar la solicitud.');
    }
    return body;
  }
  function renderExcelPreview(){
    excelButtons();
    if(!reviewChanges.length){
      if(reviewWarnings.length){
        excelPreview.hidden=false;
        excelPreview.innerHTML='<p><strong>Se encontraron precios que necesitan corrección.</strong> No se pueden publicar estos modelos hasta resolver las observaciones:</p>'+
          '<ul style="padding-left:22px;line-height:1.65">'+
          reviewWarnings.slice(0,30).map(w=>'<li>'+safe(w)+'</li>').join('')+
          '</ul>'+(reviewWarnings.length>30?'<p>Y '+(reviewWarnings.length-30)+' observaciones adicionales.</p>':'');
      }else{
        excelPreview.hidden=true;
        excelPreview.innerHTML='';
      }
      return;
    }
    const karla=activeMode==='karla_promotions';
    excelPreview.hidden=false;
    let markup='<p><strong>'+reviewChanges.length+' cambios para revisar.</strong> Sin publicar.'+
      (karla?' Promociones con vigencia hasta '+safe(validThrough)+'.':'')+'</p>'+
      '<div style="max-height:380px;overflow:auto"><table class="accountTable"><thead><tr>'+
      (karla?'<th>Modelo</th><th>Promoción anterior</th><th>Nuevo precio (1–2)</th><th>Nuevo precio (3+)</th><th>Vigencia</th>':
        '<th>Modelo</th><th>Precio actual</th><th>Precio aprobado Karla</th><th>Diferencia</th>')+
      '</tr></thead><tbody>';
    markup+=reviewChanges.slice(0,150).map(c=>karla?
      '<tr><td>'+safe(c.sku)+'</td><td>'+moneyValue(c.old_cents)+'</td>'+
      '<td>'+moneyValue(c.new_cents)+'</td><td>'+(c.new_volume_cents==null?'Sin descuento adicional':moneyValue(c.new_volume_cents))+'</td>'+
      '<td>'+safe(c.valid_through)+'</td></tr>':
      '<tr><td>'+safe(c.sku)+'</td><td>'+moneyValue(c.old_cents)+'</td>'+
      '<td>'+moneyValue(c.new_cents)+'</td><td>'+
      (c.old_cents==null?'Nuevo precio':moneyValue(c.new_cents-c.old_cents))+'</td></tr>'
    ).join('');
    markup+='</tbody></table></div>';
    if(reviewChanges.length>150)markup+='<p>Se muestran los primeros 150 cambios.</p>';
    if(reviewWarnings.length)markup+='<p><strong>Modelos que no se publicarán:</strong> '+
      reviewWarnings.slice(0,12).map(safe).join(' · ')+
      (reviewWarnings.length>12?' · y '+(reviewWarnings.length-12)+' más':'')+'</p>';
    excelPreview.innerHTML=markup;
  }
  function shortDate(iso){
    if(!iso)return 'sin revisión registrada';
    const date=new Date(iso);
    return Number.isNaN(date.valueOf())?'desconocida':date.toLocaleString('es-PR',{
      timeZone:'America/Puerto_Rico',dateStyle:'short',timeStyle:'short'});
  }
  async function checkLiveConnection(){
    if(!canPublish())return;
    try{
      const result=await excelRpc({action:'bridgeStatus'});
      if(!canPublish())return;
      bridgeIndicator.textContent=result.configured?
        'Conexión privada de Google Sheets configurada. Presiona «Verificar Google Sheets ahora» para consultar precios y generar borradores inmediatamente.':
        'La lectura directa de Google Sheets todavía requiere una autorización inicial de la cuenta maestra. La consulta de borradores anteriores sigue disponible.';
      bridgeStatus.textContent=result.configured?
        'Conexión activa. Si necesitas cambiarla, usa una clave nueva y vuelve a vincular el Apps Script.':
        'Pendiente: crea y despliega el puente seguro una sola vez para habilitar la consulta directa.';
      if(!result.configured&&canConfigure())bridgeInstructions.open=true;
    }catch(error){
      bridgeIndicator.textContent='No se pudo verificar el estado de la conexión con Google Sheets: '+error.message;
    }
  }
  async function loadDriveDraft(verifyNow=false){
    if(!canPublish()||importPending)return;
    importPending=true;excelButtons();
    excelMessage(verifyNow?'Leyendo Google Sheets y comparando los precios actuales…':
      'Consultando los borradores guardados de Google Sheets…');
    try{
      const result=await excelRpc({action:verifyNow?'refreshNow':'driveDraft'});
      if(!canPublish())return;
      const draft=result.draft;
      if(draft&&Array.isArray(draft.changes)&&draft.changes.length>0){
        activeBatch=draft.id;
        reviewChanges=draft.changes;
        reviewWarnings=[...new Set([
          ...(Array.isArray(draft.warnings)?draft.warnings:[]),
          ...(Array.isArray(result.validationIssues)?result.validationIssues:[])
        ])];
        activeMode='karla_promotions';
        validThrough=draft.valid_through;
        excelFile.value='';
        excelMessage((verifyNow?'Revisión directa terminada · ':'Borrador de última revisión · ')+
          reviewChanges.length+' precio(s) pendientes de aprobación · '+
          reviewWarnings.length+' observaciones · vigencia hasta '+validThrough+
          ' · comprobado '+shortDate(result.lastChecked)+
          '. Revisa los importes antes de presionar «Publicar cambios aprobados».');
      }else{
        activeBatch=null;reviewChanges=[];
        reviewWarnings=Array.isArray(result.validationIssues)?result.validationIssues:[];
        activeMode='karla_promotions';validThrough=null;
        excelMessage((verifyNow?'Revisión directa terminada. ':'')+
          'No hay cambios válidos pendientes de publicación en «Precios PORTAL DE LEWAR». '+
          (verifyNow?String(result.checkedRows||0)+' modelos revisados. ':'')+
          (reviewWarnings.length?' ATENCIÓN: '+reviewWarnings.length+
            ' errores detectados en la hoja. Consulta los modelos y la explicación debajo.':
            (verifyNow&&result.warningsCount?' '+result.warningsCount+' observaciones requieren revisión.':''))+
          ' Última revisión: '+shortDate(result.lastChecked)+'.',
          reviewWarnings.length>0);
      }
      renderExcelPreview();
    }catch(error){
      activeBatch=null;reviewChanges=[];reviewWarnings=[];validThrough=null;
      excelMessage((verifyNow?'No se pudo realizar una revisión nueva: ':'No se pudieron consultar los borradores: ')+
        error.message,true);
      if(verifyNow&&canConfigure()&&/conexión|vincul|Apps Script/i.test(error.message)){
        bridgeInstructions.open=true;
        bridgeIndicator.textContent='Conexión directa pendiente. Completa la configuración única indicada abajo.';
      }
      renderExcelPreview();
    }finally{
      importPending=false;excelButtons();
    }
  }
  driveDraftBtn.addEventListener('click',()=>loadDriveDraft(true));
  bridgeGenerate.addEventListener('click',()=>{
    if(!canConfigure()||importPending)return;
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    bridgeToken.value=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
    bridgeStatus.textContent='Clave segura generada. Cópiala en las propiedades del Google Apps Script antes de vincularlo.';
    excelButtons();
  });
  bridgeCopy.addEventListener('click',async()=>{
    if(!canConfigure()||!bridgeSecretPattern.test(bridgeToken.value))return;
    try{
      await navigator.clipboard.writeText(bridgeToken.value);
      bridgeStatus.textContent='Clave copiada. Pégala en LEWAR_KARLA_SYNC_TOKEN dentro de Apps Script.';
    }catch{
      bridgeToken.type='text';
      bridgeToken.select();
      bridgeStatus.textContent='El navegador no permitió copiar. Copia el texto seleccionado y vuelve a ocultarlo después.';
    }
  });
  bridgeUrl.addEventListener('input',excelButtons);
  bridgeConnect.addEventListener('click',async()=>{
    if(!canConfigure()||importPending||bridgeConnect.disabled)return;
    importPending=true;excelButtons();
    bridgeStatus.textContent='Validando el acceso al Google Sheet privado…';
    try{
      const result=await excelRpc({action:'configureBridge',
        scriptUrl:bridgeUrl.value.trim(),bridgeSecret:bridgeToken.value});
      if(!result.configured)throw Error('La conexión no pudo confirmarse.');
      bridgeToken.value='';bridgeToken.type='password';
      bridgeUrl.value='';bridgeInstructions.open=false;
      bridgeStatus.textContent='Conexión privada configurada correctamente.';
      await checkLiveConnection();
    }catch(error){
      bridgeStatus.textContent='No se pudo vincular la hoja: '+error.message+
        '. Verifica la clave, la URL /exec y los permisos de despliegue del Apps Script.';
    }finally{importPending=false;excelButtons();}
    if(canPublish()&&!bridgeInstructions.open)loadDriveDraft(true);
  });
  excelFile.addEventListener('change',()=>{
    activeBatch=null;reviewChanges=[];reviewWarnings=[];activeMode='master';validThrough=null;
    excelMessage('Archivo seleccionado. Presiona «Revisar tabla de Karla» antes de publicar.');
    renderExcelPreview();
  });
  reviewBtn.addEventListener('click',async()=>{
    if(!canPublish()||!excelFile.files.length||importPending)return;
    const file=excelFile.files[0];
    if(!/\.xlsx$/i.test(file.name)||file.size>6*1024*1024){
      excelMessage('Selecciona un Excel .xlsx de hasta 6 MB.',true);return;
    }
    importPending=true;excelButtons();excelMessage('Comparando los precios aprobados con el Portal General…');
    try{
      const fields=new FormData();
      const auth=authInput();
      fields.append('file',file,file.name);
      fields.append('sessionToken',auth.sessionToken);
      fields.append('deviceId',auth.deviceId);
      const response=await fetch(endpoint,{method:'POST',body:fields,cache:'no-store',
        signal:AbortSignal.timeout(60000)});
      const result=await response.json().catch(()=>({error:'No se recibió una respuesta válida.'}));
      if(!response.ok||!result.ok)throw Error(result.error||'El archivo no pudo revisarse.');
      activeBatch=result.batchId||null;
      reviewChanges=result.changes||[];
      reviewWarnings=result.warnings||[];
      activeMode=result.mode||'master';
      validThrough=result.validThrough||null;
      const karla=activeMode==='karla_promotions';
      excelMessage(result.rowsChecked+' modelos revisados · '+reviewChanges.length+
        (karla?' promociones listas para revisión · ':' precios aprobados diferentes · ')+
        reviewWarnings.length+' alertas. '+
        (karla?'Vigencia hasta '+validThrough+'. ':'')+
        (activeBatch?'Verifica los importes y confirma antes de publicar.':'No hay cambios pendientes de publicación.'));
      renderExcelPreview();
    }catch(error){
      activeBatch=null;reviewChanges=[];
      excelMessage(error.message,true);renderExcelPreview();
    }finally{importPending=false;excelButtons();}
  });
  publishBtn.addEventListener('click',async()=>{
    if(!canPublish()||!activeBatch||!reviewChanges.length||importPending)return;
    const karla=activeMode==='karla_promotions';
    const warning=karla?
      'PUBLICAR '+reviewChanges.length+' promociones de la tabla de Karla, vigentes hasta '+validThrough+
      '?\n\nSe aplicarán los precios de 1–2 unidades y los precios desde 3 unidades por modelo. Al expirar se volverá al precio base publicado.'+
      '\n\nNo se publican costos, cantidades internas, impuestos ni columnas particulares de clientes.':
      'PUBLICAR '+reviewChanges.length+' cambios de precio generales en el Portal General de Lewar?'+
      '\n\nLos impuestos, inventarios y precios especiales por cliente NO se modificarán.';
    if(!confirm(warning))return;
    importPending=true;excelButtons();excelMessage('Publicando precios autorizados…');
    try{
      const result=await excelRpc({action:'publish',batchId:activeBatch,approveCount:reviewChanges.length});
      excelMessage('Publicación completada: '+result.published+
        (activeMode==='karla_promotions'?' promociones con vencimiento '+validThrough:' precios generales')+
        '. Los clientes verán los precios nuevos al actualizar el catálogo.');
      activeBatch=null;reviewChanges=[];reviewWarnings=[];
      excelFile.value='';renderExcelPreview();
      window.alert('Cambios publicados correctamente. Se actualizará el portal para reflejar los nuevos precios.');
      window.location.reload();
    }catch(error){excelMessage(error.message,true);}
    finally{importPending=false;excelButtons();}
  });
  function setPublishPermission(){
    byId('masterPublishPanel').classList.toggle('hidden',!canPublish());
    bridgeSetup.classList.toggle('hidden',!canConfigure());
    if(!canPublish()){
      activeBatch=null;reviewChanges=[];reviewWarnings=[];validThrough=null;
      bridgeToken.value='';bridgeToken.type='password';bridgeUrl.value='';
      renderExcelPreview();
    }
    excelButtons();
  }

  // Listado administrativo de pedidos pendientes de AR Invoice.
  const ordersPanel=byId('masterOrdersPanel');
  const ordersStatus=byId('masterOrdersStatus');
  const ordersList=byId('masterOrdersList');
  const ordersRefresh=byId('masterOrdersRefresh');
  let ordersBusy=false;
  const mayViewOrders=()=>['owner','admin','catalog'].includes(role);
  const orderMoney=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(cents)||0)/100);
  function orderStatusLine(message,error=false){
    ordersStatus.textContent=message;
    ordersStatus.classList.toggle('accountError',error);
  }
  async function loadOrders(){
    if(!mayViewOrders()||ordersBusy)return;
    ordersBusy=true;ordersRefresh.disabled=true;
    orderStatusLine('Consultando las órdenes registradas…');
    try{
      if(typeof window.lewarOrderApi!=='function')throw Error('Servicio de órdenes no disponible.');
      const payload=await window.lewarOrderApi('staffList');
      if(!mayViewOrders())return;
      const list=Array.isArray(payload.orders)?payload.orders:[];
      const outstanding=list.filter(item=>item.agingSyncStatus!=='synced').length;
      orderStatusLine(list.length+' solicitudes recientes · '+outstanding+
        ' con sincronización de aging pendiente · Todas requieren factura AR validada.');
      ordersList.innerHTML=list.length?
        '<table class="orderTable" style="min-width:850px"><thead><tr>'+
        '<th>Referencia</th><th>Cliente</th><th>Fecha</th><th>Total previsto</th>'+
        '<th>Seguimiento aging</th><th>Notificación</th><th>PDF</th></tr></thead><tbody>'+
        list.map(item=>{
          const date=new Date(item.createdAt).toLocaleDateString('es-PR',{timeZone:'America/Puerto_Rico'});
          const aging=item.agingSyncStatus==='synced'?'En aging · pendiente de AR':'Pendiente de sincronizar';
          const email=item.emailStatus==='sent'?'Aviso interno aceptado':'Aviso interno sin confirmar';
          const customer=item.clientEmailStatus==='sent'?' · Copia cliente aceptada':item.clientEmailStatus==='failed'?' · Copia cliente fallida':'';
          return '<tr><td><b>'+safe(item.reference)+'</b></td>'+
            '<td>'+safe(item.customerName)+(item.customerCode?' <small>'+safe(item.customerCode)+'</small>':'')+'</td>'+
            '<td>'+safe(date)+'</td><td><b>'+orderMoney(item.totalCents)+'</b></td>'+
            '<td>'+safe(aging)+'</td><td>'+safe(email+customer)+'</td>'+
            '<td><button class="pdfBtn" type="button" data-order-id="'+safe(item.id)+'">Descargar PDF</button></td></tr>';
        }).join('')+'</tbody></table>':
        '<p class="lead">Aún no se han recibido solicitudes reales desde el Portal General.</p>';
    }catch(error){orderStatusLine('No fue posible consultar las órdenes: '+error.message,true);}
    finally{ordersBusy=false;ordersRefresh.disabled=false;}
  }
  ordersRefresh.addEventListener('click',loadOrders);
  ordersList.addEventListener('click',async event=>{
    const button=event.target.closest('[data-order-id]');
    if(!button||!mayViewOrders())return;
    button.disabled=true;
    try{
      const result=await window.lewarOrderApi('staffPdf',{orderId:button.dataset.orderId});
      window.lewarDownloadB64PDF(result.pdfBase64,result.reference+'.pdf');
    }catch(error){orderStatusLine('No se pudo descargar el PDF: '+error.message,true);}
    finally{button.disabled=false;}
  });
  function orderPermissions(){
    ordersPanel.classList.toggle('hidden',!mayViewOrders());
    if(!mayViewOrders())ordersList.replaceChildren();
  }
  const originalPermissions=permissions;
  function combinedPermissions(next){
    originalPermissions(next);
    setPublishPermission();
    orderPermissions();
  }
  async function openCombined(){
    await open();
    if(mayViewOrders())loadOrders();
    if(canPublish()&&!importPending){
      checkLiveConnection();
      loadDriveDraft(false);
    }
  }
  window.LewarMaster={open:openCombined,permissions:combinedPermissions};
})();

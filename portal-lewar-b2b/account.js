(function () {
  'use strict';
  if (window.location.protocol === 'http:' &&
      ['lewardistributors.com', 'www.lewardistributors.com'].includes(window.location.hostname)) {
    const secureUrl = new window.URL(window.location.href);
    secureUrl.protocol = 'https:';
    secureUrl.hostname = 'www.lewardistributors.com';
    secureUrl.port = '';
    window.location.replace(secureUrl.href);
    return;
  }
  const URL = 'https://aznoakixjklsxuwuyshw.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6bm9ha2l4amtsc3h1d3V5c2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3OTgxNjIsImV4cCI6MjEwNjM3NDE2Mn0.yFIUmArDTliai9JhLtVtxGdGU5Y6U6bVZGYzJEFHe14';
  const SESSION = 'lewar-client-session-v1', DEVICE = 'lewar-client-device-v1';
  const el = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const usd = cents => cents === null ? 'No disponible' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
  const day = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.slice(5,7)+'/'+s.slice(8,10)+'/'+s.slice(0,4) : 'No documentada';
  const labels = {'saldada':'Saldada','abono':'Abono','saldo-reducido':'Saldo reducido','con-saldo':'Con saldo','por-conciliar':'Por conciliar','por-validar':'Por validar','confirmado':'Confirmado','depositado':'Depositado','recibido':'Recibido · pendiente','registrado-sap':'Registrado en SAP','devuelto':'Devuelto','anulado':'Anulado','posdatado':'Posdatado · pendiente'};
  const label = s => labels[s] || s || 'Por validar';
  function get(key) {try {return localStorage.getItem(key)||sessionStorage.getItem(key)||cookie(key)} catch {return cookie(key)}}
  function cookie(key) {const p=document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(encodeURIComponent(key)+'='));return p?decodeURIComponent(p.slice(p.indexOf('=')+1)):''}
  function device() {
    const stored=get(DEVICE); if(stored)return stored;
    const s=window.screen||{};
    const id='fp-'+[navigator.userAgent||'ua',navigator.platform||'platform',navigator.language||'lang',String(s.width||0)+'x'+String(s.height||0),String(navigator.hardwareConcurrency||0),String(navigator.deviceMemory||0),Intl.DateTimeFormat().resolvedOptions().timeZone||'tz'].join('|').replace(/[^a-zA-Z0-9|._:-]/g,'').slice(0,500);
    try{localStorage.setItem(DEVICE,id)}catch{} return id;
  }
  let token=get(SESSION)||'', data=null, pending=false, customerId=null, generation=0;
  function saveToken(value) {token=value;try{sessionStorage.setItem(SESSION,value);localStorage.removeItem(SESSION)}catch{}}
  function clearToken() {hasLoadedStock=false;window.setPortalStock?.(null);token='';data=null;customerId=null;generation++;try{sessionStorage.removeItem(SESSION);localStorage.removeItem(SESSION)}catch{}document.cookie=encodeURIComponent(SESSION)+'=; Path=/; Max-Age=0; SameSite=Lax; Secure';}
  function status(text,error=false) {el('accountStatus').textContent=text;el('accountStatus').classList.toggle('accountError',error);}
  function clearFigures() {for(const id of ['accountBalance','accountOverdue','accountPayments','accountAging'])el(id).textContent='—';el('accountInvoices').innerHTML='';el('accountPaymentRows').innerHTML='';el('accountCustomer').textContent='';el('accountTables').hidden=true;el('accountStats').hidden=true;el('accountPrint').disabled=true;}
  async function rpc(name,body) {
    const r=await fetch(URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
    const value=await r.json();if(!r.ok||!value.ok)throw Error(value.error||value.message||'No se pudo verificar el acceso.');return value;
  }
  async function login(inputId='accountPin') {
    if(pending)return;
    const input=el(inputId),pin=input.value.trim();
    if(!/^\d{6}$/.test(pin)){el(inputId==='portalPin'?'portalPinStatus':'accountStatus').textContent='Ingresa tu PIN de 6 dígitos.';input.focus();return;}
    clearToken();clearFigures();pending=true;el('portalPinStatus').textContent='Verificando acceso…';status('Verificando acceso…');
    try {
      const value=await rpc('portal_access_login',{p_pin:pin,p_device_id:device(),p_device_info:{browser:navigator.userAgent,platform:navigator.platform,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}});
      saveToken(value.sessionToken);input.value='';generation++;customerId=null;
      window.enterAccountPortal(value.actor?.name || 'Mi cuenta');refreshStock();
      el('portalPinStatus').textContent='';
    } catch(e) {el('portalPinStatus').textContent=e.message;status(e.message,true)}
    finally {pending=false}
    if(token)await refresh();
  }
  let stockPending=false,hasLoadedStock=false;
  async function refreshStock() {
    if(!token||document.hidden||stockPending)return;
    const currentToken=token;
    stockPending=true;
    const refreshButton=el('inventoryRefresh');
    if(refreshButton)refreshButton.disabled=true;
    const message=el('inventoryLoadMessage');
    if(message)message.textContent='Consultando inventario autorizado de Lewar…';
    try {
      const r=await fetch(URL+'/functions/v1/lewar-stock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionToken:currentToken,deviceId:device()}),cache:'no-store',signal:AbortSignal.timeout(20000)});
      const stock=await r.json();
      if(!r.ok||![1,2,3].includes(stock.schema)||!Array.isArray(stock.items))throw Error(stock.error||'Disponibilidad no disponible.');
      if(token===currentToken){
        window.setPortalStock?.(stock);
        hasLoadedStock=true;
      }
    }catch(error){
      if(token===currentToken){
        if(!hasLoadedStock)window.setPortalStock?.(null);
        const notice=el('inventoryLoadMessage');
        if(notice)notice.textContent=(hasLoadedStock?'No se pudo actualizar; se mantiene el último corte cargado. ':'No se pudo consultar el inventario. ')+
          'Presiona «Actualizar existencias» para volver a intentar.';
      }
    }finally{
      stockPending=false;
      if(refreshButton)refreshButton.disabled=false;
      if(token&&token!==currentToken)refreshStock();
    }
  }
  async function refresh() {
    if(!token){clearFigures();el('accountGate').hidden=false;el('accountLogout').hidden=true;el('accountCustomerSelect').hidden=true;status('Usa tu PIN autorizado para consultar tu estado de cuenta.');return;}
    if(pending)return;pending=true;
    const version=generation,usedToken=token;
    el('accountRefresh').disabled=true;el('accountCustomerSelect').disabled=true;status('Actualizando estado de cuenta…');
    try {
      const r=await fetch(URL+'/functions/v1/portal-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionToken:token,deviceId:device(),customerId}),cache:'no-store',signal:AbortSignal.timeout(25000)});
      const value=await r.json();if(version!==generation||usedToken!==token)return;
      if(!r.ok){
        if(r.status===401){
          clearToken();
          clearFigures();
          el('accountGate').hidden=false;
          el('accountLogout').hidden=true;
          el('accountCustomerSelect').hidden=true;
          status(value.error||'Sesión inválida o vencida.',true);
          return;
        }
        if(r.status===403){
          el('accountGate').hidden=true;
          el('accountLogout').hidden=false;
          el('accountCustomerSelect').hidden=true;
        }
        throw Error(value.error||'No se pudo actualizar.');
      }
      el('accountGate').hidden=true;el('accountLogout').hidden=false;
      if(value.selectCustomer){clearFigures();const select=el('accountCustomerSelect');select.innerHTML='<option value="">Selecciona un cliente</option>'+value.customers.map(c=>'<option value="'+escape(c.id)+'">'+escape(c.name)+'</option>').join('');select.hidden=false;status('Selecciona el cliente cuyo estado de cuenta deseas consultar.');return;}
      data=value;render();
    } catch(e) {if(version===generation){clearFigures();data=null;status(e.name==='TimeoutError'?'La consulta tardó demasiado. Pulsa Actualizar para intentar nuevamente.':e.message,true)}}
    finally {pending=false;el('accountRefresh').disabled=false;el('accountCustomerSelect').disabled=false;}
  }
  function table(rows,headers) {return '<div class="accountTableScroll"><table class="accountTable"><thead><tr>'+headers.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}
  function render() {
    clearFigures();if(!data)return;
    window.setAccountCustomerName?.(data.customer.name);
    el('accountCustomer').textContent=data.customer.name+(data.customer.code?' · '+data.customer.code:'');
    if(!data.linked){status(data.message);return;}
    el('accountStats').hidden=false;el('accountTables').hidden=false;el('accountPrint').disabled=false;
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Puerto_Rico',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const overdue=data.invoices.filter(i=>i.due<today&&i.balance>0).reduce((s,i)=>s+i.balance,0);
    const validPayments=data.payments.filter(p=>!['anulado','devuelto','cancelado'].includes(p.status));
    el('accountBalance').textContent=usd(data.balance);el('accountOverdue').textContent=data.hasRecords?usd(overdue):'No disponible';el('accountPayments').textContent=usd(validPayments.reduce((s,p)=>s+p.amount,0));el('accountAging').textContent=day(data.agingDate);
    const synced=new Intl.DateTimeFormat('es-PR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Puerto_Rico'}).format(new Date(data.syncedAt));
    status('Actualizado: '+synced+' (Puerto Rico).'+(data.needsReview?' Hay facturas pendientes de validación.':'')+(data.hasRecords?'':' No hay registros disponibles para este cliente; confirma el estado con Lewar.'));
    const keys=new Set(data.invoices.map(i=>i.key));
    const invoices=[...data.invoices.map(i=>({...i,status:i.needsReview?'por-validar':i.balance===0?'saldada':'con-saldo'})),...data.paidInvoices.filter(i=>!keys.has(i.key))];
    const invoiceRows=invoices.map(i=>'<tr><td>'+escape(i.number)+(i.installment?' / '+escape(i.installment):'')+'</td><td>'+day(i.posting||i.date)+'</td><td>'+day(i.due)+'</td><td>'+usd(i.original)+'</td><td>'+usd(i.balance)+'</td><td>'+escape(label(i.status))+'</td></tr>');
    el('accountInvoices').innerHTML=invoiceRows.length?table(invoiceRows,['Factura','Fecha','Vencimiento','Importe original','Balance','Estado']):'<p>No hay facturas en los registros disponibles.</p>';
    const paymentRows=[...data.payments].sort((a,b)=>b.date.localeCompare(a.date)).map(p=>'<tr><td>'+day(p.date)+(p.dateBasis==='validacion'?'<small>Fecha de validación</small>':'')+'</td><td>'+escape(p.method)+'</td><td>'+escape(p.reference||'No documentada')+'</td><td>'+usd(p.amount)+'</td><td>'+escape(label(p.status))+(p.depositDate?'<small>Depósito: '+day(p.depositDate)+'</small>':'')+'</td><td>'+p.applications.map(a=>escape(a.number)+(a.installment?' / '+escape(a.installment):'')+': '+usd(a.amount)+' · '+escape(label(a.status))).join('<br>')+(p.unapplied?'<small>Sin aplicación: '+usd(p.unapplied)+'</small>':'')+'</td></tr>');
    el('accountPaymentRows').innerHTML=paymentRows.length?table(paymentRows,['Fecha','Método','Referencia / cheque','Monto','Estado','Facturas']):'<p>No hay pagos registrados en el historial disponible.</p>';
    el('accountHistoryNote').textContent='Los pagos recibidos, posdatados o pendientes no equivalen a fondos confirmados. El balance refleja la conciliación registrada en Control de cobros.'+(data.historyAvailableFrom?' Historial disponible desde '+day(data.historyAvailableFrom)+'.':'');
  }
  async function logout() {const old=token;clearToken();clearFigures();el('accountGate').hidden=false;el('accountLogout').hidden=true;el('accountCustomerSelect').hidden=true;status('Usa tu PIN autorizado para consultar tu estado de cuenta.');await refresh();if(old)try{await rpc('portal_access_logout',{p_session_token:old,p_device_id:device()})}catch{}}
  const visible=()=>!document.hidden&&!el('view-account').classList.contains('hidden');
  async function master(action,fields={}) {
    if(!token)throw Error('Entra con tu PIN autorizado.');
    const currentToken=token;
    const response=await fetch(URL+'/functions/v1/lewar-stock',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...fields,action,sessionToken:currentToken,deviceId:device()}),cache:'no-store',signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok||!result.ok||token!==currentToken)throw Error(result.error||'No se pudo guardar el cambio.');
    if(action!=='masterRead')await refreshStock();
    return result;
  }
  async function uploadProductPhoto(sku,file) {
    if(!token)throw Error('Entra con tu PIN autorizado.');
    const currentToken=token;
    const response=await fetch(URL+'/functions/v1/lewar-stock',{method:'POST',headers:{'Content-Type':file.type,
      'Authorization':'Bearer '+currentToken,'X-Lewar-Photo-Sku':encodeURIComponent(sku),'X-Lewar-Device':encodeURIComponent(device())},
      body:file,cache:'no-store',signal:AbortSignal.timeout(45000)});
    const result=await response.json();
    if(!response.ok||!result.ok||token!==currentToken)throw Error(result.error||'No se pudo sustituir la foto.');
    await refreshStock();
    return result;
  }
  window.LewarAccount={login,refresh,refreshStock,logout,master,uploadProductPhoto,select:async id=>{customerId=id||null;generation++;data=null;clearFigures();await refresh()},print:()=>{if(data?.linked){document.body.classList.add('printingAccount');window.print();document.body.classList.remove('printingAccount')}}};
  el('accountPin').addEventListener('keydown',e=>{if(e.key==='Enter')login()});el('portalPin').addEventListener('keydown',e=>{if(e.key==='Enter')login('portalPin')});
  function refreshVisible(){if(visible())refresh();refreshStock();}
  window.addEventListener('focus',refreshVisible);document.addEventListener('visibilitychange',refreshVisible);setInterval(refreshVisible,60000);
  if(token){window.enterAccountPortal('Mi cuenta');refresh();refreshStock();}
  window.addEventListener('pagehide',()=>{data=null;clearFigures();window.setPortalStock?.(null)});window.addEventListener('pageshow',refreshVisible);
})();

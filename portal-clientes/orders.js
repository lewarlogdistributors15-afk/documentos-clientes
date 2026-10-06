const SUPABASE_URL='https://aznoakixjklsxuwuyshw.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6bm9ha2l4amtsc3h1d3V5c2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3OTgxNjIsImV4cCI6MjEwNjM3NDE2Mn0.yFIUmArDTliai9JhLtVtxGdGU5Y6U6bVZGYzJEFHe14';
const SESSION_KEY='lewar-client-session-v1';
const DEVICE_KEY='lewar-client-device-v1';
const $=id=>document.getElementById(id);
const memoryStore={};
let sessionToken='';

function safeGet(key){
  try{const v=localStorage.getItem(key);if(v!==null)return v}catch{}
  try{const v=sessionStorage.getItem(key);if(v!==null)return v}catch{}
  return Object.prototype.hasOwnProperty.call(memoryStore,key)?memoryStore[key]:null;
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
  const parts=[navigator.userAgent||'ua',navigator.platform||'platform',navigator.language||'lang',
    String(s.width||0)+'x'+String(s.height||0),String(navigator.hardwareConcurrency||0),
    String(navigator.deviceMemory||0),Intl.DateTimeFormat().resolvedOptions().timeZone||'tz'];
  return 'fp-'+parts.join('|').replace(/[^a-zA-Z0-9|._:-]/g,'').slice(0,500);
}
function deviceId(){return safeGet(DEVICE_KEY)||cookieGet(DEVICE_KEY)||deviceFingerprint()}
async function rpc(name,payload){
  const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(payload),
    cache:'no-store'
  });
  let data={};try{data=await res.json()}catch{}
  if(!res.ok)throw new Error(data.message||data.error||'No se pudo conectar con el registro.');
  return data;
}
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(cents)||0)/100);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function render(orders){
  const rows=$('rows');rows.replaceChildren();
  if(!orders.length){
    const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=9;td.className='empty';td.textContent='No se encontraron órdenes.';tr.append(td);rows.append(tr);return;
  }
  for(const o of orders){
    const tr=document.createElement('tr');
    const created=o.date||new Date(o.createdAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico'});
    const createdBy=o.submittedBy||'Cliente';
    tr.innerHTML='<td><strong>'+esc(o.id)+'</strong><br><span class="status">v'+esc(o.version)+' · '+esc(created)+'</span></td>'+
      '<td>'+esc(o.cliente)+'</td>'+
      '<td>'+esc(o.vendedor||'—')+'</td>'+
      '<td>'+esc(createdBy)+(o.submittedRole?'<br><span class="status">'+esc(o.submittedRole)+'</span>':'')+'</td>'+
      '<td>'+esc(o.units)+'</td>'+
      '<td class="money"><strong>'+money(o.total)+'</strong></td>'+
      '<td><span class="pill">'+esc(o.status||'—')+'</span></td>'+
      '<td><span class="pill">'+esc(o.emailState||'—')+'</span></td>';
    const action=document.createElement('td');
    const btn=document.createElement('button');btn.className='detail-btn';btn.type='button';btn.textContent='Detalle';
    const detail=document.createElement('div');detail.className='details';detail.hidden=true;
    const lines=(o.lines||[]).map(l=>'<li>'+esc(l.quantity)+' × '+esc(l.product?.modelo||'')+' · '+money(l.total)+'</li>').join('');
    detail.innerHTML='<strong>Contacto:</strong> '+esc(o.contacto||'—')+' · '+esc(o.telefono||'—')+' · '+esc(o.correo||'—')+
      (o.nota?'<br><strong>Notas:</strong> '+esc(o.nota):'')+
      '<br><strong>Artículos:</strong><ul>'+lines+'</ul>';
    btn.onclick=()=>{detail.hidden=!detail.hidden;btn.textContent=detail.hidden?'Detalle':'Ocultar'};
    action.append(btn,detail);tr.append(action);rows.append(tr);
  }
}
async function load(){
  $('status').textContent='Cargando registro…';
  try{
    const data=await rpc('portal_admin_orders',{
      p_session_token:sessionToken,
      p_device_id:deviceId(),
      p_search:$('search').value.trim()||null
    });
    if(!data.ok)throw new Error(data.error||'Acceso denegado.');
    $('access-panel').hidden=true;$('registry').hidden=false;
    $('status').textContent=(data.orders?.length||0)+' órdenes mostradas.';
    render(data.orders||[]);
  }catch(e){
    $('registry').hidden=true;$('access-panel').hidden=false;
    $('access-status').textContent=e.message;
    $('access-status').className='status error';
  }
}
async function logout(){
  try{if(sessionToken)await rpc('portal_access_logout',{p_session_token:sessionToken,p_device_id:deviceId()})}catch{}
  safeRemove(SESSION_KEY);location.href='./';
}
$('refresh').addEventListener('click',load);
$('search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();load()}});
$('logout').addEventListener('click',logout);
sessionToken=safeGet(SESSION_KEY)||cookieGet(SESSION_KEY)||'';
if(!sessionToken){$('access-status').textContent='Inicia sesión como administrador desde el portal de pedidos.';$('access-status').className='status error';}
else load();

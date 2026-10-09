(()=>{
'use strict';
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

async function loadInventory(includeItems=true){
 const token=safeGet(SESSION_KEY)||cookieGet(SESSION_KEY)||'';
 if(!token)return {ok:false,code:'SESSION',error:'Inicia sesión en el portal con tu cuenta interna.'};
 const data=await rpc('portal_staff_inventory',{p_session_token:token,p_device_id:deviceId(),p_include_items:includeItems});
 if(token!==(safeGet(SESSION_KEY)||cookieGet(SESSION_KEY)||''))return {ok:false,error:'La sesión cambió. Vuelve a acceder.'};
 return data;
}
async function refreshLink(){
 const link=document.getElementById('inventory-tab');
 if(!link)return;
 link.hidden=true;
 try{const data=await loadInventory(false);link.hidden=!data.ok}catch{}
}
window.LewarInventory={load:loadInventory,refreshLink};
window.addEventListener('pageshow',refreshLink);
window.addEventListener('storage',refreshLink);
refreshLink();
})();

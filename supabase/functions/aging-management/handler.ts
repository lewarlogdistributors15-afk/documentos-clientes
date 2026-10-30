const ORIGIN='https://lewarlogdistributors15-afk.github.io';
const encode=new TextEncoder();
export const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
const day=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s));
const short=(s:unknown,max=200)=>{if(typeof s!=='string'||s.length>max)throw Error('invalid');return s;};
const amount=(n:unknown)=>{if(!Number.isSafeInteger(n)||Number(n)<0)throw Error('invalid');return n;};
export function cleanPayload(b:any){
 if(!Number.isSafeInteger(b?.revision)||b.revision<1||!Array.isArray(b.readers)||b.readers.length<1||b.readers.length>10||!Array.isArray(b.snapshot?.invoices)||b.snapshot.invoices.length>10000)throw Error('invalid');
 const readers=b.readers.map((r:any)=>{if(!/^[0-9a-f]{64}$/.test(r.keyHash)||!r.email?.includes('@'))throw Error('invalid');return {email:short(r.email).toLowerCase(),name:short(r.name),keyHash:r.keyHash};});
 if(new Set(readers.map((r:any)=>r.email)).size!==readers.length||new Set(readers.map((r:any)=>r.keyHash)).size!==readers.length)throw Error('invalid');
 const a=b.snapshot.aging;const aging=a?{date:short(a.date,10),name:short(a.name,300),uploadedAt:short(a.uploadedAt,40)}:null;
 if(aging&&(!day(aging.date)||isNaN(Date.parse(aging.uploadedAt))))throw Error('invalid');
 const invoices=b.snapshot.invoices.map((i:any)=>{if(!day(i.posting)||!day(i.due)||typeof i.needsReview!=='boolean')throw Error('invalid');return {key:short(i.key,300),clientCode:short(i.clientCode,60),clientName:short(i.clientName),number:short(i.number,80),installment:short(i.installment,30),posting:i.posting,due:i.due,term:short(i.term,60),original:amount(i.original),balance:amount(i.balance),agingBalance:amount(i.agingBalance),needsReview:i.needsReview};});
 if(new Set(invoices.map((i:any)=>i.key)).size!==invoices.length)throw Error('invalid');
 return {revision:b.revision,readers,snapshot:{aging,invoices,checkedAt:new Date().toISOString()},updated_at:new Date().toISOString()};
}
export function makeHandler(settings:{url:string;serviceKey:string;request?:typeof fetch}){
 const request=settings.request||fetch;
 const rest=(query:string,init:RequestInit={})=>request(settings.url+'/rest/v1/management_bridge?'+query,{...init,headers:{apikey:settings.serviceKey,Authorization:'Bearer '+settings.serviceKey,'Content-Type':'application/json',...init.headers}});
 return async(req:Request)=>{
  const origin=req.headers.get('origin')||'';
  const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Origin','X-Content-Type-Options':'nosniff',...(origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,OPTIONS'}:{})};
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&origin!==ORIGIN)return json({error:'Origen no permitido.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','POST'].includes(req.method))return json({error:'Método no permitido.'},405);
  try{
   // The owner explicitly enabled public read-only access. Never select reader
   // identities or server credentials when returning the aging projection.
   if(req.method==='GET'){
    const result=await rest('id=eq.lewar&select=snapshot,updated_at');if(!result.ok)throw Error('database');const current=(await result.json())[0];
    if(!current?.snapshot)return json({error:'El aging todavía no está sincronizado.'},503);
    return json({...current.snapshot,checkedAt:new Date().toISOString(),syncedAt:current.updated_at});
   }
   const credential=req.headers.get('x-sync-key');
   if(!credential||!(/^[a-zA-Z0-9_-]{43,100}$/).test(credential))return json({error:'Acceso no autorizado.'},401);
   const digest=await hash(credential);
   // Synchronization remains authenticated independently of public viewing.
   const check=await rest('id=eq.lewar&select=writer_hash,revision');
   if(!check.ok)throw Error('database');const rows=await check.json(),record=rows[0];if(!record)throw Error('database');
   if(req.method==='POST'){
    if(!safeEqual(record.writer_hash,digest))return json({error:'Acceso no autorizado.'},401);
    if(Number(req.headers.get('content-length')||0)>2500000)return json({error:'Carga demasiado grande.'},413);
    const raw=await req.text();if(raw.length>2500000)return json({error:'Carga demasiado grande.'},413);
    let value;try{value=cleanPayload(JSON.parse(raw))}catch{return json({error:'Datos de sincronización no válidos.'},400);}
    // Optimistic monotonic update prevents a delayed request from replacing newer data.
    const update=await rest('id=eq.lewar&revision=lt.'+value.revision,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(value)});
    if(!update.ok)throw Error('database');return json({ok:true});
   }
  }catch{return json({error:'No se pudo consultar el aging. Intenta nuevamente.'},503);}
 };
}

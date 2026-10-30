export type Client={termOverride?:boolean;id:string;name:string;code:string;contact:string;phone:string;phoneNotes:string;classification:string;verified:boolean;consent:boolean;notes:string;source:string;term:string};
export type Invoice={key:string;clientId:string;number:string;installment:string;posting:string;due:string;term:string;original:number;balance:number;salesperson:string};
export type Aging={id:string;date:string;fileId:string;name:string;invoices:Invoice[];created:string};
export type Allocation={key:string;number:string;amount:number;baseline:string;included:boolean};
export type Payment={sapDocuments?:import('./sap-payments').SapDocument[];id:string;clientId:string;amount:number;date:string;method:string;status:string;reference:string;depositDate:string;evidence:string;notes:string;allocations:Allocation[];created:string;dateBasis?:'validacion';validations?:{reviewId:string;at:string;by:string;note:string;invoice:string;invoiceKey:string;previousFile:string;detectedFile:string}[]};
export type Message={id:string;clientId:string;phone:string;text:string;pdfId:string;agingId:string;status:string;created:string;sentAt?:string;notes?:string};
export type Settings={drivePreparedAt?:string;activeImport:string;sender:string;template:string;importProfile?:{headers:string[];mapping:Record<string,number>;format:string;header:number}};
export type State={agingReviews?:import("./aging-review").AgingReview[];clients:Client[];aging:Aging|null;imports:{id:string;date:string;name:string;created:string;count:number;fileId:string}[];payments:Payment[];messages:Message[];events:{id:string;kind:string;entity:string;data:Record<string,unknown>;created:string;actor:string}[];settings:Settings};
export const defaultTemplate='Hola {encargado}, le saluda Emmanuel del Departamento de Finanzas y Gestión de Cobro de Lewar LogDistributors. Adjunto el estado de cuenta de {empresa}, con {facturas} factura(s) pendiente(s) y un balance de {balance}, al {fecha}. Agradeceré confirmar la fecha estimada de pago o compartir la evidencia si ya lo realizó. Gracias.';
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Puerto_Rico',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const expectedDay=(day=today())=>{const d=new Date(day+'T12:00:00Z');const w=d.getUTCDay();if(w===0)d.setUTCDate(d.getUTCDate()-2);if(w===6)d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)};
export const validDay=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
export const displayDay=(s:string)=>s?`${s.slice(5,7)}/${s.slice(8,10)}/${s.slice(0,4)}`:'—';
export const late=(due:string,day=today())=>Math.max(0,Math.round((Date.parse(day)-Date.parse(due))/86400000));
export const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const phone=(s:string)=>{let d=s.replace(/\D/g,'');if(d.length===10)d='1'+d;return /^\d{11,15}$/.test(d)?d:''};
export function cents(v:unknown){const s=String(v??'').trim().replace(/[$,\s]/g,'').replace(/^\((.*)\)$/,'-$1');if(!/^-?\d+(\.\d{1,2})?$/.test(s))return NaN;const n=Math.round(Number(s)*100);return Number.isSafeInteger(n)?n:NaN}
export function parseDay(v:unknown,format='MDY'):string{
 if(v instanceof Date)return v.toISOString().slice(0,10);
 if(typeof v==='number')return new Date(Math.round((v-25569)*86400000)).toISOString().slice(0,10);
 const s=String(v??'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(s))return validDay(s.slice(0,10))?s.slice(0,10):'';
 const m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);if(!m)return '';
 const d=`${m[3]}-${(format==='DMY'?m[2]:m[1]).padStart(2,'0')}-${(format==='DMY'?m[1]:m[2]).padStart(2,'0')}`;return validDay(d)?d:'';
}
export function effective(i:Invoice,agingId:string,payments:Payment[]){let adjustment=0,reconcile=false;for(const p of payments.filter(p=>p.clientId===i.clientId&&['confirmado','depositado','devuelto'].includes(p.status))){for(const a of p.allocations.filter(a=>a.key===i.key)){if(p.status==='devuelto'){if(a.included||a.baseline!==agingId)reconcile=true;continue}if(a.baseline!==agingId)reconcile=true;else if(!a.included)adjustment+=a.amount;}}return {balance:Math.max(0,i.balance-adjustment),reconcile,overallocated:adjustment>i.balance};}
export function assertPayment(p:Payment,s:State){
 if(!s.aging)throw Error('Carga un aging antes de registrar pagos.');
 if(!s.clients.some(c=>c.id===p.clientId))throw Error('Cliente no válido.');
 if(!validDay(p.date)||p.date>today())throw Error('Revisa la fecha del pago.');
 if(!['Cheque','ACH','Transferencia','Efectivo','Tarjeta','Otro'].includes(p.method))throw Error('Método no válido.');
 if(!Number.isSafeInteger(p.amount)||p.amount<=0)throw Error('Importe de pago no válido.');
 if(p.method==='Cheque'&&!p.reference.trim())throw Error('Escribe el número del cheque.');
 if(!['confirmado','recibido'].includes(p.status)||(p.method==='Cheque'&&p.status!=='recibido'))throw Error('Estado de pago no válido.');
 if(!p.allocations.length||new Set(p.allocations.map(a=>a.key)).size!==p.allocations.length||p.allocations.reduce((t,a)=>t+a.amount,0)!==p.amount)throw Error('La suma aplicada a facturas debe ser igual al pago.');
 for(const a of p.allocations){const i=s.aging.invoices.find(i=>i.key===a.key&&i.clientId===p.clientId);if(!i||!Number.isSafeInteger(a.amount)||a.amount<=0)throw Error('Factura o cantidad no válida.');const e=effective(i,s.aging.id,s.payments);if(e.reconcile)throw Error('Concilia los pagos anteriores antes de aplicar otro pago.');const reserved=s.payments.filter(p=>p.status==='recibido').flatMap(p=>p.allocations).filter(x=>x.key===a.key&&!x.included).reduce((t,x)=>t+x.amount,0);if(a.amount>e.balance-reserved)throw Error('La cantidad excede el balance disponible de la factura '+i.number);}
 if(p.reference&&s.payments.some(x=>x.clientId===p.clientId&&x.method===p.method&&x.reference.toLowerCase()===p.reference.toLowerCase()&&x.status!=='anulado'))throw Error('Ya existe un pago de este cliente con esa referencia.');
}
export const reportCell=(v:unknown)=>{let s=String(v??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};

// Calendar days from the invoice posting date; no business-day shifts.
export function paymentTermDays(term:string):number|null{
 const t=term.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
 if(['COD','C.O.D.','CONTADO','AL CONTADO','CASH'].includes(t))return 0;
 const m=t.match(/^(?:NET\s*|NETO\s*|N\/)?(\d{1,3})(?:\s*(?:DIAS|DAYS))?$/);
 if(!m)return null;const n=Number(m[1]);return n<=365?n:null;
}
export function withContactTerms(aging:Aging|null,clients:Client[]):Aging|null{
 if(!aging)return null;const byId=new Map(clients.map(c=>[c.id,c]));
 return {...aging,invoices:aging.invoices.map(i=>{const c=byId.get(i.clientId),days=c?.termOverride?paymentTermDays(c.term):null;
  if(days===null||!validDay(i.posting))return i;
  const date=new Date(i.posting+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);
  return {...i,term:c!.term,due:date.toISOString().slice(0,10)};
 })};
}
export function dueStatus(due:string,day=today()):string{
 const days=Math.round((Date.parse(due+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000);
 return days<0?`${-days} días vencida`:days===0?'Vence hoy':`${days} días restantes`;
}


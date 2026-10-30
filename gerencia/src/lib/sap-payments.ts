import {cents,parseDay,today,validDay,type Payment,type State} from './domain';
export type SapDocument={document:string;date:string;clientCode:string;amount:number;openBalance:number;account:string;dueDate:string;recordedAt?:string;recordedBy?:string};
export function parseSapPayments(text:string):SapDocument[]{
 const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());
 if(lines.length<2||lines.length>201)throw Error('Pega el encabezado y entre 1 y 200 pagos de SAP.');
 const head=lines.shift()!.split('\t').map(x=>x.trim()),col=(name:string)=>{const i=head.indexOf(name);if(i<0)throw Error('Falta la columna '+name+'.');return i;};
 const columns={document:col('#'),date:col('Date'),clientCode:col('Customer/Vendor Code'),amount:col('total'),openBalance:col('Open Balance Amount'),account:col('Current Account'),dueDate:col('Due Date')};
 return lines.map(line=>{const row=line.split('\t'),v=(key:keyof typeof columns)=>(row[columns[key]]||'').trim();return {document:v('document'),date:parseDay(v('date')),clientCode:v('clientCode'),amount:cents(v('amount')),openBalance:cents(v('openBalance')),account:v('account'),dueDate:parseDay(v('dueDate'))};});
}
export function sapPaymentPlan(rows:SapDocument[],s:State,now:string,actor:string){
 if(!Array.isArray(rows)||!rows.length||rows.length>200)throw Error('Selecciona entre 1 y 200 pagos.');
 const docs=new Set<string>(),groups=new Map<string,{payment?:Payment;clientId:string;rows:SapDocument[]}>();
 let existingDocuments=0;
 for(const raw of rows){
  const r:SapDocument={document:String(raw.document||'').trim(),date:raw.date,clientCode:String(raw.clientCode||'').trim(),amount:raw.amount,openBalance:raw.openBalance,account:String(raw.account||'').slice(0,200),dueDate:raw.dueDate};
  if(!/^\d{1,20}$/.test(r.document)||docs.has(r.document))throw Error('Documento SAP inválido o repetido: '+r.document);docs.add(r.document);
  if(!validDay(r.date)||r.date>today()||!validDay(r.dueDate)||!Number.isSafeInteger(r.amount)||r.amount<=0||!Number.isSafeInteger(r.openBalance)||r.openBalance<0||r.openBalance>r.amount)throw Error('Revisa las fechas e importes del documento '+r.document+'.');
  const clients=s.clients.filter(c=>c.code===r.clientCode);if(clients.length!==1)throw Error('El código '+r.clientCode+' no identifica un único cliente.');
  const clientId=clients[0].id,already=s.payments.filter(p=>p.sapDocuments?.some(d=>d.document===r.document));
  if(already.length){
   if(already.length!==1)throw Error('Documento SAP duplicado en el registro.');
   const d=already[0].sapDocuments!.find(d=>d.document===r.document)!;
   if(already[0].clientId!==clientId||['date','clientCode','amount','openBalance','account','dueDate'].some(k=>d[k as keyof SapDocument]!==r[k as keyof SapDocument]))throw Error('El documento '+r.document+' ya existe con otros datos.');
   existingDocuments++;continue;
  }
  const candidates=s.payments.filter(p=>p.clientId===clientId&&!['anulado','devuelto'].includes(p.status)&&!p.sapDocuments?.length&&(p.amount===r.amount||p.allocations.some(a=>a.amount===r.amount)));
  if(candidates.length>1)throw Error('Hay varios pagos posibles para SAP '+r.document+'. Revisa antes de importar.');
  const payment=candidates[0],key=payment?.id||'sap:'+r.document;
  const group=groups.get(key)||{payment,clientId,rows:[]};group.rows.push({...r,recordedAt:now,recordedBy:actor});groups.set(key,group);
 }
 const payments:Payment[]=[];let added=0,addedAmount=0,linkedDocuments=0,dateCorrections=0;
 for(const [id,g] of groups){
  const amount=g.rows.reduce((n,r)=>n+r.amount,0),date=g.rows[0].date;
  if(g.rows.some(r=>r.date!==date))throw Error('Los documentos de un pago agrupado tienen fechas diferentes.');
  if(g.payment){
   if(amount!==g.payment.amount)throw Error('Los documentos SAP no cubren exactamente el pago agrupado '+g.payment.reference+'. Incluye todos sus documentos.');
   if(g.payment.depositDate&&date>g.payment.depositDate)throw Error('La fecha SAP es posterior al depósito registrado.');
   payments.push({...g.payment,date,dateBasis:undefined,sapDocuments:g.rows});linkedDocuments+=g.rows.length;if(g.payment.date!==date)dateCorrections++;
  }else{
   if(s.payments.some(p=>p.id===id))throw Error('El identificador SAP ya existe.');
   payments.push({id,clientId:g.clientId,amount,date,method:'No documentado',status:'registrado-sap',reference:'SAP '+g.rows[0].document,depositDate:'',evidence:'',notes:'Pago registrado en SAP. El extracto no detalla las facturas aplicadas ni confirma el depósito bancario.',allocations:[],created:now,sapDocuments:g.rows});added++;addedAmount+=amount;
  }
 }
 return {payments,added,addedAmount,linkedDocuments,existingDocuments,dateCorrections};
}

import {effective,validDay,type Invoice,type State} from './domain';

export type InvoicePaymentStatus='saldada'|'abono'|'saldo-reducido'|'con-saldo'|'por-conciliar'|'por-validar';
export type HistoryDateBasis='pago'|'validacion'|'aging';
export type HistoryInvoiceSource={invoice:Invoice;agingId:string;date:string;firstDate:string};
export type ManagementApplication={key:string;number:string;installment:string;amount:number;balance:number|null;status:InvoicePaymentStatus};
export type ManagementReceipt={id:string;clientCode:string;clientName:string;date:string;dateBasis:'pago'|'validacion';method:string;status:string;reference:string;depositDate:string;amount:number;unapplied:number;applications:ManagementApplication[]};
export type ManagementPaidInvoice={key:string;clientCode:string;clientName:string;number:string;installment:string;original:number|null;balance:number|null;applied:number;pending:number;status:InvoicePaymentStatus;date:string;dateBasis:HistoryDateBasis;lastPaymentDate:string;validationDate:string};
export type ManagementPaymentHistory={version:1;generatedAt:string;availableFrom:string|null;payments:ManagementReceipt[];invoices:ManagementPaidInvoice[]};
export const countedReceipt=(status:string)=>['confirmado','depositado','recibido','registrado-sap'].includes(status);
const confirmedReceipt=(status:string)=>['confirmado','depositado'].includes(status);
const dayInPR=(at:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Puerto_Rico',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const latest=(days:string[])=>days.filter(validDay).sort().at(-1)||'';

/** Public projection only. Never publish contacts, evidence files, notes or bank details. */
export function managementPayments(s:State,sources:HistoryInvoiceSource[],generatedAt=new Date().toISOString()):ManagementPaymentHistory{
 const clients=new Map(s.clients.map(c=>[c.id,c]));
 const sourceByKey=new Map(sources.map(x=>[x.invoice.key,x]));
 for(const r of s.agingReviews||[])if(!sourceByKey.has(r.invoice.key))sourceByKey.set(r.invoice.key,{invoice:r.invoice,agingId:r.previousId,date:r.previousDate,firstDate:r.previousDate});
 for(const invoice of s.aging?.invoices||[])sourceByKey.set(invoice.key,{invoice,agingId:s.aging!.id,date:s.aging!.date,firstDate:sourceByKey.get(invoice.key)?.firstDate||s.aging!.date});
 const applications=new Map<string,{payment:State['payments'][number];amount:number}[]>();
 for(const payment of s.payments)for(const a of payment.allocations){const key=payment.clientId+'\n'+a.key;const rows=applications.get(key)||[];rows.push({payment,amount:a.amount});applications.set(key,rows);}
 const byInvoice=new Map<string,ManagementPaidInvoice>();
 const invoiceRows:ManagementPaidInvoice[]=[];
 for(const source of sourceByKey.values()){
  const i=source.invoice,client=clients.get(i.clientId),current=s.aging?.invoices.find(x=>x.key===i.key&&x.clientId===i.clientId);
  const linked=applications.get(i.clientId+'\n'+i.key)||[],confirmed=linked.filter(x=>confirmedReceipt(x.payment.status)),pending=linked.filter(x=>x.payment.status==='recibido');
  const review=(s.agingReviews||[]).find(r=>r.invoice.key===i.key&&r.invoice.clientId===i.clientId);
  const e=current&&s.aging?effective(current,s.aging.id,s.payments):null;
  const returned=linked.some(x=>x.payment.status==='devuelto');
  const validated=review?.status==='pagada'&&!returned;
  const settled=current?!!e&&!e.reconcile&&!e.overallocated&&e.balance===0:validated||(!returned&&i.balance===0);
  const uncertain=current?!!e&&(e.reconcile||e.overallocated):!settled;
  const balance=settled?0:current&&!uncertain?e!.balance:null;
  const applied=confirmed.reduce((n,x)=>n+x.amount,0),pendingAmount=pending.reduce((n,x)=>n+x.amount,0);
  // A reduction in an aging can include a credit; it is not proof of a received payment.
  const reduced=i.original>i.balance;
  const status:InvoicePaymentStatus=settled?'saldada':uncertain?(current?'por-conciliar':'por-validar'):applied>0?'abono':reduced?'saldo-reducido':'con-saldo';
  const lastPaymentDate=latest(confirmed.filter(x=>x.payment.dateBasis!=='validacion').map(x=>x.payment.date));
  const validationDate=latest([...confirmed.filter(x=>x.payment.dateBasis==='validacion').map(x=>x.payment.date),...(validated&&review?.validatedAt?[dayInPR(review.validatedAt)]:[])]);
  const receivedDate=latest(pending.map(x=>x.payment.date));
  const date=latest([lastPaymentDate,validationDate,receivedDate])||source.date;
  const dateBasis:HistoryDateBasis=date===validationDate?'validacion':date===lastPaymentDate||date===receivedDate?'pago':'aging';
  const row:ManagementPaidInvoice={key:i.key,clientCode:client?.code||'',clientName:client?.name||'Cliente sin identificar',number:i.number,installment:i.installment,original:i.original,balance,applied,pending:pendingAmount,status,date,dateBasis,lastPaymentDate,validationDate};
  byInvoice.set(i.clientId+'\n'+i.key,row);
  if(linked.length||settled||reduced)invoiceRows.push(row);
 }
 const payments=s.payments.map(p=>{
  const client=clients.get(p.clientId);
  const rows=p.allocations.map(a=>{const invoice=byInvoice.get(p.clientId+'\n'+a.key);return {key:a.key,number:a.number||invoice?.number||'',installment:invoice?.installment||'',amount:a.amount,balance:invoice?.balance??null,status:invoice?.status||'por-validar' as InvoicePaymentStatus};});
  return {id:p.id,clientCode:client?.code||'',clientName:client?.name||'Cliente sin identificar',date:p.date,dateBasis:p.dateBasis==='validacion'?'validacion' as const:'pago' as const,method:p.method,status:p.status,reference:p.reference,depositDate:p.depositDate||'',amount:p.amount,unapplied:Math.max(0,p.amount-rows.reduce((n,a)=>n+a.amount,0)),applications:rows};
 }).sort((a,b)=>b.date.localeCompare(a.date)||a.clientName.localeCompare(b.clientName)||a.id.localeCompare(b.id));
 const dates=[...payments.map(p=>p.date),...sources.map(s=>s.firstDate),...invoiceRows.map(i=>i.date)].filter(validDay).sort();
 return {version:1,generatedAt,availableFrom:dates[0]||null,payments,invoices:invoiceRows.sort((a,b)=>b.date.localeCompare(a.date)||a.clientName.localeCompare(b.clientName)||a.number.localeCompare(b.number))};
}

export type PaymentPeriod='week'|'month'|'six-months'|'ytd'|'all'|'custom';
export function paymentRange(period:PaymentPeriod,day:string){
 const d=new Date(day+'T12:00:00Z');let from='';
 if(period==='week'){d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));from=d.toISOString().slice(0,10);}
 if(period==='month')from=day.slice(0,7)+'-01';
 if(period==='ytd')from=day.slice(0,4)+'-01-01';
 if(period==='six-months'){const n=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-6);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(n,end));from=d.toISOString().slice(0,10);}
 return {from,to:period==='all'?'':day};
}
export const inPaymentRange=(date:string,from:string,to:string)=>(!from||date>=from)&&(!to||date<=to);
export function paymentTotals(rows:ManagementReceipt[]){return {amount:rows.filter(p=>countedReceipt(p.status)).reduce((n,p)=>n+p.amount,0),count:rows.filter(p=>countedReceipt(p.status)).length,pendingChecks:rows.filter(p=>p.status==='recibido').reduce((n,p)=>n+p.amount,0),unapplied:rows.filter(p=>countedReceipt(p.status)).reduce((n,p)=>n+p.unapplied,0)};}

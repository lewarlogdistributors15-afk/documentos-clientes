const statuses=['saldada','abono','saldo-reducido','con-saldo','por-conciliar','por-validar'];
const text=(s:unknown,max=300)=>{if(typeof s!=='string'||s.length>max)throw Error('invalid history');return s;};
const cents=(n:unknown)=>{if(!Number.isSafeInteger(n)||Number(n)<0)throw Error('invalid history');return Number(n);};
const date=(s:unknown,optional=false)=>{if(optional&&s==='')return '';if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error('invalid history');return s;};
const status=(s:unknown)=>{if(typeof s!=='string'||!statuses.includes(s))throw Error('invalid history');return s;};
const basis=(s:unknown,invoice=false)=>{if(s!=='pago'&&s!=='validacion'&&!(invoice&&s==='aging'))throw Error('invalid history');return s;};
const nullableCents=(n:unknown)=>n===null?null:cents(n);
export function cleanHistory(h:any){
 if(h?.version!==1||!Array.isArray(h.payments)||h.payments.length>20000||!Array.isArray(h.invoices)||h.invoices.length>20000||typeof h.generatedAt!=='string'||!Number.isFinite(Date.parse(h.generatedAt)))throw Error('invalid history');
 const payments=h.payments.map((p:any)=>{
  if(!Array.isArray(p.applications)||p.applications.length>10000)throw Error('invalid history');
  const applications=p.applications.map((a:any)=>({key:text(a.key),number:text(a.number,80),installment:text(a.installment,30),amount:cents(a.amount),balance:nullableCents(a.balance),status:status(a.status)}));
  if(new Set(applications.map((a:any)=>a.key)).size!==applications.length)throw Error('duplicate application');
  const amount=cents(p.amount),applied=applications.reduce((n:number,a:any)=>n+a.amount,0);if(applied>amount)throw Error('overallocated history');
  return {id:text(p.id),clientCode:text(p.clientCode,60),clientName:text(p.clientName,200),date:date(p.date),dateBasis:basis(p.dateBasis),method:text(p.method,80),status:text(p.status,60),reference:text(p.reference,300),depositDate:date(p.depositDate,true),amount,unapplied:amount-applied,applications};
 });
 const invoices=h.invoices.map((i:any)=>({key:text(i.key),clientCode:text(i.clientCode,60),clientName:text(i.clientName,200),number:text(i.number,80),installment:text(i.installment,30),original:nullableCents(i.original),balance:nullableCents(i.balance),applied:cents(i.applied),pending:cents(i.pending),status:status(i.status),date:date(i.date),dateBasis:basis(i.dateBasis,true),lastPaymentDate:date(i.lastPaymentDate,true),validationDate:date(i.validationDate,true)}));
 if(new Set(payments.map((p:any)=>p.id)).size!==payments.length||new Set(invoices.map((i:any)=>i.key)).size!==invoices.length)throw Error('duplicate history row');
 return {version:1,generatedAt:text(h.generatedAt,40),availableFrom:h.availableFrom===null?null:date(h.availableFrom),payments,invoices};
}

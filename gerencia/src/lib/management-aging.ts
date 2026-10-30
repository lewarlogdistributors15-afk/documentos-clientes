import {effective,type State} from './domain';
export type ManagementInvoice={key:string;clientCode:string;clientName:string;number:string;installment:string;posting:string;due:string;term:string;original:number;balance:number;agingBalance:number;needsReview:boolean};
export type ManagementAging={aging:{date:string;name:string;uploadedAt:string}|null;checkedAt:string;invoices:ManagementInvoice[]};
export function managementAging(s:State,checkedAt=new Date().toISOString()):ManagementAging{
 const clients=new Map(s.clients.map(c=>[c.id,c]));
 return {aging:s.aging?{date:s.aging.date,name:s.aging.name,uploadedAt:s.aging.created}:null,checkedAt,invoices:(s.aging?.invoices||[]).map(i=>{const client=clients.get(i.clientId),e=effective(i,s.aging!.id,s.payments);return {key:i.key,clientCode:client?.code||'',clientName:client?.name||'Cliente sin identificar',number:i.number,installment:i.installment,posting:i.posting,due:i.due,term:i.term,original:i.original,balance:e.balance,agingBalance:i.balance,needsReview:e.reconcile||e.overallocated};}).filter(i=>i.balance>0||i.needsReview).sort((a,b)=>a.clientName.localeCompare(b.clientName)||a.due.localeCompare(b.due)||a.number.localeCompare(b.number))};
}
export function agingBand(due:string,day:string){const days=Math.round((Date.parse(day+'T12:00:00Z')-Date.parse(due+'T12:00:00Z'))/86400000);return days<=0?0:days<=30?1:days<=60?2:days<=90?3:4;}
export function agingSummary(invoices:ManagementInvoice[],day:string){const buckets=[0,0,0,0,0];for(const i of invoices)buckets[agingBand(i.due,day)]+=i.balance;return {total:buckets.reduce((a,b)=>a+b,0),overdue:buckets.slice(1).reduce((a,b)=>a+b,0),clients:new Set(invoices.map(i=>i.clientCode||i.clientName)).size,count:invoices.length,review:invoices.filter(i=>i.needsReview).length,buckets};}

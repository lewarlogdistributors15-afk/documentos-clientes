import {agingBand,agingSummary,type ManagementInvoice} from './management-aging';
import {inPaymentRange,paymentTotals,type ManagementReceipt,type ManagementPaidInvoice} from './management-payments';

export type ManagementClient={clientCode:string;clientName:string};
export type ManagementClientOption=ManagementClient & {key:string};
export const managementClientKey=(client:ManagementClient)=>client.clientCode.trim()?'code:'+client.clientCode.trim().toUpperCase():'name:'+client.clientName.trim();
const searchable=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase();
export const managementMatches=(value:string,query:string)=>searchable(value).includes(searchable(query.trim()));
export const matchesManagementClient=(row:ManagementClient,selected:string)=>!selected||managementClientKey(row)===selected;
export function managementClients(rows:ManagementClient[]):ManagementClientOption[]{
 const clients=new Map<string,ManagementClientOption>();
 for(const row of rows){const key=managementClientKey(row);if(!clients.has(key))clients.set(key,{key,clientCode:row.clientCode,clientName:row.clientName});}
 return [...clients.values()].sort((a,b)=>a.clientName.localeCompare(b.clientName,'es')||a.clientCode.localeCompare(b.clientCode));
}
export function filterManagementAging(rows:ManagementInvoice[],day:string,client:string,query:string,band='all'){
 return rows.filter(i=>matchesManagementClient(i,client)&&managementMatches(i.clientName+' '+i.clientCode+' '+i.number,query)&&(band==='all'||(band==='review'?i.needsReview:agingBand(i.due,day)===Number(band))));
}
export function agingClientTotals(rows:ManagementInvoice[],day:string){
 const groups=new Map<string,ManagementInvoice[]>();
 for(const row of rows){const key=managementClientKey(row);const group=groups.get(key)||[];group.push(row);groups.set(key,group);}
 return [...groups.entries()].map(([key,invoices])=>({key,clientCode:invoices[0].clientCode,clientName:invoices[0].clientName,...agingSummary(invoices,day)})).sort((a,b)=>b.total-a.total||a.clientName.localeCompare(b.clientName,'es'));
}
export function filterManagementReceipts(rows:ManagementReceipt[],client:string,query:string,from:string,to:string,status='all'){
 return rows.filter(p=>matchesManagementClient(p,client)&&inPaymentRange(p.date,from,to)&&managementMatches([p.clientCode,p.clientName,p.reference,p.method,...p.applications.map(a=>a.number)].join(' '),query)&&(status==='all'||p.status===status));
}
export function filterManagementInvoices(rows:ManagementPaidInvoice[],client:string,query:string,from:string,to:string,status='all'){
 return rows.filter(i=>matchesManagementClient(i,client)&&inPaymentRange(i.date,from,to)&&managementMatches(i.clientName+' '+i.clientCode+' '+i.number,query)&&(status==='all'||i.status===status));
}
export function paymentClientTotals(payments:ManagementReceipt[],invoices:ManagementPaidInvoice[]){
 const paymentGroups=new Map<string,ManagementReceipt[]>(),invoiceGroups=new Map<string,ManagementPaidInvoice[]>();
 for(const p of payments){const key=managementClientKey(p),rows=paymentGroups.get(key)||[];rows.push(p);paymentGroups.set(key,rows);}
 for(const i of invoices){const key=managementClientKey(i),rows=invoiceGroups.get(key)||[];rows.push(i);invoiceGroups.set(key,rows);}
 return managementClients([...payments,...invoices]).map(client=>{
  const receipts=paymentGroups.get(client.key)||[],bills=invoiceGroups.get(client.key)||[];
  return {...client,...paymentTotals(receipts),recordCount:receipts.length,invoiceCount:bills.length,settled:bills.filter(i=>i.status==='saldada').length,partial:bills.filter(i=>i.status==='abono').length,review:bills.filter(i=>['por-validar','por-conciliar'].includes(i.status)).length};
 }).sort((a,b)=>b.amount-a.amount||a.clientName.localeCompare(b.clientName,'es'));
}

import type {Aging, Invoice} from './domain';
export type AgingReview={id:string;invoice:Invoice;previousId:string;previousDate:string;previousName:string;detectedId:string;detectedDate:string;detectedName:string;detectedCreated:string;status:'pendiente'|'pagada'|'otra-causa'|'reaparecida';note?:string;validatedAt?:string;validatedBy?:string;paymentIds?:string[];paymentRecordedAt?:string};
// Preserve zeros and punctuation. Never match by customer name or amount.
export const invoiceIdentity=(i:Invoice)=>JSON.stringify([i.clientId,i.number,i.installment].map(x=>x.trim().replace(/\s+/g,' ').toUpperCase()));
export function disappeared(previous:Aging|null,current:Aging|null):AgingReview[]{
 if(!previous||!current||previous.id===current.id)return [];
 const present=new Set(current.invoices.map(invoiceIdentity));
 return previous.invoices.filter(i=>i.balance>0&&!present.has(invoiceIdentity(i))).map(invoice=>({id:'aging-review:'+current.id+':'+invoice.key,invoice,previousId:previous.id,previousDate:previous.date,previousName:previous.name,detectedId:current.id,detectedDate:current.date,detectedName:current.name,detectedCreated:current.created,status:'pendiente'}));
}
export function mergeReviews(saved:AgingReview[],derived:AgingReview[],current:Aging|null):AgingReview[]{
 const byId=new Map(derived.map(r=>[r.id,r]));for(const r of saved)byId.set(r.id,r);
 const latest=new Map<string,AgingReview>();
 for(const r of [...byId.values()].sort((a,b)=>a.detectedCreated.localeCompare(b.detectedCreated)))latest.set(invoiceIdentity(r.invoice),r);
 const present=new Set(current?.invoices.map(invoiceIdentity)||[]);
 return [...latest.values()].map(r=>present.has(invoiceIdentity(r.invoice))?{...r,status:'reaparecida' as const}:r);
}

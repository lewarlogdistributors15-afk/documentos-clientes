'use client';
import {money} from './lib/domain';
import type {paymentClientTotals} from './lib/management-clients';
import type {paymentTotals} from './lib/management-payments';

export default function ManagementClientPaymentsTable({rows,start,end,totals,onDetail}:{rows:ReturnType<typeof paymentClientTotals>;start:number;end:number|undefined;totals:ReturnType<typeof paymentTotals>;onDetail:(key:string,hasReceipts:boolean)=>void}){
 return <table className="management-client-table"><thead><tr><th>Cliente / código</th><th className="numeric">Pagos incluidos</th><th className="numeric">Total recibido / registrado</th><th className="numeric">Cheques por depositar</th><th className="numeric">Sin aplicar</th><th>Facturas del período</th><th className="management-controls">Detalle</th></tr></thead><tbody>{rows.slice(start,end).map(c=><tr key={c.key}>
  <td><strong>{c.clientName}</strong><small>{c.clientCode}</small></td><td className="numeric">{c.count}{c.recordCount>c.count&&<small>{c.recordCount-c.count} devueltos / anulados excluidos</small>}</td><td className="numeric bold">{money(c.amount)}</td><td className="numeric">{money(c.pendingChecks)}</td><td className="numeric">{money(c.unapplied)}</td><td><span>{c.settled} saldadas · {c.partial} con abonos</span>{c.review>0&&<small>{c.review} por revisar</small>}</td><td className="management-controls"><button className="btn small secondary" onClick={()=>onDetail(c.key,c.recordCount>0)}>Ver detalle</button></td>
 </tr>)}</tbody><tfoot><tr><th>Total filtrado · {rows.length} clientes</th><td className="numeric">{totals.count}</td><td className="numeric bold">{money(totals.amount)}</td><td className="numeric">{money(totals.pendingChecks)}</td><td className="numeric">{money(totals.unapplied)}</td><td>{rows.reduce((n,c)=>n+c.settled,0)} saldadas · {rows.reduce((n,c)=>n+c.partial,0)} con abonos</td><td className="management-controls"/></tr></tfoot></table>;
}

'use client';
import type {ManagementClientOption} from './lib/management-clients';

export default function ManagementClientFilter({clients,value,onChange}:{clients:ManagementClientOption[];value:string;onChange:(value:string)=>void}){
 const selected=clients.find(c=>c.key===value);
 return <div className="management-client-filter">
  <div className="management-client-input management-controls">
   <label>Filtrar por cliente<select value={value} onChange={e=>onChange(e.target.value)}>
    <option value="">Todos los clientes</option>
    {value&&!selected&&<option value={value}>Cliente seleccionado sin registros</option>}
    {clients.map(c=><option key={c.key} value={c.key}>{c.clientName}{c.clientCode?' · '+c.clientCode:''}</option>)}
   </select></label>
   {value&&<button className="btn secondary" onClick={()=>onChange('')}>Ver todos los clientes</button>}
  </div>
  <p className="management-selection"><strong>{selected?selected.clientName+(selected.clientCode?' · '+selected.clientCode:''):value?'Cliente seleccionado':'Todos los clientes'}</strong><span>Los totales corresponden a los filtros aplicados.</span></p>
 </div>;
}

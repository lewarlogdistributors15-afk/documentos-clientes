'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import ManagementPaymentsView from './management-payments-view';
import type {ManagementAging} from './lib/management-aging';
import {managementClients} from './lib/management-clients';
import ManagementAgingContent from './management-aging-content';
import {today} from './lib/domain';

export default function ManagementView({isOwner=false,initialData,loadData,logoSrc='/lewar-logo.png',accessControls}:{isOwner?:boolean;initialData?:ManagementAging;loadData?:(signal:AbortSignal)=>Promise<ManagementAging>;logoSrc?:string;accessControls?:ReactNode}){
 const [section,setSection]=useState<'aging'|'payments'>('aging'),[client,setClient]=useState('');
 useEffect(()=>{if(location.hash==='#pagos')setSection('payments')},[]);
 const [data,setData]=useState<ManagementAging|null>(initialData||null),[day,setDay]=useState(today()),[loading,setLoading]=useState(!initialData),[error,setError]=useState(''),[accessError,setAccessError]=useState(false),[printing,setPrinting]=useState(false);
 const inFlight=useRef(false),controller=useRef<AbortController|null>(null);
 async function refresh(){
  setDay(today());if(initialData||inFlight.current)return;inFlight.current=true;setLoading(true);const c=new AbortController();controller.current=c;
  try{if(loadData){const body=await loadData(c.signal);setData(body);setError('');setAccessError(false);return;}const r=await fetch('/api/gerencia',{cache:'no-store',signal:c.signal}),body=await r.json() as ManagementAging & {error?:string};if(!r.ok){if(r.status===401||r.status===403){setData(null);setAccessError(true);}throw Error(body.error||'No se pudo actualizar el aging.');}if(!Array.isArray(body.invoices))throw Error('No se pudo leer el aging.');setData(body);setError('');setAccessError(false);}
  catch(e){if(!c.signal.aborted)setError((e as Error).message);}finally{inFlight.current=false;if(!c.signal.aborted)setLoading(false);}
 }
 useEffect(()=>{void refresh();const timer=setInterval(()=>{setDay(today());if(document.visibilityState==='visible')void refresh()},60000);const visible=()=>{setDay(today());if(document.visibilityState==='visible')void refresh()};window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);controller.current?.abort();window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)};},[]);
 const clients=managementClients([...(data?.invoices||[]),...(data?.history?.payments||[]),...(data?.history?.invoices||[])]);
 return <div className="management-shell">
  <header className="management-header"><div className="management-brand"><img className="management-logo" src={logoSrc} alt="Lewar LogDistributors" width="104" height="104" fetchPriority="high"/><div><strong>LEWAR</strong><small>LOGDISTRIBUTORS</small></div></div><div className="management-access"><span className="badge">Solo lectura</span>{accessControls}{isOwner&&<a href="/" className="management-admin-link">Volver a Control de cobros</a>}</div></header>
  <main className="management-content">
   <div className="management-heading"><div><span className="eyebrow">VISTA DE GERENCIA</span><h1>{section==='aging'?'Cuentas por cobrar':'Pagos y facturas pagadas'}</h1><p>{section==='aging'?'El aging vigente, en un solo lugar.':'Historial de pagos, saldos y aplicaciones por factura.'}</p></div><div className="action-row management-controls"><button className="btn secondary" disabled={loading} onClick={()=>void refresh()}>{loading?'Actualizando…':'Actualizar ahora'}</button>{data&&<button className="btn secondary" onClick={()=>{flushSync(()=>setPrinting(true));try{window.print()}finally{setPrinting(false)}}}>Imprimir / PDF</button>}</div></div>
   <nav className="management-switch management-controls" aria-label="Vista de gerencia"><button aria-pressed={section==='aging'} onClick={()=>setSection('aging')}>Aging actual</button><button aria-pressed={section==='payments'} onClick={()=>setSection('payments')}>Pagos y facturas pagadas</button></nav>
   {error&&<div className="alert danger" role="alert">{error}{data&&<span> Se conserva la última consulta; los datos podrían haber cambiado.</span>}</div>}
   {!data?<section className="card padded"><h2>{loading?'Cargando el aging…':accessError?'Acceso restringido':'No se pudo cargar el aging'}</h2><p>{accessError?'Entra con tu acceso personal autorizado de Lewar.':'La vista consulta el último aging disponible en Control de cobros.'}</p></section>:section==='payments'?<ManagementPaymentsView history={data.history} day={day} printing={printing} clients={clients} client={client} onClientChange={setClient}/>:!data.aging?<section className="card padded"><h2>Aún no hay un aging disponible</h2><p>La vista se completará al cargar el primer archivo en Control de cobros.</p></section>:<ManagementAgingContent data={data} day={day} printing={printing} clients={clients} client={client} onClientChange={setClient}/>}
  </main><footer className="management-footer">Lewar LogDistributors · Finanzas y Gestión de Cobro · USD · Hora de Puerto Rico</footer>
 </div>;
}

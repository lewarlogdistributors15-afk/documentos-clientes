import {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import ManagementView from './management-view';
import type {ManagementAging} from './lib/management-aging';
const API='https://wbahyotiggsjtqvqpjio.supabase.co/functions/v1/aging-management';

async function fetchAging(signal?:AbortSignal){
 const response=await fetch(API,{cache:'no-store',signal});
 let data:any;try{data=await response.json()}catch{throw Error('No se pudo conectar con el aging. Intenta nuevamente.');}
 if(!response.ok)throw Error(data.error||'No se pudo cargar el aging.');
 if(!Array.isArray(data.invoices))throw Error('Respuesta no válida.');
 return data as ManagementAging;
}
function App(){
 useEffect(()=>{
  // Remove credentials left by the previous private-access version.
  try{sessionStorage.removeItem('lewar-gerencia-private-session')}catch{}
  if(new URLSearchParams(location.hash.slice(1)).has('acceso'))history.replaceState(null,'',location.pathname+location.search);
 },[]);
 return <ManagementView logoSrc="../expo-muebles/lewar-logo.png" loadData={fetchAging}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);

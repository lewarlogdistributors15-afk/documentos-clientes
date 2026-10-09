(()=>{'use strict';
const $=id=>document.getElementById(id);
let items=[],generation=0;
const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function clear(){items=[];$('inventory-rows').replaceChildren();$('inventory-panel').hidden=true;$('orders-link').hidden=true;}
function render(){
 const term=normalize($('inventory-search').value.trim());
 const matches=items.filter(item=>normalize(item.model+' '+item.description).includes(term));
 const fragment=document.createDocumentFragment();
 for(const item of matches){
  const tr=document.createElement('tr');
  for(const value of [item.model,item.description,item.available]){
   const td=document.createElement('td');td.textContent=String(value);tr.append(td);
  }
  tr.lastChild.className='number'+(item.available<0?' negative':'');
  fragment.append(tr);
 }
 $('inventory-rows').replaceChildren(fragment);
 $('inventory-count').textContent=matches.length+' de '+items.length+' artículos';
 $('inventory-empty').hidden=matches.length!==0;
}
async function load(){
 const current=++generation;clear();$('inventory-refresh').disabled=true;
 $('access-status').className='muted';$('access-status').textContent='Verificando acceso…';
 try{
  const data=await window.LewarInventory.load(true);
  if(current!==generation)return;
  if(!data.ok)throw new Error(data.error||'No tienes acceso al inventario interno.');
  items=data.items||[];
  $('access-status').textContent='Acceso interno · '+data.viewer;
  const date=data.date?new Date(data.date+'T12:00:00').toLocaleDateString('es-PR',{day:'numeric',month:'long',year:'numeric'}):'Sin reporte';
  $('inventory-date').textContent='Inventario al '+date;
  $('orders-link').hidden=!['admin','billing'].includes(data.role);
  render();$('inventory-panel').hidden=false;
 }catch(error){
  if(current!==generation)return;
  clear();$('access-status').className='muted error';$('access-status').textContent=error.message;
 }finally{if(current===generation)$('inventory-refresh').disabled=false;}
}
$('inventory-search').addEventListener('input',render);
$('inventory-refresh').addEventListener('click',load);
window.addEventListener('pagehide',()=>{generation++;clear()});
window.addEventListener('pageshow',load);
window.addEventListener('storage',event=>{if(event.key==='lewar-client-session-v1'||event.key===null)load()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();else{generation++;clear()}});
})();

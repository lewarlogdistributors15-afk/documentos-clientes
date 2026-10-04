function roundExpoPrice(value){
 const n=Number(value);
 return Number.isFinite(n)?Math.ceil(n):n;
}
function priceOrder(products, quantities, overrides={}) {
 const hasManual=p=>Number.isFinite(overrides[p.modelo])&&overrides[p.modelo]>=0;
 const qty=p=>Number.isInteger(quantities[p.modelo])&&quantities[p.modelo]>=0&&quantities[p.modelo]<=999&&(Number.isFinite(p.precio)||hasManual(p))?quantities[p.modelo]:0;
 const combined=products.filter(p=>p.regla==='combinable').reduce((n,p)=>n+qty(p),0);
 const lines=products.map(p=>{
  const q=qty(p),manual=hasManual(p);
  const regular=Number.isFinite(p.precio)?roundExpoPrice(p.precio):p.precio;
  const volumePrice=Number.isFinite(p.precio_volumen)?roundExpoPrice(p.precio_volumen):p.precio_volumen;
  const volume=!manual&&Number.isFinite(volumePrice)&&(p.regla==='mismo_modelo'?q>=3:combined>=3);
  const automaticUnit=Number.isFinite(volumePrice)&&(p.regla==='mismo_modelo'?q>=3:combined>=3)?volumePrice:regular;
  const unit=manual?roundExpoPrice(overrides[p.modelo]):volume?volumePrice:regular;
  return {product:p,quantity:q,unit,volume,manual,automaticUnit,total:q*Math.round((unit||0)*100)};
 });
 return {lines,combined,total:lines.reduce((n,l)=>n+l.total,0),units:lines.reduce((n,l)=>n+l.quantity,0)};
}
if(typeof module!=='undefined')module.exports={priceOrder,roundExpoPrice};

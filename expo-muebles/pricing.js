function priceOrder(products, quantities, overrides={}) {
 const hasManual=p=>Number.isFinite(overrides[p.modelo])&&overrides[p.modelo]>=0;
 const qty=p=>Number.isInteger(quantities[p.modelo])&&quantities[p.modelo]>=0&&quantities[p.modelo]<=999&&(Number.isFinite(p.precio)||hasManual(p))?quantities[p.modelo]:0;
 const combined=products.filter(p=>p.regla==='combinable').reduce((n,p)=>n+qty(p),0);
 const lines=products.map(p=>{const q=qty(p);const manual=hasManual(p);const volume=!manual&&Number.isFinite(p.precio_volumen)&&(p.regla==='mismo_modelo'?q>=3:combined>=3);const automaticUnit=Number.isFinite(p.precio_volumen)&&(p.regla==='mismo_modelo'?q>=3:combined>=3)?p.precio_volumen:p.precio;const unit=manual?Math.round(overrides[p.modelo]*100)/100:volume?p.precio_volumen:p.precio;return {product:p,quantity:q,unit,volume,manual,automaticUnit,total:q*Math.round((unit||0)*100)};});
 return {lines,combined,total:lines.reduce((n,l)=>n+l.total,0),units:lines.reduce((n,l)=>n+l.quantity,0)};
}
if(typeof module!=='undefined')module.exports={priceOrder};

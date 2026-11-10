import {isMaster,isCatalogSku} from './portal-master.mjs';

const bucket='lewar-b2b-product-photos';
const maxBytes=5*1024*1024;
const begins=(bytes,signature,offset=0)=>signature.every((value,index)=>bytes[offset+index]===value);
const formats={
  'image/jpeg':{extension:'jpg',matches:bytes=>begins(bytes,[0xff,0xd8,0xff])},
  'image/png':{extension:'png',matches:bytes=>begins(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])},
  'image/webp':{extension:'webp',matches:bytes=>begins(bytes,[82,73,70,70])&&begins(bytes,[87,69,66,80],8)},
};

async function photoBytes(req){
  if(Number(req.headers.get('Content-Length'))>maxBytes)return null;
  if(!req.body)return new Uint8Array(0);
  const reader=req.body.getReader();
  const chunks=[];
  let size=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>maxBytes){await reader.cancel();return null;}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

export async function replaceProductPhoto({req,sku,actor,rpc,json,url,storage}){
  if(!await isMaster(rpc,actor))return json({error:'Solo la cuenta maestra puede sustituir fotos.'},403);
  if(!await isCatalogSku(rpc,sku))return json({error:'El modelo no está en el catálogo B2B.'},404);
  const mime=req.headers.get('Content-Type');
  const format=Object.hasOwn(formats,mime)?formats[mime]:null;
  if(!format)return json({error:'Selecciona una imagen JPG, PNG o WebP.'},415);
  const bytes=await photoBytes(req);
  if(!bytes)return json({error:'La foto debe pesar 5 MB o menos.'},413);
  if(!format.matches(bytes))return json({error:'El archivo no coincide con el formato de imagen indicado.'},415);

  const name=crypto.randomUUID()+'.'+format.extension;
  const uploaded=await storage('object/'+bucket+'/'+name,{
    method:'POST',headers:{'Content-Type':mime,'Cache-Control':'max-age=86400'},body:bytes,
  });
  if(!uploaded.ok)throw Error('photo upload');
  const photoUrl=url+'/storage/v1/object/public/'+bucket+'/'+name;
  const saved=await rpc('rpc/lewar_b2b_set_product_photo',{
    method:'POST',body:JSON.stringify({p_sku:sku,p_photo_url:photoUrl,p_staff_id:actor.id}),
  });
  if(!saved.ok)throw Error('photo save');
  if(await saved.json()!==true)return json({error:'No se pudo sustituir la foto de este modelo.'},409);
  return json({ok:true,photoUrl});
}

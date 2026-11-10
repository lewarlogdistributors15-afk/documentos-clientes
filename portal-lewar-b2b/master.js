(() => {
  const byId=id=>document.getElementById(id);
  const productForm=byId('masterProductForm'), customerForm=byId('masterCustomerForm');
  const photoInput=productForm.elements.photoFile, uploadButton=byId('masterPhotoUpload'), preview=byId('masterPhotoPreview');
  const photoTypes=['image/jpeg','image/png','image/webp'];
  const photoLimit=5*1024*1024;
  let previewUrl='';
  let data=null, sequence=0, pending=false, role=null;
  const report=(message,error=false)=>{
    byId('masterStatus').textContent=message;
    byId('masterStatus').classList.toggle('accountError',error);
  };
  function buttons(){
    const noProduct=pending||!data||!role||!productForm.elements.sku.value;
    productForm.querySelector('button[type="submit"]').disabled=noProduct;
    photoInput.disabled=noProduct||role!=='owner';
    uploadButton.disabled=photoInput.disabled||!photoInput.files.length;
    customerForm.querySelector('button').disabled=pending||!data||!['owner','admin'].includes(role)||!customerForm.elements.customer.value;
  }
  function options(select,items){
    const prior=select.value;
    select.replaceChildren(new Option('Seleccionar',''),...items.map(([value,label])=>new Option(label,value)));
    select.value=items.some(([value])=>value===prior)?prior:'';
  }
  function fillProduct(){
    const sku=productForm.elements.sku.value;
    const row=data?.products.find(row=>row.sku===sku);
    productForm.elements.price.value=row?.sale_cents==null?'':(row.sale_cents/100).toFixed(2);
    productForm.elements.price.placeholder=sku&&sapSaleBySku.has(sku)?(sapSaleBySku.get(sku)/100).toFixed(2):'Precio SAP por confirmar';
    productForm.elements.available.value=row?.available_qty??'';
    productForm.elements.photo.value=row?.photo_url??'';
    photoInput.value='';
    const product=ALL_PRODUCTS.find(product=>stockSku(product.sku)===sku);
    showPreview(row?.photo_url||(product&&productImageSources(product)[0]));
    buttons();
  }
  function showPreview(src,file){
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=file?URL.createObjectURL(file):'';
    const source=previewUrl||src;
    preview.hidden=!source;
    if(source)preview.src=source;
    else preview.removeAttribute('src');
  }
  function fillCustomer(){
    const id=customerForm.elements.customer.value;
    const row=data?.customerEdits.find(row=>row.customer_id===id);
    customerForm.elements.displayName.value=row?.display_name??'';
    customerForm.elements.displayName.placeholder=data?.customers.find(row=>row.id===id)?.name??'';
    customerForm.elements.contactEmail.value=row?.contact_email??'';
    buttons();
  }
  async function open(message=''){
    if(!role)return;
    const current=++sequence;
    data=null;buttons();
    report('Cargando catálogo y clientes…');
    try{
      const result=await window.LewarAccount.master('masterRead');
      if(current!==sequence)return;
      data=result;
      const products=[...new Map(ALL_PRODUCTS.map(product=>[stockSku(product.sku),product])).entries()]
        .sort(([left],[right])=>left.localeCompare(right));
      options(productForm.elements.sku,products.map(([sku,product])=>[sku,sku+' · '+desc(product)]));
      options(customerForm.elements.customer,data.customers.map(({id,name,clientCode})=>[id,name+(clientCode?' · '+clientCode:'')]));
      fillProduct();fillCustomer();
      report(message||(role==='catalog'?'Selecciona un modelo para editar su precio o disponibilidad.':'Selecciona un modelo o un cliente para editar.'));
    }catch(error){
      if(current===sequence)report(error.message,true);
    }
  }
  async function submit(action,fields,message){
    if(!data||pending)return;
    pending=true;buttons();report('Guardando…');
    try{
      await window.LewarAccount.master(action,fields);
      await open(message);
    }catch(error){report(error.message,true)}
    finally{pending=false;buttons()}
  }
  productForm.elements.sku.addEventListener('change',fillProduct);
  customerForm.elements.customer.addEventListener('change',fillCustomer);
  photoInput.addEventListener('change',()=>{
    const file=photoInput.files[0];
    if(file&&(!photoTypes.includes(file.type)||!file.size||file.size>photoLimit)){
      photoInput.value='';
      report('Selecciona una foto JPG, PNG o WebP de hasta 5 MB.',true);
    }
    const product=ALL_PRODUCTS.find(product=>stockSku(product.sku)===productForm.elements.sku.value);
    showPreview(productForm.elements.photo.value||(product&&productImageSources(product)[0]),photoInput.files[0]);
    buttons();
  });
  uploadButton.addEventListener('click',async()=>{
    const sku=productForm.elements.sku.value,file=photoInput.files[0];
    if(!data||pending||role!=='owner'||!sku||!file)return;
    pending=true;buttons();report('Subiendo la foto…');
    try{
      const {photoUrl}=await window.LewarAccount.uploadProductPhoto(sku,file);
      const previous=data?.products.find(row=>row.sku===sku);
      if(previous)previous.photo_url=photoUrl;
      else data?.products.push({sku,photo_url:photoUrl});
      if(productForm.elements.sku.value===sku){
        productForm.elements.photo.value=photoUrl;
        photoInput.value='';
        showPreview(photoUrl);
      }
      report('Foto sustituida en el Portal General.');
    }catch(error){report(error.message,true)}
    finally{pending=false;buttons()}
  });
  productForm.addEventListener('submit',event=>{
    event.preventDefault();
    const {sku,price,available,photo}=productForm.elements;
    const saleCents=price.value===''?null:Math.round(price.valueAsNumber*100);
    const fields={sku:sku.value,saleCents,availableQty:available.value===''?null:available.valueAsNumber};
    if(role==='owner')fields.photoUrl=photo.value.trim()||null;
    submit('masterProduct',fields,'Producto guardado en el Portal General.');
  });
  customerForm.addEventListener('submit',event=>{
    event.preventDefault();
    const {customer,displayName,contactEmail}=customerForm.elements;
    submit('masterCustomer',{customerId:customer.value,displayName:displayName.value.trim()||null,contactEmail:contactEmail.value.trim()||null},'Cliente guardado en el Portal General.');
  });
  function permissions(next){
    if(role===next)return;
    role=next;
    byId('masterPhotoControls').classList.toggle('hidden',role!=='owner');
    customerForm.classList.toggle('hidden',!['owner','admin'].includes(role));
    byId('managementProductTitle').textContent=role==='owner'?'Fotos, precios y disponibilidad':'Precios y disponibilidad';
    if(!role){sequence++;data=null;}
    buttons();
  }
  window.LewarMaster={open,permissions};
})();

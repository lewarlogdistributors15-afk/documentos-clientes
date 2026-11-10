(() => {
  const byId=id=>document.getElementById(id);
  const productForm=byId('masterProductForm'), customerForm=byId('masterCustomerForm');
  let data=null, sequence=0, pending=false;
  const report=(message,error=false)=>{
    byId('masterStatus').textContent=message;
    byId('masterStatus').classList.toggle('accountError',error);
  };
  function buttons(){
    productForm.querySelector('button').disabled=pending||!data||!productForm.elements.sku.value;
    customerForm.querySelector('button').disabled=pending||!data||!customerForm.elements.customer.value;
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
    productForm.elements.photo.value=row?.photo_url??'';
    buttons();
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
      report(message||'Selecciona un modelo o un cliente para editar.');
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
  productForm.addEventListener('submit',event=>{
    event.preventDefault();
    const {sku,price,photo}=productForm.elements;
    const saleCents=price.value===''?null:Math.round(price.valueAsNumber*100);
    submit('masterProduct',{sku:sku.value,saleCents,photoUrl:photo.value.trim()||null},'Producto guardado en el Portal General.');
  });
  customerForm.addEventListener('submit',event=>{
    event.preventDefault();
    const {customer,displayName,contactEmail}=customerForm.elements;
    submit('masterCustomer',{customerId:customer.value,displayName:displayName.value.trim()||null,contactEmail:contactEmail.value.trim()||null},'Cliente guardado en el Portal General.');
  });
  window.LewarMaster={open};
})();

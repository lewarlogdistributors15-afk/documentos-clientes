const ORIGIN = 'https://lewarlogdistributors15-afk.github.io';
const AGING_URL = 'https://wbahyotiggsjtqvqpjio.supabase.co/functions/v1/aging-management';
const normalizeCode = (value: string) => value.trim().toUpperCase().split('-').map(s => /^\d+$/.test(s) ? String(Number(s)) : s).join('-');
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const pick = (obj: any, keys: string[]) => Object.fromEntries(keys.map(k => [k, obj[k]]));
export function projectAccount(snapshot: any, customer: any) {
  if (!Array.isArray(snapshot.invoices) || !snapshot.aging?.date || !snapshot.syncedAt) throw Error('source');
  const all = [...snapshot.invoices, ...(snapshot.history?.invoices || []), ...(snapshot.history?.payments || [])];
  let code = customer.client_code?.trim() || '';
  // An exact, unique name is the only permitted fallback. Never guess by similarity.
  if (!code) {
    const codes = [...new Set(all.filter(r => norm(r.clientName || '') === norm(customer.name)).map(r => r.clientCode).filter(Boolean))];
    if (codes.length === 1) code = String(codes[0]);
  }
  if (!code) return {ok: true, linked: false, customer: {name: customer.name}, message: 'Lewar debe vincular tu cuenta con tu código de cliente antes de mostrar balances.'};
  const mine = (r: any) => normalizeCode(r.clientCode || '') === normalizeCode(code);
  const invoices = snapshot.invoices.filter(mine).map((i: any) => pick(i, ['key','number','installment','posting','due','term','original','balance','needsReview']));
  const paidInvoices = (snapshot.history?.invoices || []).filter(mine).map((i: any) => pick(i, ['key','number','installment','original','balance','applied','pending','status','date','dateBasis','lastPaymentDate','validationDate']));
  const payments = (snapshot.history?.payments || []).filter(mine).map((p: any) => ({...pick(p, ['id','date','dateBasis','method','status','reference','depositDate','amount','unapplied']), applications: (p.applications || []).map((a: any) => pick(a, ['key','number','installment','amount','balance','status']))}));
  const hasRecords = invoices.length + paidInvoices.length + payments.length > 0;
  // Source balances already include applied payments. Do not subtract them again.
  return {ok: true, linked: true, customer: {name: customer.name, code}, currency: 'USD', amountUnit: 'cents',
    agingDate: snapshot.aging.date, syncedAt: snapshot.syncedAt, checkedAt: new Date().toISOString(),
    hasRecords, balance: hasRecords ? invoices.reduce((sum: number, i: any) => sum + i.balance, 0) : null,
    needsReview: invoices.some((i: any) => i.needsReview), invoices, paidInvoices, payments,
    historyAvailableFrom: snapshot.history?.availableFrom || null};
}
export function makeAccountHandler(settings: {url: string; serviceKey: string; request?: typeof fetch}) {
  const request = settings.request || fetch;
  return async (req: Request) => {
    const origin = req.headers.get('origin') || '';
    const headers = {'Content-Type':'application/json', 'Cache-Control':'private, no-store', Vary:'Origin', 'X-Content-Type-Options':'nosniff',
      ...(origin === ORIGIN ? {'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods':'POST,OPTIONS', 'Access-Control-Allow-Headers':'content-type'} : {})};
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers});
    if (origin && origin !== ORIGIN) return json({error:'Origen no permitido.'}, 403);
    if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
    if (req.method !== 'POST') return json({error:'Método no permitido.'}, 405);
    try {
      const raw = await req.text();
      if (raw.length > 4096) return json({error:'Solicitud demasiado grande.'}, 413);
      let body: any; try {body = JSON.parse(raw)} catch {return json({error:'Solicitud inválida.'},400)}
      if (typeof body.sessionToken !== 'string' || !/^[a-zA-Z0-9_-]{32,200}$/.test(body.sessionToken) || typeof body.deviceId !== 'string' || !body.deviceId || body.deviceId.length > 1000) return json({error:'Ingresa con tu PIN de cliente.'},401);
      const authHeaders = {apikey:settings.serviceKey, Authorization:'Bearer '+settings.serviceKey, 'Content-Type':'application/json'};
      const auth = await request(settings.url+'/rest/v1/rpc/portal_access_bootstrap', {method:'POST',headers:authHeaders,body:JSON.stringify({p_session_token:body.sessionToken,p_device_id:body.deviceId,p_customer_id:body.customerId || null}),signal:AbortSignal.timeout(15000)});
      if (!auth.ok) throw Error('auth-service');
      const access = await auth.json();
      if (!access.ok) return json({error:access.error || 'Sesión inválida o vencida.'},401);
      if (access.actor?.type !== 'client' && !['admin','billing'].includes(access.actor?.role)) return json({error:'Tu acceso no permite consultar estados de cuenta.'},403);
      if (!access.customer?.id) return json({ok:true, selectCustomer:true, customers:access.customers || []});
      // The identity is returned by the authenticated server, never by a browser name/code.
      const record = await request(settings.url+'/rest/v1/portal_client_customers?id=eq.'+encodeURIComponent(access.customer.id)+'&active=eq.true&select=id,name,client_code', {headers:authHeaders,signal:AbortSignal.timeout(15000)});
      if (!record.ok) throw Error('customer-service');
      const customer = (await record.json())[0];
      if (!customer) return json({error:'Esta cuenta no está activa.'},403);
      const source = await request(AGING_URL, {headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)});
      if (!source.ok) throw Error('source');
      return json(projectAccount(await source.json(), customer));
    } catch {return json({error:'No se pudo actualizar el estado de cuenta. Intenta nuevamente.'},503)}
  };
}

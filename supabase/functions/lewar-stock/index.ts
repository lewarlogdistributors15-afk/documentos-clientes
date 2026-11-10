import {makeStockHandler} from './handler.mjs';
Deno.serve(makeStockHandler({
  url:Deno.env.get('SUPABASE_URL')!,
  serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
}));

import {makeAccountHandler} from './handler.ts';
Deno.serve(makeAccountHandler({url:Deno.env.get('SUPABASE_URL')!,serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}));

-- Temporary pause for Portal de Clientes Lewar. Preserve PINs, devices, orders and staff access.
-- Reactivate: UPDATE private.portal_client_access_control SET paused=false, updated_at=now() WHERE id=true;
CREATE TABLE private.portal_client_access_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  paused boolean NOT NULL DEFAULT false,
  message text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.portal_client_access_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.portal_client_access_control FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private.portal_client_access_control (id,paused,message)
VALUES (true,true,'Ups, lo sentimos. Estos precios ya no están disponibles.');

CREATE OR REPLACE FUNCTION private.portal_client_pause_response()
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO ''
AS $body$
 SELECT jsonb_build_object('ok',false,'code','PORTAL_PAUSED','error',message)
 FROM private.portal_client_access_control WHERE id=true AND paused=true
$body$;
REVOKE ALL ON FUNCTION private.portal_client_pause_response() FROM PUBLIC, anon, authenticated, service_role;

DO $pause$
DECLARE
 target regprocedure;
 original text;
 patched text;
 guard text := E'\n  -- Reversible client access pause; staff entry points remain available.\n  IF private.portal_client_pause_response() IS NOT NULL THEN\n    RETURN private.portal_client_pause_response();\n  END IF;\n';
BEGIN
 FOREACH target IN ARRAY ARRAY[
  'public.portal_client_login(text,text)'::regprocedure,
  'public.portal_client_login_v2(text,text,jsonb)'::regprocedure,
  'public.portal_client_bootstrap(text,text)'::regprocedure,
  'public.portal_client_save(text,text,text,text,text,text,text,jsonb)'::regprocedure,
  'public.portal_client_delivery_update(text,text,text,text,text,text,text)'::regprocedure
 ] LOOP
   original := pg_get_functiondef(target);
   IF position('portal_client_pause_response' IN original)>0 THEN
     RAISE EXCEPTION 'Pause guard already present in %',target;
   END IF;
   patched := regexp_replace(original,'(\mbegin\M)',E'\\1'||guard,'i');
   IF patched=original THEN RAISE EXCEPTION 'Missing entry point in %',target; END IF;
   EXECUTE patched;
 END LOOP;

 target := 'private.portal_session_customer(text,text)'::regprocedure;
 original := pg_get_functiondef(target);
 patched := replace(original,'where s.token_hash =',E'where private.portal_client_pause_response() IS NULL\n        and s.token_hash =');
 IF patched=original THEN RAISE EXCEPTION 'Missing client session condition'; END IF;
 EXECUTE patched;

 target := 'private.portal_start_new_order(text,text,uuid,text,integer)'::regprocedure;
 original := pg_get_functiondef(target);
 patched := replace(original,
   'select customer_id,customer_name into v_customer,v_name from private.portal_session_customer(p_session_token,p_device_id);',
   guard||'select customer_id,customer_name into v_customer,v_name from private.portal_session_customer(p_session_token,p_device_id);');
 IF patched=original THEN RAISE EXCEPTION 'Missing client new-order branch'; END IF;
 EXECUTE patched;
END $pause$;

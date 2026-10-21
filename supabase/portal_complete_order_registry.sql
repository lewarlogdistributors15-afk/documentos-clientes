-- Full order registry for the existing Administration / Billing access roles.
-- Preserve source tables and their original order IDs, statuses and totals.
CREATE OR REPLACE FUNCTION public.portal_admin_orders(
  p_session_token text, p_device_id text, p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions'
AS $function$
DECLARE
  v_staff_id uuid;
  v_username text;
  v_name text;
  v_role text;
  v_q text;
  v_orders jsonb;
BEGIN
  SELECT staff_id,username,display_name,role
    INTO v_staff_id,v_username,v_name,v_role
  FROM private.portal_staff_session(p_session_token,p_device_id);

  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'code','SESSION','error','Sesión inválida o vencida.');
  END IF;
  IF v_role NOT IN ('admin','billing') THEN
    RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','error','Este registro está disponible únicamente para Administración y Facturación.');
  END IF;

  v_q := lower(trim(coalesce(p_search,'')));
  WITH orders AS (
    SELECT o.id,o.version,o.status,o.email_state,o.created_at,o.updated_at,
           o.customer_id,o.data,'portal'::text AS source
    FROM public.portal_client_orders o
    UNION ALL
    SELECT o.id,o.version,o.status,o.email_state,o.created_at,o.updated_at,
           NULL::uuid AS customer_id,o.data,'expo'::text AS source
    FROM public.expo_orders o
  ), matching AS (
    SELECT o.*,jsonb_build_object(
      'id',o.id,'version',o.version,'status',o.status,'emailState',o.email_state,
      'createdAt',o.created_at,'updatedAt',o.updated_at,'customerId',o.customer_id,
      'source',o.source,'cliente',o.data->>'cliente','vendedor',o.data->>'vendedor',
      'submittedBy',o.data->>'submittedBy','submittedRole',o.data->>'submittedRole',
      'contacto',o.data->>'contacto','telefono',o.data->>'telefono','correo',o.data->>'correo',
      'tipo',o.data->>'tipo','changeReason',o.data->>'changeReason',
      'units',coalesce((o.data->>'units')::integer,
        (SELECT sum((line->>'quantity')::integer) FROM jsonb_array_elements(coalesce(o.data->'lines','[]'::jsonb)) line),0),
      'total',coalesce((o.data->>'total')::bigint,0),'date',o.data->>'date',
      'nota',o.data->>'nota','lines',coalesce(o.data->'lines','[]'::jsonb)
    ) AS order_data
    FROM orders o
    WHERE v_q=''
       OR lower(o.id) LIKE '%'||v_q||'%'
       OR lower(coalesce(o.data->>'cliente','')) LIKE '%'||v_q||'%'
       OR lower(coalesce(o.data->>'vendedor','')) LIKE '%'||v_q||'%'
       OR lower(coalesce(o.data->>'submittedBy','')) LIKE '%'||v_q||'%'
  )
  SELECT coalesce(jsonb_agg(order_data ORDER BY updated_at DESC,id),'[]'::jsonb)
    INTO v_orders
  FROM matching;

  RETURN jsonb_build_object(
    'ok',true,
    'actor',jsonb_build_object('id',v_staff_id,'username',v_username,'name',v_name,'role',v_role),
    'orders',v_orders
  );
END
$function$;

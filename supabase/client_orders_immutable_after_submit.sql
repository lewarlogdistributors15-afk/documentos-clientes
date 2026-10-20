-- Migración aplicada al proyecto Lewar Expo Muebles Registry el 20-10-2026.
-- Restringe la edición desde sesiones de CLIENTE, no la edición autorizada de personal Lewar.
-- El estado interno "editable" permanece para que los administradores puedan gestionar la orden;
-- en la interfaz del CLIENTE, cualquier orden existente con ese estado está sometida y bloqueada.
-- "Nuevo pedido" finaliza la anterior y permite crear una NUEVA, sin modificar la original.

create or replace function public.portal_client_save(
  p_session_token text, p_device_id text, p_contacto text,
  p_telefono text, p_correo text, p_vendedor text,
  p_nota text, p_items jsonb
) returns jsonb
language plpgsql security definer
set search_path to 'public','private','extensions'
as $function$
declare
  v_customer_id uuid;
  v_customer_name text;
begin
  select customer_id,customer_name into v_customer_id,v_customer_name
  from private.portal_session_customer(p_session_token,p_device_id);

  if v_customer_id is null then
    return jsonb_build_object('ok',false,'code','SESSION','error',
      'Sesión inválida o vencida.');
  end if;

  if length(trim(coalesce(p_contacto,'')))<2
     or length(trim(coalesce(p_telefono,'')))<7
     or position('@' in coalesce(p_correo,''))<2
     or length(trim(coalesce(p_vendedor,'')))<2 then
    return jsonb_build_object('ok',false,'code','FIELDS','error',
      'Completa contacto, teléfono, correo y vendedor.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_customer_id::text,0));

  if exists (
    select 1 from public.portal_client_orders
    where customer_id=v_customer_id and status='editable'
  ) then
    return jsonb_build_object('ok',false,'code','ORDER_LOCKED','error',
      'Esta orden ya fue sometida y no puede modificarse. Usa Nuevo pedido para crear otra.');
  end if;

  return private.portal_store_order(
    v_customer_id,v_customer_name,p_contacto,p_telefono,
    p_correo,p_vendedor,p_nota,p_items
  );
end
$function$;

notify pgrst,'reload schema';

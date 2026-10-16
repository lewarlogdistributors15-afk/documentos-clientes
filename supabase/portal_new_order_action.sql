
create or replace function private.portal_start_new_order(
 p_session_token text,p_device_id text,p_customer_id uuid,p_order_id text,p_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_staff uuid; v_role text; v_customer uuid; v_name text;
 v_order public.portal_client_orders%rowtype;
begin
 select staff_id,role into v_staff,v_role from private.portal_staff_session(p_session_token,p_device_id);
 if v_staff is not null then
   if v_role not in ('admin','seller','billing') or (v_role='billing' and not exists(
     select 1 from public.portal_staff_users where id=v_staff and can_create_orders=true
   )) then return jsonb_build_object('ok',false,'error','No tienes permiso para crear pedidos.'); end if;
   select id,name into v_customer,v_name from public.portal_client_customers
   where id=p_customer_id and active=true and pin_hash not like 'INTERNAL-%' and name <> 'LEWAR · DEMO INTERNO'
   and not exists(select 1 from public.portal_staff_users s where s.active and lower(s.display_name)=lower(portal_client_customers.name));
 else
   select customer_id,customer_name into v_customer,v_name from private.portal_session_customer(p_session_token,p_device_id);
   if p_customer_id is distinct from v_customer then
     return jsonb_build_object('ok',false,'error','Sesión inválida para este cliente.');
   end if;
 end if;
 if v_customer is null then return jsonb_build_object('ok',false,'error','Sesión inválida o cliente no disponible.'); end if;
 select * into v_order from public.portal_client_orders
 where id=p_order_id and customer_id=v_customer for update;
 if not found then return jsonb_build_object('ok',false,'error','La orden no está disponible para este cliente.'); end if;
 if v_order.status='procesada' then return jsonb_build_object('ok',true,'previousOrderId',v_order.id); end if;
 if v_order.status<>'editable' or v_order.version is distinct from p_version then
   return jsonb_build_object('ok',false,'error','La orden cambió. Recarga la página antes de iniciar un nuevo pedido.');
 end if;
 update public.portal_client_orders set status='procesada',
 data=jsonb_set(data,'{status}','"procesada"'::jsonb),updated_at=now() where id=v_order.id;
 insert into public.portal_client_order_events(order_id,customer_id,version,action,data)
 values(v_order.id,v_customer,v_order.version,'edicion_cerrada_para_nuevo_pedido',
 jsonb_set(v_order.data,'{status}','"procesada"'::jsonb)||jsonb_build_object(
 'previousStatus','editable','closedAt',now(),'closedByStaffId',v_staff,
 'auditReason','Nuevo pedido solicitado desde el portal. Se conserva la orden anterior; no certifica despacho, entrega ni facturación.'));
 return jsonb_build_object('ok',true,'previousOrderId',v_order.id);
end $$;
revoke all on function private.portal_start_new_order(text,text,uuid,text,integer) from public;
grant usage on schema private to anon,authenticated;
grant execute on function private.portal_start_new_order(text,text,uuid,text,integer) to anon,authenticated;
create or replace function public.portal_access_new_order(
 p_session_token text,p_device_id text,p_customer_id uuid,p_order_id text,p_version integer
) returns jsonb language sql security invoker set search_path='' as $$
 select private.portal_start_new_order(p_session_token,p_device_id,p_customer_id,p_order_id,p_version)
$$;
revoke all on function public.portal_access_new_order(text,text,uuid,text,integer) from public;
grant execute on function public.portal_access_new_order(text,text,uuid,text,integer) to anon,authenticated;
notify pgrst,'reload schema';

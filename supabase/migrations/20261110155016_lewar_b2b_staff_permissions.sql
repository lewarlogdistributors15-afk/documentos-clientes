create table public.lewar_b2b_staff_access (
  staff_id uuid primary key references public.portal_staff_users(id),
  portal_role text not null check (portal_role in ('admin','catalog'))
);
alter table public.lewar_b2b_staff_access enable row level security;
revoke all on public.lewar_b2b_staff_access from public,anon,authenticated;
grant select on public.lewar_b2b_staff_access to service_role;

alter table public.lewar_b2b_product_edits
add column available_qty integer check (available_qty between 0 and 1000000);

create function public.lewar_b2b_set_product_offer(
  p_sku text,p_sale_cents integer,p_available_qty integer,p_set_available boolean,
  p_photo_url text,p_set_photo boolean,p_staff_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with eligible as (
    select staff.id, owner.staff_id is not null and staff.role='admin' as is_owner
    from public.portal_staff_users staff
    left join public.lewar_b2b_owner owner on owner.staff_id=staff.id and owner.id
    left join public.lewar_b2b_staff_access access on access.staff_id=staff.id
    where staff.id=p_staff_id and staff.active
    and ((owner.staff_id is not null and staff.role='admin')
      or (access.portal_role='admin' and staff.role='admin')
      or (access.portal_role='catalog' and staff.role='billing'))
  ), saved as (
    insert into public.lewar_b2b_product_edits as product
      (sku,sale_cents,available_qty,photo_url,updated_by,updated_at)
    select p_sku,p_sale_cents,case when p_set_available then p_available_qty end,
      case when p_set_photo then p_photo_url end,p_staff_id,now()
    from eligible
    where (not p_set_photo or is_owner)
    and exists (select 1 from public.b2b_inventory item where item.sku=p_sku and item.visible)
    on conflict (sku) do update set
      sale_cents=excluded.sale_cents,
      available_qty=case when p_set_available then excluded.available_qty else product.available_qty end,
      photo_url=case when p_set_photo then excluded.photo_url else product.photo_url end,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at
    returning sku
  )
  select exists(select 1 from saved);
$$;

revoke all on function public.lewar_b2b_set_product_offer(text,integer,integer,boolean,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.lewar_b2b_set_product_offer(text,integer,integer,boolean,text,boolean,uuid) to service_role;

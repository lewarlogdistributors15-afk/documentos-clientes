insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('lewar-b2b-product-photos','lewar-b2b-product-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create function public.lewar_b2b_set_product_photo(p_sku text,p_photo_url text,p_staff_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with saved as (
    insert into public.lewar_b2b_product_edits (sku,photo_url,updated_by,updated_at)
    select p_sku,p_photo_url,p_staff_id,now()
    where exists (
      select 1 from public.lewar_b2b_owner owner
      join public.portal_staff_users staff on staff.id=owner.staff_id
      where owner.id and owner.staff_id=p_staff_id and staff.active and staff.role='admin'
    )
    and exists (select 1 from public.b2b_inventory item where item.sku=p_sku and item.visible)
    and p_photo_url ~ '^https://aznoakixjklsxuwuyshw[.]supabase[.]co/storage/v1/object/public/lewar-b2b-product-photos/[a-f0-9-]{36}[.](jpg|png|webp)$'
    on conflict (sku) do update
      set photo_url=excluded.photo_url,updated_by=excluded.updated_by,updated_at=excluded.updated_at
    returning sku
  )
  select exists(select 1 from saved);
$$;

revoke all on function public.lewar_b2b_set_product_photo(text,text,uuid) from public,anon,authenticated;
grant execute on function public.lewar_b2b_set_product_photo(text,text,uuid) to service_role;

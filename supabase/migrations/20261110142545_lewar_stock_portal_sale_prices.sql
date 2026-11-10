alter table public.lewar_stock_snapshot
add column portal_sale_items jsonb
check (case when jsonb_typeof(portal_sale_items) = 'array' then jsonb_array_length(portal_sale_items) <= 10000 else portal_sale_items is null end);

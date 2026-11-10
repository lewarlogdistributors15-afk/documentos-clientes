alter table public.lewar_stock_snapshot
add column price_items jsonb
check (case when jsonb_typeof(price_items) = 'array' then jsonb_array_length(price_items) <= 10000 else price_items is null end);

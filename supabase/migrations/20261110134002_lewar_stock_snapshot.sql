create table public.lewar_stock_snapshot (
  id smallint primary key check (id = 1),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  as_of date,
  items jsonb,
  check ((as_of is null) = (items is null)),
  check (case when jsonb_typeof(items) = 'array' then jsonb_array_length(items) <= 10000 else items is null end)
);
alter table public.lewar_stock_snapshot enable row level security;
revoke all on table public.lewar_stock_snapshot from public, anon, authenticated;
grant select, insert, update on table public.lewar_stock_snapshot to service_role;

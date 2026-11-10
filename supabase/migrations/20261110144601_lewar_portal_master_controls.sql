create table public.lewar_b2b_owner (
  id boolean primary key default true check (id),
  staff_id uuid not null references public.portal_staff_users(id)
);
create table public.lewar_b2b_product_edits (
  sku text primary key,
  sale_cents integer check (sale_cents > 0),
  photo_url text,
  updated_by uuid not null references public.portal_staff_users(id),
  updated_at timestamptz not null default now()
);
create table public.lewar_b2b_customer_edits (
  customer_id uuid primary key references public.portal_client_customers(id),
  display_name text,
  contact_email text,
  updated_by uuid not null references public.portal_staff_users(id),
  updated_at timestamptz not null default now()
);
alter table public.lewar_b2b_owner enable row level security;
alter table public.lewar_b2b_product_edits enable row level security;
alter table public.lewar_b2b_customer_edits enable row level security;
revoke all on public.lewar_b2b_owner, public.lewar_b2b_product_edits, public.lewar_b2b_customer_edits from public, anon, authenticated;
grant select on public.lewar_b2b_owner to service_role;
grant select, insert, update on public.lewar_b2b_product_edits, public.lewar_b2b_customer_edits to service_role;

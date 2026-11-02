alter table public.stores
  add column focus text not null default 'products'
  check (focus in ('products', 'services', 'trips'));
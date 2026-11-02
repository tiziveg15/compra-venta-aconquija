create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null unique check (char_length(name) between 2 and 100),
  description text not null default '',
  avatar_url text,
  banner_url text,
  location text not null default 'Valles Calchaquíes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  category text not null,
  location text not null default 'Valles Calchaquíes',
  tags text[] not null default '{}',
  condition text not null default 'Nuevo' check (condition in ('Nuevo','Usado')),
  stock integer not null default 0 check (stock >= 0),
  shipping boolean not null default false,
  image_url text not null,
  media jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  store_id uuid references public.stores (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1000),
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_exactly_one_target check ((product_id is not null) <> (store_id is not null))
);

create index products_active_created_at_idx on public.products (created_at desc) where status = 'active';
create index products_owner_created_at_idx on public.products (owner_id, created_at desc);
create index products_store_created_at_idx on public.products (store_id, created_at desc);
create index reviews_product_created_at_idx on public.reviews (product_id, created_at desc) where product_id is not null;
create index reviews_store_created_at_idx on public.reviews (store_id, created_at desc) where store_id is not null;

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.reviews enable row level security;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.stores to anon, authenticated;
grant insert, update, delete on public.stores to authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;

create policy "Profiles are public" on public.profiles for select to anon, authenticated using (true);
create policy "Users create their own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users update their own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Stores are public" on public.stores for select to anon, authenticated using (true);
create policy "Owners create their store" on public.stores for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Owners update their store" on public.stores for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners delete their store" on public.stores for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "Active products and owner inventory are visible" on public.products for select to anon, authenticated using (status = 'active' or (select auth.uid()) = owner_id);
create policy "Owners create products" on public.products for insert to authenticated with check ((select auth.uid()) = owner_id and exists (select 1 from public.stores s where s.id = store_id and s.owner_id = (select auth.uid())));
create policy "Owners update products" on public.products for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and exists (select 1 from public.stores s where s.id = store_id and s.owner_id = (select auth.uid())));
create policy "Owners delete products" on public.products for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "Reviews are public" on public.reviews for select to anon, authenticated using (true);
create policy "Signed-in users create reviews" on public.reviews for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "Authors update their reviews" on public.reviews for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy "Authors delete their reviews" on public.reviews for delete to authenticated using ((select auth.uid()) = author_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('market-media', 'market-media', true, 41943040, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

create policy "Market media is publicly readable" on storage.objects for select to anon, authenticated using (bucket_id = 'market-media');
create policy "Users upload media to their own folder" on storage.objects for insert to authenticated with check (bucket_id = 'market-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users update media in their own folder" on storage.objects for update to authenticated using (bucket_id = 'market-media' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'market-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete media in their own folder" on storage.objects for delete to authenticated using (bucket_id = 'market-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

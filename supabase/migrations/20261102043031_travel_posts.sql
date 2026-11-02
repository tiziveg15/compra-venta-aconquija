create table public.travel_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  origin text not null check (char_length(origin) between 2 and 120),
  destination text not null check (char_length(destination) between 2 and 120),
  departure_at timestamptz not null,
  vehicle text not null check (vehicle in ('Auto', 'Moto')),
  seats_available smallint not null check (seats_available between 1 and 20),
  accepts_packages boolean not null default false,
  package_destinations text[] not null default '{}',
  price_per_seat numeric(12,2) check (price_per_seat is null or price_per_seat >= 0),
  contact_phone text not null default '' check (char_length(contact_phone) <= 40),
  notes text not null default '' check (char_length(notes) <= 2000),
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint package_destinations_required check (not accepts_packages or cardinality(package_destinations) > 0)
);

create index travel_posts_active_departure_idx
  on public.travel_posts (departure_at asc)
  where status = 'active';
create index travel_posts_owner_created_idx
  on public.travel_posts (owner_id, created_at desc);

alter table public.travel_posts enable row level security;
grant select on public.travel_posts to anon, authenticated;
grant insert, update, delete on public.travel_posts to authenticated;

create policy "Active trips and owners are visible"
  on public.travel_posts for select to anon, authenticated
  using (status = 'active' or (select auth.uid()) = owner_id);
create policy "Owners create trips for their store"
  on public.travel_posts for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.stores s
      where s.id = store_id and s.owner_id = (select auth.uid())
    )
  );
create policy "Owners update their trips"
  on public.travel_posts for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.stores s
      where s.id = store_id and s.owner_id = (select auth.uid())
    )
  );
create policy "Owners delete their trips"
  on public.travel_posts for delete to authenticated
  using ((select auth.uid()) = owner_id);

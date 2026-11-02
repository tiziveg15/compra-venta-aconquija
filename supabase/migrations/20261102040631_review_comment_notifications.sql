create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  review_id uuid not null unique references public.reviews (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  store_id uuid references public.stores (id) on delete cascade,
  notification_type text not null check (notification_type in ('product_comment', 'store_comment')),
  target_label text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notification_exactly_one_target check ((product_id is not null) <> (store_id is not null))
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_unread_recipient_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "Users read their notifications"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = recipient_id);
create policy "Users mark their notifications as read"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

create or replace function public.create_review_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
  v_target_label text;
  v_notification_type text;
begin
  if nullif(btrim(new.body), '') is null
     and jsonb_array_length(coalesce(new.media, '[]'::jsonb)) = 0 then
    return new;
  end if;

  if new.product_id is not null then
    select p.owner_id, p.title
      into v_recipient_id, v_target_label
      from public.products p
      where p.id = new.product_id;
    v_notification_type := 'product_comment';
  else
    select s.owner_id, s.name
      into v_recipient_id, v_target_label
      from public.stores s
      where s.id = new.store_id;
    v_notification_type := 'store_comment';
  end if;

  if v_recipient_id is null or v_recipient_id = new.author_id then
    return new;
  end if;

  insert into public.notifications (
    recipient_id, actor_id, review_id, product_id, store_id,
    notification_type, target_label
  ) values (
    v_recipient_id, new.author_id, new.id, new.product_id, new.store_id,
    v_notification_type, v_target_label
  ) on conflict (review_id) do nothing;

  return new;
end;
$$;

create trigger reviews_create_comment_notification
  after insert or update of body, media on public.reviews
  for each row
  execute function public.create_review_comment_notification();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

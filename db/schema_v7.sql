-- ПолиКоннект — веха 7: настоящие объявления (Услуги/Вещи).
-- Применить так же: SQL Editor → New query → вставить → Run.

create table public.listings (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('service','thing')),
  deal_type text not null check (deal_type in ('paid','free','wanted')),
  category text not null,
  title text not null check (char_length(title) between 3 and 150),
  description text not null check (char_length(description) between 1 and 2000),
  price_text text,
  photo_url text,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now()
);

alter table public.listings enable row level security;

-- Читает любой, даже гость (как Avito). Писать/менять/удалять — только свои.
create policy "listings_select_all" on public.listings for select using (true);

create policy "listings_insert_own" on public.listings for insert
  with check (author_id = auth.uid());

create policy "listings_update_own" on public.listings for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "listings_delete_own" on public.listings for delete
  using (author_id = auth.uid());

-- Публичный бакет для фото объявлений (как avatars/profile-photos) —
-- читает любой, пишет только владелец, путь вида "<uid>/файл".
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

drop policy if exists "listing_photos_public_read" on storage.objects;
create policy "listing_photos_public_read" on storage.objects for select
  using (bucket_id = 'listing-photos');

drop policy if exists "listing_photos_owner_write" on storage.objects;
create policy "listing_photos_owner_write" on storage.objects for insert
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "listing_photos_owner_delete" on storage.objects;
create policy "listing_photos_owner_delete" on storage.objects for delete
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ПолиКоннект — веха 20: Альбомы, только через админ-панель.
-- Решение принято вместе с пользователем: не открывать загрузку фото
-- всем подряд (1000+ студентов с несжатыми телефонными фото быстро
-- съели бы 1 GB бесплатного хранилища Supabase) — вместо этого альбомы
-- создаёт и наполняет только администратор через admin.html, фото
-- сжимаются в браузере перед загрузкой. Смотреть может любой.
-- Применить как обычно: SQL Editor → New query → вставить → Run.

create table public.albums (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 100),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.album_photos (
  id bigint generated always as identity primary key,
  album_id bigint not null references public.albums(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

alter table public.albums enable row level security;
alter table public.album_photos enable row level security;

create policy "albums_select_all" on public.albums for select using (true);
create policy "albums_insert_admin" on public.albums for insert with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);
create policy "albums_delete_admin" on public.albums for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

create policy "album_photos_select_all" on public.album_photos for select using (true);
create policy "album_photos_insert_admin" on public.album_photos for insert with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);
create policy "album_photos_delete_admin" on public.album_photos for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

-- Публичный бакет для фото альбомов — читать может любой, писать/удалять
-- только admin (тут нет понятия "владелец пути", как в остальных бакетах —
-- это кураторская, а не пользовательская фича).
insert into storage.buckets (id, name, public)
values ('album-photos', 'album-photos', true)
on conflict (id) do nothing;

drop policy if exists "album_photos_public_read" on storage.objects;
create policy "album_photos_public_read" on storage.objects for select using (bucket_id = 'album-photos');

drop policy if exists "album_photos_admin_write" on storage.objects;
create policy "album_photos_admin_write" on storage.objects for insert with check (
  bucket_id = 'album-photos' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

drop policy if exists "album_photos_admin_delete" on storage.objects;
create policy "album_photos_admin_delete" on storage.objects for delete using (
  bucket_id = 'album-photos' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

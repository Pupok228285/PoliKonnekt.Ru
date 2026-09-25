-- ПолиКоннект — веха 39: участники присылают рисунки/фото в Альбомы —
-- через модерацию, не напрямую. Заявка падает в очередь, админ в
-- admin.html либо добавляет её в выбранный альбом (тогда она становится
-- обычной строкой album_photos), либо отклоняет — саму очередь не видит
-- никто, кроме автора заявки и админа.
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.

create table public.album_submissions (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  photo_url text not null,
  caption text check (char_length(caption) <= 200),
  created_at timestamptz not null default now()
);

alter table public.album_submissions enable row level security;

create policy "album_submissions_select_own_or_admin" on public.album_submissions for select using (
  author_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);
create policy "album_submissions_insert_own" on public.album_submissions for insert with check (
  author_id = auth.uid()
);
-- Своё "pending"-предложение можно отозвать самому; админ удаляет и при
-- одобрении (переносит фото в album_photos, потом чистит очередь), и при
-- отклонении — отдельного статуса "отклонено" не держим, просто убираем.
create policy "album_submissions_delete_own_or_admin" on public.album_submissions for delete using (
  author_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

-- Публичный бакет — как и остальные фото-бакеты в проекте (dating-photos,
-- listing-photos): читает любой по прямой ссылке, пишет только владелец
-- по своему пути "<uid>/файл", удаляет владелец или админ (админу нужно
-- при отклонении заявки).
insert into storage.buckets (id, name, public)
values ('album-submissions', 'album-submissions', true)
on conflict (id) do nothing;

drop policy if exists "album_submissions_public_read" on storage.objects;
create policy "album_submissions_public_read" on storage.objects for select using (
  bucket_id = 'album-submissions'
);

drop policy if exists "album_submissions_owner_write" on storage.objects;
create policy "album_submissions_owner_write" on storage.objects for insert with check (
  bucket_id = 'album-submissions' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "album_submissions_owner_or_admin_delete" on storage.objects;
create policy "album_submissions_owner_or_admin_delete" on storage.objects for delete using (
  bucket_id = 'album-submissions' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  )
);

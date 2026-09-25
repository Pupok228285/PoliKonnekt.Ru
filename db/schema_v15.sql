-- ПолиКоннект — веха 15: Библиотека (без оплаты — открыта всем зарегистрированным).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

create table public.library_items (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 150),
  description text,
  subject text not null check (char_length(subject) between 2 and 100),
  file_path text not null,
  file_name text not null,
  file_size bigint,
  downloads bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.library_items enable row level security;

create policy "library_select_all" on public.library_items for select using (true);
create policy "library_insert_own" on public.library_items for insert with check (author_id = auth.uid());
create policy "library_delete_own_or_admin" on public.library_items for delete using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

-- Публичный бакет для файлов (как avatars) — читать может любой, писать
-- только владелец, путь вида "<uid>/файл".
insert into storage.buckets (id, name, public)
values ('library-files', 'library-files', true)
on conflict (id) do nothing;

drop policy if exists "library_files_public_read" on storage.objects;
create policy "library_files_public_read" on storage.objects for select using (bucket_id = 'library-files');

drop policy if exists "library_files_owner_write" on storage.objects;
create policy "library_files_owner_write" on storage.objects for insert with check (
  bucket_id = 'library-files' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "library_files_owner_delete" on storage.objects;
create policy "library_files_owner_delete" on storage.objects for delete using (
  bucket_id = 'library-files' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Счётчик скачиваний — через функцию, а не открытый UPDATE всем подряд.
create or replace function public.bump_library_downloads(item_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.library_items set downloads = downloads + 1 where id = item_id;
end;
$$;

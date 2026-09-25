-- v33: реальное "В избранное" вместо мёртвой ссылки в Ленте.
-- Обычные own-row RLS-политики достаточно — ничего привилегированного, RPC не нужен.

create table if not exists public.favorites (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null,
  content_id bigint not null,
  created_at timestamptz not null default now(),
  unique (profile_id, content_type, content_id)
);

alter table public.favorites enable row level security;

drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own on public.favorites for select
  using (profile_id = auth.uid());

drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own on public.favorites for insert
  with check (profile_id = auth.uid());

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own on public.favorites for delete
  using (profile_id = auth.uid());

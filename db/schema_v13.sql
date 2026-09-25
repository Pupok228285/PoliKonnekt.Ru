-- ПолиКоннект — веха 13: Потеряшки (нашли/потеряли).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

create table public.lost_found_posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('lost', 'found')),
  title text not null check (char_length(title) between 3 and 150),
  description text not null check (char_length(description) between 1 and 1000),
  location text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

alter table public.lost_found_posts enable row level security;

create policy "lostfound_select_all" on public.lost_found_posts for select using (true);
create policy "lostfound_insert_own" on public.lost_found_posts for insert with check (author_id = auth.uid());
create policy "lostfound_update_own_or_admin" on public.lost_found_posts for update using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);
create policy "lostfound_delete_own_or_admin" on public.lost_found_posts for delete using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

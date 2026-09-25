-- ПолиКоннект — веха 12: Столовая (общий чат сайта, отдельно от Ленты).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

create table public.canteen_posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.canteen_posts enable row level security;

create policy "canteen_select_all" on public.canteen_posts for select using (true);
create policy "canteen_insert_own" on public.canteen_posts for insert with check (author_id = auth.uid());
create policy "canteen_delete_own_or_admin" on public.canteen_posts for delete using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

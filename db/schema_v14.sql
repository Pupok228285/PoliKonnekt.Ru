-- ПолиКоннект — веха 14: Цитаты и Креатив.
-- Применить как обычно: SQL Editor → New query → вставить → Run.

create table public.quote_posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.quote_posts enable row level security;

create policy "quotes_select_all" on public.quote_posts for select using (true);
create policy "quotes_insert_own" on public.quote_posts for insert with check (author_id = auth.uid());
create policy "quotes_delete_own_or_admin" on public.quote_posts for delete using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

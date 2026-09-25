-- ПолиКоннект — веха 4: настоящий форум (темы и ответы).
-- Применить так же: SQL Editor → New query → вставить → Run.

create table public.forum_topics (
  id bigint generated always as identity primary key,
  section text not null,
  title text not null,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.forum_replies (
  id bigint generated always as identity primary key,
  topic_id bigint not null references public.forum_topics(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

alter table public.forum_topics enable row level security;
alter table public.forum_replies enable row level security;

-- Темы и ответы читает любой (даже гость), пишет — только вошедший, от своего имени.
create policy "topics_select_all" on public.forum_topics for select using (true);
create policy "topics_insert_own" on public.forum_topics for insert with check (author_id = auth.uid());

create policy "replies_select_all" on public.forum_replies for select using (true);
create policy "replies_insert_own" on public.forum_replies for insert with check (author_id = auth.uid());

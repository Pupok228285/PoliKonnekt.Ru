-- ПолиКоннект — веха 23: «Дневники» — личный блог в духе ЖЖ (публичный,
-- как и всё на сайте), заголовок необязателен. Переиспользует уже готовые
-- оценки (cast_vote) и комментарии (comments).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

create table public.diary_posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  body text not null check (char_length(body) between 1 and 4000),
  score bigint not null default 0,
  comment_count bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.diary_posts enable row level security;
create policy "diary_posts_select_all" on public.diary_posts for select using (true);
create policy "diary_posts_insert_own" on public.diary_posts for insert with check (author_id = auth.uid());
create policy "diary_posts_delete_own_or_admin" on public.diary_posts for delete using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

-- ---------- подключаем к уже существующим оценкам и комментариям ----------
alter table public.votes drop constraint if exists votes_content_type_check;
alter table public.votes add constraint votes_content_type_check check (
  content_type in ('feed_post', 'quote_post', 'canteen_post', 'artel_post', 'forum_reply', 'review_topic', 'diary_post')
);

alter table public.comments drop constraint if exists comments_content_type_check;
alter table public.comments add constraint comments_content_type_check check (
  content_type in ('feed_post', 'quote_post', 'canteen_post', 'artel_post', 'diary_post')
);

create or replace function public.cast_vote(p_content_type text, p_content_id bigint, p_value smallint)
returns table(new_score bigint, my_vote smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  tbl text;
  existing smallint;
  delta int := 0;
  v_author uuid;
  v_score bigint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_value not in (-1, 0, 1) then
    raise exception 'invalid value';
  end if;

  tbl := case p_content_type
    when 'feed_post' then 'feed_posts'
    when 'quote_post' then 'quote_posts'
    when 'canteen_post' then 'canteen_posts'
    when 'artel_post' then 'artel_posts'
    when 'forum_reply' then 'forum_replies'
    when 'review_topic' then 'review_topics'
    when 'diary_post' then 'diary_posts'
    else null
  end;
  if tbl is null then
    raise exception 'unknown content_type';
  end if;

  select value into existing from public.votes
    where content_type = p_content_type and content_id = p_content_id and voter_id = auth.uid();

  if p_value = 0 then
    if existing is not null then
      delta := -existing;
      delete from public.votes
        where content_type = p_content_type and content_id = p_content_id and voter_id = auth.uid();
    end if;
  elsif existing is null then
    delta := p_value;
    insert into public.votes (content_type, content_id, voter_id, value)
      values (p_content_type, p_content_id, auth.uid(), p_value);
  elsif existing <> p_value then
    delta := p_value - existing;
    update public.votes set value = p_value
      where content_type = p_content_type and content_id = p_content_id and voter_id = auth.uid();
  end if;

  if delta <> 0 then
    execute format('update public.%I set score = coalesce(score,0) + $1 where id = $2 returning author_id, score', tbl)
      into v_author, v_score
      using delta, p_content_id;
    if v_author is not null then
      update public.profiles set reputation = coalesce(reputation, 0) + delta where id = v_author;
    end if;
  else
    execute format('select score from public.%I where id = $1', tbl)
      into v_score
      using p_content_id;
  end if;

  return query select v_score, (case when p_value = 0 then null else p_value end)::smallint;
end;
$$;

create or replace function public.bump_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tbl text;
begin
  tbl := case coalesce(new.content_type, old.content_type)
    when 'feed_post' then 'feed_posts'
    when 'quote_post' then 'quote_posts'
    when 'canteen_post' then 'canteen_posts'
    when 'artel_post' then 'artel_posts'
    when 'diary_post' then 'diary_posts'
    else null
  end;
  if tbl is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    execute format('update public.%I set comment_count = coalesce(comment_count,0) + 1 where id = $1', tbl) using new.content_id;
  elsif tg_op = 'DELETE' then
    execute format('update public.%I set comment_count = greatest(0, coalesce(comment_count,0) - 1) where id = $1', tbl) using old.content_id;
  end if;
  return null;
end;
$$;

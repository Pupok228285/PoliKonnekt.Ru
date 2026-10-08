-- ПолиКоннект — веха 88: автор фото в альбоме (с возможностью анонимности)
-- и лайки (переиспользуем общую систему оценок, как у остальных разделов).
-- Применить так же: SQL Editor → New query → вставить → Run.

alter table public.album_photos add column if not exists author_id uuid references public.profiles(id) on delete set null;
alter table public.album_photos add column if not exists is_anonymous boolean not null default true;
alter table public.album_photos add column if not exists score bigint not null default 0;

-- Заявка несёт выбор анонимности с собой — переносится в album_photos при одобрении.
alter table public.album_submissions add column if not exists is_anonymous boolean not null default false;

alter table public.votes drop constraint if exists votes_content_type_check;
alter table public.votes add constraint votes_content_type_check check (
  content_type in ('feed_post', 'quote_post', 'canteen_post', 'artel_post', 'forum_reply', 'review_topic', 'diary_post', 'album_photo')
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
    when 'album_photo' then 'album_photos'
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

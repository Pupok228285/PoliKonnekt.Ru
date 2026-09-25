-- ПолиКоннект — веха 17: оценки (стрелочки вверх/вниз → настоящая
-- "Репутация" автора, которая раньше была нарисованным числом) и
-- комментарии — на Ленте, Цитатах, Столовой, стене артели и ответах
-- форума (оценки), везде кроме форума (комментарии — там уже есть темы).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

alter table public.profiles add column if not exists reputation bigint not null default 0;

alter table public.feed_posts add column if not exists score bigint not null default 0;
alter table public.feed_posts add column if not exists comment_count bigint not null default 0;
alter table public.quote_posts add column if not exists score bigint not null default 0;
alter table public.quote_posts add column if not exists comment_count bigint not null default 0;
alter table public.canteen_posts add column if not exists score bigint not null default 0;
alter table public.canteen_posts add column if not exists comment_count bigint not null default 0;
alter table public.artel_posts add column if not exists score bigint not null default 0;
alter table public.artel_posts add column if not exists comment_count bigint not null default 0;
alter table public.forum_replies add column if not exists score bigint not null default 0;

-- ---------- оценки ----------
create table public.votes (
  content_type text not null check (content_type in ('feed_post', 'quote_post', 'canteen_post', 'artel_post', 'forum_reply')),
  content_id bigint not null,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (content_type, content_id, voter_id)
);

alter table public.votes enable row level security;

-- Видит каждый только свой голос (чтобы подсветить свою стрелочку) — сумма
-- голосов (score) и так открыта всем прямо на самом посте.
create policy "votes_select_own" on public.votes for select using (voter_id = auth.uid());
-- Ставить/менять/снимать голос — только через cast_vote() ниже, напрямую
-- в таблицу писать нельзя (иначе можно было бы накрутить очки в обход
-- пересчёта репутации автора).

-- Единая функция для голоса по любому типу контента: ставит, меняет или
-- снимает голос (value = 0 — снять), сама пересчитывает счётчик на посте
-- и репутацию автора, возвращает новый счёт и текущий голос вызывающего.
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

-- ---------- комментарии (везде, кроме форума — там уже есть свои темы) ----------
create table public.comments (
  id bigint generated always as identity primary key,
  content_type text not null check (content_type in ('feed_post', 'quote_post', 'canteen_post', 'artel_post')),
  content_id bigint not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "comments_select_all" on public.comments for select using (true);
create policy "comments_insert_own" on public.comments for insert with check (author_id = auth.uid());
create policy "comments_delete_own_or_admin" on public.comments for delete using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

create or replace function public.bump_comment_count()
returns trigger
language plpgsql
as $$
declare
  tbl text;
begin
  tbl := case (case when TG_OP = 'DELETE' then old.content_type else new.content_type end)
    when 'feed_post' then 'feed_posts'
    when 'quote_post' then 'quote_posts'
    when 'canteen_post' then 'canteen_posts'
    when 'artel_post' then 'artel_posts'
    else null
  end;
  if tbl is null then
    return coalesce(new, old);
  end if;
  if TG_OP = 'INSERT' then
    execute format('update public.%I set comment_count = coalesce(comment_count,0) + 1 where id = $1', tbl) using new.content_id;
    return new;
  elsif TG_OP = 'DELETE' then
    execute format('update public.%I set comment_count = greatest(coalesce(comment_count,0) - 1, 0) where id = $1', tbl) using old.content_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_bump_comment_count on public.comments;
create trigger trg_bump_comment_count
after insert or delete on public.comments
for each row execute function public.bump_comment_count();

-- Заодно показываем репутацию в админ-панели (список участников).
drop function if exists public.admin_list_profiles();
create or replace function public.admin_list_profiles()
returns table (
  id uuid, member_no bigint, nickname text, email text, verified boolean,
  is_admin boolean, is_moderator boolean, reputation bigint, created_at timestamptz, last_seen_at timestamptz
) language plpgsql security definer as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized';
  end if;
  return query
    select pr.id, pr.member_no, pr.nickname, u.email::text, pr.verified, pr.is_admin, pr.is_moderator, pr.reputation,
           pr.created_at, pr.last_seen_at
    from public.profiles pr join auth.users u on u.id = pr.id
    order by pr.created_at desc;
end;
$$;

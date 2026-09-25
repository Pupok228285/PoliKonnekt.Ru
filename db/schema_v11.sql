-- ПолиКоннект — веха 11: К'Артель на реальных данных (создание, членство,
-- подписки, стена). Голосования (старшина / название) в эту веху НЕ входят —
-- отдельная, более крупная задача, сделана позже. Применить как обычно:
-- SQL Editor → New query → вставить → Run.

create table public.artels (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(name) between 3 and 100),
  description text not null check (char_length(description) between 1 and 500),
  category text not null check (category in ('faculty', 'dorm', 'interest', 'course')),
  leader_id uuid references public.profiles(id) on delete set null,
  leader_since timestamptz,
  member_count bigint not null default 0,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Членство эксклюзивное: один человек — не более чем в одной артели сразу
-- (уникальный индекс по profile_id одному, без привязки к artel_id).
create table public.artel_members (
  artel_id bigint not null references public.artels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'deputy', 'member')),
  joined_at timestamptz not null default now(),
  primary key (artel_id, profile_id)
);
create unique index artel_members_one_per_profile on public.artel_members(profile_id);

-- Подписка на стену — в отличие от членства, не ограничена количеством.
create table public.artel_subscriptions (
  artel_id bigint not null references public.artels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (artel_id, profile_id)
);

create table public.artel_posts (
  id bigint generated always as identity primary key,
  artel_id bigint not null references public.artels(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.artels enable row level security;
alter table public.artel_members enable row level security;
alter table public.artel_subscriptions enable row level security;
alter table public.artel_posts enable row level security;

create policy "artels_select_all" on public.artels for select using (true);
create policy "artels_insert_own" on public.artels for insert with check (created_by = auth.uid());
create policy "artels_delete_admin" on public.artels for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

create policy "artel_members_select_all" on public.artel_members for select using (true);
-- Вступление/выход — только через join_artel()/leave_artel() ниже (эти функции
-- security definer и сами обходят RLS), обычных insert/delete-политик нет
-- специально, чтобы нельзя было вступить в обход правила "только одна артель".

create policy "artel_subscriptions_select_own" on public.artel_subscriptions for select using (profile_id = auth.uid());
create policy "artel_subscriptions_insert_own" on public.artel_subscriptions for insert with check (profile_id = auth.uid());
create policy "artel_subscriptions_delete_own" on public.artel_subscriptions for delete using (profile_id = auth.uid());

create policy "artel_posts_select_all" on public.artel_posts for select using (true);
create policy "artel_posts_insert_member" on public.artel_posts for insert with check (
  author_id = auth.uid()
  and exists (select 1 from public.artel_members m where m.artel_id = artel_posts.artel_id and m.profile_id = auth.uid())
);

-- Попутно найдено при автономном тестировании 22.09: у forum_topics и
-- forum_replies вообще не было политики на удаление — даже автор или админ
-- не мог убрать тестовый/спам-пост. Добавляем сюда, раз уж всё равно
-- применять этот файл целиком.
create policy "forum_topics_delete_own_or_admin" on public.forum_topics for delete using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);
create policy "forum_replies_delete_own_or_admin" on public.forum_replies for delete using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

-- Создатель артели автоматически становится старшиной и первым участником
-- (и выходит из прежней артели, если состоял — членство ведь эксклюзивное).
create or replace function public.handle_new_artel()
returns trigger
language plpgsql
as $$
begin
  delete from public.artel_members where profile_id = new.created_by;
  insert into public.artel_members (artel_id, profile_id, role) values (new.id, new.created_by, 'leader');
  update public.artels set leader_id = new.created_by, leader_since = now() where id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_new_artel on public.artels;
create trigger trg_new_artel
after insert on public.artels
for each row execute function public.handle_new_artel();

-- Счётчик участников — держим денормализованным полем, чтобы список артелей
-- не бил по базе отдельным запросом на каждую строку.
create or replace function public.bump_artel_member_count()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    update public.artels set member_count = member_count + 1 where id = new.artel_id;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.artels set member_count = greatest(member_count - 1, 0) where id = old.artel_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_artel_member_count on public.artel_members;
create trigger trg_artel_member_count
after insert or delete on public.artel_members
for each row execute function public.bump_artel_member_count();

-- Вступить: выходит из прежней артели (если была) и вступает в новую.
create or replace function public.join_artel(target_artel_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from public.artel_members where profile_id = auth.uid();
  insert into public.artel_members (artel_id, profile_id, role) values (target_artel_id, auth.uid(), 'member');
end;
$$;

-- Выйти: если выходит старшина, артель остаётся без старшины (выборы —
-- отдельная задача, пока просто освобождаем место).
create or replace function public.leave_artel()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_artel bigint;
begin
  select artel_id into my_artel from public.artel_members where profile_id = auth.uid();
  if my_artel is null then
    return;
  end if;
  delete from public.artel_members where profile_id = auth.uid();
  update public.artels set leader_id = null, leader_since = null where id = my_artel and leader_id = auth.uid();
end;
$$;

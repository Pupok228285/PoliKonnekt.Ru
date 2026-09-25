-- ПолиКоннект — веха 9: назначение ролей через сайт + жалобы/вопросы (Поддержка).
-- Применить так же: SQL Editor → New query → вставить → Run.

-- 1) admin_list_profiles() — добавляем is_moderator в выдачу, иначе в админке
--    не отрисовать, кто уже модератор. Права/логика запроса не меняются.
--    Postgres не даёт поменять состав колонок через CREATE OR REPLACE — сперва
--    удаляем старую версию функции.
drop function if exists public.admin_list_profiles();
create or replace function public.admin_list_profiles()
returns table (
  id uuid, member_no bigint, nickname text, email text, verified boolean,
  is_admin boolean, is_moderator boolean, created_at timestamptz, last_seen_at timestamptz
) language plpgsql security definer as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized';
  end if;
  return query
    select pr.id, pr.member_no, pr.nickname, u.email::text, pr.verified, pr.is_admin, pr.is_moderator,
           pr.created_at, pr.last_seen_at
    from public.profiles pr join auth.users u on u.id = pr.id
    order by pr.created_at desc;
end;
$$;

-- 2) Жалобы и вопросы в поддержку (заменяет декоративные ссылки "Пожаловаться"
--    как единая точка входа — форма "Поддержка").
create table public.support_messages (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('complaint', 'question')),
  subject text not null check (char_length(subject) between 3 and 150),
  body text not null check (char_length(body) between 1 and 2000),
  context_url text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;

create policy "support_insert_own" on public.support_messages
  for insert with check (author_id = auth.uid());

create policy "support_select_own_or_staff" on public.support_messages
  for select using (
    author_id = auth.uid()
    or exists (select 1 from public.profiles p2 where p2.id = auth.uid() and (p2.is_admin or p2.is_moderator))
  );

create policy "support_update_staff" on public.support_messages
  for update using (
    exists (select 1 from public.profiles p2 where p2.id = auth.uid() and (p2.is_admin or p2.is_moderator))
  );

-- 3) Мини-переписка внутри обращения (ответ автора / ответ поддержки) —
--    чтобы можно было уточнить детали, а не только один текст в одну сторону.
create table public.support_replies (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.support_messages(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.support_replies enable row level security;

create policy "support_replies_select" on public.support_replies for select using (
  exists (
    select 1 from public.support_messages sm where sm.id = ticket_id and (
      sm.author_id = auth.uid()
      or exists (select 1 from public.profiles p2 where p2.id = auth.uid() and (p2.is_admin or p2.is_moderator))
    )
  )
);

create policy "support_replies_insert" on public.support_replies for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.support_messages sm where sm.id = ticket_id and (
      sm.author_id = auth.uid()
      or exists (select 1 from public.profiles p2 where p2.id = auth.uid() and (p2.is_admin or p2.is_moderator))
    )
  )
);

-- Если автор обращения отвечает в уже решённый тикет — тикет тихо
-- открывается заново (как с отклонённой заявкой в сообщениях), вместо
-- того чтобы ответ ушёл в закрытую тему и никто его не заметил.
create or replace function public.reopen_support_on_reply()
returns trigger
language plpgsql
as $$
declare
  ticket_author uuid;
begin
  select author_id into ticket_author from public.support_messages where id = new.ticket_id;
  if new.author_id = ticket_author then
    update public.support_messages set status = 'open' where id = new.ticket_id and status = 'resolved';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reopen_support on public.support_replies;
create trigger trg_reopen_support
after insert on public.support_replies
for each row execute function public.reopen_support_on_reply();

-- 4) Назначение/снятие ролей — своя функция вместо прямого UPDATE из браузера:
--    так безопаснее (нельзя случайно/криво выставить поле мимо проверки) и
--    само не даёт назначающему снять роль с самого себя (чтобы не остаться
--    без единого админа по ошибке).
create or replace function public.set_staff_role(target_id uuid, role text, value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized';
  end if;
  if target_id = auth.uid() then
    raise exception 'нельзя менять роль себе — попросите другого админа';
  end if;
  if role = 'admin' then
    update public.profiles set is_admin = value where id = target_id;
  elsif role = 'moderator' then
    update public.profiles set is_moderator = value where id = target_id;
  else
    raise exception 'invalid role';
  end if;
end;
$$;

-- ПолиКоннект — веха 33: чиним три триггера, у которых нет security definer,
-- хотя они пишут в таблицы, куда у обычного пользователя нет прав по RLS.
-- Из-за этого триггеры молча падали (откатывая всю операцию), а никакой
-- ошибки в интерфейсе не было видно, кроме глухого "не сохранилось".
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.
--
-- 1) handle_new_artel() — из-за этого НИ ОДНОЙ артели не получалось создать:
--    сам insert в artels проходил (там есть своя policy), а вот вложенный
--    insert в artel_members падал — там политик на insert нет вообще, кроме
--    как через security definer функции join_artel()/leave_artel(), а этот
--    триггер definer'ом не был. Нашёл это, попробовав вживую создать артель
--    под тестовым логином — упало с "new row violates row-level security
--    policy for table artel_members".
create or replace function public.handle_new_artel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.artel_members where profile_id = new.created_by;
  insert into public.artel_members (artel_id, profile_id, role) values (new.id, new.created_by, 'leader');
  update public.artels set leader_id = new.created_by, leader_since = now() where id = new.id;
  return new;
end;
$$;

-- 2) bump_artel_member_count() — та же болезнь: у artels нет policy на update
--    для обычных пользователей вообще, только косвенно через security definer
--    функции. На практике этот триггер всегда и так срабатывал изнутри
--    join_artel()/leave_artel() (они definer, и это давало ему прав "по
--    наследству"), но теперь, когда handle_new_artel() тоже стал definer,
--    делаем и этот definer'ом явно — не полагаемся на неявное наследование
--    контекста, а фиксируем то же самое поведение, что уже сделано для
--    bump_comment_count()/bump_review_comment_count() в более поздних вёрстках.
create or replace function public.bump_artel_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- 3) reopen_support_on_reply() — вся его задача: когда автор обращения (не
--    сотрудник поддержки) отвечает в уже решённый тикет, тихо открыть тикет
--    заново. Но у support_messages update разрешён только staff'у
--    (support_update_staff) — то есть именно в том единственном случае, ради
--    которого триггер и писался (автор — НЕ staff), update молча падал.
create or replace function public.reopen_support_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public
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

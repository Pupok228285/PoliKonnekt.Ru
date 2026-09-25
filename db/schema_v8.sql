-- ПолиКоннект — веха 8: два уровня админа + админы пишут без ожидания
-- одобрения заявки в сообщениях. Применить так же: SQL Editor → New query.

-- 1) Второй, более слабый уровень прав.
--    is_admin      — полный доступ (как раньше): список участников с почтой,
--                     очередь зачёток, онлайн.
--    is_moderator  — очередь зачёток + онлайн, БЕЗ списка участников с почтой
--                     (почта — чувствительные данные, оставляем только админу).
alter table public.profiles add column if not exists is_moderator boolean not null default false;

-- 2) Очередь зачёток и приватные фото — теперь видят и админ, и модератор
--    (было только is_admin).
drop policy if exists "verification_select_own_or_admin" on public.verification_requests;
create policy "verification_select_own_or_admin" on public.verification_requests
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p2 where p2.id = auth.uid() and (p2.is_admin or p2.is_moderator))
  );

drop policy if exists "verification_update_admin" on public.verification_requests;
create policy "verification_update_admin" on public.verification_requests
  for update using (
    exists (select 1 from public.profiles p2 where p2.id = auth.uid() and (p2.is_admin or p2.is_moderator))
  );

drop policy if exists "idcards_select_own_or_admin" on storage.objects;
create policy "idcards_select_own_or_admin" on storage.objects for select using (
  bucket_id = 'id-cards' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.profiles p2 where p2.id = auth.uid() and (p2.is_admin or p2.is_moderator))
  )
);
drop policy if exists "idcards_delete_own_or_admin" on storage.objects;
create policy "idcards_delete_own_or_admin" on storage.objects for delete using (
  bucket_id = 'id-cards' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.profiles p2 where p2.id = auth.uid() and (p2.is_admin or p2.is_moderator))
  )
);

-- 3) Подтверждение/отклонение зачётки — теперь одна функция вместо двух
--    прямых UPDATE. Работает и для is_admin, и для is_moderator, но НЕ даёт
--    модератору никакого другого доступа на запись в profiles (в отличие от
--    "profiles_update_admin", которая остаётся только для is_admin).
create or replace function public.review_verification_request(req_id bigint, decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_staff boolean;
  target_profile uuid;
begin
  select (is_admin or is_moderator) into is_staff from public.profiles where id = auth.uid();
  if not coalesce(is_staff, false) then
    raise exception 'not authorized';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;

  select profile_id into target_profile from public.verification_requests where id = req_id;

  update public.verification_requests
    set status = decision, reviewed_at = now(), reviewed_by = auth.uid()
    where id = req_id;

  if decision = 'approved' then
    update public.profiles set verified = true where id = target_profile;
  end if;
end;
$$;

-- 4) Сообщения от админа/модератора сразу уходят в "Входящие" получателя,
--    без ожидания "Одобрить" — независимо от того, что прислал клиент,
--    статус проставляет сервер по реальной роли автора темы.
create or replace function public.set_conversation_initial_status()
returns trigger
language plpgsql
as $$
declare
  initiator_is_staff boolean;
begin
  select (is_admin or is_moderator) into initiator_is_staff
  from public.profiles where id = new.initiator;
  new.status := case when coalesce(initiator_is_staff, false) then 'accepted' else 'pending' end;
  return new;
end;
$$;

drop trigger if exists trg_conversation_initial_status on public.conversations;
create trigger trg_conversation_initial_status
before insert on public.conversations
for each row execute function public.set_conversation_initial_status();

-- 5) Назначить кого-то модератором — выполните ОТДЕЛЬНО после этого файла,
--    подставив нужный ник:
-- update public.profiles set is_moderator = true where nickname = 'НИК_ЗДЕСЬ';

-- Веха 77 (уточнение): «Удалить переписку» теперь мягкое удаление — пропадает
-- из списка у обоих, но хранится в базе 14 дней. Если за это время попросят
-- вернуть (через Поддержку) — admin/moderator восстанавливает из админки.
-- Настоящая DELETE-политика из db/schema_v52.sql больше не используется
-- клиентом (вся запись/восстановление теперь только через эти RPC), но
-- трогать её не стали — она безвредна и ничего не ломает, оставшись мёртвой.

alter table public.conversations add column if not exists deleted_at timestamptz;
alter table public.conversations add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create or replace function public.soft_delete_conversation(p_conversation_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ) then
    raise exception 'not_participant';
  end if;
  update public.conversations set deleted_at = now(), deleted_by = auth.uid()
  where id = p_conversation_id;
end;
$$;
grant execute on function public.soft_delete_conversation(bigint) to authenticated;

-- Восстановить может только staff (по просьбе через Поддержку — руками, не
-- автоматически) — сам участник так же мог что-то удалить на эмоциях и
-- потом попросить вернуть, но RPC даёт это право только staff.
create or replace function public.admin_restore_conversation(p_conversation_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator)
  ) then
    raise exception 'not_staff';
  end if;
  update public.conversations set deleted_at = null, deleted_by = null
  where id = p_conversation_id;
end;
$$;
grant execute on function public.admin_restore_conversation(bigint) to authenticated;

-- Ленивая чистка — settings/schema без pg_cron (его нет на этом тарифе),
-- поэтому как и close_artel_election_if_due() — вызывается с клиента
-- (из админки, при заходе в «Удалённые переписки»), сама ничего не делает,
-- если чистить нечего.
create or replace function public.purge_old_deleted_conversations()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.conversations where deleted_at is not null and deleted_at < now() - interval '14 days';
$$;
grant execute on function public.purge_old_deleted_conversations() to authenticated;

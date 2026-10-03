-- Веха 76: "прочитано" в переписках — почтовый конверт для личных сообщений
-- (открыт/закрыт), аватарки прочитавших для групп (переиспользует уже
-- существующий chat_group_members.last_read_at — для групп новых таблиц не
-- нужно, только для личных сообщений, у которых раньше не было вообще
-- никакого отметки о прочтении).

create table public.dm_read_state (
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

alter table public.dm_read_state enable row level security;

create policy "dm_read_state_select_participant" on public.dm_read_state for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Запись — только через RPC (security definer), прямого INSERT/UPDATE для
-- клиента нет, как и у mark_chat_group_read.
create or replace function public.mark_dm_read(p_conversation_id bigint)
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
  insert into public.dm_read_state (conversation_id, profile_id, last_read_at)
  values (p_conversation_id, auth.uid(), now())
  on conflict (conversation_id, profile_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

grant execute on function public.mark_dm_read(bigint) to authenticated;

-- v34: ещё 2 пункта в Настройках, которым нужна база (смена почты/пароля —
-- обычный supabase.auth.updateUser(), миграции не требует).

alter table public.profiles add column if not exists hide_online boolean not null default false;
alter table public.profiles add column if not exists dm_policy text not null default 'all' check (dm_policy in ('all', 'friends'));

-- "Кто может писать мне первым" — расширяем уже существующий триггер
-- set_conversation_initial_status (см. schema_v8.sql), не заводим новый.
-- Админов/модераторов проверка не касается — они по-прежнему пишут кому угодно.
create or replace function public.set_conversation_initial_status()
returns trigger
language plpgsql
as $$
declare
  initiator_is_staff boolean;
  recipient_id uuid;
  recipient_policy text;
  are_friends boolean;
begin
  select (is_admin or is_moderator) into initiator_is_staff
  from public.profiles where id = new.initiator;

  if not coalesce(initiator_is_staff, false) then
    recipient_id := case when new.initiator = new.user_a then new.user_b else new.user_a end;
    select dm_policy into recipient_policy from public.profiles where id = recipient_id;
    if recipient_policy = 'friends' then
      select exists(
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = new.initiator and f.addressee_id = recipient_id)
            or (f.requester_id = recipient_id and f.addressee_id = new.initiator))
      ) into are_friends;
      if not are_friends then
        raise exception 'dm_friends_only';
      end if;
    end if;
  end if;

  new.status := case when coalesce(initiator_is_staff, false) then 'accepted' else 'pending' end;
  return new;
end;
$$;

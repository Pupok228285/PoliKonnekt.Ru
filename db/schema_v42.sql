-- ПолиКоннект — веха 42: групповые чаты в «Сообщениях» + настройка
-- «кто может добавлять меня в группы».
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.
--
-- Группы — отдельные таблицы, личные переписки (conversations/messages) не
-- трогаем. Создатель группы — её владелец: переименовывает, убирает
-- участников, удаляет группу. Добавлять людей может любой участник, но
-- только через add_chat_group_member() — она проверяет блокировки и
-- настройку добавляемого (все / только друзья).

alter table public.profiles add column if not exists group_invite_policy text not null default 'all'
  check (group_invite_policy in ('all', 'friends'));

create table public.chat_groups (
  id bigint generated always as identity primary key,
  title text not null check (char_length(trim(title)) between 1 and 60),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.chat_group_members (
  group_id bigint not null references public.chat_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index chat_group_members_profile on public.chat_group_members (profile_id);

create table public.chat_group_messages (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.chat_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  photo_path text,
  created_at timestamptz not null default now(),
  constraint chat_group_messages_has_content check (
    (body is not null and char_length(body) between 1 and 2000) or photo_path is not null
  )
);
create index chat_group_messages_group_time on public.chat_group_messages (group_id, created_at);

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_messages enable row level security;

-- Проверка «я участник» — security definer, чтобы политика на
-- chat_group_members не ссылалась сама на себя (бесконечная рекурсия RLS).
create or replace function public.is_chat_group_member(p_group_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_group_members m
    where m.group_id = p_group_id and m.profile_id = auth.uid()
  );
$$;

create policy "chat_groups_select_member" on public.chat_groups for select
  using (public.is_chat_group_member(id));
create policy "chat_groups_update_owner" on public.chat_groups for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "chat_groups_delete_owner" on public.chat_groups for delete
  using (owner_id = auth.uid());

create policy "chat_group_members_select_member" on public.chat_group_members for select
  using (public.is_chat_group_member(group_id));
-- Участник может выйти сам (кроме владельца — он удаляет группу целиком),
-- владелец может убрать любого другого.
create policy "chat_group_members_delete" on public.chat_group_members for delete using (
  (profile_id = auth.uid() and not exists (
    select 1 from public.chat_groups g where g.id = group_id and g.owner_id = auth.uid()
  ))
  or (profile_id <> auth.uid() and exists (
    select 1 from public.chat_groups g where g.id = group_id and g.owner_id = auth.uid()
  ))
);

create policy "chat_group_messages_select_member" on public.chat_group_messages for select
  using (public.is_chat_group_member(group_id));
create policy "chat_group_messages_insert_member" on public.chat_group_messages for insert
  with check (sender_id = auth.uid() and public.is_chat_group_member(group_id));

-- ---------- создание группы и добавление людей ----------
create or replace function public.create_chat_group(p_title text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 1 then raise exception 'group_title_empty'; end if;
  insert into public.chat_groups (title, owner_id) values (trim(p_title), auth.uid()) returning id into v_id;
  insert into public.chat_group_members (group_id, profile_id, added_by) values (v_id, auth.uid(), auth.uid());
  return v_id;
end;
$$;

create or replace function public.add_chat_group_member(p_group_id bigint, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy text;
  v_is_friend boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_chat_group_member(p_group_id) then raise exception 'group_not_member'; end if;
  if exists (select 1 from public.chat_group_members m where m.group_id = p_group_id and m.profile_id = p_profile_id) then
    return;
  end if;

  select p.group_invite_policy into v_policy from public.profiles p where p.id = p_profile_id;
  if v_policy is null then raise exception 'group_no_such_user'; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_profile_id and b.blocked_id = auth.uid())
       or (b.blocker_id = auth.uid() and b.blocked_id = p_profile_id)
  ) then
    raise exception 'group_blocked';
  end if;

  if v_policy = 'friends' then
    select exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = p_profile_id)
          or (f.requester_id = p_profile_id and f.addressee_id = auth.uid()))
    ) into v_is_friend;
    if not v_is_friend then raise exception 'group_friends_only'; end if;
  end if;

  if (select count(*) from public.chat_group_members m where m.group_id = p_group_id) >= 50 then
    raise exception 'group_full';
  end if;

  insert into public.chat_group_members (group_id, profile_id, added_by) values (p_group_id, p_profile_id, auth.uid());
end;
$$;

create or replace function public.mark_chat_group_read(p_group_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_group_members m set last_read_at = now()
  where m.group_id = p_group_id and m.profile_id = auth.uid();
$$;

-- Список моих групп для «Сообщений»: последнее сообщение и сколько не прочитано.
create or replace function public.my_chat_groups()
returns table (
  group_id bigint, title text, owner_id uuid, last_message_at timestamptz,
  member_count bigint, unread bigint, last_body text, last_sender_nick text, last_has_photo boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.owner_id,
    g.last_message_at,
    (select count(*) from public.chat_group_members mm where mm.group_id = g.id),
    (select count(*) from public.chat_group_messages x
      where x.group_id = g.id and x.created_at > me.last_read_at and x.sender_id <> auth.uid()),
    lm.body,
    lp.nickname,
    lm.photo_path is not null
  from public.chat_group_members me
  join public.chat_groups g on g.id = me.group_id
  left join lateral (
    select y.body, y.sender_id, y.photo_path from public.chat_group_messages y
    where y.group_id = g.id order by y.created_at desc limit 1
  ) lm on true
  left join public.profiles lp on lp.id = lm.sender_id
  where me.profile_id = auth.uid()
  order by g.last_message_at desc;
$$;

-- Группа поднимается наверх списка при каждом новом сообщении.
create or replace function public.bump_chat_group_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_groups set last_message_at = new.created_at where id = new.group_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_group_bump on public.chat_group_messages;
create trigger trg_chat_group_bump after insert on public.chat_group_messages
for each row execute function public.bump_chat_group_last_message();

-- Уведомление в Telegram (бот сам разошлёт всем участникам, кроме автора).
drop trigger if exists trg_tg_chat_group_messages on public.chat_group_messages;
create trigger trg_tg_chat_group_messages after insert on public.chat_group_messages
for each row execute function public.notify_user_telegram();

-- ---------- фото в группах: отдельный приватный бакет ----------
-- Отдельный от pm-photos: политики того бакета переводят имя папки в число
-- переписки и упали бы на путях групп. Путь здесь — "<group_id>/<файл>".
insert into storage.buckets (id, name, public)
values ('group-photos', 'group-photos', false)
on conflict (id) do nothing;

-- CASE, а не просто AND: порядок проверки условий через AND Postgres не
-- гарантирует, и приведение имени папки к числу не должно выполняться на
-- файлах других бакетов (там имена папок не числа — была бы ошибка).
drop policy if exists "group_photos_member_read" on storage.objects;
create policy "group_photos_member_read" on storage.objects for select
  using (
    case when bucket_id = 'group-photos' and (storage.foldername(name))[1] ~ '^[0-9]+$'
      then public.is_chat_group_member(((storage.foldername(name))[1])::bigint)
      else false
    end
  );

drop policy if exists "group_photos_member_write" on storage.objects;
create policy "group_photos_member_write" on storage.objects for insert
  with check (
    case when bucket_id = 'group-photos' and (storage.foldername(name))[1] ~ '^[0-9]+$'
      then public.is_chat_group_member(((storage.foldername(name))[1])::bigint)
      else false
    end
  );

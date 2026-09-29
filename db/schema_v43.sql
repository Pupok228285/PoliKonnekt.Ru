-- ПолиКоннект — веха 43: звуковые уведомления на сайте (пока вкладка
-- открыта) + приглушение конкретной переписки/группы.
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.
--
-- Три категории — как попросил пользователь: «комментарии» (ответы на
-- форуме + комментарии к постам/отзывам), «сообщения» (личка), «группы».
-- Сам звук и громкость — предпочтение браузера (localStorage, как микрофон
-- в Библиотеке), а вот что именно присылать — настройка аккаунта, чтобы
-- была одна на всех устройствах.

alter table public.profiles add column if not exists sound_notify_comments boolean not null default true;
alter table public.profiles add column if not exists sound_notify_messages boolean not null default true;
alter table public.profiles add column if not exists sound_notify_groups boolean not null default true;

alter table public.chat_group_members add column if not exists muted boolean not null default false;

-- ---------- приглушение личных переписок ----------
create table public.dm_mutes (
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (conversation_id, profile_id)
);
alter table public.dm_mutes enable row level security;

-- Читать можно только свои приглушения; писать — исключительно через
-- set_dm_muted() ниже (проверяет, что вы участник разговора).
create policy "dm_mutes_select_own" on public.dm_mutes for select using (profile_id = auth.uid());

create or replace function public.set_dm_muted(p_conversation_id bigint, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ) then
    raise exception 'not a participant';
  end if;

  if p_muted then
    insert into public.dm_mutes (conversation_id, profile_id) values (p_conversation_id, auth.uid())
      on conflict do nothing;
  else
    delete from public.dm_mutes where conversation_id = p_conversation_id and profile_id = auth.uid();
  end if;
end;
$$;

-- ---------- приглушение группы (в обход RLS — чтобы не открывать участникам
-- прямой update на всю строку своего членства) ----------
create or replace function public.set_chat_group_muted(p_group_id bigint, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.chat_group_members set muted = p_muted
    where group_id = p_group_id and profile_id = auth.uid();
  if not found then raise exception 'group_not_member'; end if;
end;
$$;

-- my_chat_groups() из schema_v42.sql — добавлено поле muted, чтобы список
-- переписок мог показать приглушённые группы без лишнего запроса. Менять
-- набор колонок в returns table через create or replace нельзя — сначала
-- дропаем.
drop function if exists public.my_chat_groups();
create or replace function public.my_chat_groups()
returns table (
  group_id bigint, title text, owner_id uuid, last_message_at timestamptz,
  member_count bigint, unread bigint, last_body text, last_sender_nick text,
  last_has_photo boolean, muted boolean
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
    lm.photo_path is not null,
    me.muted
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

-- ---------- включить Realtime на нужных таблицах ----------
-- ADD TABLE не поддерживает IF NOT EXISTS — оборачиваем в DO-блок, чтобы
-- повторный запуск миграции не падал, если таблица уже добавлена.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_group_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.forum_replies;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.review_comments;
exception when duplicate_object then null;
end $$;

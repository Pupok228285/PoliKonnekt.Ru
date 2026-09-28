-- ПолиКоннект — веха 40: уведомления пользователям в Telegram через
-- отдельного бота (не того, что шлёт админам жалобы и заявки).
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.
--
-- Как устроено: человек жмёт «Подключить Telegram» в Настройках → сайт
-- выдаёт одноразовый код → ссылка открывает бота с этим кодом → бот
-- (Edge Function telegram-notify) запоминает chat_id за аккаунтом. Дальше
-- триггеры на новых сообщениях/ответах/комментариях/друзьях/отзывах/анонимках
-- дёргают ту же функцию, она сама перечитывает строку из базы и шлёт
-- уведомление получателю, если он подключил Telegram и не выключил этот тип.

-- ---------- привязка аккаунта к Telegram ----------
create table public.telegram_links (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  chat_id bigint not null unique,
  tg_username text,
  linked_at timestamptz not null default now(),
  notify_messages boolean not null default true,
  notify_replies boolean not null default true,
  notify_comments boolean not null default true,
  notify_friends boolean not null default true,
  notify_reviews boolean not null default true,
  notify_anon boolean not null default true
);
alter table public.telegram_links enable row level security;

-- Свою привязку человек видит и может удалить. Вставлять и менять chat_id
-- напрямую нельзя — привязывает только бот, галочки меняются через
-- set_telegram_pref(), чтобы нельзя было подсунуть чужой chat_id.
create policy "telegram_links_select_own" on public.telegram_links for select using (profile_id = auth.uid());
create policy "telegram_links_delete_own" on public.telegram_links for delete using (profile_id = auth.uid());

-- Одноразовые коды для привязки (живут 15 минут). Политик нет: доступ только
-- через create_telegram_link_code() и у бота.
create table public.telegram_link_codes (
  code text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table public.telegram_link_codes enable row level security;

-- Что уже отправлено — чтобы повторный вызов функции по тому же событию не
-- прислал уведомление второй раз. Политик нет: пишет только бот.
create table public.telegram_sent (
  event_key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.telegram_sent enable row level security;

-- Имя бота для кнопки «Подключить» — его записывает сама функция при настройке.
alter table public.site_settings add column if not exists telegram_bot_username text;

create or replace function public.create_telegram_link_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.telegram_link_codes where profile_id = auth.uid() or expires_at < now();
  v_code := replace(gen_random_uuid()::text, '-', '');
  insert into public.telegram_link_codes (code, profile_id) values (v_code, auth.uid());
  return v_code;
end;
$$;

create or replace function public.set_telegram_pref(p_key text, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  case p_key
    when 'messages' then update public.telegram_links set notify_messages = p_value where profile_id = auth.uid();
    when 'replies' then update public.telegram_links set notify_replies = p_value where profile_id = auth.uid();
    when 'comments' then update public.telegram_links set notify_comments = p_value where profile_id = auth.uid();
    when 'friends' then update public.telegram_links set notify_friends = p_value where profile_id = auth.uid();
    when 'reviews' then update public.telegram_links set notify_reviews = p_value where profile_id = auth.uid();
    when 'anon' then update public.telegram_links set notify_anon = p_value where profile_id = auth.uid();
    else raise exception 'неизвестный тип уведомлений';
  end case;
end;
$$;

-- ---------- триггеры: сообщить функции о новом событии ----------
-- security definer — чтобы проверить «подключил ли хоть кто-то Telegram»
-- (от имени обычного пользователя RLS показал бы только его собственную
-- привязку). Пока никто не подключил — функцию зря не дёргаем.
create or replace function public.notify_user_telegram()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.telegram_links) then
    return new;
  end if;
  perform net.http_post(
    url := 'https://ecdyocxbswvdficyuohu.supabase.co/functions/v1/telegram-notify',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('kind', 'event', 'table', TG_TABLE_NAME, 'op', TG_OP, 'id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_tg_messages on public.messages;
create trigger trg_tg_messages after insert on public.messages
for each row execute function public.notify_user_telegram();

drop trigger if exists trg_tg_forum_replies on public.forum_replies;
create trigger trg_tg_forum_replies after insert on public.forum_replies
for each row execute function public.notify_user_telegram();

drop trigger if exists trg_tg_review_comments on public.review_comments;
create trigger trg_tg_review_comments after insert on public.review_comments
for each row execute function public.notify_user_telegram();

drop trigger if exists trg_tg_comments on public.comments;
create trigger trg_tg_comments after insert on public.comments
for each row execute function public.notify_user_telegram();

drop trigger if exists trg_tg_friendships_insert on public.friendships;
create trigger trg_tg_friendships_insert after insert on public.friendships
for each row execute function public.notify_user_telegram();

drop trigger if exists trg_tg_friendships_accept on public.friendships;
create trigger trg_tg_friendships_accept after update of status on public.friendships
for each row when (old.status = 'pending' and new.status = 'accepted')
execute function public.notify_user_telegram();

drop trigger if exists trg_tg_profile_reviews on public.profile_reviews;
create trigger trg_tg_profile_reviews after insert on public.profile_reviews
for each row execute function public.notify_user_telegram();

drop trigger if exists trg_tg_anonymous_messages on public.anonymous_messages;
create trigger trg_tg_anonymous_messages after insert on public.anonymous_messages
for each row execute function public.notify_user_telegram();

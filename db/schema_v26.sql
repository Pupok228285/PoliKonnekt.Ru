-- ПолиКоннект — веха 28: Знакомства — настоящие анкеты (лайк/дизлайк) и
-- случайный текстовый чат (без видео/фото в самом чате). Только для
-- подтверждённых студентов (verified) — проверяется в каждой RPC.
-- Без pg_cron/websocket-сервера: чат обновляется поллингом с клиента (как и
-- остальной сайт), подбор собеседника — через SECURITY DEFINER функцию,
-- вызываемую с клиента (см. коммент у dating_find_match).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

-- ---------- анкеты ----------
create table public.dating_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  gender text not null check (gender in ('m', 'f')),
  interested_in text not null check (interested_in in ('m', 'f', 'any')),
  use_real_name boolean not null default true,
  display_name text,
  bio text check (bio is null or char_length(bio) <= 500),
  photo_url text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.dating_profiles enable row level security;
create policy "dating_profiles_select_verified" on public.dating_profiles for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.verified)
);
create policy "dating_profiles_upsert_own" on public.dating_profiles for insert with check (
  profile_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.verified)
);
create policy "dating_profiles_update_own" on public.dating_profiles for update using (profile_id = auth.uid());
create policy "dating_profiles_delete_own" on public.dating_profiles for delete using (profile_id = auth.uid());

-- ---------- лайки/дизлайки анкет ----------
create table public.dating_likes (
  liker_id uuid not null references public.profiles(id) on delete cascade,
  liked_id uuid not null references public.profiles(id) on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (liker_id, liked_id)
);
alter table public.dating_likes enable row level security;
create policy "dating_likes_select_own" on public.dating_likes for select using (liker_id = auth.uid() or liked_id = auth.uid());
create policy "dating_likes_insert_own" on public.dating_likes for insert with check (
  liker_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.verified)
);
create policy "dating_likes_update_own" on public.dating_likes for update using (liker_id = auth.uid());

-- ---------- публичный бакет для одного фото анкеты ----------
insert into storage.buckets (id, name, public)
values ('dating-photos', 'dating-photos', true)
on conflict (id) do nothing;

drop policy if exists "dating_photos_public_read" on storage.objects;
create policy "dating_photos_public_read" on storage.objects for select using (bucket_id = 'dating-photos');
drop policy if exists "dating_photos_owner_write" on storage.objects;
create policy "dating_photos_owner_write" on storage.objects for insert with check (
  bucket_id = 'dating-photos' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "dating_photos_owner_delete" on storage.objects;
create policy "dating_photos_owner_delete" on storage.objects for delete using (
  bucket_id = 'dating-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------- случайный чат: очередь + комнаты + сообщения ----------
create table public.dating_chat_queue (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  gender text not null,
  interested_in text not null,
  joined_at timestamptz not null default now()
);
alter table public.dating_chat_queue enable row level security;
create policy "dating_queue_select_own" on public.dating_chat_queue for select using (profile_id = auth.uid());

create table public.dating_chat_rooms (
  id bigint generated always as identity primary key,
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.dating_chat_rooms enable row level security;
create policy "dating_rooms_select_own" on public.dating_chat_rooms for select using (user_a = auth.uid() or user_b = auth.uid());

create table public.dating_chat_messages (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.dating_chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.dating_chat_messages enable row level security;
create policy "dating_messages_select_own_room" on public.dating_chat_messages for select using (
  exists (select 1 from public.dating_chat_rooms r where r.id = room_id and (r.user_a = auth.uid() or r.user_b = auth.uid()))
);
create policy "dating_messages_insert_own_room" on public.dating_chat_messages for insert with check (
  sender_id = auth.uid() and
  exists (select 1 from public.dating_chat_rooms r where r.id = room_id and r.active and (r.user_a = auth.uid() or r.user_b = auth.uid()))
);

-- Подбор собеседника. Вызывается с клиента (кнопка "Найти" и раз в несколько
-- секунд, пока ждёте) — сначала проверяет, не подобрал ли УЖЕ кто-то другой
-- пару именно вам (тогда просто возвращает готовую комнату), иначе ищет
-- подходящего в очереди (SKIP LOCKED — чтобы два одновременных вызова не
-- расхватали одного и того же человека дважды) и создаёт комнату сама.
create or replace function public.dating_find_match()
returns table(room_id bigint, other_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gender text;
  v_interested text;
  v_other uuid;
  v_room_id bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.verified) then
    raise exception 'раздел только для подтверждённых студентов';
  end if;

  select r.id into v_room_id from public.dating_chat_rooms r
    where (r.user_a = auth.uid() or r.user_b = auth.uid()) and r.active
    order by r.created_at desc limit 1;
  if v_room_id is not null then
    select case when user_a = auth.uid() then user_b else user_a end into v_other
      from public.dating_chat_rooms where id = v_room_id;
    return query select v_room_id, v_other;
    return;
  end if;

  select gender, interested_in into v_gender, v_interested from public.dating_profiles where profile_id = auth.uid();
  if v_gender is null then raise exception 'сначала заполните анкету'; end if;

  insert into public.dating_chat_queue (profile_id, gender, interested_in)
    values (auth.uid(), v_gender, v_interested)
    on conflict (profile_id) do update set joined_at = public.dating_chat_queue.joined_at;

  select q.profile_id into v_other
    from public.dating_chat_queue q
    where q.profile_id <> auth.uid()
      and (v_interested = 'any' or q.gender = v_interested)
      and (q.interested_in = 'any' or q.interested_in = v_gender)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = q.profile_id)
           or (b.blocker_id = q.profile_id and b.blocked_id = auth.uid())
      )
    order by q.joined_at asc
    limit 1
    for update skip locked;

  if v_other is not null then
    delete from public.dating_chat_queue where profile_id in (auth.uid(), v_other);
    insert into public.dating_chat_rooms (user_a, user_b) values (auth.uid(), v_other) returning id into v_room_id;
    return query select v_room_id, v_other;
  else
    return query select null::bigint, null::uuid;
  end if;
end;
$$;

-- Выйти из чата ("Следующий" или закрыл вкладку) — комната закрывается для
-- обоих, при желании ищущий тут же снова встаёт в очередь кнопкой "Найти".
create or replace function public.dating_leave_chat(p_room_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.dating_chat_rooms set active = false, ended_at = now()
    where id = p_room_id and (user_a = auth.uid() or user_b = auth.uid());
  delete from public.dating_chat_queue where profile_id = auth.uid();
end;
$$;

-- Уйти со страницы, пока идёт поиск (ещё не нашли пару) — просто выйти из очереди.
create or replace function public.dating_cancel_search()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.dating_chat_queue where profile_id = auth.uid();
end;
$$;

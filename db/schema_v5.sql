-- ПолиКоннект — веха 5: настоящие личные сообщения (заявки, диалоги, блокировка).
-- Применить так же: SQL Editor → New query → вставить → Run.

create table public.conversations (
  id bigint generated always as identity primary key,
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  initiator uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_pair_order check (user_a < user_b),
  constraint conversations_pair_unique unique (user_a, user_b)
);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;

-- Разговор видят и меняют (принять/отклонить) только его два участника.
create policy "conversations_select_participant" on public.conversations for select
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "conversations_insert_participant" on public.conversations for insert
  with check (auth.uid() = initiator and (auth.uid() = user_a or auth.uid() = user_b));

create policy "conversations_update_participant" on public.conversations for update
  using (auth.uid() = user_a or auth.uid() = user_b)
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- Блокировку видят обе стороны (чтобы проверка "не заблокирован ли я" работала),
-- но создать/снять её может только тот, кто заблокировал.
create policy "blocks_select_related" on public.blocks for select
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

create policy "blocks_insert_own" on public.blocks for insert
  with check (auth.uid() = blocker_id);

create policy "blocks_delete_own" on public.blocks for delete
  using (auth.uid() = blocker_id);

-- Сообщения читают участники разговора; писать может участник, и только если
-- никто из двоих никого не заблокировал (в любую сторону).
create policy "messages_select_participant" on public.messages for select
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));

create policy "messages_insert_participant_not_blocked" on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
    and not exists (
      select 1 from public.blocks b
      join public.conversations c2 on c2.id = conversation_id
      where (b.blocker_id = c2.user_a and b.blocked_id = c2.user_b)
         or (b.blocker_id = c2.user_b and b.blocked_id = c2.user_a)
    )
  );

-- Новое сообщение двигает разговор наверх списка и, если получатель раньше
-- отклонил заявку, а автор написал снова, — возвращает разговор в "заявки".
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      status = case when status = 'declined' and new.sender_id = initiator then 'pending' else status end
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_on_message();

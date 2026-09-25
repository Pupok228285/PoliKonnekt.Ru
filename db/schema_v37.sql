-- v37: анонимные сообщения ("валентинки") в профиле. Настоящая анонимность,
-- а не просто "не показываем в интерфейсе" — получатель физически не может
-- прочитать sender_id даже через прямой запрос к API, у него нет SELECT-
-- доступа к самой таблице, только к RPC ниже, которая его не возвращает.
-- Видит отправителя только админ (для разбора жалоб/злоупотреблений).

alter table public.profiles add column if not exists anon_messages_enabled boolean not null default false;

create table public.anonymous_messages (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint anonymous_messages_not_self check (recipient_id <> sender_id)
);

alter table public.anonymous_messages enable row level security;

create policy "anon_messages_select_admin" on public.anonymous_messages for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "anon_messages_insert_sender" on public.anonymous_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.anon_messages_enabled)
  );

create policy "anon_messages_delete_recipient" on public.anonymous_messages for delete
  using (recipient_id = auth.uid());

-- Получатель читает СВОИ анонимки только через эту функцию — нарочно не
-- возвращает sender_id ни в каком виде.
create or replace function public.get_my_anonymous_messages()
returns table (id bigint, body text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select m.id, m.body, m.created_at
  from public.anonymous_messages m
  where m.recipient_id = auth.uid()
  order by m.created_at desc;
end;
$$;

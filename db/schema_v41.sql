-- ПолиКоннект — веха 41: адрес бота уведомлений в триггере.
-- Функция из supabase/functions/telegram-notify/ задеплоена через Dashboard
-- под именем «swift-responder» (Dashboard сам подставил случайное имя, а
-- переименовать функцию в Supabase нельзя) — триггер из schema_v40.sql
-- смотрел на /functions/v1/telegram-notify, которой не существует.

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
    url := 'https://ecdyocxbswvdficyuohu.supabase.co/functions/v1/swift-responder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('kind', 'event', 'table', TG_TABLE_NAME, 'op', TG_OP, 'id', new.id)
  );
  return new;
end;
$$;

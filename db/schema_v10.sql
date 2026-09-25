-- ПолиКоннект — веха 10: Telegram-уведомления через прямой pg_net-триггер.
-- Применить так же: SQL Editor → New query → вставить → Run.
--
-- Почему не через Dashboard → Database → Webhooks: у этого проекта нет
-- служебной схемы "supabase_functions" (которую использует мастер вебхуков
-- в интерфейсе) — Dashboard выдаёт "schema supabase_functions does not
-- exist". Результат тот же самый: делаем триггер напрямую через pg_net
-- (включён в Database → Extensions), он дёргает Edge Function по HTTP
-- при каждой новой заявке на зачётку и новом обращении в поддержку.

create or replace function public.notify_telegram()
returns trigger
language plpgsql
as $$
begin
  perform net.http_post(
    url := 'https://ecdyocxbswvdficyuohu.supabase.co/functions/v1/notify-telegram',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('type', 'INSERT', 'table', TG_TABLE_NAME, 'record', to_jsonb(new))
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_telegram_verification on public.verification_requests;
create trigger trg_notify_telegram_verification
after insert on public.verification_requests
for each row execute function public.notify_telegram();

drop trigger if exists trg_notify_telegram_support on public.support_messages;
create trigger trg_notify_telegram_support
after insert on public.support_messages
for each row execute function public.notify_telegram();

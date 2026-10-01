-- ПолиКоннект — веха 46: тайминги рекламного поп-апа теперь настройка
-- сайта (site_settings), а не зашитые в коде числа — админ сам решает,
-- через сколько минут реклама выскакивает заново после закрытия крестиком
-- и через сколько секунд меняются объявления внутри одного угла, если их
-- там несколько.
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.

alter table public.site_settings add column if not exists ad_reappear_minutes int not null default 10 check (ad_reappear_minutes between 1 and 1440);
alter table public.site_settings add column if not exists ad_rotate_seconds int not null default 30 check (ad_rotate_seconds between 5 and 600);

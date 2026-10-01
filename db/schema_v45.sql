-- ПолиКоннект — веха 45: автообновление очереди заявок на рекламу в
-- админке (без ручного обновления страницы) — включаем Realtime на
-- ads и ad_access_grants, тот же приём, что в schema_v43.sql.
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.

do $$
begin
  alter publication supabase_realtime add table public.ads;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.ad_access_grants;
exception when duplicate_object then null;
end $$;

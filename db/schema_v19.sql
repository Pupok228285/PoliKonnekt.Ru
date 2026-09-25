-- ПолиКоннект — довесок к вехе 18: одна колонка, которая не попала в v18,
-- потому что была дописана уже после того, как вы скопировали файл.
-- Применить как обычно: SQL Editor → New query → вставить → Run.

alter table public.profiles add column if not exists current_path text;

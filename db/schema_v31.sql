-- ПолиКоннект — веха 41: Цитаты и Креатив разделены. Раньше это была одна
-- общая лента без разбора — добавляем kind, чтобы можно было читать цитаты
-- отдельно от своих текстов/стихов/зарисовок (комментарии и лайки уже
-- работают у обоих через общую систему data-vtype/data-ctype="quote_post" —
-- новую колонку это никак не задевает).
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.

alter table public.quote_posts add column if not exists kind text not null default 'quote' check (kind in ('quote', 'creative'));

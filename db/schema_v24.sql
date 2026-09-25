-- ПолиКоннект — веха 24: чиним рекламу — текст и фото больше не исключают
-- друг друга (раньше при выборе "Фото" подпись пропадала совсем).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

alter table public.ads drop constraint if exists ads_content_present;
alter table public.ads add constraint ads_content_present check (
  image_url is not null or text_body is not null
);
alter table public.ads drop constraint if exists ads_text_length;
alter table public.ads add constraint ads_text_length check (
  text_body is null or char_length(text_body) between 1 and 300
);

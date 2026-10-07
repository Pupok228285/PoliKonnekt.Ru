-- ПолиКоннект — веха 86: подпись к фото в альбоме.
-- Применить так же: SQL Editor → New query → вставить → Run.

alter table public.album_photos add column if not exists caption text;

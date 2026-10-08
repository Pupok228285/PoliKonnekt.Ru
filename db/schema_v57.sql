-- ПолиКоннект — веха 87: комментарии к фото альбома и к альбому целиком.
-- Применить так же: SQL Editor → New query → вставить → Run.

alter table public.comments drop constraint if exists comments_content_type_check;
alter table public.comments add constraint comments_content_type_check check (
  content_type in ('feed_post', 'quote_post', 'canteen_post', 'artel_post', 'diary_post', 'album_photo', 'album')
);

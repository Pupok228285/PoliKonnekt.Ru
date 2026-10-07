-- ПолиКоннект — веха 86 (продолжение): редактирование подписи к фото в альбоме.
-- Применить так же: SQL Editor → New query → вставить → Run.

create policy "album_photos_update_admin" on public.album_photos for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

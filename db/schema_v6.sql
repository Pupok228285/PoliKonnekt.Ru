-- ПолиКоннект — веха 6: фото в личных сообщениях (без видео).
-- Применить так же: SQL Editor → New query → вставить → Run.

-- Сообщение теперь может быть фото без текста (или текст без фото, или оба).
alter table public.messages alter column body drop not null;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add column if not exists photo_path text;
alter table public.messages add constraint messages_has_content check (
  (body is not null and char_length(body) between 1 and 2000) or photo_path is not null
);

-- Приватный бакет для фото в переписке: путь вида "<conversation_id>/<файл>",
-- читать/писать может только участник этого разговора.
insert into storage.buckets (id, name, public)
values ('pm-photos', 'pm-photos', false)
on conflict (id) do nothing;

drop policy if exists "pm_photos_participants_read" on storage.objects;
create policy "pm_photos_participants_read" on storage.objects for select
  using (
    bucket_id = 'pm-photos'
    and exists (
      select 1 from public.conversations c
      where c.id = ((storage.foldername(name))[1])::bigint
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

drop policy if exists "pm_photos_participants_write" on storage.objects;
create policy "pm_photos_participants_write" on storage.objects for insert
  with check (
    bucket_id = 'pm-photos'
    and exists (
      select 1 from public.conversations c
      where c.id = ((storage.foldername(name))[1])::bigint
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
    and not exists (
      select 1 from public.blocks b
      join public.conversations c2 on c2.id = ((storage.foldername(name))[1])::bigint
      where (b.blocker_id = c2.user_a and b.blocked_id = c2.user_b)
         or (b.blocker_id = c2.user_b and b.blocked_id = c2.user_a)
    )
  );

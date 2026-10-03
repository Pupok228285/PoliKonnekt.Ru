-- Веха 73 (продолжение): фото в личных перепискях/группах тоже должны
-- открываться админу/модератору в досье — иначе кнопка «Чаты/Группы»
-- показывает текст сообщений, но не умеет подписать ссылку на само фото
-- (отдельные политики именно для чтения файлов в хранилище, не для
-- таблиц — их уже расширил schema_v48.sql). Политики INSERT не трогаются.

drop policy if exists "pm_photos_participants_read" on storage.objects;
create policy "pm_photos_participants_read" on storage.objects for select
  using (
    bucket_id = 'pm-photos'
    and (
      exists (
        select 1 from public.conversations c
        where c.id = ((storage.foldername(name))[1])::bigint
          and (c.user_a = auth.uid() or c.user_b = auth.uid())
      )
      or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator))
    )
  );

drop policy if exists "group_photos_member_read" on storage.objects;
create policy "group_photos_member_read" on storage.objects for select
  using (
    case when bucket_id = 'group-photos' and (storage.foldername(name))[1] ~ '^[0-9]+$'
      then public.is_chat_group_member(((storage.foldername(name))[1])::bigint)
        or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator))
      else false
    end
  );

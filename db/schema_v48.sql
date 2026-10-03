-- Веха 73: админ/модератор видит переписки пользователей.
-- (1) жалобы отныне знают, на кого жалуются; (2)-(3) staff может читать
-- ЛЮБУЮ личную переписку и групповой чат — не только по жалобе, но и
-- напрямую через профиль ("Чаты/Группы"). Политики INSERT/UPDATE/DELETE
-- нигде не трогаются — staff по-прежнему не может писать от чужого имени
-- или лезть в чужие файлы/группы, расширено только чтение.

-- 1. Жалоба знает, на кого жалуются (раньше — только текст + ссылка на
--    страницу, без ID автора контента/собеседника).
alter table public.support_messages
  add column if not exists target_user_id uuid references public.profiles(id) on delete set null;

-- 2. Личные сообщения — staff читает любую переписку.
drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant" on public.conversations for select
  using (
    auth.uid() = user_a or auth.uid() = user_b
    or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator))
  );

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator))
  );

-- 3. Групповые чаты — те же 3 SELECT-политики отдельно от самой функции
--    is_chat_group_member() (её трогать нельзя: она же разрешает ПИСАТЬ в
--    группу и грузить фото — staff не должен получать это во все группы разом,
--    только право читать).
drop policy if exists "chat_groups_select_member" on public.chat_groups;
create policy "chat_groups_select_member" on public.chat_groups for select
  using (
    public.is_chat_group_member(id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator))
  );

drop policy if exists "chat_group_members_select_member" on public.chat_group_members;
create policy "chat_group_members_select_member" on public.chat_group_members for select
  using (
    public.is_chat_group_member(group_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator))
  );

drop policy if exists "chat_group_messages_select_member" on public.chat_group_messages;
create policy "chat_group_messages_select_member" on public.chat_group_messages for select
  using (
    public.is_chat_group_member(group_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator))
  );

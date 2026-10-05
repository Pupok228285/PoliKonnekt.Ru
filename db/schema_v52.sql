-- Веха 77: можно удалить личную переписку целиком (кнопка «Удалить
-- переписку» в диалоге, с подтверждением). У conversations раньше не было
-- вообще никакой DELETE-политики. messages.conversation_id уже стоит с
-- "on delete cascade" (db/schema_v5.sql), поэтому сами сообщения удалять
-- отдельно не нужно — уйдут вместе со строкой разговора.

create policy "conversations_delete_participant" on public.conversations for delete
  using (auth.uid() = user_a or auth.uid() = user_b);

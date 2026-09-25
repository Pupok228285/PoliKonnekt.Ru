-- ПолиКоннект — веха 16: мелкая доделка — у support_messages не было
-- политики на удаление (не мог убрать даже свою тестовую жалобу).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

create policy "support_delete_own_or_admin" on public.support_messages for delete using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

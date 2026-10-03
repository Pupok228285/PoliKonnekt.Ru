-- ПолиКоннект — веха 47: админ и модератор могут удалить любой пост в
-- Ленте (раньше RLS разрешал удалять только свой собственный).
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.

create policy "feed_delete_staff" on public.feed_posts for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator))
);

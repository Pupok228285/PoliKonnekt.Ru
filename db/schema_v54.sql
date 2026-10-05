-- ПолиКоннект — веха 81: админ и модераторы могут удалять ЛЮБОЕ объявление
-- и любую запись в "Цитаты и Креатив" (не только своё) — для модерации.
-- Применить так же: SQL Editor → New query → вставить → Run.

-- quote_posts: раньше "own_or_admin" пускал только автора или is_admin,
-- модераторов не было вообще — добавляем is_moderator.
drop policy if exists "quotes_delete_own_or_admin" on public.quote_posts;
create policy "quotes_delete_own_or_staff" on public.quote_posts for delete using (
  author_id = auth.uid() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator)
  )
);

-- listings: раньше вообще не было политики для staff, удалить мог только
-- сам автор своё объявление (вкладка "Мои объявления").
drop policy if exists "listings_delete_own" on public.listings;
create policy "listings_delete_own_or_staff" on public.listings for delete using (
  author_id = auth.uid() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator)
  )
);

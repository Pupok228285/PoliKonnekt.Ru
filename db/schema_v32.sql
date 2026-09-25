-- ПолиКоннект — веха 42: фикс списка участников в админке + удаление артели
-- для админа/модератора. Применить как обычно: Supabase → SQL Editor →
-- New query → вставить → Run.

-- 1) admin_list_profiles() падал с "column reference \"id\" is ambiguous":
--    у функции returns table(id uuid, ...) — эти имена колонок становятся
--    переменными в теле функции, и `where id = auth.uid()` внутри exists()
--    стало неоднозначным (переменная id функции против profiles.id).
--    Раньше эта проверка нигде не роняла ошибку молча — просто список
--    участников и их количество никогда не показывались администратору.
--    Чиним ровно так же, как везде в проекте — через алиас таблицы.
drop function if exists public.admin_list_profiles();
create or replace function public.admin_list_profiles()
returns table (
  id uuid, member_no bigint, nickname text, email text, verified boolean,
  is_admin boolean, is_moderator boolean, reputation bigint, created_at timestamptz, last_seen_at timestamptz
) language plpgsql security definer as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'not authorized';
  end if;
  return query
    select pr.id, pr.member_no, pr.nickname, u.email::text, pr.verified, pr.is_admin, pr.is_moderator, pr.reputation,
           pr.created_at, pr.last_seen_at
    from public.profiles pr join auth.users u on u.id = pr.id
    order by pr.created_at desc;
end;
$$;

-- 2) Удалить артель целиком (не только пост) может модератор ИЛИ админ —
--    как и с постами/сменой главаря в этой же артели, шире, чем на
--    остальном сайте (там только admin), по прямой просьбе для К'Артели.
drop policy if exists "artels_delete_admin" on public.artels;
create policy "artels_delete_admin_or_moderator" on public.artels for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator))
);

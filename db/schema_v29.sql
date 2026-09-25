-- ПолиКоннект — веха 34: модератор/админ может напрямую сменить главаря
-- артели (в обход голосования) и удалять посты со стены артели.
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.
--
-- Раньше у artel_posts вообще не было delete-политики (единственная таблица
-- в проекте без неё — у всех остальных разделов давно есть свой
-- "..._delete_own_or_admin"). Здесь по прямой просьбе сделали шире, чем
-- везде: автор поста ИЛИ модератор/админ (в остальных разделах — только
-- админ; это осознанное решение для К'Артели конкретно, не меняет остальной
-- сайт).
create policy "artel_posts_delete_own_or_staff" on public.artel_posts for delete using (
  author_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator))
);

-- Смена главаря напрямую, минуя выборы. Цель обязана уже состоять в этой
-- артели (нельзя мгновенно сделать главарём постороннего человека) — та же
-- логика, что и при подведении итогов голосования: старого главаря понижаем
-- до участника, нового — повышаем.
create or replace function public.set_artel_leader_admin(p_artel_id bigint, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can boolean;
  v_is_member boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select exists(
    select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator)
  ) into v_can;
  if not v_can then raise exception 'менять главаря напрямую может только модератор или админ'; end if;

  select exists(
    select 1 from public.artel_members m where m.artel_id = p_artel_id and m.profile_id = p_profile_id
  ) into v_is_member;
  if not v_is_member then raise exception 'этот человек не состоит в артели'; end if;

  update public.artels set leader_id = p_profile_id, leader_since = now() where id = p_artel_id;
  update public.artel_members set role = 'member' where artel_id = p_artel_id and role = 'leader' and profile_id <> p_profile_id;
  update public.artel_members set role = 'leader' where artel_id = p_artel_id and profile_id = p_profile_id;
end;
$$;

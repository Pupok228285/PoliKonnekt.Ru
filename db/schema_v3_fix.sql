-- Правка бага в admin_list_profiles(): «column reference id is ambiguous».
-- Причина — имена возвращаемых колонок (id, is_admin) совпадали с именами
-- колонок в подзапросе без явного алиаса. Применить так же: SQL Editor → Run.

create or replace function public.admin_list_profiles()
returns table (
  id uuid, member_no bigint, nickname text, email text, verified boolean, is_admin boolean,
  created_at timestamptz, last_seen_at timestamptz
) language plpgsql security definer as $$
begin
  if not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin) then
    raise exception 'not authorized';
  end if;
  return query
    select p.id, p.member_no, p.nickname, u.email::text, p.verified, p.is_admin, p.created_at, p.last_seen_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

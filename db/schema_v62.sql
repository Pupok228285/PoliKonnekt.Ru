-- ПолиКоннект — веха 94: админ выдаёт/снимает галочку вручную, без заявки
-- на подтверждение. Применить как обычно: SQL Editor → New query → Run.

create or replace function public.set_staff_role(target_id uuid, role text, value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized';
  end if;
  if target_id = auth.uid() then
    raise exception 'нельзя менять роль себе — попросите другого админа';
  end if;
  if role = 'admin' then
    update public.profiles set is_admin = value where id = target_id;
  elsif role = 'moderator' then
    update public.profiles set is_moderator = value where id = target_id;
  elsif role = 'verified' then
    update public.profiles set verified = value where id = target_id;
  else
    raise exception 'invalid role';
  end if;
end;
$$;

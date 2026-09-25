-- v38: почта пользователя для "Истории аккаунта" — теперь доступна и
-- модератору, не только админу (осознанное расширение существующей
-- границы privileges, по прямой просьбе: досье со всей активностью
-- пользователя должно быть доступно обеим ролям). Пароль — принципиально
-- не отдаётся никем и нигде, это необратимый хеш, см. интерфейс.

create or replace function public.admin_get_user_email(target_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator)) then
    raise exception 'not authorized';
  end if;
  select u.email::text into result from auth.users u where u.id = target_id;
  return result;
end;
$$;

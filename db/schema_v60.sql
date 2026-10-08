-- ПолиКоннект — веха 90: подарок ника становится двухшаговым — отправили,
-- получатель сам принимает/отклоняет (раньше передавалось сразу).
-- Применить так же: SQL Editor → New query → вставить → Run.

alter table public.nickname_gifts add column if not exists status text not null default 'pending'
  check (status in ('pending', 'accepted', 'declined'));

-- gift_nickname теперь только СОЗДАЁТ заявку на подарок, владение не трогает.
create or replace function public.gift_nickname(p_nickname text, p_to_nickname text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_to_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select owner_id into v_owner from public.nickname_registry where nickname = p_nickname;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Этот ник вам не принадлежит.';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid() and nickname = p_nickname) then
    raise exception 'Нельзя подарить ник, которым вы пользуетесь сейчас — сначала смените имя на другое.';
  end if;

  if exists (select 1 from public.nickname_gifts where nickname = p_nickname and status = 'pending') then
    raise exception 'Этот ник уже кому-то подарен и ждёт ответа.';
  end if;

  select id into v_to_id from public.profiles where nickname = p_to_nickname;
  if v_to_id is null then
    raise exception 'Пользователь с таким ником не найден.';
  end if;
  if v_to_id = auth.uid() then
    raise exception 'Нельзя подарить ник самому себе.';
  end if;

  insert into public.nickname_gifts (nickname, from_id, to_id, status) values (p_nickname, auth.uid(), v_to_id, 'pending');
end;
$$;

-- Получатель принимает или отклоняет; владение переходит только здесь,
-- и только если даритель к этому моменту всё ещё владеет ником.
create or replace function public.respond_nickname_gift(p_gift_id bigint, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gift record;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_gift from public.nickname_gifts where id = p_gift_id for update;
  if v_gift is null then
    raise exception 'Подарок не найден.';
  end if;
  if v_gift.to_id <> auth.uid() then
    raise exception 'Это не ваш подарок.';
  end if;
  if v_gift.status <> 'pending' then
    raise exception 'Этот подарок уже обработан.';
  end if;

  if not p_accept then
    update public.nickname_gifts set status = 'declined' where id = p_gift_id;
    return;
  end if;

  select owner_id into v_owner from public.nickname_registry where nickname = v_gift.nickname;
  if v_owner is distinct from v_gift.from_id then
    update public.nickname_gifts set status = 'declined' where id = p_gift_id;
    raise exception 'Даритель уже не владеет этим ником — подарок отменён.';
  end if;

  update public.nickname_registry set owner_id = auth.uid() where nickname = v_gift.nickname;
  update public.nickname_gifts set status = 'accepted' where id = p_gift_id;
end;
$$;

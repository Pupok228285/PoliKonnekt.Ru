-- ПолиКоннект — веха 89: личный реестр ников (кто сменил имя — старое
-- остаётся за ним навсегда, занять его никто другой не может, можно
-- вернуться обратно) + передача ника как подарка другому пользователю.
-- Применить так же: SQL Editor → New query → вставить → Run.

-- 1) Реестр: каждый ник, который когда-либо использовался или был явно
--    занят, закреплён за одним владельцем. Прямой insert/update/delete
--    пользователям не нужен — всё только через функции ниже.
create table public.nickname_registry (
  nickname text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.nickname_registry enable row level security;
create policy "nickname_registry_select_all" on public.nickname_registry for select using (true);

-- 2) Бэкафилл по уже существующим данным: сперва нынешние ники (они
--    авторитетны), потом исторические из profile_history — если какой-то
--    ник менял нескольких владельцев в прошлом, берём самого недавнего
--    (на случай, если он при этом НЕ чей-то нынешний — тому уже отдан
--    приоритет первым insert'ом, on conflict do nothing просто пропустит).
insert into public.nickname_registry (nickname, owner_id)
select nickname, id from public.profiles
on conflict (nickname) do nothing;

insert into public.nickname_registry (nickname, owner_id)
select distinct on (old_value) old_value, profile_id
from public.profile_history
where field = 'nickname' and old_value is not null and old_value <> ''
order by old_value, changed_at desc
on conflict (nickname) do nothing;

-- 3) Триггер на profiles — и при регистрации, и при смене имени: если
--    желаемый ник уже закреплён за ДРУГИМ пользователем, запрет; если
--    ник новый (никогда не встречался) — закрепляется за тем, кто его
--    взял первым; если это уже его собственный исторический ник —
--    просто разрешаем (он и так в реестре на него).
create or replace function public.enforce_nickname_registry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'UPDATE' and new.nickname is not distinct from old.nickname then
    return new;
  end if;
  select owner_id into v_owner from public.nickname_registry where nickname = new.nickname;
  if v_owner is not null and v_owner <> new.id then
    raise exception 'Этот ник закреплён за другим пользователем и недоступен.';
  end if;
  insert into public.nickname_registry (nickname, owner_id) values (new.nickname, new.id)
    on conflict (nickname) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_nickname_check on public.profiles;
create trigger on_profile_nickname_check
  before insert or update on public.profiles
  for each row execute procedure public.enforce_nickname_registry();

-- 4) Подарок ника: владелец закреплённого (но НЕ активного сейчас) ника
--    передаёт право на него другому пользователю по его нынешнему нику.
create table public.nickname_gifts (
  id bigint generated always as identity primary key,
  nickname text not null,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.nickname_gifts enable row level security;
create policy "nickname_gifts_select_own" on public.nickname_gifts for select using (
  from_id = auth.uid() or to_id = auth.uid()
);

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

  select id into v_to_id from public.profiles where nickname = p_to_nickname;
  if v_to_id is null then
    raise exception 'Пользователь с таким ником не найден.';
  end if;
  if v_to_id = auth.uid() then
    raise exception 'Нельзя подарить ник самому себе.';
  end if;

  update public.nickname_registry set owner_id = v_to_id where nickname = p_nickname;
  insert into public.nickname_gifts (nickname, from_id, to_id) values (p_nickname, auth.uid(), v_to_id);
end;
$$;

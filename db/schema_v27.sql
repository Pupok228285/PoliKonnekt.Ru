-- ПолиКоннект — веха 29: «старшина» → «главарь» (по просьбе пользователя,
-- в духе изначальной шутки про К'Артель/ОПГ). Тексты на страницах уже
-- поменяны, здесь — только формулировки в текстах ошибок трёх функций из
-- db/schema_v25.sql (сама логика не меняется, только слово).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

create or replace function public.open_artel_election(p_artel_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_leader boolean;
  v_election_id bigint;
  v_name text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select exists(
    select 1 from public.artels a where a.id = p_artel_id and a.leader_id = auth.uid()
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) into v_is_leader;
  if not v_is_leader then raise exception 'только главарь или админ может начать выборы'; end if;

  select name, leader_id into v_name from public.artels where id = p_artel_id;

  insert into public.artel_elections (artel_id, opened_by, closes_at)
    values (p_artel_id, auth.uid(), now() + interval '5 days')
    returning id into v_election_id;

  insert into public.artel_leader_candidates (election_id, profile_id)
    select v_election_id, leader_id from public.artels where id = p_artel_id and leader_id is not null
    on conflict do nothing;

  insert into public.artel_name_candidates (election_id, text, proposed_by)
    values (v_election_id, v_name, null);

  return v_election_id;
end;
$$;

create or replace function public.propose_artel_name(p_election_id bigint, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artel_id bigint;
  v_can boolean;
  v_count int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if char_length(trim(p_text)) < 2 then raise exception 'слишком короткое название'; end if;
  select artel_id into v_artel_id from public.artel_elections where id = p_election_id and status = 'open';
  if v_artel_id is null then raise exception 'голосование закрыто или не найдено'; end if;

  select exists(
    select 1 from public.artel_members m where m.artel_id = v_artel_id and m.profile_id = auth.uid() and m.role in ('leader', 'deputy')
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) into v_can;
  if not v_can then raise exception 'предлагать варианты может главарь, замы или админ'; end if;

  select count(*) into v_count from public.artel_name_candidates where election_id = p_election_id;
  if v_count >= 5 then raise exception 'уже пять вариантов — больше нельзя'; end if;

  insert into public.artel_name_candidates (election_id, text, proposed_by) values (p_election_id, trim(p_text), auth.uid());
end;
$$;

create or replace function public.set_artel_deputy(p_artel_id bigint, p_profile_id uuid, p_is_deputy boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select exists(
    select 1 from public.artels a where a.id = p_artel_id and a.leader_id = auth.uid()
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) into v_can;
  if not v_can then raise exception 'назначать замов может только главарь или админ'; end if;

  update public.artel_members
    set role = case when p_is_deputy then 'deputy' else 'member' end
    where artel_id = p_artel_id and profile_id = p_profile_id and role <> 'leader';
end;
$$;

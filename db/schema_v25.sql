-- ПолиКоннект — веха 27: настоящие выборы старшины К'Артели + двухэтапное
-- голосование за название (шли вместе, как и было задумано с самого начала
-- проекта), плюс назначение замов (не выборно, по спецификации). Без
-- pg_cron/edge-функций — окно голосования 5 дней, закрывается "лениво":
-- при следующем заходе на страницу артели после closes_at вызывается
-- close_artel_election_if_due(), которая сама подводит итоги.
-- Применить как обычно: SQL Editor → New query → вставить → Run.

create table public.artel_elections (
  id bigint generated always as identity primary key,
  artel_id bigint not null references public.artels(id) on delete cascade,
  opened_by uuid references public.profiles(id) on delete set null,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  new_leader_id uuid references public.profiles(id),
  name_changed boolean,
  new_name text
);
-- одна активная кампания на артель одновременно
create unique index artel_elections_one_open on public.artel_elections (artel_id) where status = 'open';

create table public.artel_leader_candidates (
  election_id bigint not null references public.artel_elections(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (election_id, profile_id)
);

create table public.artel_leader_votes (
  election_id bigint not null references public.artel_elections(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid not null references public.profiles(id),
  primary key (election_id, voter_id)
);

create table public.artel_name_stage1_votes (
  election_id bigint not null references public.artel_elections(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  choice boolean not null, -- true = менять название, false = оставить
  primary key (election_id, voter_id)
);

create table public.artel_name_candidates (
  id bigint generated always as identity primary key,
  election_id bigint not null references public.artel_elections(id) on delete cascade,
  text text not null check (char_length(text) between 2 and 60),
  proposed_by uuid references public.profiles(id)
);

create table public.artel_name_stage2_votes (
  election_id bigint not null references public.artel_elections(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id bigint not null references public.artel_name_candidates(id),
  primary key (election_id, voter_id)
);

alter table public.artel_elections enable row level security;
alter table public.artel_leader_candidates enable row level security;
alter table public.artel_leader_votes enable row level security;
alter table public.artel_name_stage1_votes enable row level security;
alter table public.artel_name_candidates enable row level security;
alter table public.artel_name_stage2_votes enable row level security;

-- Читать может любой (прозрачно, как и остальное на сайте); своим голосом
-- в чужой список не залезть — видно, кто ЗА кого голосовал, это открыто
-- (в реальных небольших артелях так и должно быть, не тайное голосование
-- в паспарту). Писать можно только через RPC ниже.
create policy "artel_elections_select_all" on public.artel_elections for select using (true);
create policy "artel_leader_candidates_select_all" on public.artel_leader_candidates for select using (true);
create policy "artel_leader_votes_select_all" on public.artel_leader_votes for select using (true);
create policy "artel_name_stage1_votes_select_all" on public.artel_name_stage1_votes for select using (true);
create policy "artel_name_candidates_select_all" on public.artel_name_candidates for select using (true);
create policy "artel_name_stage2_votes_select_all" on public.artel_name_stage2_votes for select using (true);

-- ---------- открыть кампанию ----------
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
  if not v_is_leader then raise exception 'только старшина или админ может начать выборы'; end if;

  select name, leader_id into v_name from public.artels where id = p_artel_id;

  insert into public.artel_elections (artel_id, opened_by, closes_at)
    values (p_artel_id, auth.uid(), now() + interval '5 days')
    returning id into v_election_id;

  -- действующий старшина автоматически идёт кандидатом (может не победить)
  insert into public.artel_leader_candidates (election_id, profile_id)
    select v_election_id, leader_id from public.artels where id = p_artel_id and leader_id is not null
    on conflict do nothing;

  -- текущее название всегда участвует одним из вариантов на втором этапе
  insert into public.artel_name_candidates (election_id, text, proposed_by)
    values (v_election_id, v_name, null);

  return v_election_id;
end;
$$;

-- ---------- выдвинуть себя в старшины ----------
create or replace function public.nominate_leader_self(p_election_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artel_id bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select artel_id into v_artel_id from public.artel_elections where id = p_election_id and status = 'open';
  if v_artel_id is null then raise exception 'голосование закрыто или не найдено'; end if;
  if not exists (select 1 from public.artel_members m where m.artel_id = v_artel_id and m.profile_id = auth.uid()) then
    raise exception 'выдвигаться может только участник артели';
  end if;
  insert into public.artel_leader_candidates (election_id, profile_id) values (p_election_id, auth.uid())
    on conflict do nothing;
end;
$$;

-- ---------- голос за старшину ----------
create or replace function public.cast_leader_vote(p_election_id bigint, p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artel_id bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select artel_id into v_artel_id from public.artel_elections where id = p_election_id and status = 'open';
  if v_artel_id is null then raise exception 'голосование закрыто или не найдено'; end if;
  if not exists (select 1 from public.artel_members m where m.artel_id = v_artel_id and m.profile_id = auth.uid()) then
    raise exception 'голосовать может только участник артели';
  end if;
  if not exists (select 1 from public.artel_leader_candidates c where c.election_id = p_election_id and c.profile_id = p_candidate_id) then
    raise exception 'такого кандидата нет в списке';
  end if;
  insert into public.artel_leader_votes (election_id, voter_id, candidate_id) values (p_election_id, auth.uid(), p_candidate_id)
    on conflict (election_id, voter_id) do update set candidate_id = excluded.candidate_id;
end;
$$;

-- ---------- голос: менять ли название (этап 1) ----------
create or replace function public.cast_name_stage1_vote(p_election_id bigint, p_choice boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artel_id bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select artel_id into v_artel_id from public.artel_elections where id = p_election_id and status = 'open';
  if v_artel_id is null then raise exception 'голосование закрыто или не найдено'; end if;
  if not exists (select 1 from public.artel_members m where m.artel_id = v_artel_id and m.profile_id = auth.uid()) then
    raise exception 'голосовать может только участник артели';
  end if;
  insert into public.artel_name_stage1_votes (election_id, voter_id, choice) values (p_election_id, auth.uid(), p_choice)
    on conflict (election_id, voter_id) do update set choice = excluded.choice;
end;
$$;

-- ---------- предложить вариант названия (только замы/старшина/админ) ----------
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
  if not v_can then raise exception 'предлагать варианты может старшина, замы или админ'; end if;

  select count(*) into v_count from public.artel_name_candidates where election_id = p_election_id;
  if v_count >= 5 then raise exception 'уже пять вариантов — больше нельзя'; end if;

  insert into public.artel_name_candidates (election_id, text, proposed_by) values (p_election_id, trim(p_text), auth.uid());
end;
$$;

-- ---------- голос за вариант названия (этап 2) ----------
create or replace function public.cast_name_stage2_vote(p_election_id bigint, p_candidate_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artel_id bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select artel_id into v_artel_id from public.artel_elections where id = p_election_id and status = 'open';
  if v_artel_id is null then raise exception 'голосование закрыто или не найдено'; end if;
  if not exists (select 1 from public.artel_members m where m.artel_id = v_artel_id and m.profile_id = auth.uid()) then
    raise exception 'голосовать может только участник артели';
  end if;
  if not exists (select 1 from public.artel_name_candidates c where c.id = p_candidate_id and c.election_id = p_election_id) then
    raise exception 'такого варианта нет в списке';
  end if;
  insert into public.artel_name_stage2_votes (election_id, voter_id, candidate_id) values (p_election_id, auth.uid(), p_candidate_id)
    on conflict (election_id, voter_id) do update set candidate_id = excluded.candidate_id;
end;
$$;

-- ---------- подвести итоги, если срок вышел (вызывается лениво со страницы) ----------
create or replace function public.close_artel_election_if_due(p_artel_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_election record;
  v_new_leader uuid;
  v_yes bigint;
  v_no bigint;
  v_new_name_id bigint;
  v_new_name text;
begin
  select * into v_election from public.artel_elections
    where artel_id = p_artel_id and status = 'open' and closes_at <= now()
    limit 1;
  if v_election.id is null then return; end if;

  -- старшина: больше голосов побеждает, при ничьей — кто дольше в артели
  select c.profile_id into v_new_leader
    from public.artel_leader_candidates c
    left join public.artel_leader_votes v on v.election_id = c.election_id and v.candidate_id = c.profile_id
    left join public.artel_members m on m.artel_id = p_artel_id and m.profile_id = c.profile_id
    where c.election_id = v_election.id
    group by c.profile_id, m.joined_at
    order by count(v.voter_id) desc, m.joined_at asc nulls last
    limit 1;

  -- название: этап 1
  select count(*) filter (where choice) , count(*) filter (where not choice)
    into v_yes, v_no
    from public.artel_name_stage1_votes where election_id = v_election.id;

  v_new_name := null;
  if v_yes > v_no then
    select c.id, c.text into v_new_name_id, v_new_name
      from public.artel_name_candidates c
      left join public.artel_name_stage2_votes v on v.election_id = c.election_id and v.candidate_id = c.id
      where c.election_id = v_election.id
      group by c.id, c.text
      order by count(v.voter_id) desc, c.id asc
      limit 1;
  end if;

  if v_new_leader is not null then
    update public.artels set leader_id = v_new_leader, leader_since = now() where id = p_artel_id and leader_id is distinct from v_new_leader;
    update public.artel_members set role = 'member' where artel_id = p_artel_id and role = 'leader' and profile_id <> v_new_leader;
    update public.artel_members set role = 'leader' where artel_id = p_artel_id and profile_id = v_new_leader;
  end if;

  if v_new_name is not null then
    update public.artels set name = v_new_name where id = p_artel_id;
  end if;

  update public.artel_elections
    set status = 'closed', new_leader_id = v_new_leader, name_changed = (v_new_name is not null), new_name = v_new_name
    where id = v_election.id;
end;
$$;

-- ---------- назначить/снять зама (не выборно, решает старшина) ----------
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
  if not v_can then raise exception 'назначать замов может только старшина или админ'; end if;

  update public.artel_members
    set role = case when p_is_deputy then 'deputy' else 'member' end
    where artel_id = p_artel_id and profile_id = p_profile_id and role <> 'leader';
end;
$$;

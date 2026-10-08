-- ПолиКоннект — веха 91: приоритетные Потеряшки на главной (блок «Полезное»)
-- + напоминание автору через 3 дня, если объявление всё ещё открыто.
-- Применить так же: SQL Editor → New query → вставить → Run.

-- «Актуально» для 3-дневного окна — либо дата создания, либо дата
-- последнего подтверждения «ещё актуально» (см. renew_lostfound_post).
alter table public.lost_found_posts add column if not exists renewed_at timestamptz;

-- Напоминания — отдельная лёгкая таблица, она же источник realtime-
-- уведомления (тот же приём, что nickname_gifts в Вехе 89/90).
create table public.lostfound_reminders (
  id bigint generated always as identity primary key,
  lostfound_id bigint not null references public.lost_found_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.lostfound_reminders enable row level security;
create policy "lostfound_reminders_select_own" on public.lostfound_reminders for select using (author_id = auth.uid());

-- Ленивая проверка — вызывается с клиента при заходе на главную (как
-- purge_old_deleted_conversations/close_artel_election_if_due — на этом
-- тарифе Supabase нет pg_cron). Один раз на пост после каждого порога.
create or replace function public.check_lostfound_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lostfound_reminders (lostfound_id, author_id)
  select lp.id, lp.author_id
  from public.lost_found_posts lp
  where lp.status = 'open'
    and coalesce(lp.renewed_at, lp.created_at) < now() - interval '3 days'
    and not exists (
      select 1 from public.lostfound_reminders r
      where r.lostfound_id = lp.id and r.created_at > coalesce(lp.renewed_at, lp.created_at)
    );
end;
$$;

-- Автор подтверждает «ещё актуально» — сбрасывает 3-дневный отсчёт заново.
create or replace function public.renew_lostfound_post(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.lost_found_posts set renewed_at = now()
  where id = p_id and author_id = auth.uid();
end;
$$;

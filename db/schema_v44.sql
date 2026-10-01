-- ПолиКоннект — веха 44: реклама от сторонних рекламодателей.
-- Админ выдаёт по ссылке временный доступ (на N дней) — по этой ссылке
-- человек без аккаунта на сайте сам присылает текст/фото/ссылку, админ
-- смотрит и одобряет, отправляет на доработку (с комментарием, можно
-- прислать заново по той же ссылке) или отменяет совсем (ссылка сразу
-- гаснет). Объявления теперь ещё умеют висеть в разных углах экрана
-- одновременно, а не только в одном. Тайминги: новый блок выскакивает
-- каждые 10 минут (было 30), внутри одного угла смена объявлений — каждые
-- 30 секунд (было 15).
-- Применить как обычно: Supabase → SQL Editor → New query → вставить → Run.

-- ---------- доступы для рекламодателей ----------
create table public.ad_access_grants (
  id bigint generated always as identity primary key,
  label text not null check (char_length(trim(label)) between 1 and 80),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.ad_access_grants enable row level security;

create policy "ad_access_grants_admin_all" on public.ad_access_grants for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

-- ---------- доработка ads: заявки на модерацию + угол экрана ----------
alter table public.ads add column if not exists status text not null default 'approved' check (status in ('pending', 'approved', 'rejected'));
alter table public.ads add column if not exists position text not null default 'bottom-right' check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left'));
alter table public.ads add column if not exists grant_id bigint references public.ad_access_grants(id) on delete set null;
alter table public.ads add column if not exists reviewer_note text;

-- Раньше "select true" для всех — теперь заявки (pending/rejected) видят
-- только админы, живые (approved) объявления — все, как и было.
drop policy if exists "ads_select_all" on public.ads;
create policy "ads_select_public" on public.ads for select using (
  status = 'approved' or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

-- Раньше update вообще не было policy — нужна, чтобы одобрять/переносить
-- по углам через обычный update из админки (не только через RPC).
create policy "ads_update_admin" on public.ads for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

-- ---------- фото для заявки — папка pending/, без привязки к аккаунту ----------
-- Саму заявку (и то, что токен настоящий и не истёк) эта policy не
-- проверяет — это не умеет storage RLS, токен проверяется в RPC
-- submit_ad_via_grant ниже. Чужой файл без реальной заявки просто никогда
-- не попадёт в объявление — бакет и так публичный на чтение.
drop policy if exists "ad_photos_public_write_pending" on storage.objects;
create policy "ad_photos_public_write_pending" on storage.objects for insert with check (
  bucket_id = 'ad-photos' and (storage.foldername(name))[1] = 'pending'
);

-- ---------- RPC: создать доступ (админ) ----------
create or replace function public.create_ad_grant(p_label text, p_days int)
returns table (id bigint, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
  new_token text;
  new_expires timestamptz;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'только администратор';
  end if;
  new_token := replace(gen_random_uuid()::text, '-', '');
  new_expires := now() + make_interval(days => greatest(1, coalesce(p_days, 2)));
  insert into public.ad_access_grants (label, token, created_by, expires_at)
    values (trim(p_label), new_token, auth.uid(), new_expires)
    returning public.ad_access_grants.id into new_id;
  return query select new_id, new_token, new_expires;
end;
$$;

-- ---------- RPC: инфо по токену (публичная страница заявки) ----------
create or replace function public.get_ad_grant_info(p_token text)
returns table (valid boolean, label text, expires_at timestamptz, last_status text, last_note text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g public.ad_access_grants;
begin
  select * into g from public.ad_access_grants where token = p_token;
  if g.id is null or g.expires_at < now() then
    return query select false, null::text, null::timestamptz, null::text, null::text;
    return;
  end if;
  return query
    select true, g.label, g.expires_at, a.status, a.reviewer_note
    from (select 1) dummy
    left join lateral (
      select status, reviewer_note from public.ads
      where grant_id = g.id order by created_at desc limit 1
    ) a on true;
end;
$$;

-- ---------- RPC: отправить / переотправить заявку по токену ----------
create or replace function public.submit_ad_via_grant(
  p_token text, p_text text, p_link text, p_image_url text,
  p_desktop_w int, p_desktop_h int, p_mobile_w int, p_mobile_h int
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.ad_access_grants;
  new_id bigint;
begin
  select * into g from public.ad_access_grants where token = p_token;
  if g.id is null then raise exception 'ссылка недействительна'; end if;
  if g.expires_at < now() then raise exception 'срок действия ссылки истёк'; end if;
  if coalesce(trim(p_text), '') = '' and coalesce(trim(p_image_url), '') = '' then
    raise exception 'добавьте текст или фото';
  end if;

  insert into public.ads (
    content_type, text_body, link_url, image_url,
    desktop_w, desktop_h, mobile_w, mobile_h,
    active_until, status, grant_id, created_by
  ) values (
    case when coalesce(trim(p_image_url), '') <> '' then 'image' else 'text' end,
    nullif(trim(p_text), ''), nullif(trim(p_link), ''), nullif(trim(p_image_url), ''),
    greatest(40, coalesce(p_desktop_w, 300)), greatest(40, coalesce(p_desktop_h, 250)),
    greatest(40, coalesce(p_mobile_w, 320)), greatest(40, coalesce(p_mobile_h, 50)),
    now() + interval '1 year', -- настоящий срок показа поставит админ при одобрении
    'pending', g.id, g.created_by
  ) returning id into new_id;

  return new_id;
end;
$$;

-- ---------- RPC: решение админа по заявке ----------
create or replace function public.review_ad(p_ad_id bigint, p_action text, p_note text default null, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ads;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'только администратор';
  end if;
  select * into a from public.ads where id = p_ad_id;
  if a.id is null then raise exception 'объявление не найдено'; end if;

  if p_action = 'approve' then
    update public.ads set status = 'approved', reviewer_note = p_note,
      active_until = coalesce(p_until, now() + interval '7 days')
      where id = p_ad_id;
  elsif p_action = 'edit' then
    update public.ads set status = 'rejected', reviewer_note = p_note where id = p_ad_id;
  elsif p_action = 'cancel' then
    update public.ads set status = 'rejected', reviewer_note = p_note where id = p_ad_id;
    if a.grant_id is not null then
      update public.ad_access_grants set expires_at = now() where id = a.grant_id;
    end if;
  else
    raise exception 'неизвестное действие';
  end if;
end;
$$;

grant execute on function public.create_ad_grant(text, int) to authenticated;
grant execute on function public.get_ad_grant_info(text) to anon, authenticated;
grant execute on function public.submit_ad_via_grant(text, text, text, text, int, int, int, int) to anon, authenticated;
grant execute on function public.review_ad(bigint, text, text, timestamptz) to authenticated;

-- ---------- уведомление админу о новой заявке (тот же бот, что и v10) ----------
drop trigger if exists trg_notify_telegram_ads on public.ads;
create trigger trg_notify_telegram_ads
after insert on public.ads
for each row when (new.status = 'pending')
execute function public.notify_telegram();

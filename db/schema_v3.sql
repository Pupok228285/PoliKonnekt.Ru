-- ПолиКоннект — веха 3: администрирование. Онлайн, очередь проверки зачёток,
-- права админа. Применить так же: SQL Editor → New query → вставить → Run.

-- 1) Кто админ, когда был на сайте, и простой порядковый номер участника
--    (чтобы искать в админке не только по нику, но и по короткому номеру).
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists member_no bigint generated always as identity;

-- 2) Заявки на подтверждение по зачётке.
create table public.verification_requests (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  photo_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

alter table public.verification_requests enable row level security;

create policy "verification_insert_own" on public.verification_requests
  for insert with check (profile_id = auth.uid());

create policy "verification_select_own_or_admin" on public.verification_requests
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p2 where p2.id = auth.uid() and p2.is_admin)
  );

create policy "verification_update_admin" on public.verification_requests
  for update using (
    exists (select 1 from public.profiles p2 where p2.id = auth.uid() and p2.is_admin)
  );

-- 3) Админ может подтверждать/снимать галочку у любого профиля (не только у своего).
create policy "profiles_update_admin" on public.profiles
  for update using (
    exists (select 1 from public.profiles p2 where p2.id = auth.uid() and p2.is_admin)
  );

-- 4) Приватное хранилище для фото зачёток — читать может только сам человек и админ,
--    в отличие от avatars/profile-photos это НЕ публичный бакет.
insert into storage.buckets (id, name, public) values ('id-cards', 'id-cards', false) on conflict (id) do nothing;

create policy "idcards_insert_own" on storage.objects for insert with check (
  bucket_id = 'id-cards' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "idcards_select_own_or_admin" on storage.objects for select using (
  bucket_id = 'id-cards' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.profiles p2 where p2.id = auth.uid() and p2.is_admin)
  )
);
create policy "idcards_delete_own_or_admin" on storage.objects for delete using (
  bucket_id = 'id-cards' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.profiles p2 where p2.id = auth.uid() and p2.is_admin)
  )
);

-- 5) Список участников с почтой — только для админа. Обычным способом почту
--    не достать (она лежит в защищённой auth.users, а не в public.profiles),
--    эта функция сама проверяет права и отдаёт данные только если вы админ.
create function public.admin_list_profiles()
returns table (
  id uuid, member_no bigint, nickname text, email text, verified boolean, is_admin boolean,
  created_at timestamptz, last_seen_at timestamptz
) language plpgsql security definer as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized';
  end if;
  return query
    select p.id, p.member_no, p.nickname, u.email, p.verified, p.is_admin, p.created_at, p.last_seen_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

-- 6) Сделать себя первым админом — выполните ОТДЕЛЬНО после этого файла,
--    подставив свой ник (посмотреть его можно в профиле на сайте):
-- update public.profiles set is_admin = true where nickname = 'ВАШ_НИК_ЗДЕСЬ';

-- ПолиКоннект — веха 2: аватар, фото в профиле, история изменений.
-- Применить так же, как первый файл: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Ничего из schema.sql не трогает и не дублирует, только добавляет новое.

-- 1) Аватар — просто ссылка на файл в Storage.
alter table public.profiles add column if not exists avatar_url text;

-- 2) Настройки приватности истории — те самые переключатели «Открыта всем / Скрыта»
--    в профиле. По умолчанию имя и аватар открыты, цитата скрыта — как в макете.
alter table public.profiles add column if not exists name_history_public boolean not null default true;
alter table public.profiles add column if not exists avatar_history_public boolean not null default true;
alter table public.profiles add column if not exists quote_history_public boolean not null default false;

-- 3) История изменений — заполняется САМА, триггером, при любом UPDATE профиля.
create table public.profile_history (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  field text not null check (field in ('nickname', 'avatar_url', 'quote')),
  old_value text,
  changed_at timestamptz not null default now()
);

create function public.log_profile_change()
returns trigger as $$
begin
  if new.nickname is distinct from old.nickname then
    insert into public.profile_history (profile_id, field, old_value) values (old.id, 'nickname', old.nickname);
  end if;
  if new.avatar_url is distinct from old.avatar_url then
    insert into public.profile_history (profile_id, field, old_value) values (old.id, 'avatar_url', old.avatar_url);
  end if;
  if new.quote is distinct from old.quote then
    insert into public.profile_history (profile_id, field, old_value) values (old.id, 'quote', old.quote);
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_profile_updated
  after update on public.profiles
  for each row execute procedure public.log_profile_change();

-- 4) Фото в профиле (с подписями — в отличие от Альбомов).
create table public.profile_photos (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  caption text,
  created_at timestamptz not null default now()
);

-- 5) RLS на новые таблицы.
alter table public.profile_history enable row level security;
alter table public.profile_photos enable row level security;

-- Историю всегда видит сам владелец; остальные — только если владелец явно разрешил
-- переключателем для этого конкретного поля (nickname/avatar_url/quote).
create policy "history_select" on public.profile_history for select using (
  profile_id = auth.uid()
  or exists (
    select 1 from public.profiles pr
    where pr.id = profile_history.profile_id
      and (
        (profile_history.field = 'nickname' and pr.name_history_public)
        or (profile_history.field = 'avatar_url' and pr.avatar_history_public)
        or (profile_history.field = 'quote' and pr.quote_history_public)
      )
  )
);
-- Строки пишет только триггер (security definer) — обычным пользователям insert не нужен.

-- Фото — публичная витрина профиля: читать может любой, добавлять/удалять — только свои.
create policy "photos_select_all" on public.profile_photos for select using (true);
create policy "photos_insert_own" on public.profile_photos for insert with check (profile_id = auth.uid());
create policy "photos_delete_own" on public.profile_photos for delete using (profile_id = auth.uid());

-- 6) Storage: два публичных бакета для файлов, каждый пишет только в свою папку
--    (путь вида <ваш_id>/<имя_файла> — это и проверяют политики ниже).
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('profile-photos', 'profile-photos', true) on conflict (id) do nothing;

-- RLS на storage.objects у Supabase включена по умолчанию — трогать её самим нельзя
-- (это системная таблица не в вашем владении), да и не нужно.

create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars_own_write" on storage.objects for insert with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "avatars_own_update" on storage.objects for update using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "avatars_own_delete" on storage.objects for delete using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "photos_bucket_public_read" on storage.objects for select using (bucket_id = 'profile-photos');
create policy "photos_bucket_own_write" on storage.objects for insert with check (
  bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "photos_bucket_own_delete" on storage.objects for delete using (
  bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

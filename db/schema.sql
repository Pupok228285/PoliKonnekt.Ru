-- ПолиКоннект — схема для Supabase, веха 1: настоящая регистрация/вход + живая Лента.
-- Как применить: Supabase → ваш проект → SQL Editor → New query → вставить целиком → Run.
-- Дальше будем добавлять таблицы под Форум, Профиль, Сообщения, К'Артель и т.д. по мере работы.

-- 1) Профиль поверх встроенной таблицы auth.users (её саму не трогаем).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique,
  quote text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- Автосоздание профиля при регистрации (nickname берём из метаданных, которые передадим при signUp).
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', 'Студент' || substr(new.id::text, 1, 4)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2) Лента.
create table public.feed_posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- 3) Row Level Security — кто что может читать/писать.
alter table public.profiles enable row level security;
alter table public.feed_posts enable row level security;

-- Профили: читать может любой (гость тоже), редактировать — только свой.
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Лента: читать может любой, писать — только вошедшие, и только от своего имени.
create policy "feed_select_all" on public.feed_posts for select using (true);
create policy "feed_insert_own" on public.feed_posts
  for insert with check (auth.uid() = author_id);
create policy "feed_delete_own" on public.feed_posts
  for delete using (auth.uid() = author_id);

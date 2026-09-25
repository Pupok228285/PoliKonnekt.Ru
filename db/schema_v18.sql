-- ПолиКоннект — веха 18: полноценный профиль по референсу (анкета,
-- образование, друзья, отзывы, счётчик просмотров).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

alter table public.profiles add column if not exists real_name text;
alter table public.profiles add column if not exists gender text check (gender in ('m', 'f'));
alter table public.profiles add column if not exists birthday date;
alter table public.profiles add column if not exists hobbies text;
alter table public.profiles add column if not exists vk_url text;
alter table public.profiles add column if not exists signature text;
alter table public.profiles add column if not exists faculty text;
alter table public.profiles add column if not exists enroll_year int;
alter table public.profiles add column if not exists speciality text;
alter table public.profiles add column if not exists profile_views bigint not null default 0;
-- где сейчас человек (путь+якорь страницы) — для настоящей таблицы "Активные участники" на главной
alter table public.profiles add column if not exists current_path text;

-- ---------- друзья (взаимные, через заявку) ----------
create table public.friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friendships_not_self check (requester_id <> addressee_id)
);
-- одна пара — одна запись, независимо от того, кто кому первый написал
create unique index friendships_pair_unique on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

create policy "friendships_select_related" on public.friendships for select using (
  requester_id = auth.uid() or addressee_id = auth.uid()
);
create policy "friendships_insert_own" on public.friendships for insert with check (requester_id = auth.uid());
-- принять заявку может только адресат
create policy "friendships_update_addressee" on public.friendships for update
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());
-- отменить заявку / удалить из друзей может любая из сторон
create policy "friendships_delete_related" on public.friendships for delete using (
  requester_id = auth.uid() or addressee_id = auth.uid()
);

-- ---------- отзывы (гостевая книга на профиле) ----------
create table public.profile_reviews (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.profile_reviews enable row level security;

create policy "reviews_select_all" on public.profile_reviews for select using (true);
create policy "reviews_insert_own" on public.profile_reviews for insert with check (author_id = auth.uid());
create policy "reviews_delete_own_or_admin" on public.profile_reviews for delete using (
  author_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

-- ---------- счётчик просмотров профиля (чужих, не своих) ----------
create or replace function public.bump_profile_views(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() = target_id then
    return;
  end if;
  update public.profiles set profile_views = profile_views + 1 where id = target_id;
end;
$$;

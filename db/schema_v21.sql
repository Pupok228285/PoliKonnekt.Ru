-- ПолиКоннект — веха 21: настоящая реклама (поп-ап на главной), управляется
-- только из админ-панели — размер отдельно для ПК и телефона, дата, до
-- которой висит, фото или текст. Пока нет ни одного активного объявления —
-- поп-ап честно показывает старую шутку (как и было).
-- Применить как обычно: SQL Editor → New query → вставить → Run.

create table public.ads (
  id bigint generated always as identity primary key,
  content_type text not null check (content_type in ('image', 'text')),
  image_url text,
  text_body text,
  link_url text,
  desktop_w int not null check (desktop_w between 40 and 1200),
  desktop_h int not null check (desktop_h between 40 and 800),
  mobile_w int not null check (mobile_w between 40 and 600),
  mobile_h int not null check (mobile_h between 40 and 600),
  active_until timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ads_content_present check (
    (content_type = 'image' and image_url is not null) or
    (content_type = 'text' and text_body is not null and char_length(text_body) between 1 and 300)
  )
);

alter table public.ads enable row level security;

create policy "ads_select_all" on public.ads for select using (true);
create policy "ads_insert_admin" on public.ads for insert with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);
create policy "ads_delete_admin" on public.ads for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

-- Публичный бакет для фото объявлений — читать может любой, писать/удалять
-- только admin (та же логика, что у album-photos).
insert into storage.buckets (id, name, public)
values ('ad-photos', 'ad-photos', true)
on conflict (id) do nothing;

drop policy if exists "ad_photos_public_read" on storage.objects;
create policy "ad_photos_public_read" on storage.objects for select using (bucket_id = 'ad-photos');

drop policy if exists "ad_photos_admin_write" on storage.objects;
create policy "ad_photos_admin_write" on storage.objects for insert with check (
  bucket_id = 'ad-photos' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

drop policy if exists "ad_photos_admin_delete" on storage.objects;
create policy "ad_photos_admin_delete" on storage.objects for delete using (
  bucket_id = 'ad-photos' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

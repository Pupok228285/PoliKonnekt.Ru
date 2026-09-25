-- v35: справочник разделов форума (корпуса/факультеты/общие темы). Раньше
-- список жил только в статичной HTML-разметке forum.html — добавить туда
-- новый раздел мог только я правкой кода. Теперь настоящая таблица, читают
-- все, добавлять/менять/удалять разделы могут только админ и модераторы.
--
-- Важно: forum_topics.section как был, так и остаётся обычным текстовым
-- полем (не FK на эту таблицу) — переделывать это отдельная, более крупная
-- задача. Значит теоретически можно создать тему с разделом, которого нет в
-- списке, напрямую через forum-section.html?name=... — эта миграция не
-- закрывает эту дыру, только даёт управление самим списком разделов.

create table public.forum_sections (
  id bigint generated always as identity primary key,
  name text not null unique,
  group_key text not null check (group_key in ('corpus', 'faculty', 'general')),
  description text not null default '',
  icon text not null default 'i-feed.svg',
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.forum_sections enable row level security;

create policy "forum_sections_select_all" on public.forum_sections for select using (true);

create policy "forum_sections_insert_staff" on public.forum_sections for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator)));

create policy "forum_sections_update_staff" on public.forum_sections for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator)))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator)));

create policy "forum_sections_delete_staff" on public.forum_sections for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.is_moderator)));

-- Перенос текущего статичного списка один в один, чтобы ничего не пропало
-- и уже существующие темы не остались без своего раздела в списке.
insert into public.forum_sections (name, group_key, description, icon, position) values
  ('Университетский трёп', 'general', 'Свободное общение на любые темы. Новички могут представиться', 'i-feed.svg', 1),
  ('Место встречи', 'general', 'Где поесть, погулять и просто пересечься рядом с корпусом', 'i-heart.svg', 2),
  ('Потеха', 'general', 'Байки, шутки с пар и всё, что не влезло в Цитаты', 'i-quote.svg', 3),
  ('Б. Семёновская', 'corpus', 'Главный корпус — расписание, столовая, где что искать', 'i-canteen.svg', 1),
  ('Автозаводская', 'corpus', 'Машиностроение, Химтех, Урбанистика — всё про этот корпус', 'i-service.svg', 2),
  ('Прянишникова', 'corpus', 'ФИТ, издательское дело, журналистика, общежитие рядом', 'i-doc.svg', 3),
  ('Павла Корчагина (ВДНХ)', 'corpus', 'Графика и книга им. Фаворского, полиграфический', 'i-portfolio.svg', 4),
  ('Факультет информационных технологий', 'faculty', 'ИТ, бизнес-информатика, дизайн и медиа', 'i-service.svg', 1),
  ('Транспортный факультет', 'faculty', 'Транспортная техника, логистика, дизайн транспорта', 'i-things.svg', 2),
  ('Факультет машиностроения', 'faculty', 'Восемь кафедр — от станков до автомобилестроения', 'i-artel.svg', 3),
  ('Химтех и биотех', 'faculty', 'Лабораторные, реагенты, кто спалил вытяжку в третий раз', 'i-doc.svg', 4),
  ('Урбанистика и городское хозяйство', 'faculty', 'Городская среда, ЖКХ, курсовые по благоустройству', 'i-lost.svg', 5),
  ('Экономики и управления', 'faculty', 'Финансы, менеджмент, кто идёт на биржевой кружок', 'i-support.svg', 6),
  ('Графики и искусства книги им. Фаворского', 'faculty', 'Иллюстрация, книжная графика, выставки студентов', 'i-portfolio.svg', 7),
  ('Издательского дела и журналистики', 'faculty', 'Тексты, вёрстка, кто пишет в студенческую газету', 'i-quote.svg', 8),
  ('Полиграфический факультет', 'faculty', 'Печать, материалы, оборудование типографий', 'i-doc.svg', 9),
  ('Факультет базовых компетенций', 'faculty', 'Общие дисциплины первых курсов, подготовка', 'i-help.svg', 10)
on conflict (name) do nothing;

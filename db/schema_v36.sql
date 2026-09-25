-- v36: новый вид обращения в Поддержку — «Предложение» (идеи, мысли),
-- рядом с уже существующими «Вопрос»/«Жалоба».

alter table public.support_messages drop constraint if exists support_messages_kind_check;
alter table public.support_messages add constraint support_messages_kind_check
  check (kind in ('complaint', 'question', 'suggestion'));

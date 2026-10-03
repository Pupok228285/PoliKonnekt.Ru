-- Веха 75: всплывающие уведомления (js/notify-toast.js) + настройка вкл/выкл.

alter table public.profiles add column if not exists popup_notify_enabled boolean not null default true;

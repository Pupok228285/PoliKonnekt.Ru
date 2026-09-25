// supabase/functions/notify-telegram/index.ts
//
// Принимает вызов от Database Webhook (Supabase) при INSERT в
// verification_requests или support_messages и шлёт уведомление в
// Telegram-группу/канал через Bot API. Токен бота и id чата — в секретах
// функции (Deno.env), никогда не в коде.
//
// Настройка — вся через Supabase Dashboard, без командной строки:
// 1. Создайте бота через @BotFather в Telegram, получите токен.
// 2. Создайте группу/канал для уведомлений, добавьте туда бота
//    (в канал — с правами администратора).
// 3. Узнайте chat_id: напишите что-нибудь в группу, затем откройте
//    https://api.telegram.org/bot<ТОКЕН>/getUpdates — id чата в поле
//    "chat":{"id": ...} (для групп обычно отрицательное число).
// 4. Dashboard → Edge Functions → Deploy a new function → Via Editor →
//    вставить этот файл → Deploy. В настройках функции выключить
//    "Enforce JWT Verification" (вызывает сам webhook, не браузер).
// 5. Dashboard → Edge Functions → Secrets → добавить TELEGRAM_BOT_TOKEN
//    и TELEGRAM_CHAT_ID.
// 6. Dashboard → Database → Webhooks → Create a new webhook — по одному
//    на каждую таблицу: verification_requests (INSERT) и
//    support_messages (INSERT), тип — Supabase Edge Functions, функция —
//    notify-telegram.

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const table = payload.table as string;
    const record = (payload.record ?? {}) as Record<string, unknown>;

    // Публикуемый ключ + URL проекта — это стандартные секреты, доступные
    // в любой Edge Function по умолчанию, вводить их отдельно не нужно.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    let publishableKey: string | undefined;
    try {
      const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
      publishableKey = keys.default;
    } catch { /* ignore */ }
    const supabase = supabaseUrl && publishableKey ? createClient(supabaseUrl, publishableKey) : null;

    async function lookupProfile(id: unknown): Promise<{ nickname: string; member_no: number } | null> {
      if (!supabase || !id) return null;
      const { data } = await supabase.from('profiles').select('nickname, member_no').eq('id', id).maybeSingle();
      return data;
    }

    // Telegram Bot API получает text в HTML-режиме (parse_mode ниже) — весь
    // текст, подставляемый из базы (ник, тема, сообщение), экранируется,
    // чтобы случайные `<`/`>`/`&` в чужом тексте не сломали разметку.
    function escapeHtml(s: string): string {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    const SUPPORT_KIND_LABELS: Record<string, string> = {
      complaint: 'Жалоба', question: 'Вопрос', suggestion: 'Предложение',
    };

    let text = '';
    if (table === 'verification_requests') {
      const prof = await lookupProfile(record.profile_id);
      const who = prof ? `${escapeHtml(prof.nickname)} (№${prof.member_no})` : 'неизвестный студент';
      text = `🎓 <b>Новая заявка на подтверждение зачётки</b>\nОт: ${who}\nОткрыть: админ-панель сайта.`;
    } else if (table === 'support_messages') {
      const prof = await lookupProfile(record.author_id);
      const who = prof ? prof.nickname : 'неизвестный автор';
      const kind = SUPPORT_KIND_LABELS[String(record.kind)] || 'Вопрос';
      const subject = String(record.subject ?? '');
      const body = String(record.body ?? '').slice(0, 300);
      const page = record.context_url ? `\nСтраница: ${escapeHtml(String(record.context_url))}` : '';
      text = `📩 <b>${kind} от ${escapeHtml(who)}: «${escapeHtml(subject)}»</b>\n<blockquote>${escapeHtml(body)}</blockquote>${page}\nОткрыть: админ-панель сайта.`;
    } else {
      text = `Событие в таблице ${escapeHtml(table)}.`;
    }

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) {
      return new Response(JSON.stringify({ ok: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы в секретах функции' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const tgJson = await tgRes.json();

    return new Response(JSON.stringify({ ok: tgJson.ok === true, telegram: tgJson }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

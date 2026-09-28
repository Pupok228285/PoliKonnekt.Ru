// supabase/functions/telegram-notify/index.ts
//
// Бот уведомлений для пользователей сайта (отдельный от админского бота в
// notify-telegram). Три входа:
//   GET  ?setup=1                 — один раз после деплоя: ставит вебхук бота
//                                   на эту функцию и записывает имя бота в
//                                   site_settings (для кнопки в Настройках).
//   POST от Telegram (вебхук)     — /start <код> привязывает аккаунт, /stop
//                                   отвязывает. Проверяется заголовок
//                                   X-Telegram-Bot-Api-Secret-Token.
//   POST {kind:'event', ...}      — от триггеров db/schema_v40.sql. Функция
//                                   не верит телу запроса: сама перечитывает
//                                   строку из базы, сама решает, кому писать,
//                                   и не шлёт одно событие дважды
//                                   (telegram_sent). Поэтому чужой вызов
//                                   ничего нового не отправит.
//
// Секрет: TELEGRAM_NOTIFY_BOT_TOKEN (токен нового бота от @BotFather).
// Необязательный секрет: SITE_URL — адрес сайта для ссылок в уведомлениях.
// При деплое выключить «Enforce JWT Verification»: ни Telegram, ни триггер
// JWT не присылают.

import { createClient } from 'npm:@supabase/supabase-js@2';

const BOT_TOKEN = Deno.env.get('TELEGRAM_NOTIFY_BOT_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://pupok228285.github.io/PoliKonnekt.Ru').replace(/\/+$/, '');
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/swift-responder`;

function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    if (keys.default) return keys.default;
  } catch { /* ключей нового формата нет — берём старый */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

const db = createClient(SUPABASE_URL, serviceKey(), { auth: { persistSession: false } });

const HELP = 'Это бот уведомлений сайта ПолиКоннект.ru.\n\n' +
  `Чтобы получать сюда уведомления, откройте на сайте <a href="${SITE_URL}/settings.html">Настройки</a> → «Уведомления в Telegram» и нажмите «Подключить Telegram».\n\n` +
  'Отключить уведомления — команда /stop.';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function quote(s: unknown, max = 300): string {
  const t = String(s ?? '');
  return `<blockquote>${escapeHtml(t.length > max ? t.slice(0, max) + '…' : t)}</blockquote>`;
}

// Секрет вебхука выводим из токена бота — отдельный секрет заводить не нужно.
async function webhookSecret(): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('polikonnekt-webhook:' + BOT_TOKEN));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

// deno-lint-ignore no-explicit-any
async function tg(method: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await res.json();
}

// deno-lint-ignore no-explicit-any
function sendTo(chatId: number, text: string): Promise<any> {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

async function nick(id: string | null | undefined): Promise<string> {
  if (!id) return 'Кто-то';
  const { data } = await db.from('profiles').select('nickname').eq('id', id).maybeSingle();
  return data?.nickname ?? 'Кто-то';
}

// ---------- настройка ----------
async function setup(): Promise<Response> {
  if (!BOT_TOKEN) return json({ ok: false, error: 'не задан секрет TELEGRAM_NOTIFY_BOT_TOKEN' }, 500);
  const me = await tg('getMe', {});
  if (!me.ok) return json({ ok: false, step: 'getMe', telegram: me }, 500);
  const hook = await tg('setWebhook', {
    url: FUNCTION_URL,
    secret_token: await webhookSecret(),
    allowed_updates: ['message'],
  });
  const save = await db.from('site_settings').update({ telegram_bot_username: me.result.username }).eq('id', true);
  return json({
    ok: hook.ok === true && !save.error,
    bot_username: me.result.username,
    webhook: hook,
    db_error: save.error ? save.error.message : null,
  });
}

// ---------- сообщения боту ----------
// deno-lint-ignore no-explicit-any
async function handleUpdate(update: any): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.chat || msg.chat.type !== 'private') return;
  const chatId: number = msg.chat.id;
  const text = String(msg.text ?? '').trim();

  if (text.startsWith('/start')) {
    const code = text.slice(6).trim();
    if (!code) { await sendTo(chatId, HELP); return; }

    const { data: row } = await db.from('telegram_link_codes').select('profile_id, expires_at').eq('code', code).maybeSingle();
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      await sendTo(chatId, 'Ссылка устарела или уже использована. Откройте на сайте Настройки → «Уведомления в Telegram» и нажмите «Подключить Telegram» ещё раз.');
      return;
    }
    // один Telegram — один аккаунт: если этот чат был привязан к другому, отвязываем
    await db.from('telegram_links').delete().eq('chat_id', chatId).neq('profile_id', row.profile_id);
    const up = await db.from('telegram_links').upsert({
      profile_id: row.profile_id,
      chat_id: chatId,
      tg_username: msg.from?.username ?? null,
      linked_at: new Date().toISOString(),
    }, { onConflict: 'profile_id' });
    await db.from('telegram_link_codes').delete().eq('code', code);
    if (up.error) {
      console.error(up.error);
      await sendTo(chatId, 'Не получилось привязать аккаунт. Попробуйте ещё раз чуть позже.');
      return;
    }
    const who = await nick(row.profile_id);
    await sendTo(chatId,
      `✅ Готово! Telegram привязан к аккаунту <b>${escapeHtml(who)}</b> на ПолиКоннект.ru.\n\n` +
      'Сюда будут приходить уведомления: личные сообщения, ответы, комментарии, друзья, отзывы в профиле, анонимки. ' +
      `Что именно присылать — в <a href="${SITE_URL}/settings.html">Настройках</a>. Отключить всё — /stop.`);
    return;
  }

  if (text === '/stop') {
    await db.from('telegram_links').delete().eq('chat_id', chatId);
    await sendTo(chatId, 'Уведомления отключены, аккаунт отвязан. Подключить снова можно в Настройках на сайте.');
    return;
  }

  await sendTo(chatId, HELP);
}

// ---------- события с сайта ----------
type Notice = { recipient: string; actor: string | null; pref: string; text: string };

const COMMENT_TARGETS: Record<string, { table: string; where: string }> = {
  feed_post: { table: 'feed_posts', where: 'в Ленте' },
  quote_post: { table: 'quote_posts', where: 'в Цитатах и Креативе' },
  canteen_post: { table: 'canteen_posts', where: 'в Столовой' },
  artel_post: { table: 'artel_posts', where: 'на стене артели' },
  diary_post: { table: 'diary_posts', where: 'в Дневнике' },
};

// deno-lint-ignore no-explicit-any
function commentLink(type: string, post: any): string {
  if (type === 'feed_post') return `${SITE_URL}/index.html#lenta`;
  if (type === 'quote_post') return `${SITE_URL}/quotes.html`;
  if (type === 'canteen_post') return `${SITE_URL}/canteen.html`;
  if (type === 'artel_post') return `${SITE_URL}/artel-view.html?id=${post.artel_id}`;
  return `${SITE_URL}/diary.html?id=${post.author_id}`;
}

async function buildNotice(table: string, op: string, id: number): Promise<Notice | null> {
  if (table === 'messages') {
    const { data: m } = await db.from('messages').select('conversation_id, sender_id, body').eq('id', id).maybeSingle();
    if (!m) return null;
    const { data: c } = await db.from('conversations').select('user_a, user_b').eq('id', m.conversation_id).maybeSingle();
    if (!c) return null;
    const recipient = c.user_a === m.sender_id ? c.user_b : c.user_a;
    return {
      recipient, actor: m.sender_id, pref: 'notify_messages',
      text: `💬 Новое сообщение от <b>${escapeHtml(await nick(m.sender_id))}</b>:\n${quote(m.body)}\n<a href="${SITE_URL}/messages.html">Открыть сообщения</a>`,
    };
  }

  if (table === 'forum_replies') {
    const { data: r } = await db.from('forum_replies').select('topic_id, author_id, body').eq('id', id).maybeSingle();
    if (!r) return null;
    const { data: t } = await db.from('forum_topics').select('author_id, title').eq('id', r.topic_id).maybeSingle();
    if (!t || !t.author_id) return null;
    return {
      recipient: t.author_id, actor: r.author_id, pref: 'notify_replies',
      text: `💭 <b>${escapeHtml(await nick(r.author_id))}</b> ответил(а) в вашей теме «${escapeHtml(t.title)}»:\n${quote(r.body)}\n<a href="${SITE_URL}/forum-topic.html?id=${r.topic_id}">Открыть тему</a>`,
    };
  }

  if (table === 'review_comments') {
    const { data: r } = await db.from('review_comments').select('topic_id, parent_id, author_id, body').eq('id', id).maybeSingle();
    if (!r) return null;
    const { data: t } = await db.from('review_topics').select('author_id, title').eq('id', r.topic_id).maybeSingle();
    if (!t) return null;
    let recipient: string | null = t.author_id;
    let what = 'прокомментировал(а) ваш отзыв';
    if (r.parent_id) {
      const { data: p } = await db.from('review_comments').select('author_id').eq('id', r.parent_id).maybeSingle();
      recipient = p?.author_id ?? null;
      what = 'ответил(а) на ваш комментарий к отзыву';
    }
    if (!recipient) return null;
    return {
      recipient, actor: r.author_id, pref: 'notify_replies',
      text: `💭 <b>${escapeHtml(await nick(r.author_id))}</b> ${what} «${escapeHtml(t.title)}»:\n${quote(r.body)}\n<a href="${SITE_URL}/review-topic.html?id=${r.topic_id}">Открыть</a>`,
    };
  }

  if (table === 'comments') {
    const { data: c } = await db.from('comments').select('content_type, content_id, author_id, body').eq('id', id).maybeSingle();
    if (!c) return null;
    const target = COMMENT_TARGETS[c.content_type];
    if (!target) return null;
    const { data: post } = await db.from(target.table).select('*').eq('id', c.content_id).maybeSingle();
    if (!post || !post.author_id) return null;
    return {
      recipient: post.author_id, actor: c.author_id, pref: 'notify_comments',
      text: `🗨 <b>${escapeHtml(await nick(c.author_id))}</b> прокомментировал(а) вашу запись ${target.where}:\n${quote(c.body)}\n<a href="${commentLink(c.content_type, post)}">Открыть</a>`,
    };
  }

  if (table === 'friendships') {
    const { data: f } = await db.from('friendships').select('requester_id, addressee_id, status').eq('id', id).maybeSingle();
    if (!f) return null;
    if (op === 'INSERT' && f.status === 'pending') {
      return {
        recipient: f.addressee_id, actor: f.requester_id, pref: 'notify_friends',
        text: `👋 <b>${escapeHtml(await nick(f.requester_id))}</b> хочет добавить вас в друзья.\n<a href="${SITE_URL}/profile.html">Принять или отклонить — в профиле</a>`,
      };
    }
    if (op === 'UPDATE' && f.status === 'accepted') {
      return {
        recipient: f.requester_id, actor: f.addressee_id, pref: 'notify_friends',
        text: `🤝 <b>${escapeHtml(await nick(f.addressee_id))}</b> принял(а) вашу заявку в друзья.\n<a href="${SITE_URL}/profile.html?id=${f.addressee_id}">Открыть профиль</a>`,
      };
    }
    return null;
  }

  if (table === 'profile_reviews') {
    const { data: r } = await db.from('profile_reviews').select('profile_id, author_id, body').eq('id', id).maybeSingle();
    if (!r) return null;
    return {
      recipient: r.profile_id, actor: r.author_id, pref: 'notify_reviews',
      text: `📝 <b>${escapeHtml(await nick(r.author_id))}</b> оставил(а) отзыв в вашем профиле:\n${quote(r.body)}\n<a href="${SITE_URL}/profile.html">Открыть профиль</a>`,
    };
  }

  if (table === 'anonymous_messages') {
    const { data: a } = await db.from('anonymous_messages').select('recipient_id, sender_id, body').eq('id', id).maybeSingle();
    if (!a) return null;
    // Отправителя в тексте нет и быть не должно — анонимность та же, что на сайте.
    return {
      recipient: a.recipient_id, actor: a.sender_id, pref: 'notify_anon',
      text: `💌 Вам пришло анонимное сообщение:\n${quote(a.body)}\n<a href="${SITE_URL}/profile.html">Открыть профиль</a>`,
    };
  }

  return null;
}

async function handleEvent(table: string, op: string, id: number): Promise<void> {
  const n = await buildNotice(table, op, id);
  if (!n || !n.recipient || n.recipient === n.actor) return;

  const { data: link } = await db.from('telegram_links').select('*').eq('profile_id', n.recipient).maybeSingle();
  if (!link || !link[n.pref]) return;

  if (n.actor) {
    const { data: blk } = await db.from('blocks').select('blocker_id').eq('blocker_id', n.recipient).eq('blocked_id', n.actor).maybeSingle();
    if (blk) return;
  }

  // Заявка «это событие я отправил» — уникальный ключ, второй раз не пройдёт.
  const claim = await db.from('telegram_sent').insert({ event_key: `${table}:${op}:${id}` });
  if (claim.error) return;

  const res = await sendTo(link.chat_id, n.text);
  // 403 — человек заблокировал бота: привязка больше не работает, снимаем её.
  if (!res.ok && res.error_code === 403) {
    await db.from('telegram_links').delete().eq('profile_id', n.recipient);
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    if (url.searchParams.get('setup') === '1') return await setup();
    return json({ ok: true });
  }
  if (req.method !== 'POST') return json({ ok: false }, 405);
  if (!BOT_TOKEN) return json({ ok: false, error: 'не задан секрет TELEGRAM_NOTIFY_BOT_TOKEN' }, 500);

  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => null);
  if (!body) return json({ ok: false }, 400);

  const tgSecret = req.headers.get('x-telegram-bot-api-secret-token');
  if (tgSecret !== null) {
    if (tgSecret !== await webhookSecret()) return json({ ok: false }, 403);
    try { await handleUpdate(body); } catch (e) { console.error(e); }
    return json({ ok: true });
  }

  if (body.kind === 'event' && typeof body.table === 'string' && Number.isFinite(Number(body.id))) {
    try { await handleEvent(body.table, String(body.op ?? 'INSERT'), Number(body.id)); } catch (e) { console.error(e); }
    return json({ ok: true });
  }

  return json({ ok: false }, 400);
});

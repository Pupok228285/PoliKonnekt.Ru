/*
 * Звуковые уведомления, пока вкладка сайта открыта (db/schema_v43.sql,
 * Supabase Realtime). Три категории — комментарии (форум+лента), сообщения,
 * группы; звук и громкость — предпочтение этого браузера (localStorage, как
 * микрофон в Библиотеке), сами категории и приглушение конкретных чатов —
 * настройка аккаунта.
 *
 * Звуки не файлы, а синтезированы через Web Audio API прямо тут — короткие
 * наборы тонов, ничего не скачивается и не хранится на сервере.
 *
 * comments_select_all/replies_select_all/review_comments_select_all у нас
 * публичные (весь форум читает кто угодно) — Realtime присылает ВСЕ новые
 * записи всем подписчикам, «моё это или нет» проверяем сами на клиенте по
 * заранее загруженным id своих тем/постов/отзывов. Сообщения и группы,
 * наоборот, размечены RLS по auth.uid() — Realtime сам не пришлёт чужое.
 * Анонимки сюда не включены: у получателя нет SELECT-доступа к таблице
 * напрямую (это и есть настоящая анонимность), только через RPC — для звука
 * остаётся один Telegram-бот.
 */
(function () {
  var SOUND_KEY = 'pk_notify_sound';
  var VOLUME_KEY = 'pk_notify_volume';
  var DEFAULT_SOUND = 'chime';
  var DEFAULT_VOLUME = 60;

  var SOUNDS = [
    { id: 'classic', label: 'Классический', tones: [
      { freq: 880, dur: .09, type: 'sine' },
      { freq: 660, dur: .12, at: .08, type: 'sine' }
    ] },
    { id: 'chime', label: 'Колокольчик', tones: [
      { freq: 1318, dur: .4, type: 'triangle', peak: .8 },
      { freq: 1975, dur: .35, at: .02, type: 'triangle', peak: .4 }
    ] },
    { id: 'drop', label: 'Капля', tones: [
      { freq: 800, toFreq: 380, dur: .22, type: 'sine' }
    ] },
    { id: 'marimba', label: 'Маримба', tones: [
      { freq: 523, dur: .12, type: 'triangle' },
      { freq: 659, dur: .12, at: .09, type: 'triangle' },
      { freq: 784, dur: .18, at: .18, type: 'triangle' }
    ] },
    { id: 'blip', label: 'Блип', tones: [
      { freq: 1046, dur: .06, type: 'square', peak: .5 }
    ] },
    { id: 'knock', label: 'Тук-тук', tones: [
      { freq: 180, dur: .05, type: 'square', peak: .6 },
      { freq: 180, dur: .05, at: .1, type: 'square', peak: .6 }
    ] },
    { id: 'soft', label: 'Мягкий', tones: [
      { freq: 523, dur: .55, type: 'sine', peak: .6 }
    ] },
    { id: 'glass', label: 'Стекло', tones: [
      { freq: 988, dur: .32, type: 'sine', peak: .7 },
      { freq: 1319, dur: .28, at: .015, type: 'sine', peak: .45 }
    ] },
    { id: 'softpop', label: 'Мягкий поп', tones: [
      { freq: 1800, dur: .02, type: 'sine', peak: .3 },
      { freq: 900, dur: .16, at: .02, type: 'sine', peak: .45 }
    ] },
    { id: 'retro', label: 'Ретро', tones: [
      { freq: 400, dur: .05, type: 'square', peak: .5 },
      { freq: 800, dur: .05, at: .05, type: 'square', peak: .5 },
      { freq: 400, dur: .08, at: .1, type: 'square', peak: .5 }
    ] },
    { id: 'tritone', label: 'Три-тон', tones: [
      { freq: 659, dur: .11, type: 'triangle', peak: .8 },
      { freq: 988, dur: .13, at: .09, type: 'triangle', peak: .8 },
      { freq: 1318, dur: .22, at: .2, type: 'triangle', peak: .7 }
    ] },
    { id: 'whoosh', label: 'Свист', noise: [
      { dur: .22, fromFreq: 500, toFreq: 3200, peak: .5, q: 1.1 }
    ] },
    { id: 'chord', label: 'Аккорд', tones: [
      { freq: 523, dur: .4, type: 'triangle', peak: .5 },
      { freq: 659, dur: .4, type: 'triangle', peak: .45 },
      { freq: 784, dur: .4, type: 'triangle', peak: .4 }
    ] }
  ];
  var SOUNDS_BY_ID = {};
  SOUNDS.forEach(function (s) { SOUNDS_BY_ID[s.id] = s; });

  var audioCtx = null;
  function getCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    return audioCtx;
  }

  // «Свист» (звук отправки в iMessage) — не нота, а отфильтрованный шум с
  // растущей частотой полосы; отдельно от обычных тонов ниже.
  function playNoiseSweep(ctx, dest, startAt, n) {
    var dur = n.dur || 0.25;
    var buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    var noise = ctx.createBufferSource();
    noise.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = n.q || 1.2;
    filter.frequency.setValueAtTime(n.fromFreq || 500, startAt);
    filter.frequency.exponentialRampToValueAtTime(n.toFreq || 3000, startAt + dur);
    var g = ctx.createGain();
    var peak = n.peak == null ? 0.5 : n.peak;
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.linearRampToValueAtTime(peak, startAt + dur * 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    noise.connect(filter);
    filter.connect(g);
    g.connect(dest);
    noise.start(startAt);
    noise.stop(startAt + dur + 0.02);
  }

  function playSound(id, volumePct) {
    var def = SOUNDS_BY_ID[id] || SOUNDS_BY_ID[DEFAULT_SOUND];
    var ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1, (volumePct == null ? DEFAULT_VOLUME : volumePct) / 100));
    master.connect(ctx.destination);
    var startAt = ctx.currentTime + 0.01;
    (def.tones || []).forEach(function (t) {
      var osc = ctx.createOscillator();
      osc.type = t.type || 'sine';
      var g = ctx.createGain();
      var t0 = startAt + (t.at || 0);
      var dur = t.dur || 0.15;
      osc.frequency.setValueAtTime(t.freq, t0);
      if (t.toFreq) osc.frequency.exponentialRampToValueAtTime(t.toFreq, t0 + dur);
      var peak = t.peak == null ? 1 : t.peak;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.01, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    });
    (def.noise || []).forEach(function (n) {
      playNoiseSweep(ctx, master, startAt + (n.at || 0), n);
    });
  }

  function readSound() { try { return localStorage.getItem(SOUND_KEY) || DEFAULT_SOUND; } catch (e) { return DEFAULT_SOUND; } }
  function readVolume() {
    try {
      var raw = localStorage.getItem(VOLUME_KEY);
      if (raw === null) return DEFAULT_VOLUME;
      var v = Number(raw);
      return isNaN(v) ? DEFAULT_VOLUME : v;
    } catch (e) { return DEFAULT_VOLUME; }
  }
  function writeSound(id) { try { localStorage.setItem(SOUND_KEY, id); } catch (e) {} }
  function writeVolume(v) { try { localStorage.setItem(VOLUME_KEY, String(v)); } catch (e) {} }

  window.PKNotifySound = { SOUNDS: SOUNDS, play: playSound, readSound: readSound, readVolume: readVolume, writeSound: writeSound, writeVolume: writeVolume };

  // ---------- реальное время: играть звук на новых событиях ----------
  if (!window.supa) return;

  var myId = null;
  var prefs = { comments: true, messages: true, groups: true };
  var popupEnabled = true;
  var myContentIds = { feed_post: null, quote_post: null, canteen_post: null, artel_post: null, diary_post: null };
  var myTopicIds = null;      // Set: мои темы форума
  var myReviewTopicIds = null; // Set: мои темы отзывов
  var myReviewCommentIds = null; // Set: мои комментарии в отзывах (чтобы поймать ответ на них)
  var myConversationIds = {}; // Set: мои личные переписки
  var myGroupIds = {};        // Set: мои группы
  var mutedGroups = {};       // group_id -> true
  var mutedConvs = {};        // conversation_id -> true
  var channel = null;

  var COMMENT_LINKS = {
    feed_post: function () { return 'index.html#lenta'; },
    quote_post: function () { return 'quotes.html'; },
    canteen_post: function () { return 'canteen.html'; },
    artel_post: function () { return 'artel.html'; },
    diary_post: function () { return 'diary.html'; }
  };
  var COMMENT_ICONS = {
    feed_post: 'img/icons/i-arrow.svg',
    quote_post: 'img/icons/i-quote.svg',
    canteen_post: 'img/icons/i-canteen.svg',
    artel_post: 'img/icons/i-artel.svg',
    diary_post: 'img/icons/i-user.svg'
  };

  // Попап показываем только если включён в настройках и реально загружен
  // модуль; звук — как и раньше, по категориям.
  function notify(categoryFlag, buildToast) {
    if (categoryFlag === false) return;
    playSound(readSound(), readVolume());
    if (popupEnabled && buildToast && window.PKNotifyToast) buildToast();
  }

  function loadMyConversationIds() {
    return window.supa.from('conversations').select('id').or('user_a.eq.' + myId + ',user_b.eq.' + myId).then(function (r) {
      var set = {};
      (r.data || []).forEach(function (row) { set[row.id] = true; });
      myConversationIds = set;
    });
  }

  function loadMyGroupIds() {
    return window.supa.from('chat_group_members').select('group_id').eq('profile_id', myId).then(function (r) {
      var set = {};
      (r.data || []).forEach(function (row) { set[row.group_id] = true; });
      myGroupIds = set;
    });
  }

  function loadIdSet(table, col) {
    return window.supa.from(table).select('id').eq(col, myId).then(function (r) {
      var set = {};
      (r.data || []).forEach(function (row) { set[row.id] = true; });
      return set;
    });
  }

  function refreshMyContentIds() {
    return Promise.all([
      loadIdSet('feed_posts', 'author_id'),
      loadIdSet('quote_posts', 'author_id'),
      loadIdSet('canteen_posts', 'author_id'),
      loadIdSet('artel_posts', 'author_id'),
      loadIdSet('diary_posts', 'author_id'),
      loadIdSet('forum_topics', 'author_id'),
      loadIdSet('review_topics', 'author_id'),
      loadIdSet('review_comments', 'author_id')
    ]).then(function (r) {
      myContentIds.feed_post = r[0];
      myContentIds.quote_post = r[1];
      myContentIds.canteen_post = r[2];
      myContentIds.artel_post = r[3];
      myContentIds.diary_post = r[4];
      myTopicIds = r[5];
      myReviewTopicIds = r[6];
      myReviewCommentIds = r[7];
    });
  }

  function refreshMutes() {
    return Promise.all([
      window.supa.from('dm_mutes').select('conversation_id').eq('profile_id', myId).then(function (r) {
        mutedConvs = {};
        (r.data || []).forEach(function (row) { mutedConvs[row.conversation_id] = true; });
      }),
      window.supa.from('chat_group_members').select('group_id, muted').eq('profile_id', myId).then(function (r) {
        mutedGroups = {};
        (r.data || []).forEach(function (row) { if (row.muted) mutedGroups[row.group_id] = true; });
      })
    ]);
  }
  // Другие вкладки/страницы сайта меняют список приглушённых — перечитываем
  // при возврате на вкладку, не держим фоновый опрос.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && myId) refreshMutes();
  });
  window.PKNotifyRefreshMutes = function () { if (myId) refreshMutes(); };

  // Явная проверка участия (myConversationIds/myGroupIds) обязательна:
  // staff теперь по RLS видит ЛЮБУЮ переписку (db/schema_v48.sql, досье
  // "Чаты/Группы"), Realtime поэтому пришлёт админу вообще все личные
  // сообщения и все группы сайта, если не отфильтровать самим на клиенте.
  function onMessageInsert(row) {
    if (row.sender_id === myId) return;
    if (!myConversationIds[row.conversation_id]) return;
    if (mutedConvs[row.conversation_id]) return;
    notify(prefs.messages, function () {
      window.supa.from('profiles').select('nickname, avatar_url').eq('id', row.sender_id).single().then(function (r) {
        var p = r.data || {};
        window.PKNotifyToast.show({
          title: p.nickname || 'Сообщение',
          body: row.body || (row.photo_path ? '📷 фото' : ''),
          avatar: p.avatar_url,
          href: 'messages.html?conv=' + row.conversation_id,
          reply: { table: 'messages', payload: { conversation_id: row.conversation_id, sender_id: myId } }
        });
      });
    });
  }

  function onGroupMessageInsert(row) {
    if (row.sender_id === myId) return;
    if (!myGroupIds[row.group_id]) return;
    if (mutedGroups[row.group_id]) return;
    notify(prefs.groups, function () {
      Promise.all([
        window.supa.from('chat_groups').select('title').eq('id', row.group_id).single(),
        window.supa.from('profiles').select('nickname, avatar_url').eq('id', row.sender_id).single()
      ]).then(function (res) {
        var g = (res[0] && res[0].data) || {};
        var p = (res[1] && res[1].data) || {};
        window.PKNotifyToast.show({
          title: (g.title || 'Группа') + (p.nickname ? ' · ' + p.nickname : ''),
          body: row.body || (row.photo_path ? '📷 фото' : ''),
          avatar: p.avatar_url,
          href: 'messages.html?group=' + row.group_id,
          reply: { table: 'chat_group_messages', payload: { group_id: row.group_id, sender_id: myId } }
        });
      });
    });
  }

  function onForumReplyInsert(row) {
    if (row.author_id === myId) return;
    if (!myTopicIds || !myTopicIds[row.topic_id]) return;
    notify(prefs.comments, function () {
      window.supa.from('forum_topics').select('title').eq('id', row.topic_id).single().then(function (r) {
        var title = r.data && r.data.title;
        window.PKNotifyToast.show({
          title: 'Новый ответ в теме' + (title ? ' «' + title + '»' : ''),
          body: row.body || '',
          icon: 'img/icons/i-feed.svg',
          href: 'forum-topic.html?id=' + row.topic_id
        });
      });
    });
  }

  function onCommentInsert(row) {
    if (row.author_id === myId) return;
    var mine = myContentIds[row.content_type];
    if (!mine || !mine[row.content_id]) return;
    notify(prefs.comments, function () {
      var link = COMMENT_LINKS[row.content_type];
      window.PKNotifyToast.show({
        title: 'Новый комментарий к вашей записи',
        body: row.body || '',
        icon: COMMENT_ICONS[row.content_type],
        href: link ? link() : 'index.html'
      });
    });
  }

  function onReviewCommentInsert(row) {
    if (row.author_id === myId) return;
    var aboutMine = row.parent_id
      ? (myReviewCommentIds && myReviewCommentIds[row.parent_id])
      : (myReviewTopicIds && myReviewTopicIds[row.topic_id]);
    if (!aboutMine) return;
    notify(prefs.comments, function () {
      window.PKNotifyToast.show({
        title: row.parent_id ? 'Ответ на ваш комментарий в Отзывах' : 'Новый комментарий в Отзывах',
        body: row.body || '',
        icon: 'img/icons/i-reviews.svg',
        href: 'review-topic.html?id=' + row.topic_id
      });
    });
  }

  // Подарок ника — не обычный тост: на весь экран, с «фейерверком» из
  // эмодзи (в духе телеграмовских стикеров) на 5 секунд, и сразу кнопками
  // принять/отклонить/отложить — получателю сначала надо согласиться,
  // владение переходит только после «Принять» (см. respond_nickname_gift).
  var GIFT_EMOJIS = ['🎉', '✨', '🎊', '🎁', '⭐', '💫'];

  function showGiftCelebration(gift, onClose) {
    if (document.querySelector('.gift-overlay[data-gift-id="' + gift.id + '"]')) return; // уже показан
    var overlay = document.createElement('div');
    overlay.className = 'gift-overlay';
    overlay.setAttribute('data-gift-id', String(gift.id));

    var fireworks = document.createElement('div');
    fireworks.className = 'gift-fireworks';
    for (var i = 0; i < 36; i++) {
      var p = document.createElement('span');
      p.className = 'gift-particle';
      p.textContent = GIFT_EMOJIS[Math.floor(Math.random() * GIFT_EMOJIS.length)];
      p.style.left = Math.round(Math.random() * 100) + 'vw';
      p.style.fontSize = Math.round(16 + Math.random() * 20) + 'px';
      p.style.animationDelay = (Math.random() * 1.2).toFixed(2) + 's';
      p.style.animationDuration = (2.2 + Math.random() * 1.6).toFixed(2) + 's';
      fireworks.appendChild(p);
    }
    overlay.appendChild(fireworks);
    setTimeout(function () { fireworks.innerHTML = ''; }, 5000); // сам фейерверк — 5 секунд, карточка остаётся

    var card = document.createElement('div');
    card.className = 'gift-card';
    var h2 = document.createElement('h2');
    h2.textContent = '🎁 Вам подарили имя!';
    var p1 = document.createElement('p');
    p1.appendChild(document.createTextNode(gift.fromNick + ' передал(а) вам ник '));
    var b = document.createElement('span');
    b.className = 'gift-nick';
    b.textContent = '«' + gift.nickname + '»';
    p1.appendChild(b);
    var status = document.createElement('p');
    status.className = 'hint';
    var actions = document.createElement('div');
    actions.className = 'gift-actions';

    function close() {
      overlay.remove();
      if (onClose) onClose();
    }

    function respond(accept) {
      window.supa.rpc('respond_nickname_gift', { p_gift_id: gift.id, p_accept: accept }).then(function (res) {
        if (res.error) { status.textContent = res.error.message; status.style.color = '#b23e00'; return; }
        close();
      });
    }

    var acceptBtn = document.createElement('button');
    acceptBtn.className = 'submit'; acceptBtn.type = 'button'; acceptBtn.textContent = 'Принять';
    acceptBtn.addEventListener('click', function () { respond(true); });
    var declineBtn = document.createElement('button');
    declineBtn.className = 'submit'; declineBtn.type = 'button'; declineBtn.textContent = 'Отклонить';
    declineBtn.addEventListener('click', function () {
      window.pkConfirm ? window.pkConfirm('Отклонить ник «' + gift.nickname + '»?', function () { respond(false); }) : respond(false);
    });
    var laterBtn = document.createElement('button');
    laterBtn.className = 'submit'; laterBtn.type = 'button'; laterBtn.textContent = 'Позже';
    laterBtn.title = 'Подарок останется ждать в вашем профиле';
    laterBtn.addEventListener('click', close);

    actions.appendChild(acceptBtn); actions.appendChild(declineBtn); actions.appendChild(laterBtn);
    card.appendChild(h2); card.appendChild(p1); card.appendChild(status); card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function onNicknameGiftInsert(row) {
    if (row.to_id !== myId) return;
    window.supa.from('profiles').select('nickname').eq('id', row.from_id).single().then(function (r) {
      var fromNick = (r.data && r.data.nickname) || 'Кто-то';
      playSound(readSound(), readVolume());
      showGiftCelebration({ id: row.id, nickname: row.nickname, fromNick: fromNick });
    });
  }

  // Не только «вживую» (пока вы на сайте в момент дарения) — подарок,
  // на который ещё не ответили, встречает фейерверком на КАЖДОЙ странице
  // при каждом заходе, пока не нажали принять/отклонить (Телеграм делает
  // так же со стикерами-подарками). «Позже» просто закрывает карточку —
  // статус остаётся pending, и она всплывёт заново на следующей странице.
  function showPendingGiftsOneByOne(gifts, i) {
    if (i >= gifts.length) return;
    var row = gifts[i];
    window.supa.from('profiles').select('nickname').eq('id', row.from_id).single().then(function (r) {
      var fromNick = (r.data && r.data.nickname) || 'Кто-то';
      showGiftCelebration({ id: row.id, nickname: row.nickname, fromNick: fromNick }, function () {
        showPendingGiftsOneByOne(gifts, i + 1);
      });
    });
  }

  function checkPendingGifts() {
    window.supa.from('nickname_gifts').select('id, nickname, from_id')
      .eq('to_id', myId).eq('status', 'pending').order('created_at', { ascending: true })
      .then(function (res) {
        if (res.data && res.data.length) showPendingGiftsOneByOne(res.data, 0);
      });
  }

  function onLostfoundReminderInsert(row) {
    if (row.author_id !== myId) return;
    window.supa.from('lost_found_posts').select('title').eq('id', row.lostfound_id).single().then(function (r) {
      var title = r.data && r.data.title;
      notify(true, function () {
        window.PKNotifyToast.show({
          title: 'Напоминание о Потеряшках',
          body: 'Прошло 3 дня с публикации' + (title ? ' «' + title + '»' : '') + ' — ещё актуально? Отметьте или подтвердите на странице.',
          icon: 'img/icons/i-lost.svg',
          href: 'lostfound.html'
        });
      });
    });
  }

  function subscribe() {
    if (channel) window.supa.removeChannel(channel);
    channel = window.supa.channel('site-notify-' + myId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, function (p) { onMessageInsert(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_group_messages' }, function (p) { onGroupMessageInsert(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_replies' }, function (p) { onForumReplyInsert(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, function (p) { onCommentInsert(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'review_comments' }, function (p) { onReviewCommentInsert(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nickname_gifts' }, function (p) { onNicknameGiftInsert(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lostfound_reminders' }, function (p) { onLostfoundReminderInsert(p.new); })
      .subscribe();
  }

  function init() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (channel) { window.supa.removeChannel(channel); channel = null; }
      if (!session) { myId = null; return; }
      myId = session.user.id;
      window.supa.from('profiles').select('sound_notify_comments, sound_notify_messages, sound_notify_groups, popup_notify_enabled')
        .eq('id', myId).single().then(function (r) {
          if (r.data) {
            prefs.comments = r.data.sound_notify_comments !== false;
            prefs.messages = r.data.sound_notify_messages !== false;
            prefs.groups = r.data.sound_notify_groups !== false;
            popupEnabled = r.data.popup_notify_enabled !== false;
          }
        });
      refreshMyContentIds();
      refreshMutes();
      loadMyConversationIds();
      loadMyGroupIds();
      subscribe();
      checkPendingGifts();
    });
  }

  init();
  window.supa.auth.onAuthStateChange(init);
})();

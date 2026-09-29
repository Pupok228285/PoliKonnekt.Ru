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
    { id: 'retro', label: 'Ретро', tones: [
      { freq: 400, dur: .05, type: 'square', peak: .5 },
      { freq: 800, dur: .05, at: .05, type: 'square', peak: .5 },
      { freq: 400, dur: .08, at: .1, type: 'square', peak: .5 }
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

  function playSound(id, volumePct) {
    var def = SOUNDS_BY_ID[id] || SOUNDS_BY_ID[DEFAULT_SOUND];
    var ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1, (volumePct == null ? DEFAULT_VOLUME : volumePct) / 100));
    master.connect(ctx.destination);
    var startAt = ctx.currentTime + 0.01;
    def.tones.forEach(function (t) {
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

  function ding(categoryFlag) {
    if (categoryFlag === false) return; // настройка аккаунта — не присылать эту категорию
    playSound(readSound(), readVolume());
  }

  var myId = null;
  var prefs = { comments: true, messages: true, groups: true };
  var myContentIds = { feed_post: null, quote_post: null, canteen_post: null, artel_post: null, diary_post: null };
  var myTopicIds = null;      // Set: мои темы форума
  var myReviewTopicIds = null; // Set: мои темы отзывов
  var myReviewCommentIds = null; // Set: мои комментарии в отзывах (чтобы поймать ответ на них)
  var mutedGroups = {};       // group_id -> true
  var mutedConvs = {};        // conversation_id -> true
  var channel = null;

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

  function onMessageInsert(row) {
    if (row.sender_id === myId) return;
    if (mutedConvs[row.conversation_id]) return;
    ding(prefs.messages);
  }

  function onGroupMessageInsert(row) {
    if (row.sender_id === myId) return;
    if (mutedGroups[row.group_id]) return;
    ding(prefs.groups);
  }

  function onForumReplyInsert(row) {
    if (row.author_id === myId) return;
    if (!myTopicIds || !myTopicIds[row.topic_id]) return;
    ding(prefs.comments);
  }

  function onCommentInsert(row) {
    if (row.author_id === myId) return;
    var mine = myContentIds[row.content_type];
    if (!mine || !mine[row.content_id]) return;
    ding(prefs.comments);
  }

  function onReviewCommentInsert(row) {
    if (row.author_id === myId) return;
    var aboutMine = row.parent_id
      ? (myReviewCommentIds && myReviewCommentIds[row.parent_id])
      : (myReviewTopicIds && myReviewTopicIds[row.topic_id]);
    if (!aboutMine) return;
    ding(prefs.comments);
  }

  function subscribe() {
    if (channel) window.supa.removeChannel(channel);
    channel = window.supa.channel('site-notify-' + myId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, function (p) { onMessageInsert(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_group_messages' }, function (p) { onGroupMessageInsert(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_replies' }, function (p) { onForumReplyInsert(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, function (p) { onCommentInsert(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'review_comments' }, function (p) { onReviewCommentInsert(p.new); })
      .subscribe();
  }

  function init() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (channel) { window.supa.removeChannel(channel); channel = null; }
      if (!session) { myId = null; return; }
      myId = session.user.id;
      window.supa.from('profiles').select('sound_notify_comments, sound_notify_messages, sound_notify_groups')
        .eq('id', myId).single().then(function (r) {
          if (r.data) {
            prefs.comments = r.data.sound_notify_comments !== false;
            prefs.messages = r.data.sound_notify_messages !== false;
            prefs.groups = r.data.sound_notify_groups !== false;
          }
        });
      refreshMyContentIds();
      refreshMutes();
      subscribe();
    });
  }

  init();
  window.supa.auth.onAuthStateChange(init);
})();

/*
 * Строка "последняя активность" под меню — раньше на каждой странице был
 * захардкожен свой придуманный человек и текст ("Стас: кто-нибудь отдаёт
 * микроволновку" и т.п.). Теперь — самая свежая настоящая запись по всему
 * сайту (Лента/Форум/Цитаты и Креатив/Столовая/К'Артель/Дневник/Услуги и
 * Вещи/Потеряшки), один параллельный запрос по всем разделам.
 */
(function () {
  if (!window.supa) return;

  var nameEl = document.getElementById('urlo');
  var textEl = document.getElementById('urlo2');
  if (!nameEl || !textEl) return;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function snippet(s, n) {
    s = (s || '').trim();
    n = n || 60;
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  var SOURCES = [
    { table: 'feed_posts', select: 'id, body, created_at, profiles(nickname)', icon: 'i-arrow.svg',
      verb: function () { return 'написал(а) в Ленте'; }, body: function (r) { return r.body; } },
    { table: 'forum_replies', select: 'id, body, created_at, profiles(nickname)', icon: 'i-feed.svg',
      verb: function () { return 'ответил(а) на форуме'; }, body: function (r) { return r.body; } },
    { table: 'forum_topics', select: 'id, title, created_at, profiles(nickname)', icon: 'i-feed.svg',
      verb: function () { return 'создал(а) тему на форуме'; }, body: function (r) { return r.title; } },
    { table: 'quote_posts', select: 'id, body, kind, created_at, profiles(nickname)', icon: 'i-quote.svg',
      verb: function (r) { return r.kind === 'creative' ? 'поделился(лась) креативом' : 'добавил(а) цитату'; }, body: function (r) { return r.body; } },
    { table: 'canteen_posts', select: 'id, body, created_at, profiles(nickname)', icon: 'i-canteen.svg',
      verb: function () { return 'написал(а) в Столовой'; }, body: function (r) { return r.body; } },
    { table: 'artel_posts', select: 'id, body, created_at, profiles(nickname)', icon: 'i-artel.svg',
      verb: function () { return 'написал(а) на стене артели'; }, body: function (r) { return r.body; } },
    { table: 'diary_posts', select: 'id, title, body, created_at, profiles(nickname)', icon: 'i-user.svg',
      verb: function () { return 'написал(а) в Дневнике'; }, body: function (r) { return r.title || r.body; } },
    { table: 'listings', select: 'id, title, kind, created_at, profiles(nickname)', icon: 'i-service.svg',
      verb: function (r) { return r.kind === 'thing' ? 'разместил(а) вещь' : 'разместил(а) услугу'; }, body: function (r) { return r.title; } },
    { table: 'lost_found_posts', select: 'id, title, kind, created_at, profiles(nickname)', icon: 'i-lost.svg',
      verb: function (r) { return r.kind === 'found' ? 'нашёл(нашла)' : 'потерял(а)'; }, body: function (r) { return r.title; } }
  ];

  Promise.all(SOURCES.map(function (src) {
    return window.supa.from(src.table).select(src.select).order('created_at', { ascending: false }).limit(1)
      .then(function (res) {
        var row = res.data && res.data[0];
        return row ? { row: row, src: src } : null;
      })
      .catch(function () { return null; });
  })).then(function (results) {
    var found = results.filter(Boolean).sort(function (a, b) {
      return new Date(b.row.created_at) - new Date(a.row.created_at);
    });
    if (!found.length) {
      nameEl.innerHTML = '<b>ПолиКоннект</b>';
      textEl.textContent = 'Пока на сайте тихо — будьте первым.';
      return;
    }
    var best = found[0];
    var prof = best.row.profiles || {};
    var nick = prof.nickname || 'Студент';
    nameEl.innerHTML = '<b>' + escapeHtml(nick) + '</b> (' + fmtTime(best.row.created_at) + ')';
    textEl.innerHTML = escapeHtml(best.src.verb(best.row)) + ': «' + escapeHtml(snippet(best.src.body(best.row))) + '»' +
      ' <img src="img/icons/' + best.src.icon + '" width="16" height="16" alt="">';
  });
})();

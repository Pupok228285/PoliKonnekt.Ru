/*
 * Кто заходил на сайт сегодня — по profiles.last_seen_at (его обновляет
 * presence.js). Кто включил невидимку в Настройках (hide_online), сюда не
 * попадает — как и в «онлайн» на главной (site-stats.js).
 */
(function () {
  if (!window.supa) return;

  var countEl = document.getElementById('visitorsCount');
  var listEl = document.getElementById('visitorsList');
  if (!countEl) return;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function pluralForm(n, one, few, many) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  var startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  window.supa.from('profiles').select('id, nickname')
    .gte('last_seen_at', startOfDay.toISOString())
    .eq('hide_online', false)
    .order('last_seen_at', { ascending: false })
    .then(function (res) {
      if (res.error) { countEl.textContent = 'Не удалось загрузить.'; return; }
      var rows = res.data || [];
      if (!rows.length) { countEl.textContent = 'Сегодня ещё никто не заходил.'; return; }
      countEl.textContent = 'Сегодня на сайте ' +
        pluralForm(rows.length, 'побывал', 'побывали', 'побывали') + ' ' + rows.length + ' ' +
        pluralForm(rows.length, 'пользователь', 'пользователя', 'пользователей');
      if (listEl) {
        listEl.innerHTML = rows.map(function (p) {
          return '<a href="profile.html?id=' + p.id + '">' + escapeHtml(p.nickname) + '</a>';
        }).join(', ');
      }
    });
})();

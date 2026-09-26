/*
 * Список тех, кто заходил на сайт сегодня — по profiles.last_seen_at
 * (обновляет presence.js на каждой странице для вошедших). Публичная
 * страница, как и остальной список участников — своя же политика
 * profiles_select_all это уже разрешает.
 */
(function () {
  if (!window.supa) return;

  var body = document.getElementById('visitorsBody');
  var countEl = document.getElementById('visitorsCount');
  if (!body) return;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  var startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  window.supa.from('profiles').select('id, nickname, last_seen_at')
    .gte('last_seen_at', startOfDay.toISOString())
    .order('last_seen_at', { ascending: false })
    .then(function (res) {
      if (res.error) { body.innerHTML = '<tr><td colspan="2" class="hint" style="padding:8px">Не удалось загрузить.</td></tr>'; return; }
      var rows = res.data || [];
      if (countEl) countEl.textContent = '(' + rows.length + ')';
      if (!rows.length) { body.innerHTML = '<tr><td colspan="2" class="hint" style="padding:8px">Сегодня ещё никто не заходил.</td></tr>'; return; }
      body.innerHTML = rows.map(function (p) {
        return '<tr><td><a href="profile.html?id=' + p.id + '">' + escapeHtml(p.nickname) + '</a></td><td>' + fmtTime(p.last_seen_at) + '</td></tr>';
      }).join('');
    });
})();

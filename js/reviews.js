/*
 * Отзывы — каталог разделов (аналог forum.html, но своя таблица
 * review_topics). Разделов ровно три, зашиты как в схеме (db/schema_v22.sql),
 * счётчики тем — настоящие, не нарисованные.
 */
(function () {
  if (!window.supa) return;

  var SECTIONS = [
    { name: 'Преподаватели', icon: 'i-user.svg', desc: 'Кто хорошо объясняет, кто заваливает — по-честному, с именем и предметом.' },
    { name: 'Корпуса и аудитории', icon: 'i-service.svg', desc: 'Где сесть, что сломано, куда лучше не соваться в пятницу.' },
    { name: 'Дисциплины и курсы', icon: 'i-doc.svg', desc: 'Какие курсы того стоят, а какие — для галочки.' }
  ];

  var body = document.getElementById('sectionsBody');
  if (!body) return;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' - ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  Promise.all(SECTIONS.map(function (s) {
    return window.supa.from('review_topics').select('created_at').eq('section', s.name).order('created_at', { ascending: false })
      .then(function (res) { return { count: (res.data || []).length, last: res.data && res.data[0] ? res.data[0].created_at : null, error: res.error }; });
  })).then(function (results) {
    body.innerHTML = '';
    SECTIONS.forEach(function (s, i) {
      var r = results[i];
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="row2 ic"><img src="img/icons/' + s.icon + '" alt=""></td>' +
        '<td class="row1"><a class="ttl" href="reviews-section.html?name=' + encodeURIComponent(s.name) + '">' + escapeHtml(s.name) + '</a><span class="desc">' + escapeHtml(s.desc) + '</span></td>' +
        '<td class="row2 c">' + (r.error ? '—' : r.count) + '</td>' +
        '<td class="row1 upd hide-m">' + (r.last ? fmtDateTime(r.last) : '—') + '</td>';
      body.appendChild(tr);
    });
  });
})();

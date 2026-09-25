/*
 * Список тем внутри одного раздела отзывов (?name=...) — промежуточный
 * уровень между reviews.html и review-topic.html. Раздел — просто текст в
 * review_topics.section (проверяется constraint'ом в базе), как и в форуме.
 */
(function () {
  if (!window.supa) return;

  var sectionName = new URLSearchParams(window.location.search).get('name') || '';

  var crumbHere = document.getElementById('crumbHere');
  var sectionTitle = document.getElementById('sectionTitle');
  var sbSectionName = document.getElementById('sbSectionName');
  var sbTopicCount = document.getElementById('sbTopicCount');
  var topicsBody = document.getElementById('topicsBody');
  var newTopicBtn = document.getElementById('newTopicBtn');
  var newTopicForm = document.getElementById('newTopicForm');
  var newTopicTitle = document.getElementById('newTopicTitle');
  var newTopicBody = document.getElementById('newTopicBody');
  var newTopicSubmit = document.getElementById('newTopicSubmit');
  var newTopicHint = document.getElementById('newTopicHint');

  document.title = sectionName + ' — Отзывы — ПолиКоннект.ru';
  if (crumbHere) crumbHere.textContent = sectionName || 'Раздел';
  if (sectionTitle) sectionTitle.textContent = sectionName || 'Раздел';
  if (sbSectionName) sbSectionName.textContent = sectionName || '—';

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

  function setHint(text, ok) {
    if (!newTopicHint) return;
    newTopicHint.textContent = text || '';
    newTopicHint.style.color = ok == null ? '' : (ok ? '#1d7813' : '#b23e00');
  }

  function loadTopics() {
    window.supa.from('review_topics')
      .select('id, title, score, comment_count, created_at, profiles!author_id(id, nickname, verified)')
      .eq('section', sectionName)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error || !res.data) {
          topicsBody.innerHTML = '<tr><td colspan="6" class="hint" style="padding:8px">Не удалось загрузить.</td></tr>';
          return;
        }
        if (sbTopicCount) sbTopicCount.textContent = res.data.length;
        if (!res.data.length) {
          topicsBody.innerHTML = '<tr><td colspan="6" class="hint" style="padding:8px">Пока ни одной темы — создайте первую.</td></tr>';
          return;
        }
        topicsBody.innerHTML = '';
        res.data.forEach(function (t) { topicsBody.appendChild(renderRow(t)); });
      });
  }

  function renderRow(t) {
    var tr = document.createElement('tr');
    var prof = t.profiles || {};
    var nickname = prof.nickname || '?';
    var tick = prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="" title="Студент подтверждён">' : '';
    var nickHtml = prof.id
      ? '<a class="nick' + (prof.verified ? ' ok' : '') + '" href="profile.html?id=' + prof.id + '">' + escapeHtml(nickname) + '</a>'
      : '<span class="nick' + (prof.verified ? ' ok' : '') + '">' + escapeHtml(nickname) + '</span>';
    var score = t.score || 0;
    tr.innerHTML =
      '<td class="row2 ic"><img src="img/icons/i-reviews.svg" alt=""></td>' +
      '<td class="row1"><a class="ttl" href="review-topic.html?id=' + t.id + '">' + escapeHtml(t.title) + '</a></td>' +
      '<td class="row2">' + nickHtml + tick + '</td>' +
      '<td class="row1 c hide-m">' + (score > 0 ? '+' : '') + score + '</td>' +
      '<td class="row2 c hide-m">' + (t.comment_count || 0) + '</td>' +
      '<td class="row1 upd hide-m">' + fmtDateTime(t.created_at) + '</td>';
    return tr;
  }

  if (newTopicBtn) {
    newTopicBtn.addEventListener('click', function () {
      window.supa.auth.getSession().then(function (res) {
        if (!res.data || !res.data.session) { alert('Сначала войдите вверху страницы.'); return; }
        newTopicForm.style.display = newTopicForm.style.display === 'none' ? 'block' : 'none';
      });
    });
  }

  if (newTopicSubmit) {
    newTopicSubmit.addEventListener('click', function () {
      var title = (newTopicTitle.value || '').trim();
      var body = (newTopicBody.value || '').trim();
      if (!title || !body) { setHint('Заполните заголовок и текст отзыва.', false); return; }
      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) { setHint('Сначала войдите вверху страницы.', false); return; }
        newTopicSubmit.disabled = true;
        setHint('Создаём тему...', true);
        window.supa.from('review_topics')
          .insert({ section: sectionName, title: title, body: body, author_id: session.user.id })
          .select('id')
          .single()
          .then(function (res2) {
            newTopicSubmit.disabled = false;
            if (res2.error) { setHint(res2.error.message, false); return; }
            window.location.href = 'review-topic.html?id=' + res2.data.id;
          });
      });
    });
  }

  loadTopics();
})();

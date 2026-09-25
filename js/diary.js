/*
 * Дневники — личный блог в духе ЖЖ: без ?id= общая лента всех записей,
 * с ?id=UID — дневник одного человека. Механика 1-в-1 как у Ленты/Цитат
 * (votes+comments), только заголовок необязателен.
 */
(function () {
  if (!window.supa) return;

  var listEl = document.getElementById('diaryList');
  if (!listEl) return;

  var userId = new URLSearchParams(window.location.search).get('id');
  var composer = document.getElementById('diaryComposer');
  var titleInput = document.getElementById('diaryTitleInput');
  var bodyInput = document.getElementById('diaryBodyInput');
  var statusEl = document.getElementById('diaryStatus');
  var pageTitle = document.getElementById('pageTitle');
  var crumbCurrent = document.getElementById('crumbCurrent');
  var sbNote = document.getElementById('sbNote');

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' - ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function renderPost(row) {
    var prof = row.profiles || {};
    var nick = prof.nickname || 'студент';
    var initial = nick.charAt(0).toUpperCase();
    var tick = prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="" title="Студент подтверждён">' : '';
    var nickHtml = prof.id ? '<a class="nick" href="profile.html?id=' + prof.id + '">' + escapeHtml(nick) + '</a>' : '<span class="nick">' + escapeHtml(nick) + '</span>';
    var div = document.createElement('div');
    div.className = 'post';
    div.innerHTML =
      '<div class="who">' + nickHtml + tick + '<span class="av">' + escapeHtml(initial) + '</span></div>' +
      '<div class="top"><span class="no">' + (row.title ? escapeHtml(row.title) : ('Запись &#8470;' + row.id)) + '</span><span>' + fmtDate(row.created_at) + '</span></div>' +
      '<div class="body">' + escapeHtml(row.body).replace(/\n/g, '<br>') + '</div>' +
      '<div class="acts">' +
        '<span class="vote-widget" data-vtype="diary_post" data-vid="' + row.id + '">' +
          '<button type="button" class="vote-up" title="В плюс репутации">&#9650;</button>' +
          '<b class="vote-score">' + (row.score || 0) + '</b>' +
          '<button type="button" class="vote-down" title="В минус репутации">&#9660;</button>' +
        '</span>' +
        '<a href="#" class="comment-toggle" data-ctype="diary_post" data-cid="' + row.id + '">Комментарии (' + (row.comment_count || 0) + ')</a>' +
        '<a href="#">Пожаловаться</a>' +
      '</div>';
    return div;
  }

  if (userId) {
    window.supa.from('profiles').select('nickname').eq('id', userId).single().then(function (res) {
      var nick = res.data ? (res.data.nickname || '?') : '?';
      pageTitle.textContent = 'Дневник: ' + nick;
      document.title = pageTitle.textContent + ' — ПолиКоннект.ru';
      if (crumbCurrent) { crumbCurrent.hidden = false; crumbCurrent.textContent = ' → ' + pageTitle.textContent; }
      if (sbNote) sbNote.textContent = 'Записи только этого человека. Общая лента — по ссылке «Дневник» в шапке.';
    });
  }

  function loadFeed() {
    var q = window.supa.from('diary_posts')
      .select('id, title, body, created_at, score, comment_count, profiles(id, nickname, verified)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (userId) q = q.eq('author_id', userId);
    q.then(function (res) {
      if (res.error) { listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Не удалось загрузить.</p>'; return; }
      listEl.innerHTML = '';
      if (!res.data.length) {
        listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Здесь пока пусто' + (userId ? '.' : ' — напишите первыми.') + '</p>';
      } else {
        res.data.forEach(function (row) { listEl.appendChild(renderPost(row)); });
      }
      if (window.PKSocial) window.PKSocial.scan(listEl);
    });
  }

  if (userId && composer) {
    composer.hidden = true; // на чужом дневнике не пишем прямо туда
    var composerTitle = document.getElementById('diaryComposerTitle');
    if (composerTitle) composerTitle.hidden = true;
  }

  loadFeed();

  if (composer) {
    composer.addEventListener('submit', function (e) {
      e.preventDefault();
      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) {
          statusEl.innerHTML = '<span style="color:#b23e00">Сначала войдите или зарегистрируйтесь вверху страницы</span>';
          return;
        }
        var body = (bodyInput.value || '').trim();
        if (!body) return;
        var title = (titleInput.value || '').trim() || null;
        window.supa.from('diary_posts').insert({ author_id: session.user.id, title: title, body: body }).then(function (res2) {
          if (res2.error) { statusEl.innerHTML = '<span style="color:#b23e00">' + escapeHtml(res2.error.message) + '</span>'; return; }
          titleInput.value = ''; bodyInput.value = '';
          statusEl.innerHTML = '<span style="color:#1d7813">Опубликовано.</span>';
          loadFeed();
        });
      });
    });
  }
})();

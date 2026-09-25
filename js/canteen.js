/*
 * Столовая — общий чат сайта, отдельная лента от «Ленты» на главной (своя
 * таблица canteen_posts). Механика один в один как у js/feed.js.
 */
(function () {
  if (!window.supa) return;

  var listEl = document.getElementById('canteenList');
  if (!listEl) return;

  var composer = document.getElementById('canteenComposer');
  var textEl = document.getElementById('canteenText');
  var statusEl = document.getElementById('canteenStatus');

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
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
      '<div class="who">' +
        nickHtml + tick +
        '<span class="av">' + escapeHtml(initial) + '</span>' +
      '</div>' +
      '<div class="top"><span class="no">Пост &#8470;' + row.id + '</span><span>' + fmtDate(row.created_at) + '</span></div>' +
      '<div class="body">' + escapeHtml(row.body).replace(/\n/g, '<br>') + '</div>' +
      '<div class="acts">' +
        '<span class="vote-widget" data-vtype="canteen_post" data-vid="' + row.id + '">' +
          '<button type="button" class="vote-up" title="В плюс репутации">&#9650;</button>' +
          '<b class="vote-score">' + (row.score || 0) + '</b>' +
          '<button type="button" class="vote-down" title="В минус репутации">&#9660;</button>' +
        '</span>' +
        '<a href="#" class="comment-toggle" data-ctype="canteen_post" data-cid="' + row.id + '">Комментарии (' + (row.comment_count || 0) + ')</a>' +
        '<a href="#">Пожаловаться</a>' +
      '</div>';
    return div;
  }

  function loadFeed() {
    window.supa.from('canteen_posts')
      .select('id, body, created_at, score, comment_count, profiles(id, nickname, verified)')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(function (res) {
        if (res.error) { listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Не удалось загрузить.</p>'; return; }
        listEl.innerHTML = '';
        if (!res.data.length) {
          listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Здесь пока пусто — напишите первыми.</p>';
          return;
        }
        res.data.forEach(function (row) { listEl.appendChild(renderPost(row)); });
        if (window.PKSocial) window.PKSocial.scan(listEl);
      });
  }

  loadFeed();

  if (composer) {
    composer.addEventListener('submit', function (e) {
      e.preventDefault();
      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) {
          if (statusEl) statusEl.innerHTML = '<span style="color:#b23e00">Сначала войдите или зарегистрируйтесь вверху страницы</span>';
          return;
        }
        var text = (textEl.value || '').trim();
        if (!text) return;
        window.supa.from('canteen_posts').insert({ author_id: session.user.id, body: text }).then(function (res2) {
          if (res2.error) {
            if (statusEl) statusEl.innerHTML = '<span style="color:#b23e00">' + escapeHtml(res2.error.message) + '</span>';
            return;
          }
          textEl.value = '';
          if (statusEl) statusEl.innerHTML = '<span style="color:#1d7813">Опубликовано.</span>';
          loadFeed();
        });
      });
    });
  }
})();

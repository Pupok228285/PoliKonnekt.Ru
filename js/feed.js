/*
 * Живая Лента на главной странице — посты по-настоящему пишутся в Supabase
 * и переживают обновление страницы. Первая проверка, что бэкенд реально работает.
 */
(function () {
  if (!window.supa) { console.error('feed: supa client не инициализирован'); return; }

  var listEl = document.getElementById('feedList');
  if (!listEl) return; // на этой странице ленты нет

  var composer = document.getElementById('feedComposer');
  var textEl = document.getElementById('feedText');
  var feedStatusEl = document.getElementById('feedStatus');

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
        '<span class="vote-widget" data-vtype="feed_post" data-vid="' + row.id + '">' +
          '<button type="button" class="vote-up" title="В плюс репутации">&#9650;</button>' +
          '<b class="vote-score">' + (row.score || 0) + '</b>' +
          '<button type="button" class="vote-down" title="В минус репутации">&#9660;</button>' +
        '</span>' +
        '<a href="#" class="comment-toggle" data-ctype="feed_post" data-cid="' + row.id + '">Комментарии (' + (row.comment_count || 0) + ')</a>' +
        '<a href="#" class="fav-toggle" data-ftype="feed_post" data-fid="' + row.id + '">В избранное</a><a href="#">Пожаловаться</a>' +
      '</div>';
    return div;
  }

  function loadFeed() {
    window.supa.from('feed_posts')
      .select('id, body, created_at, score, comment_count, profiles(id, nickname, verified)')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(function (res) {
        if (res.error) {
          console.error('feed load error', res.error);
          listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Не удалось загрузить ленту.</p>';
          return;
        }
        listEl.innerHTML = '';
        if (!res.data.length) {
          listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Здесь пока пусто — напишите первый настоящий пост.</p>';
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
          if (feedStatusEl) { feedStatusEl.innerHTML = '<span style="color:#b23e00">Сначала войдите или зарегистрируйтесь вверху страницы</span>'; }
          return;
        }
        var text = (textEl.value || '').trim();
        if (!text) return;
        window.supa.from('feed_posts').insert({ author_id: session.user.id, body: text }).then(function (res2) {
          if (res2.error) {
            if (feedStatusEl) { feedStatusEl.innerHTML = '<span style="color:#b23e00">' + escapeHtml(res2.error.message) + '</span>'; }
            return;
          }
          textEl.value = '';
          if (feedStatusEl) { feedStatusEl.innerHTML = '<span style="color:#1d7813">Опубликовано.</span>'; }
          loadFeed();
        });
      });
    });
  }
})();

/*
 * Полная «Лента» (lenta.html) — все посты по порядку, с фильтрами.
 * Сам механизм постов (голос/комментарии/избранное/жалоба/удаление) —
 * тот же, что на главной (js/feed.js), ничего в нём не меняем, только
 * добавляем подгрузку порциями и фильтры по дате/друзьям/сортировке.
 *
 * Переход по ссылке «Перейти к сообщению» с главной приходит как
 * lenta.html#post-<id> — первая порция грузится не с самого начала,
 * а от этого поста (чтобы не читать заново то, что уже видели), и сам
 * пост подсвечивается (.flash-target, как переход на ответ форума).
 */
(function () {
  if (!window.supa) return;

  var listEl = document.getElementById('lentaList');
  if (!listEl) return;

  var moreBtn = document.getElementById('lentaMore');
  var floatTopBtn = document.getElementById('lentaFloatTop');
  var box = document.getElementById('lentaBox');
  var sortTabs = document.getElementById('lentaSortTabs');
  var dateTabs = document.getElementById('lentaDateTabs');
  var friendsLink = document.getElementById('lentaFriendsOnly');

  var BATCH = 20;
  var sort = 'new';
  var range = 'all';
  var friendsOnly = false;
  var loadedCount = 0;
  var isStaff = false;
  var currentUserId = null;
  var friendIds = null;
  var anchorId = null;
  var anchorCutoff = null;
  var boxInView = false;

  if (window.location.hash.indexOf('#post-') === 0) {
    anchorId = window.location.hash.slice(6);
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
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
    var avStyle = prof.avatar_url ? ' style="background-image:url(' + escapeHtml(prof.avatar_url) + ');background-size:cover;background-position:center"' : '';
    var div = document.createElement('div');
    div.className = 'post';
    div.id = 'post-' + row.id;
    div.innerHTML =
      '<div class="who">' +
        nickHtml + tick +
        '<span class="av"' + avStyle + '>' + (prof.avatar_url ? '' : escapeHtml(initial)) + '</span>' +
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
        '<a href="#" class="fav-toggle" data-ftype="feed_post" data-fid="' + row.id + '">В избранное</a><a href="#" data-target-user="' + (prof.id || '') + '">Пожаловаться</a>' +
        ((isStaff || (currentUserId && currentUserId === prof.id)) ? '<a href="#" class="feed-del" data-id="' + row.id + '" style="color:#b23e00">Удалить</a>' : '') +
      '</div>';
    var delBtn = div.querySelector('.feed-del');
    if (delBtn) {
      delBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.pkConfirm('Удалить этот пост из Ленты?', function () {
          window.supa.from('feed_posts').delete().eq('id', row.id).then(function (res) {
            if (res.error) { alert(res.error.message); return; }
            div.remove();
          });
        });
      });
    }
    return div;
  }

  function rangeCutoffIso() {
    if (range === 'all') return null;
    var d = new Date();
    if (range === 'day') { d.setHours(0, 0, 0, 0); }
    else if (range === 'week') { d.setDate(d.getDate() - 7); }
    else if (range === 'month') { d.setMonth(d.getMonth() - 1); }
    return d.toISOString();
  }

  function buildBaseQuery() {
    var q = window.supa.from('feed_posts')
      .select('id, body, created_at, score, comment_count, author_id, profiles(id, nickname, verified, avatar_url)');
    var cutoff = rangeCutoffIso();
    if (cutoff) q = q.gte('created_at', cutoff);
    if (anchorCutoff) q = q.lte('created_at', anchorCutoff);
    if (friendsOnly) q = q.in('author_id', (friendIds && friendIds.length) ? friendIds : ['00000000-0000-0000-0000-000000000000']);
    if (sort === 'top') q = q.order('score', { ascending: false }).order('id', { ascending: false });
    else q = q.order('created_at', { ascending: false });
    return q;
  }

  function updateFloatBtn() {
    if (floatTopBtn) floatTopBtn.hidden = !(boxInView && loadedCount > BATCH);
  }

  function loadMore(reset) {
    if (reset) { loadedCount = 0; listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Загрузка...</p>'; }
    if (friendsOnly && !currentUserId) {
      listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Сначала войдите, чтобы смотреть ленту только от друзей.</p>';
      if (moreBtn) moreBtn.hidden = true;
      return;
    }
    var from = loadedCount;
    var to = loadedCount + BATCH - 1;
    buildBaseQuery().range(from, to).then(function (res) {
      if (res.error) {
        listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Не удалось загрузить ленту.</p>';
        return;
      }
      var rows = res.data || [];
      if (reset) listEl.innerHTML = '';
      if (reset && !rows.length) {
        listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Здесь пока пусто.</p>';
      }
      rows.forEach(function (row) { listEl.appendChild(renderPost(row)); });
      loadedCount += rows.length;
      if (window.PKSocial) window.PKSocial.scan(listEl);
      if (moreBtn) moreBtn.hidden = rows.length < BATCH;
      updateFloatBtn();
      if (reset && anchorId) {
        var target = document.getElementById('post-' + anchorId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('flash-target');
          setTimeout(function () { target.classList.remove('flash-target'); }, 2000);
        }
        anchorId = null;
      }
    });
  }

  function setActiveTab(container, link) {
    container.querySelectorAll('a').forEach(function (a) { a.classList.remove('on'); });
    link.classList.add('on');
  }

  if (sortTabs) {
    sortTabs.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-sort]');
      if (!a || a.classList.contains('on')) return;
      e.preventDefault();
      sort = a.getAttribute('data-sort');
      anchorCutoff = null;
      setActiveTab(sortTabs, a);
      loadMore(true);
    });
  }
  if (dateTabs) {
    dateTabs.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-range]');
      if (!a || a.classList.contains('on')) return;
      e.preventDefault();
      range = a.getAttribute('data-range');
      anchorCutoff = null;
      setActiveTab(dateTabs, a);
      loadMore(true);
    });
  }
  if (friendsLink) {
    friendsLink.addEventListener('click', function (e) {
      e.preventDefault();
      friendsOnly = !friendsOnly;
      friendsLink.classList.toggle('on', friendsOnly);
      anchorCutoff = null;
      if (friendsOnly && friendIds === null && currentUserId) {
        window.supa.from('friendships')
          .select('requester_id, addressee_id')
          .or('requester_id.eq.' + currentUserId + ',addressee_id.eq.' + currentUserId)
          .eq('status', 'accepted')
          .then(function (res) {
            friendIds = (res.data || []).map(function (r) { return r.requester_id === currentUserId ? r.addressee_id : r.requester_id; });
            loadMore(true);
          });
      } else {
        loadMore(true);
      }
    });
  }
  if (moreBtn) moreBtn.addEventListener('click', function () { loadMore(false); });
  if (floatTopBtn) {
    floatTopBtn.addEventListener('click', function () {
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (box && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      boxInView = entries[entries.length - 1].isIntersecting;
      updateFloatBtn();
    }).observe(box);
  }

  function init() {
    if (anchorId) {
      window.supa.from('feed_posts').select('created_at').eq('id', anchorId).single().then(function (res) {
        if (res.data) anchorCutoff = res.data.created_at;
        loadMore(true);
      });
    } else {
      loadMore(true);
    }
  }

  window.supa.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) { init(); return; }
    currentUserId = session.user.id;
    window.supa.from('profiles').select('is_admin, is_moderator').eq('id', session.user.id).single().then(function (pr) {
      isStaff = !!(pr.data && (pr.data.is_admin || pr.data.is_moderator));
      init();
    });
  });
})();

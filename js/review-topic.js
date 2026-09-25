/*
 * Одна тема в разделе отзывов: сам отзыв (с оценкой через уже существующий
 * PKSocial/cast_vote, content_type='review_topic') + вложенные комментарии —
 * ответы можно оставлять и на сам отзыв, и на чужой комментарий (parent_id).
 */
(function () {
  if (!window.supa) return;

  var id = new URLSearchParams(window.location.search).get('id');
  var topicTitle = document.getElementById('topicTitle');
  if (!id || !topicTitle) return;

  var crumbSection = document.getElementById('crumbSection');
  var crumbHere = document.getElementById('crumbHere');
  var sbSection = document.getElementById('sbSection');
  var sbAuthor = document.getElementById('sbAuthor');
  var sbCount = document.getElementById('sbCount');
  var topicBodyEl = document.getElementById('topicBody');
  var topicDateEl = document.getElementById('topicDate');
  var topicAuthorLink = document.getElementById('topicAuthorLink');
  var topicAuthorTick = document.getElementById('topicAuthorTick');
  var topicAuthorAv = document.getElementById('topicAuthorAv');
  var voteWidget = document.querySelector('.vote-widget');
  var commentsList = document.getElementById('commentsList');
  var newCommentInput = document.getElementById('newCommentInput');
  var newCommentBtn = document.getElementById('newCommentBtn');

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtDateTime(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' - ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function postComment(body, parentId, cb) {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) { alert('Сначала войдите вверху страницы.'); return; }
      window.supa.from('review_comments')
        .insert({ topic_id: id, parent_id: parentId || null, author_id: session.user.id, body: body })
        .then(function (r) {
          if (r.error) { alert(r.error.message); return; }
          if (cb) cb();
        });
    });
  }

  function renderComment(c, byParent, depth) {
    var prof = c.profiles || {};
    var container = document.createElement('div');
    container.style.marginLeft = (depth * 18) + 'px';

    var row = document.createElement('p');
    row.className = 'comment-row';
    var nameHtml = prof.id
      ? '<a href="profile.html?id=' + prof.id + '">' + escapeHtml(prof.nickname || '?') + '</a>'
      : escapeHtml(prof.nickname || '?');
    row.innerHTML = '<b>' + nameHtml + '</b>' + (prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="">' : '') +
      ': ' + escapeHtml(c.body) + ' <span class="hint" style="margin:0">' + fmtDateTime(c.created_at) + '</span> ' +
      '<a href="#" class="reply-toggle" style="margin-left:6px">Ответить</a>';
    container.appendChild(row);

    var replyBox = document.createElement('div');
    replyBox.className = 'comment-compose';
    replyBox.hidden = true;
    replyBox.style.margin = '2px 0 6px';
    replyBox.innerHTML = '<input class="field" type="text" placeholder="Ответ..." maxlength="1000"><button class="submit" type="button">Отправить</button>';
    container.appendChild(replyBox);

    row.querySelector('.reply-toggle').addEventListener('click', function (e) {
      e.preventDefault();
      replyBox.hidden = !replyBox.hidden;
    });
    replyBox.querySelector('button').addEventListener('click', function () {
      var input = replyBox.querySelector('input');
      var body = (input.value || '').trim();
      if (!body) return;
      postComment(body, c.id, function () { input.value = ''; replyBox.hidden = true; loadAll(); });
    });

    (byParent[c.id] || []).forEach(function (child) { container.appendChild(renderComment(child, byParent, depth + 1)); });
    return container;
  }

  function loadComments() {
    window.supa.from('review_comments')
      .select('id, parent_id, body, created_at, profiles!author_id(id, nickname, verified)')
      .eq('topic_id', id)
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error || !res.data) { commentsList.innerHTML = '<p class="hint">Не удалось загрузить.</p>'; return; }
        if (!res.data.length) { commentsList.innerHTML = '<p class="hint">Пока без комментариев — начните первым.</p>'; return; }
        var byParent = {};
        res.data.forEach(function (r) {
          var key = r.parent_id || 'root';
          (byParent[key] = byParent[key] || []).push(r);
        });
        commentsList.innerHTML = '';
        (byParent.root || []).forEach(function (c) { commentsList.appendChild(renderComment(c, byParent, 0)); });
      });
  }

  function loadTopic() {
    window.supa.from('review_topics')
      .select('id, section, title, body, score, comment_count, created_at, profiles!author_id(id, nickname, verified)')
      .eq('id', id)
      .single()
      .then(function (res) {
        if (res.error || !res.data) { topicTitle.textContent = 'Тема не найдена'; return; }
        var t = res.data;
        var prof = t.profiles || {};
        document.title = t.title + ' — Отзывы — ПолиКоннект';
        topicTitle.textContent = t.title;
        if (crumbSection) { crumbSection.textContent = t.section; crumbSection.href = 'reviews-section.html?name=' + encodeURIComponent(t.section); }
        if (crumbHere) crumbHere.textContent = t.title;
        if (sbSection) sbSection.textContent = t.section;
        if (sbCount) sbCount.textContent = t.comment_count || 0;
        topicBodyEl.textContent = t.body;
        topicDateEl.textContent = fmtDateTime(t.created_at);
        topicAuthorAv.textContent = (prof.nickname || '?').charAt(0).toUpperCase();
        topicAuthorLink.textContent = prof.nickname || '?';
        if (prof.id) { topicAuthorLink.href = 'profile.html?id=' + prof.id; }
        topicAuthorTick.style.display = prof.verified ? '' : 'none';
        if (sbAuthor) sbAuthor.innerHTML = prof.id ? ('<a href="profile.html?id=' + prof.id + '">' + escapeHtml(prof.nickname || '?') + '</a>') : escapeHtml(prof.nickname || '?');
        voteWidget.setAttribute('data-vid', t.id);
        voteWidget.querySelector('.vote-score').textContent = t.score || 0;
        window.PKSocial.scan(document.getElementById('topicPost'));
      });
  }

  function loadAll() {
    loadTopic();
    loadComments();
  }

  if (newCommentBtn) {
    newCommentBtn.addEventListener('click', function () {
      var body = (newCommentInput.value || '').trim();
      if (!body) return;
      postComment(body, null, function () { newCommentInput.value = ''; loadAll(); });
    });
  }

  loadAll();
})();

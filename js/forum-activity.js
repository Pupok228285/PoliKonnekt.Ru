/*
 * «Ответы на форуме» внизу forum.html — настоящие последние сообщения
 * (не декоративная сводка по темам), в том же виде, что посты в Ленте:
 * аватар, текст, голос за репутацию, можно сразу ответить в теме не уходя
 * со страницы, или перейти в саму тему прямо к этому сообщению.
 */
(function () {
  if (!window.supa) return;

  var box = document.getElementById('forumActivityBox');
  var body = document.getElementById('forumActivityBody');
  var showAllBtn = document.getElementById('forumActivityShowAll');
  var hideBtn = document.getElementById('forumActivityHide');
  if (!body) return;

  var INITIAL = 10;
  var allRows = [];
  var expanded = false;

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

  function trim90(s) {
    s = s || '';
    return s.length > 90 ? s.slice(0, 90) + '…' : s;
  }

  function renderPost(row) {
    var prof = row.profiles || {};
    var topic = row.forum_topics || {};
    var nick = prof.nickname || 'студент';
    var initial = nick.charAt(0).toUpperCase();
    var tick = prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="" title="Студент подтверждён">' : '';
    var nickHtml = prof.id ? '<a class="nick" href="profile.html?id=' + prof.id + '">' + escapeHtml(nick) + '</a>' : '<span class="nick">' + escapeHtml(nick) + '</span>';
    var avStyle = prof.avatar_url ? ' style="background-image:url(' + escapeHtml(prof.avatar_url) + ');background-size:cover;background-position:center"' : '';
    var topicHref = 'forum-topic.html?id=' + topic.id + '#reply-' + row.id;
    var gotoLabel = row.isFirst ? 'В тему' : 'К ответу';

    var div = document.createElement('div');
    div.className = 'post';
    div.innerHTML =
      '<div class="who">' +
        nickHtml + tick +
        '<span class="av"' + avStyle + '>' + (prof.avatar_url ? '' : escapeHtml(initial)) + '</span>' +
      '</div>' +
      '<div class="top"><span class="no">в теме «' + escapeHtml(topic.title || '?') + '»</span><span>' + fmtDateTime(row.created_at) + '</span>' +
        (row.replyToBody ? '<span class="fa-quote">«' + escapeHtml(row.replyToNick) + '» писал(а): «' + escapeHtml(trim90(row.replyToBody)) + '»</span>' : '') +
      '</div>' +
      '<div class="body">' + escapeHtml(row.body).replace(/\n/g, '<br>') + '</div>' +
      '<div class="acts">' +
        '<span class="vote-widget" data-vtype="forum_reply" data-vid="' + row.id + '">' +
          '<button type="button" class="vote-up" title="В плюс репутации">&#9650;</button>' +
          '<b class="vote-score">' + (row.score || 0) + '</b>' +
          '<button type="button" class="vote-down" title="В минус репутации">&#9660;</button>' +
        '</span>' +
        '<a href="#" class="fa-reply-toggle">Ответить</a>' +
        '<a href="' + topicHref + '">' + gotoLabel + '</a>' +
      '</div>' +
      '<div class="comment-compose fa-reply-box" hidden>' +
        '<input class="field" type="text" placeholder="Ответ в теме «' + escapeHtml(topic.title || '?') + '»..." maxlength="4000">' +
        '<button class="submit" type="button">Отправить</button>' +
      '</div>';

    var toggle = div.querySelector('.fa-reply-toggle');
    var composeBox = div.querySelector('.fa-reply-box');
    var input = composeBox.querySelector('input');
    var sendBtn = composeBox.querySelector('button');
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      composeBox.hidden = !composeBox.hidden;
      if (!composeBox.hidden) input.focus();
    });
    sendBtn.addEventListener('click', function () {
      var text = (input.value || '').trim();
      if (!text) return;
      window.supa.auth.getSession().then(function (res) {
        if (!res.data.session) { alert('Сначала войдите вверху страницы.'); return; }
        sendBtn.disabled = true;
        window.supa.from('forum_replies').insert({ topic_id: topic.id, author_id: res.data.session.user.id, body: text }).then(function (r) {
          sendBtn.disabled = false;
          if (r.error) { alert(r.error.message); return; }
          input.value = '';
          composeBox.innerHTML = '<span class="hint" style="color:#1d7813">Отправлено — загляните в тему, чтобы увидеть ответ.</span>';
        });
      });
    });

    return div;
  }

  function render() {
    var list = expanded ? allRows : allRows.slice(0, INITIAL);
    body.innerHTML = '';
    list.forEach(function (row) { body.appendChild(renderPost(row)); });
    if (window.PKSocial) window.PKSocial.scan(body);
    if (showAllBtn) showAllBtn.hidden = expanded || allRows.length <= INITIAL;
    if (hideBtn) hideBtn.hidden = !expanded;
  }

  function load() {
    window.supa.from('forum_replies')
      .select('id, topic_id, body, created_at, score, profiles!author_id(id, nickname, verified, avatar_url), forum_topics!topic_id(id, title, section)')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) {
          body.innerHTML = '<p class="hint" style="padding:8px 2px">Сообщений пока нет.</p>';
          return;
        }
        var rows = res.data;
        var topicIds = [];
        rows.forEach(function (r) { if (topicIds.indexOf(r.topic_id) === -1) topicIds.push(r.topic_id); });
        // Полный порядок сообщений по вовлечённым темам — чтобы у каждого
        // найти именно ПРЕДЫДУЩЕЕ по хронологии сообщение (на что оно
        // отвечает), а не всегда открывающий пост темы.
        window.supa.from('forum_replies').select('id, topic_id, body, profiles!author_id(nickname)')
          .in('topic_id', topicIds).order('id', { ascending: true })
          .then(function (allRes) {
            var byTopic = {};
            (allRes.data || []).forEach(function (r) {
              (byTopic[r.topic_id] = byTopic[r.topic_id] || []).push(r);
            });
            rows.forEach(function (r) {
              var list = byTopic[r.topic_id] || [];
              var idx = -1;
              for (var i = 0; i < list.length; i++) { if (list[i].id === r.id) { idx = i; break; } }
              r.isFirst = idx === 0;
              if (idx > 0) {
                var prev = list[idx - 1];
                r.replyToNick = (prev.profiles && prev.profiles.nickname) || '?';
                r.replyToBody = prev.body;
              }
            });
            allRows = rows;
            render();
          });
      });
  }

  if (showAllBtn) showAllBtn.addEventListener('click', function () { expanded = true; render(); });
  if (hideBtn) {
    hideBtn.addEventListener('click', function () {
      expanded = false;
      render();
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  load();
})();

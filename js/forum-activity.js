/*
 * «Лента тем и ответов» внизу форума — настоящие темы, отсортированные по
 * последней активности (создание или новый ответ), тот же принцип, что у
 * «Свежие темы форума» на главной (js/site-stats.js), но тут их 10 вместо
 * 5 и есть разворачивание в полный список.
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
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function fmtDateTime(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' - ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function renderRow(info) {
    var t = info.topic;
    var authorProf = t.profiles || {};
    var lastProf = info.lastAuthor || {};
    var lastHtml = lastProf.id
      ? '<a href="profile.html?id=' + lastProf.id + '">' + escapeHtml(lastProf.nickname || '?') + '</a>'
      : escapeHtml(lastProf.nickname || authorProf.nickname || '?');
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="row2 ic"><a href="forum-topic.html?id=' + t.id + '"><img src="img/icons/i-arrow.svg" alt=""></a></td>' +
      '<td class="row1"><a class="ttl" href="forum-topic.html?id=' + t.id + '">' + escapeHtml(t.title) + '</a>' +
        '<span class="desc">начал ' + escapeHtml(authorProf.nickname || '?') + '</span></td>' +
      '<td class="row2 hide-m"><a href="forum-section.html?name=' + encodeURIComponent(t.section) + '">' + escapeHtml(t.section) + '</a></td>' +
      '<td class="row1 c">' + info.replyCount + '</td>' +
      '<td class="row2 upd hide-m">' + fmtDateTime(info.lastAt) + '<br>Автор: ' + lastHtml + '</td>';
    return tr;
  }

  function render() {
    var list = expanded ? allRows : allRows.slice(0, INITIAL);
    body.innerHTML = '';
    list.forEach(function (info) { body.appendChild(renderRow(info)); });
    if (showAllBtn) showAllBtn.hidden = expanded || allRows.length <= INITIAL;
    if (hideBtn) hideBtn.hidden = !expanded;
  }

  Promise.all([
    window.supa.from('forum_topics').select('id, section, title, created_at, profiles!author_id(id, nickname)'),
    window.supa.from('forum_replies').select('topic_id, created_at, profiles!author_id(id, nickname)')
  ]).then(function (results) {
    var topicsRes = results[0], repliesRes = results[1];
    if (topicsRes.error || !topicsRes.data || !topicsRes.data.length) {
      body.innerHTML = '<tr><td colspan="5" class="hint" style="padding:8px">Тем пока нет — станьте первым.</td></tr>';
      return;
    }
    var byTopic = {};
    topicsRes.data.forEach(function (t) {
      byTopic[t.id] = { topic: t, replyCount: 0, lastAt: t.created_at, lastAuthor: t.profiles };
    });
    (repliesRes.data || []).forEach(function (r) {
      var info = byTopic[r.topic_id];
      if (!info) return;
      info.replyCount++;
      if (new Date(r.created_at) > new Date(info.lastAt)) {
        info.lastAt = r.created_at;
        info.lastAuthor = r.profiles;
      }
    });
    allRows = Object.keys(byTopic).map(function (id) { return byTopic[id]; })
      .sort(function (a, b) { return new Date(b.lastAt) - new Date(a.lastAt); });
    render();
  });

  if (showAllBtn) {
    showAllBtn.addEventListener('click', function () { expanded = true; render(); });
  }
  if (hideBtn) {
    hideBtn.addEventListener('click', function () {
      expanded = false;
      render();
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
})();

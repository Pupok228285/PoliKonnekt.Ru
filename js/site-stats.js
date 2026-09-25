/*
 * Настоящая статистика на главной вместо нарисованных чисел: счётчик
 * участников, самый новый ник, число постов в ленте, число тем форума —
 * и честная таблица "Активные участники" по разделам, построенная на
 * profiles.current_path (пишет js/presence.js каждую минуту, пока вкладка
 * открыта у вошедшего). Раньше это были придуманные имена и цифры.
 *
 * Честно про то, чего тут НЕТ: гостей (не вошедших) мы никак не считаем —
 * для этого нужна отдельная система анонимных "пингов", которой в проекте
 * нет; onlineCountLine поэтому считает только реально вошедших. "Услуги" и
 * "Вещи" — один и тот же якорь #uslugi на главной, различить их нельзя,
 * поэтому строка одна на двоих ("Услуги и Вещи"); кто включил "Невидимку" в
 * Настройках (profiles.hide_online) — в этот список не попадает, независимо
 * от реального last_seen_at.
 */
(function () {
  if (!window.supa) return;

  var statMembers = document.getElementById('statMembersCount');
  var statNewestWrap = document.getElementById('statNewestWrap');
  var statNewestLink = document.getElementById('statNewestLink');
  var statNewestNick = document.getElementById('statNewestNick');
  var statFeed = document.getElementById('statFeedCount');
  var statForum = document.getElementById('statForumCount');
  var onlineCountLine = document.getElementById('onlineCountLine');
  var onlineTable = document.getElementById('onlineTable');
  var recentTopicsBody = document.getElementById('recentTopicsBody');
  if (!statMembers && !onlineTable && !recentTopicsBody) return; // не та страница

  function fmtDateTime(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' - ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  // ---------- сайдбар "Статистика" ----------
  if (statMembers) {
    window.supa.from('profiles').select('id', { count: 'exact', head: true }).then(function (res) {
      statMembers.textContent = res.count != null ? res.count : '?';
    });
    window.supa.from('profiles').select('id, nickname').order('created_at', { ascending: false }).limit(1).then(function (res) {
      var row = res.data && res.data[0];
      if (!row || !statNewestWrap) return;
      statNewestNick.textContent = row.nickname;
      statNewestLink.href = 'profile.html?id=' + row.id;
      statNewestWrap.style.display = '';
    });
    window.supa.from('feed_posts').select('id', { count: 'exact', head: true }).then(function (res) {
      statFeed.textContent = res.count != null ? res.count : '?';
    });
    window.supa.from('forum_topics').select('id', { count: 'exact', head: true }).then(function (res) {
      statForum.textContent = res.count != null ? res.count : '?';
    });
  }

  // ---------- "Активные участники" по разделам ----------
  function sectionLabel(path) {
    if (path) {
      if (path.indexOf('#uslugi') !== -1) return 'Услуги и Вещи';
      if (path.indexOf('#lenta') !== -1) return 'Лента';
      if (path.indexOf('forum') !== -1) return 'Форум';
      if (path.indexOf('canteen') !== -1) return 'Столовая';
      if (/index\.html$/.test(path) || path === '/' || path === '') return 'Главная';
    }
    return path ? 'Остальное' : 'Главная';
  }

  if (onlineTable) {
    var since = new Date(Date.now() - 2 * 60000).toISOString();
    window.supa.from('profiles').select('id, nickname, verified, is_admin, is_moderator, current_path')
      .gte('last_seen_at', since)
      .eq('hide_online', false)
      .then(function (res) {
        if (res.error || !res.data) { onlineCountLine.textContent = 'Не удалось загрузить.'; return; }
        var rows = res.data;
        onlineCountLine.innerHTML = '<span class="red">' + rows.length + '</span> ' +
          (rows.length === 1 ? 'вошедший на сайте' : 'вошедших на сайте') + ' — за последние 2 минуты';
        var bySection = {};
        rows.forEach(function (r) {
          var label = sectionLabel(r.current_path);
          if (!bySection[label]) bySection[label] = [];
          var color = r.is_admin ? '#b23e00' : (r.is_moderator ? '#c07a00' : (r.verified ? 'green' : '#333'));
          var roleTag = r.is_admin ? ' (админ)' : (r.is_moderator ? ' (модератор)' : '');
          bySection[label].push('<a class="nick" href="profile.html?id=' + r.id + '" style="color:' + color + '">' +
            escapeHtml(r.nickname) + '</a>' + roleTag);
        });
        onlineTable.querySelectorAll('td[data-section]').forEach(function (td) {
          var list = bySection[td.getAttribute('data-section')];
          td.innerHTML = list && list.length ? list.join(', ') : '—';
        });
      });
  }

  // ---------- "Свежие темы форума" — реально недавно активные темы (не только созданные,
  // но и те, в которые недавно ответили), а не нарисованные строки ----------
  if (recentTopicsBody) {
    Promise.all([
      window.supa.from('forum_topics').select('id, section, title, created_at, profiles!author_id(id, nickname)'),
      window.supa.from('forum_replies').select('topic_id, created_at, profiles!author_id(id, nickname)')
    ]).then(function (results) {
      var topicsRes = results[0], repliesRes = results[1];
      if (topicsRes.error || !topicsRes.data || !topicsRes.data.length) {
        recentTopicsBody.innerHTML = '<tr><td colspan="5" class="hint" style="padding:8px">Тем пока нет — станьте первым на форуме.</td></tr>';
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
      var list = Object.keys(byTopic).map(function (id) { return byTopic[id]; })
        .sort(function (a, b) { return new Date(b.lastAt) - new Date(a.lastAt); })
        .slice(0, 5);
      recentTopicsBody.innerHTML = '';
      list.forEach(function (info) {
        var t = info.topic;
        var authorProf = t.profiles || {};
        var lastProf = info.lastAuthor || {};
        var lastHtml = lastProf.id
          ? '<a href="profile.html?id=' + lastProf.id + '">' + escapeHtml(lastProf.nickname || '?') + '</a>'
          : escapeHtml(lastProf.nickname || authorProf.nickname || '?');
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td class="row2 ic"><img src="img/icons/i-arrow.svg" alt=""></td>' +
          '<td class="row1"><a class="ttl" href="forum-topic.html?id=' + t.id + '">' + escapeHtml(t.title) + '</a>' +
            '<span class="desc">начал ' + escapeHtml(authorProf.nickname || '?') + '</span></td>' +
          '<td class="row2 hide-m">' + escapeHtml(t.section) + '</td>' +
          '<td class="row1 c">' + info.replyCount + '</td>' +
          '<td class="row2 upd hide-m">' + fmtDateTime(info.lastAt) + '<br>Автор: ' + lastHtml + '</td>';
        recentTopicsBody.appendChild(tr);
      });
    });
  }
})();

/*
 * Форум: список разделов (по корпусам/факультетам/общим темам) — теперь
 * настоящая таблица forum_sections (db/schema_v35.sql), а не статичная
 * разметка страницы. Добавлять/менять/удалять разделы могут только админ и
 * модераторы (RLS на таблице + скрытая для остальных форма ниже) — по
 * прямой просьбе пользователя. Счётчики тем/ответов и «последнее
 * обновление» по-прежнему считаются по реальным forum_topics/forum_replies.
 *
 * Честно про то, чего это НЕ чинит: forum_topics.section как был, так и
 * остаётся обычным текстом, не внешним ключом на forum_sections — создать
 * тему с разделом, которого нет в списке, всё ещё можно напрямую через
 * forum-section.html?name=... в адресной строке. Эта миграция даёт
 * управление самим списком разделов, а не жёсткую проверку на бэкенде.
 */
(function () {
  if (!window.supa) return;

  var GROUP_LABEL = { corpus: 'По корпусам', faculty: 'По факультетам', general: 'Общие темы' };

  var corpusSideList = document.getElementById('corpusSideList');
  var bodyByGroup = {
    corpus: document.getElementById('sectionsBodyCorpus'),
    faculty: document.getElementById('sectionsBodyFaculty'),
    general: document.getElementById('sectionsBodyGeneral')
  };
  var sectionSel = document.getElementById('newTopicSection');
  var staffBox = document.getElementById('staffAddSectionBox');
  var newSectionGroup = document.getElementById('newSectionGroup');
  var newSectionName = document.getElementById('newSectionName');
  var newSectionDesc = document.getElementById('newSectionDesc');
  var newSectionBtn = document.getElementById('newSectionBtn');
  var newSectionHint = document.getElementById('newSectionHint');

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

  var amStaff = false;

  function setSectionHint(text, ok) {
    if (!newSectionHint) return;
    newSectionHint.textContent = text || '';
    newSectionHint.style.color = ok ? '#1d7813' : '#b23e00';
  }

  function renderSectionRow(sec, info) {
    var href = 'forum-section.html?name=' + encodeURIComponent(sec.name);
    var topics = info ? info.topics.length : 0;
    var replies = info ? info.replyCount : 0;
    var updatedHtml;
    if (!info || !info.topics.length) {
      updatedHtml = '<span style="opacity:.6">тем пока нет</span>';
    } else {
      var latest = info.topics.slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })[0];
      var authorProf = latest.profiles || {};
      var authorHref = authorProf.id ? 'profile.html?id=' + authorProf.id : 'profile.html';
      updatedHtml = fmtDateTime(latest.created_at) + '<br>Автор: <a href="' + authorHref + '">' + escapeHtml(authorProf.nickname || '?') + '</a>';
    }
    var delBtn = amStaff ? ' <a href="#" class="del-section" data-id="' + sec.id + '" data-name="' + escapeHtml(sec.name) + '" style="color:#b23e00">удалить</a>' : '';
    return '<tr data-section="' + escapeHtml(sec.name) + '">' +
      '<td class="row2 ic"><img src="img/icons/' + escapeHtml(sec.icon || 'i-feed.svg') + '" alt=""></td>' +
      '<td class="row1"><a class="ttl" href="' + href + '">' + escapeHtml(sec.name) + '</a><span class="desc">' + escapeHtml(sec.description || '') + '</span>' + delBtn + '</td>' +
      '<td class="row2 c" data-f="topics">' + topics + '</td>' +
      '<td class="row1 c" data-f="replies">' + replies + '</td>' +
      '<td class="row2 upd hide-m" data-f="updated">' + updatedHtml + '</td>' +
      '</tr>';
  }

  function wireDeleteButtons(root) {
    root.querySelectorAll('.del-section').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (!confirm('Удалить раздел «' + a.getAttribute('data-name') + '» из списка? Уже созданные темы в нём никуда не денутся, просто раздел исчезнет из каталога.')) return;
        window.supa.from('forum_sections').delete().eq('id', a.getAttribute('data-id')).then(function (r) {
          if (r.error) { alert(r.error.message); return; }
          loadAll();
        });
      });
    });
  }

  function loadAll() {
    Promise.all([
      window.supa.from('forum_sections').select('id, name, group_key, description, icon, position').order('group_key', { ascending: true }).order('position', { ascending: true }),
      window.supa.from('forum_topics').select('id, section, title, created_at, profiles!author_id(id, nickname)'),
      window.supa.from('forum_replies').select('id, topic_id, created_at')
    ]).then(function (results) {
      var sectionsRes = results[0], topicsRes = results[1], repliesRes = results[2];
      if (sectionsRes.error || !sectionsRes.data) {
        Object.keys(bodyByGroup).forEach(function (g) {
          if (bodyByGroup[g]) bodyByGroup[g].innerHTML = '<tr><td colspan="5" class="hint" style="padding:8px">Не удалось загрузить разделы.</td></tr>';
        });
        return;
      }
      var sections = sectionsRes.data;
      var topics = (topicsRes.data || []);
      var replies = (repliesRes.data || []);

      var topicById = {};
      topics.forEach(function (t) { topicById[t.id] = t; });

      var bySection = {};
      topics.forEach(function (t) {
        if (!bySection[t.section]) bySection[t.section] = { topics: [], replyCount: 0 };
        bySection[t.section].topics.push(t);
      });
      replies.forEach(function (r) {
        var t = topicById[r.topic_id];
        if (!t || !bySection[t.section]) return;
        bySection[t.section].replyCount++;
      });

      var byGroup = { corpus: [], faculty: [], general: [] };
      sections.forEach(function (sec) { if (byGroup[sec.group_key]) byGroup[sec.group_key].push(sec); });

      Object.keys(bodyByGroup).forEach(function (g) {
        var el = bodyByGroup[g];
        if (!el) return;
        var list = byGroup[g];
        el.innerHTML = list.length
          ? list.map(function (sec) { return renderSectionRow(sec, bySection[sec.name]); }).join('')
          : '<tr><td colspan="5" class="hint" style="padding:8px">Пока нет разделов в этой группе.</td></tr>';
        wireDeleteButtons(el);
      });

      if (corpusSideList) {
        var corpusList = byGroup.corpus;
        corpusSideList.innerHTML = corpusList.length
          ? corpusList.map(function (sec) {
              var info = bySection[sec.name];
              return '<a class="item dot" href="forum-section.html?name=' + encodeURIComponent(sec.name) + '"><span class="cnt">' + (info ? info.topics.length : 0) + '</span>' + escapeHtml(sec.name) + '</a>';
            }).join('')
          : '<p class="hint" style="padding:2px">Пока пусто.</p>';
      }

      if (sectionSel) {
        sectionSel.innerHTML = ['general', 'corpus', 'faculty'].map(function (g) {
          if (!byGroup[g].length) return '';
          return '<optgroup label="' + GROUP_LABEL[g] + '">' +
            byGroup[g].map(function (sec) { return '<option>' + escapeHtml(sec.name) + '</option>'; }).join('') +
            '</optgroup>';
        }).join('');
      }

      var totalTopicsEl = document.getElementById('forumTotalTopics');
      var totalRepliesEl = document.getElementById('forumTotalReplies');
      if (totalTopicsEl) totalTopicsEl.textContent = topics.length;
      if (totalRepliesEl) totalRepliesEl.textContent = replies.length;
    });
  }

  // ---------- "сейчас на форуме" — те же профили-по-current_path, что и на главной ----------
  var onlineNowEl = document.getElementById('forumOnlineNow');
  if (onlineNowEl) {
    var since = new Date(Date.now() - 2 * 60000).toISOString();
    window.supa.from('profiles').select('id, current_path').gte('last_seen_at', since).then(function (res) {
      if (res.error || !res.data) { onlineNowEl.textContent = '—'; return; }
      var n = res.data.filter(function (p) { return p.current_path && p.current_path.indexOf('forum') !== -1; }).length;
      onlineNowEl.textContent = String(n);
    });
  }

  // ---------- добавление раздела (только staff) ----------
  window.supa.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) return;
    window.supa.from('profiles').select('is_admin, is_moderator').eq('id', session.user.id).single().then(function (r) {
      if (r.error || !r.data) return;
      amStaff = !!(r.data.is_admin || r.data.is_moderator);
      if (amStaff && staffBox) staffBox.hidden = false;
      loadAll();
    });
  });

  loadAll();

  if (newSectionBtn) {
    newSectionBtn.addEventListener('click', function () {
      var name = (newSectionName.value || '').trim();
      var desc = (newSectionDesc.value || '').trim();
      var group = newSectionGroup.value;
      if (!name) { setSectionHint('Введите название раздела.', false); return; }
      newSectionBtn.disabled = true;
      setSectionHint('Добавляем...', true);
      window.supa.from('forum_sections').insert({ name: name, group_key: group, description: desc }).then(function (r) {
        newSectionBtn.disabled = false;
        if (r.error) { setSectionHint(r.error.message, false); return; }
        setSectionHint('Раздел добавлен.', true);
        newSectionName.value = '';
        newSectionDesc.value = '';
        loadAll();
      });
    });
  }

  var btn = document.getElementById('newTopicBtn');
  var form = document.getElementById('newTopicForm');
  var titleInput = document.getElementById('newTopicTitle');
  var bodyInput = document.getElementById('newTopicBody');
  var submitBtn = document.getElementById('newTopicSubmit');
  var hint = document.getElementById('newTopicHint');
  if (!btn || !form) return;

  function setHint(text, ok) {
    hint.textContent = text || '';
    hint.style.color = ok ? '#1d7813' : '#b23e00';
  }

  btn.addEventListener('click', function () {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  submitBtn.addEventListener('click', function () {
    var title = (titleInput.value || '').trim();
    var body = (bodyInput.value || '').trim();
    if (!title || !body) { setHint('Заполните заголовок и текст сообщения.', false); return; }

    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) { setHint('Сначала войдите вверху страницы.', false); return; }

      submitBtn.disabled = true;
      setHint('Создаём тему...', true);

      window.supa.from('forum_topics')
        .insert({ section: sectionSel.value, title: title, author_id: session.user.id })
        .select('id')
        .single()
        .then(function (topicRes) {
          if (topicRes.error) { setHint(topicRes.error.message, false); submitBtn.disabled = false; return; }
          var topicId = topicRes.data.id;
          window.supa.from('forum_replies')
            .insert({ topic_id: topicId, author_id: session.user.id, body: body })
            .then(function (replyRes) {
              if (replyRes.error) { setHint(replyRes.error.message, false); submitBtn.disabled = false; return; }
              window.location.href = 'forum-topic.html?id=' + topicId;
            });
        });
    });
  });
})();

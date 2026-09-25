/*
 * Тема форума — целиком реальная. Без ?id= в адресе показывать нечего —
 * честно предлагаем открыть тему из каталога (#topicNotFound). Раньше тут
 * была декоративная "домашняя" демо-тема (4 придуманных сообщения зашиты
 * в HTML) — убрали по прямой просьбе, реальных данных достаточно.
 */
(function () {
  if (!window.supa) return;

  var params = new URLSearchParams(window.location.search);
  var urlId = params.get('id');

  var notFoundBox = document.getElementById('topicNotFound');
  var realArea = document.getElementById('topicRealArea');
  var aboutBox = document.getElementById('topicAboutBox');
  if (!urlId) return; // #topicNotFound уже видна по умолчанию в HTML

  var topicId = Number(urlId);

  var postsList = document.getElementById('postsList');
  var catend = postsList ? postsList.querySelector('.catend') : null;
  var topicTitleEl = document.getElementById('topicTitle');
  var topicSectionLabel = document.getElementById('topicSectionLabel');
  var crumbSection = document.getElementById('crumbSection');
  var crumbHere = document.getElementById('crumbHere');
  var sbSection = document.getElementById('sbSection');
  var sbAuthor = document.getElementById('sbAuthor');
  var sbCount = document.getElementById('sbCount');
  var replyForm = document.getElementById('replyForm');
  var replyText = document.getElementById('replyText');
  var replyHint = document.getElementById('replyHint');
  var replyBtn = document.getElementById('replyBtn');

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

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function setHint(text, ok) {
    if (!replyHint) return;
    replyHint.textContent = text || '';
    replyHint.style.color = ok ? '#1d7813' : '#b23e00';
  }

  function trim80(s) {
    s = s || '';
    return s.length > 80 ? s.slice(0, 80) + '…' : s;
  }

  // "Цитата" — реальная: подставляет цитируемый текст в поле ответа,
  // обычным текстовым конвентом (простое форматирование, без разметки —
  // ответы хранятся как обычный текст).
  function insertQuote(nickname, body) {
    if (!replyText) return;
    var quoted = '«' + nickname + '» писал(а):\n«' + trim80(body) + '»\n\n';
    replyText.value = quoted + replyText.value;
    replyText.focus();
    var pos = replyText.value.length;
    replyText.setSelectionRange(pos, pos);
    replyText.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  var nextNo = 1;

  function renderReply(row) {
    if (!postsList) return;
    var prof = row.profiles || {};
    var nickname = prof.nickname || 'Гость';
    var nickHtml = prof.id
      ? '<a class="nick' + (prof.verified ? ' ok' : '') + '" href="profile.html?id=' + prof.id + '">' + escapeHtml(nickname) + '</a>'
      : '<span class="nick' + (prof.verified ? ' ok' : '') + '">' + escapeHtml(nickname) + '</span>';
    var el = document.createElement('div');
    el.className = 'post';
    el.innerHTML =
      '<div class="who">' +
        nickHtml +
        (prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="" title="Студент подтверждён">' : '') +
        '<span class="av">' + escapeHtml(nickname.charAt(0).toUpperCase()) + '</span>' +
        '<span class="st">На сайте с ' + fmtDate(prof.created_at) + '</span>' +
      '</div>' +
      '<div class="top"><span class="no">Сообщение №' + (nextNo++) + '</span><span>' + fmtDateTime(row.created_at) + '</span></div>' +
      '<div class="body">' + escapeHtml(row.body) + '</div>' +
      '<div class="acts">' +
        '<span class="vote-widget" data-vtype="forum_reply" data-vid="' + row.id + '">' +
          '<button type="button" class="vote-up" title="В плюс репутации">&#9650;</button>' +
          '<b class="vote-score">' + (row.score || 0) + '</b>' +
          '<button type="button" class="vote-down" title="В минус репутации">&#9660;</button>' +
        '</span>' +
        '<a href="#" class="reply-quote" data-nick="' + escapeHtml(nickname) + '" data-body="' + escapeHtml(row.body) + '">Цитата</a>' +
        '<a href="#">Пожаловаться</a>' +
      '</div>';
    postsList.insertBefore(el, catend);
  }

  if (postsList) {
    postsList.addEventListener('click', function (e) {
      var a = e.target.closest('a.reply-quote');
      if (!a) return;
      e.preventDefault();
      insertQuote(a.getAttribute('data-nick'), a.getAttribute('data-body'));
    });
  }

  function loadReplies() {
    window.supa.from('forum_replies')
      .select('id, body, created_at, score, profiles!author_id(id, nickname, verified, created_at)')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error || !res.data) return;
        res.data.forEach(renderReply);
        if (sbCount) sbCount.textContent = String(res.data.length);
        if (window.PKSocial) window.PKSocial.scan(postsList);
      });
  }

  window.supa.from('forum_topics')
    .select('id, title, section, profiles!author_id(id, nickname)')
    .eq('id', topicId)
    .single()
    .then(function (res) {
      if (res.error || !res.data) {
        if (notFoundBox) notFoundBox.hidden = false;
        if (notFoundBox) notFoundBox.querySelector('h2').textContent = 'Тема не найдена';
        return;
      }
      if (notFoundBox) notFoundBox.hidden = true;
      if (realArea) realArea.hidden = false;
      if (aboutBox) aboutBox.hidden = false;

      var data = res.data;
      var authorProf = data.profiles || {};
      document.title = data.title + ' — Форум — ПолиКоннект.ru';
      if (topicTitleEl) topicTitleEl.textContent = data.title;
      if (crumbHere) crumbHere.textContent = data.title;
      if (crumbSection) { crumbSection.textContent = data.section; crumbSection.href = 'forum-section.html?name=' + encodeURIComponent(data.section); }
      if (topicSectionLabel) topicSectionLabel.textContent = data.section;
      if (sbSection) sbSection.textContent = data.section;
      if (sbAuthor) {
        sbAuthor.innerHTML = authorProf.id
          ? '<a href="profile.html?id=' + authorProf.id + '">' + escapeHtml(authorProf.nickname || 'Гость') + '</a>'
          : escapeHtml(authorProf.nickname || 'Гость');
      }
      if (sbCount) sbCount.textContent = '0';

      loadReplies();
    });

  function refreshComposerState() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      setHint(session ? '' : 'Отвечать могут только зарегистрированные аккаунты.', !!session);
    });
  }
  refreshComposerState();
  window.supa.auth.onAuthStateChange(refreshComposerState);

  if (replyForm) {
    replyForm.addEventListener('submit', function () {
      var body = (replyText.value || '').trim();
      if (!body) return;
      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) { setHint('Сначала войдите вверху страницы.', false); return; }
        replyBtn.disabled = true;
        window.supa.from('forum_replies')
          .insert({ topic_id: topicId, author_id: session.user.id, body: body })
          .select('id, body, created_at, profiles!author_id(id, nickname, verified, created_at)')
          .single()
          .then(function (insRes) {
            replyBtn.disabled = false;
            if (insRes.error) { setHint(insRes.error.message, false); return; }
            renderReply(insRes.data);
            if (sbCount) sbCount.textContent = String((parseInt(sbCount.textContent, 10) || 0) + 1);
            replyText.value = '';
            setHint('Ответ добавлен.', true);
          });
      });
    });
  }
})();

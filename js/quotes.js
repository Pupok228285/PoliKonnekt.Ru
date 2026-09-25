/*
 * Цитаты и Креатив — своя лента (canteen.js/feed.js устроены точно так же),
 * своя таблица quote_posts.
 */
(function () {
  if (!window.supa) return;

  var listEl = document.getElementById('quoteList');
  if (!listEl) return;

  var composer = document.getElementById('quoteComposer');
  var textEl = document.getElementById('quoteText');
  var kindSelect = document.getElementById('quoteKind');
  var statusEl = document.getElementById('quoteStatus');
  var tabsBox = document.getElementById('quoteTabs');
  var mainTitle = document.getElementById('quoteMainTitle');
  var howItWorks = document.getElementById('quoteHowItWorks');

  var KIND_LABELS = { '': 'Всё подряд', quote: 'Цитаты с пар', creative: 'Свой креатив' };
  var KIND_HOWTO = {
    '': 'Цитаты с пар — только сами фразы, дословно. Креатив — место для своего: стихи, мысли, зарисовки, мини-рассказы. Читать может любой, писать — только зарегистрированные.',
    quote: 'Только цитаты: смешные, меткие или просто запомнившиеся фразы с пар — дословно, без пересказа своими словами. Оформляются автоматически, в кавычках.',
    creative: 'Не цитата, а своё: стих, случайная мысль, зарисовка, мини-рассказ — что угодно, лишь бы сами написали.'
  };
  var KIND_PLACEHOLDER = {
    quote: 'Цитата с пары — дословно, как было сказано... Не более 1000 знаков.',
    creative: 'Стих, мысль, зарисовка, мини-рассказ — пишите что хотите, лишь бы своё... Не более 1000 знаков.'
  };
  var allPosts = [];
  var activeKind = '';

  function syncComposerKind() {
    if (!kindSelect) return;
    if (textEl) textEl.placeholder = KIND_PLACEHOLDER[kindSelect.value] || KIND_PLACEHOLDER.quote;
  }

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
      '<div class="top"><span class="no">' + (row.kind === 'creative' ? 'Креатив' : 'Цитата') + '</span><span>' + fmtDate(row.created_at) + '</span></div>' +
      '<div class="body' + (row.kind === 'creative' ? '' : ' is-quote') + '">' + escapeHtml(row.body).replace(/\n/g, '<br>') + '</div>' +
      '<div class="acts">' +
        '<span class="vote-widget" data-vtype="quote_post" data-vid="' + row.id + '">' +
          '<button type="button" class="vote-up" title="В плюс репутации">&#9650;</button>' +
          '<b class="vote-score">' + (row.score || 0) + '</b>' +
          '<button type="button" class="vote-down" title="В минус репутации">&#9660;</button>' +
        '</span>' +
        '<a href="#" class="comment-toggle" data-ctype="quote_post" data-cid="' + row.id + '">Комментарии (' + (row.comment_count || 0) + ')</a>' +
        '<a href="#">Пожаловаться</a>' +
      '</div>';
    return div;
  }

  function render() {
    var list = activeKind ? allPosts.filter(function (p) { return p.kind === activeKind; }) : allPosts;
    if (mainTitle) mainTitle.textContent = KIND_LABELS[activeKind] || KIND_LABELS[''];
    if (howItWorks) howItWorks.textContent = KIND_HOWTO[activeKind] || KIND_HOWTO[''];
    listEl.innerHTML = '';
    if (!list.length) {
      listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Здесь пока пусто — напишите первыми.</p>';
      return;
    }
    list.forEach(function (row) { listEl.appendChild(renderPost(row)); });
    if (window.PKSocial) window.PKSocial.scan(listEl);
  }

  function loadFeed() {
    window.supa.from('quote_posts')
      .select('id, body, kind, created_at, score, comment_count, profiles(id, nickname, verified)')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(function (res) {
        if (res.error) { listEl.innerHTML = '<p class="hint" style="padding:8px 2px">Не удалось загрузить.</p>'; return; }
        allPosts = res.data || [];
        render();
      });
  }

  if (tabsBox) {
    tabsBox.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-kind]');
      if (!a) return;
      e.preventDefault();
      activeKind = a.getAttribute('data-kind');
      tabsBox.querySelectorAll('a').forEach(function (x) { x.classList.remove('on'); });
      a.classList.add('on');
      render();
      // Форма публикации следует за вкладкой — иначе на «Креатив» можно было
      // случайно опубликовать с формой/плейсхолдером, оставшимися от «Цитаты».
      if (kindSelect && (activeKind === 'quote' || activeKind === 'creative')) {
        kindSelect.value = activeKind;
        syncComposerKind();
      }
    });
  }

  syncComposerKind();
  if (kindSelect) kindSelect.addEventListener('change', syncComposerKind);

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
        window.supa.from('quote_posts').insert({ author_id: session.user.id, body: text, kind: kindSelect.value }).then(function (res2) {
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

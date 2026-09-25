/*
 * Потеряшки: список грузится один раз, вкладки "Все/Потеряли/Нашли"
 * фильтруют на клиенте (тот же приём, что в Услугах и К'Артели). Автор
 * записи может отметить её решённой — тогда она просто помечается, не
 * удаляется (история никуда не девается).
 */
(function () {
  if (!window.supa) return;

  var tabsBox = document.getElementById('lfTabsBox');
  var body = document.getElementById('lfBody');
  var mainTitle = document.getElementById('lfMainTitle');
  var openBtn = document.getElementById('newLfOpenBtn');
  var form = document.getElementById('newLfForm');
  var kindSel = document.getElementById('lfKind');
  var titleInput = document.getElementById('lfTitle');
  var locationInput = document.getElementById('lfLocation');
  var descInput = document.getElementById('lfDescription');
  var submitBtn = document.getElementById('lfSubmit');
  var hint = document.getElementById('lfHint');
  if (!body) return;

  var KIND_LABELS = { lost: 'Потеряли', found: 'Нашли' };
  var all = [];
  var activeKind = '';
  var myId = null;
  var loaded = false;

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

  function setHint(text, ok) {
    if (!hint) return;
    hint.textContent = text || '';
    hint.style.color = ok == null ? '' : (ok ? '#1d7813' : '#b23e00');
  }

  function load() {
    window.supa.from('lost_found_posts')
      .select('id, kind, title, description, location, status, created_at, author_id, profiles!author_id(nickname, verified)')
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error || !res.data) {
          body.innerHTML = '<tr><td colspan="5" class="hint" style="padding:8px">Не удалось загрузить.</td></tr>';
          return;
        }
        all = res.data;
        loaded = true;
        updateCounts();
        render();
      });
  }

  function updateCounts() {
    if (!tabsBox) return;
    var open = all.filter(function (p) { return p.status === 'open'; });
    var byKind = {};
    open.forEach(function (p) { byKind[p.kind] = (byKind[p.kind] || 0) + 1; });
    tabsBox.querySelectorAll('[data-cnt]').forEach(function (el) {
      var k = el.getAttribute('data-cnt');
      el.textContent = String(k === '' ? open.length : (byKind[k] || 0));
    });
  }

  function render() {
    var list = all.filter(function (p) {
      if (p.status !== 'open') return false;
      return activeKind ? p.kind === activeKind : true;
    });
    mainTitle.textContent = activeKind ? KIND_LABELS[activeKind] : 'Все записи';
    body.innerHTML = '';
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="5" class="hint" style="padding:8px">Пока пусто.</td></tr>';
      return;
    }
    list.forEach(function (p) { body.appendChild(renderRow(p)); });
  }

  function renderRow(p) {
    var tr = document.createElement('tr');
    var prof = p.profiles || {};
    var nickname = prof.nickname || '?';
    var tick = prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="" title="Студент подтверждён">' : '';
    var kindLabel = KIND_LABELS[p.kind] || p.kind;
    var desc = (p.location ? escapeHtml(p.location) + ' · ' : '') + escapeHtml(p.description);
    var canResolve = myId && myId === p.author_id;
    tr.innerHTML =
      '<td class="row2 ic"><img src="img/icons/i-lost.svg" alt=""></td>' +
      '<td class="row1"><b>[' + kindLabel + ']</b> ' + escapeHtml(p.title) + '<span class="desc">' + desc + '</span></td>' +
      '<td class="row2"><span class="nick' + (prof.verified ? ' ok' : '') + '">' + escapeHtml(nickname) + '</span>' + tick + '</td>' +
      '<td class="row1 upd hide-m">' + fmtDateTime(p.created_at) + '</td>' +
      '<td class="row2 c"></td>';
    if (canResolve) {
      var btn = document.createElement('button');
      btn.className = 'submit';
      btn.type = 'button';
      btn.style.fontSize = '10px';
      btn.style.padding = '1px 6px';
      btn.textContent = 'Найдено';
      btn.addEventListener('click', function () {
        window.supa.from('lost_found_posts').update({ status: 'resolved' }).eq('id', p.id).then(load);
      });
      tr.lastElementChild.appendChild(btn);
    }
    return tr;
  }

  if (tabsBox) {
    tabsBox.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-kind]');
      if (!a) return;
      e.preventDefault();
      activeKind = a.getAttribute('data-kind');
      tabsBox.querySelectorAll('a.item').forEach(function (x) { x.classList.remove('now'); });
      a.classList.add('now');
      render();
    });
  }

  if (openBtn) {
    openBtn.addEventListener('click', function () {
      window.supa.auth.getSession().then(function (res) {
        if (!res.data || !res.data.session) { alert('Сначала войдите вверху страницы.'); return; }
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      var title = (titleInput.value || '').trim();
      var description = (descInput.value || '').trim();
      if (!title || !description) { setHint('Заполните, что и подробности.', false); return; }
      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) { setHint('Сначала войдите вверху страницы.', false); return; }
        submitBtn.disabled = true;
        setHint('Публикуем...', true);
        window.supa.from('lost_found_posts').insert({
          author_id: session.user.id,
          kind: kindSel.value,
          title: title,
          location: (locationInput.value || '').trim() || null,
          description: description
        }).then(function (ir) {
          submitBtn.disabled = false;
          if (ir.error) { setHint(ir.error.message, false); return; }
          setHint('Опубликовано.', true);
          titleInput.value = '';
          locationInput.value = '';
          descInput.value = '';
          form.style.display = 'none';
          load();
        });
      });
    });
  }

  window.supa.auth.getSession().then(function (res) {
    myId = res.data && res.data.session ? res.data.session.user.id : null;
    load();
  });
  window.supa.auth.onAuthStateChange(function (_e, session) {
    myId = session ? session.user.id : null;
    if (loaded) render();
  });
})();

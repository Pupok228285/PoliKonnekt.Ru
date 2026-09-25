/*
 * Каталог К'Артелей на реальных данных: список грузится один раз, вкладки и
 * категории фильтруют уже загруженное. Создание артели — по-настоящему,
 * создатель сразу становится главарём (это делает триггер в БД).
 */
(function () {
  if (!window.supa) return;

  var tabsBox = document.getElementById('artelTabs');
  var categoryBox = document.getElementById('artelCategoryBox');
  var body = document.getElementById('artelsBody');
  var openBtn = document.getElementById('newArtelOpenBtn');
  var section = document.getElementById('newArtelSection');
  var nameInput = document.getElementById('naName');
  var categorySelect = document.getElementById('naCategory');
  var descInput = document.getElementById('naDescription');
  var submitBtn = document.getElementById('newArtelSubmit');
  var hint = document.getElementById('newArtelHint');
  var rankBox = document.getElementById('artelRankBox');
  var rankList = document.getElementById('artelRankList');
  if (!body) return;

  var CATEGORY_LABELS = { faculty: 'Факультет', dorm: 'Общага', interest: 'Интересы', course: 'Курс' };
  var all = [];
  var activeTab = '';
  var amStaff = false; // админ или модератор — может удалить любую артель

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function setHint(text, ok) {
    if (!hint) return;
    hint.textContent = text || '';
    hint.style.color = ok == null ? '' : (ok ? '#1d7813' : '#b23e00');
  }

  function load() {
    window.supa.from('artels')
      .select('id, name, description, category, member_count, leader_since, created_at, profiles!leader_id(nickname, verified)')
      .order('member_count', { ascending: false })
      .then(function (res) {
        if (res.error || !res.data) {
          body.innerHTML = '<tr><td colspan="6" class="hint" style="padding:8px">Не удалось загрузить.</td></tr>';
          return;
        }
        all = res.data;
        updateCounts();
        render();
        renderRankBox();
      });
  }

  function updateCounts() {
    if (!categoryBox) return;
    var byCat = {};
    all.forEach(function (a) { byCat[a.category] = (byCat[a.category] || 0) + 1; });
    categoryBox.querySelectorAll('[data-cnt]').forEach(function (el) {
      var cat = el.getAttribute('data-cnt');
      el.textContent = String(cat === '' ? all.length : (byCat[cat] || 0));
    });
  }

  function render() {
    var list = activeTab ? all.filter(function (a) { return a.category === activeTab; }) : all;
    body.innerHTML = '';
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="6" class="hint" style="padding:8px">Пока нет ни одной артели — создайте первую.</td></tr>';
      return;
    }
    list.forEach(function (a) { body.appendChild(renderRow(a)); });
  }

  // Раньше тут была нарисованная "Активность недели" (придуманные ▲128 и т.п.) —
  // реального счётчика недельной активности в базе нет, поэтому честно
  // показываем то, что есть по-настоящему: топ-3 артели по числу участников.
  function renderRankBox() {
    if (!rankBox || !rankList) return;
    var top = all.slice(0, 3);
    if (!top.length) { rankBox.hidden = true; return; }
    rankBox.hidden = false;
    rankList.innerHTML = top.map(function (a, i) {
      return '<li><span class="n">' + (i + 1) + '.</span><a href="artel-view.html?id=' + a.id + '">' + escapeHtml(a.name) + '</a>' +
        '<span class="d">' + a.member_count + (a.member_count === 1 ? ' участник' : ' участников') + '</span></li>';
    }).join('');
  }

  function renderRow(a) {
    var tr = document.createElement('tr');
    var leader = a.profiles || {};
    var leaderHtml = leader.nickname
      ? escapeHtml(leader.nickname) + (leader.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="" title="Студент подтверждён">' : '')
      : '<span class="hint" style="margin:0">без главаря</span>';
    tr.innerHTML =
      '<td class="row2 ic"><img src="img/icons/i-artel.svg" alt=""></td>' +
      '<td class="row1"><a class="ttl" href="artel-view.html?id=' + a.id + '">' + escapeHtml(a.name) + '</a><span class="desc">' + escapeHtml(a.description) + '</span></td>' +
      '<td class="row2 hide-m">' + (CATEGORY_LABELS[a.category] || a.category) + '</td>' +
      '<td class="row1 c">' + a.member_count + '</td>' +
      '<td class="row2">' + leaderHtml + '</td>' +
      '<td class="row1 upd hide-m">' + fmtDate(a.leader_since || a.created_at) +
        (amStaff ? '<br><a href="#" class="artel-delete" data-id="' + a.id + '" style="color:#b23e00">удалить</a>' : '') + '</td>';
    return tr;
  }

  if (window.supa) {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) return;
      window.supa.from('profiles').select('is_admin, is_moderator').eq('id', session.user.id).single().then(function (pr) {
        amStaff = !!(pr.data && (pr.data.is_admin || pr.data.is_moderator));
        if (amStaff) render();
      });
    });
  }

  body.addEventListener('click', function (e) {
    var delA = e.target.closest('a.artel-delete');
    if (!delA) return;
    e.preventDefault();
    var id = delA.getAttribute('data-id');
    var artel = all.filter(function (a) { return String(a.id) === String(id); })[0];
    if (!confirm('Удалить артель «' + (artel ? artel.name : id) + '» вместе со всем составом и стеной? Это нельзя отменить.')) return;
    window.supa.from('artels').delete().eq('id', id).then(function (r) {
      if (r.error) { alert(r.error.message); return; }
      load();
    });
  });

  if (tabsBox) {
    tabsBox.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-tab]');
      if (!a) return;
      e.preventDefault();
      activeTab = a.getAttribute('data-tab');
      tabsBox.querySelectorAll('a').forEach(function (x) { x.classList.remove('on'); });
      a.classList.add('on');
      render();
    });
  }
  if (categoryBox) {
    categoryBox.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-cat]');
      if (!a) return;
      e.preventDefault();
      activeTab = a.getAttribute('data-cat');
      categoryBox.querySelectorAll('a.item').forEach(function (x) { x.classList.remove('now'); });
      a.classList.add('now');
      render();
    });
  }

  if (openBtn) {
    openBtn.addEventListener('click', function () {
      window.supa.auth.getSession().then(function (res) {
        if (!res.data || !res.data.session) { alert('Сначала войдите вверху страницы.'); return; }
        section.style.display = section.style.display === 'none' ? 'block' : 'none';
        if (section.style.display === 'block') section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      var name = (nameInput.value || '').trim();
      var description = (descInput.value || '').trim();
      if (!name || !description) { setHint('Заполните название и описание.', false); return; }
      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) { setHint('Сначала войдите вверху страницы.', false); return; }
        submitBtn.disabled = true;
        setHint('Создаём...', null);
        window.supa.from('artels').insert({
          name: name,
          description: description,
          category: categorySelect.value,
          created_by: session.user.id
        }).select('id').single().then(function (ir) {
          submitBtn.disabled = false;
          if (ir.error) { setHint(ir.error.message, false); return; }
          window.location.href = 'artel-view.html?id=' + ir.data.id;
        });
      });
    });
  }

  load();
})();

/*
 * «История аккаунта» — досье участника для админа/модератора: анкета,
 * почта, вся активность по разделам сайта. Доступ проверяется дважды: тут
 * (для удобства) и по-настоящему правилами RLS в базе.
 *
 * Сделано специально НЕ как раньше (12 параллельных запросов в модалке —
 * зависало у пользователя без объяснений, дважды). Тут каждый раздел
 * грузится СВОИМ отдельным запросом строго ПО ОЧЕРЕДИ (не параллельно), у
 * каждого свой тайм-аут 8с и своя строка на странице — если что-то одно
 * зависнет или упадёт, видно ровно на каком разделе, а все остальные, что
 * успели раньше, уже показаны и никуда не пропадают.
 */
(function () {
  if (!window.supa) return;

  var guard = document.getElementById('guard');
  var guardText = document.getElementById('guardText');
  var historyArea = document.getElementById('historyArea');
  var headerBox = document.getElementById('headerBox');
  var sectionsBox = document.getElementById('sectionsBox');
  if (!guard || !historyArea) return;

  var targetId = new URLSearchParams(window.location.search).get('id');
  var myId = null;
  var myIsAdmin = false;

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

  function withTimeout(queryFactory, ms, label) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ data: null, error: { message: 'нет ответа за ' + Math.round(ms / 1000) + 'с (' + label + ')' } });
      }, ms);
      Promise.resolve(queryFactory()).then(function (res) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(res);
      }, function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ data: null, error: { message: String((err && err.message) || err) } });
      });
    });
  }

  var CONTENT_SECTIONS = [
    { kind: 'photos', label: 'Фото в профиле' },
    { kind: 'forum', label: 'Ответы на форуме' },
    { kind: 'list', table: 'feed_posts', label: 'Лента', body: 'body' },
    { kind: 'list', table: 'quote_posts', label: 'Цитаты и Креатив', body: 'body', hasKind: true },
    { kind: 'list', table: 'canteen_posts', label: 'Столовая', body: 'body' },
    { kind: 'list', table: 'diary_posts', label: 'Дневник', body: 'body', title: 'title' },
    { kind: 'list', table: 'artel_posts', label: 'Стена артели', body: 'body' },
    { kind: 'list', table: 'listings', label: 'Услуги и вещи', body: 'description', title: 'title' },
    { kind: 'list', table: 'lost_found_posts', label: 'Потеряшки', body: 'description', title: 'title' },
    { kind: 'list', table: 'profile_reviews', label: 'Отзывы (оставленные)', body: 'body' }
  ];

  function buildQuery(sec, userId) {
    if (sec.kind === 'photos') {
      return window.supa.from('profile_photos').select('url, caption, created_at').eq('profile_id', userId).order('created_at', { ascending: false });
    }
    if (sec.kind === 'forum') {
      return window.supa.from('forum_replies').select('id, body, created_at, topic_id, forum_topics(title)').eq('author_id', userId).order('created_at', { ascending: false }).limit(100);
    }
    var cols = 'id, created_at, ' + sec.body;
    if (sec.title) cols += ', ' + sec.title;
    if (sec.hasKind) cols += ', kind';
    return window.supa.from(sec.table).select(cols).eq('author_id', userId).order('created_at', { ascending: false }).limit(100);
  }

  function renderHeader(m) {
    var html = '';
    html += '<div class="p-row" style="border-top:0"><span class="lbl">Ник</span><span class="val"><b><a href="profile.html?id=' + m.id + '" target="_blank">' + escapeHtml(m.nickname) + '</a></b> (№' + m.member_no + ')</span></div>';
    html += '<div class="p-row"><span class="lbl">Пароль</span><span class="val hint">Не показывается никому и никогда — хранится необратимым хешем, его не видит и сама Supabase. Это не ограничение интерфейса.</span></div>';
    html += '<div class="p-row"><span class="lbl">Почта</span><span class="val" id="emailField">Загрузка...</span></div>';
    html += '<div class="p-row"><span class="lbl">Регистрация</span><span class="val">' + fmtDateTime(m.created_at) + '</span></div>';
    html += '<div class="p-row"><span class="lbl">Был онлайн</span><span class="val">' + fmtDateTime(m.last_seen_at) + '</span></div>';
    html += '<div class="p-row"><span class="lbl">Студент подтверждён</span><span class="val">' + (m.verified ? 'да' : 'нет') + '</span></div>';
    html += '<div class="p-row"><span class="lbl">Репутация</span><span class="val">' + (m.reputation > 0 ? '+' : '') + (m.reputation || 0) + '</span></div>';
    html += '<div class="p-row"><span class="lbl">Роль</span><span class="val">' + (m.is_admin ? 'Администратор' : (m.is_moderator ? 'Модератор' : 'Обычный участник')) + '</span></div>';
    if (m.quote) html += '<div class="p-row"><span class="lbl">Цитата под именем</span><span class="val">«' + escapeHtml(m.quote) + '»</span></div>';
    var about = [
      m.real_name ? 'Имя: ' + escapeHtml(m.real_name) : '',
      m.faculty ? 'Факультет: ' + escapeHtml(m.faculty) : '',
      m.enroll_year ? 'Год поступления: ' + m.enroll_year : '',
      m.speciality ? 'Специальность: ' + escapeHtml(m.speciality) : '',
      m.gender ? 'Пол: ' + (m.gender === 'm' ? 'мужской' : 'женский') : '',
      m.birthday ? 'Дата рождения: ' + m.birthday : '',
      m.hobbies ? 'Увлечения: ' + escapeHtml(m.hobbies) : '',
      m.vk_url ? 'VK: ' + escapeHtml(m.vk_url) : ''
    ].filter(Boolean);
    if (about.length) html += '<div class="p-row"><span class="lbl">Анкета</span><span class="val">' + about.join('<br>') + '</span></div>';
    headerBox.innerHTML = html;

    if (myIsAdmin && m.id !== myId) renderRoleButtons(m);
  }

  function renderRoleButtons(m) {
    var roleBox = document.createElement('div');
    roleBox.className = 'p-row';
    roleBox.innerHTML = '<span class="lbl">Управление</span><span class="val" id="roleActs"></span>';
    headerBox.appendChild(roleBox);
    var actsEl = roleBox.querySelector('#roleActs');

    function addRoleBtn(label, role, value) {
      var btn = document.createElement('button');
      btn.className = 'submit';
      btn.type = 'button';
      btn.style.marginRight = '6px';
      btn.textContent = label;
      btn.addEventListener('click', function () {
        btn.disabled = true;
        window.supa.rpc('set_staff_role', { target_id: m.id, role: role, value: value }).then(function (r) {
          btn.disabled = false;
          if (r.error) { alert(r.error.message); return; }
          window.location.reload();
        });
      });
      actsEl.appendChild(btn);
    }

    if (m.is_moderator) addRoleBtn('Снять модератора', 'moderator', false);
    else addRoleBtn('Сделать модератором', 'moderator', true);
    if (m.is_admin) addRoleBtn('Снять админа', 'admin', false);
    else addRoleBtn('Сделать админом', 'admin', true);
  }

  function renderSectionRow(sec) {
    var row = document.createElement('div');
    row.className = 'p-row';
    row.innerHTML = '<span class="lbl"><a href="#" class="hist-toggle" style="text-decoration:none;color:inherit;cursor:default">' + escapeHtml(sec.label) + '</a></span><span class="val" data-status>Загрузка...</span>';
    sectionsBox.appendChild(row);
    return row.querySelector('[data-status]');
  }

  // Раздел по умолчанию показывает только число — сам список того, что
  // человек писал (или фото), открывается по клику на название раздела,
  // чтобы страница сразу не была длиннющей простынёй у активных авторов.
  function renderSectionResult(sec, statusEl, res) {
    var row = statusEl.closest('.p-row');
    var toggle = row.querySelector('.hist-toggle');
    toggle.addEventListener('click', function (e) { e.preventDefault(); });

    if (res.error) {
      statusEl.textContent = 'не удалось: ' + res.error.message;
      statusEl.style.color = '#b23e00';
      return;
    }
    var rows = res.data || [];
    statusEl.textContent = String(rows.length) + (rows.length === 100 ? '+' : '');
    if (!rows.length) return;

    var hist = document.createElement('div');
    hist.hidden = true;
    hist.className = sec.kind === 'photos' ? 'mdetail-photos' : 'p-hist';
    if (sec.kind === 'photos') {
      hist.innerHTML = rows.map(function (ph) {
        return '<figure><div class="ph" style="background-image:url(' + ph.url + ')"></div><figcaption>' + escapeHtml(ph.caption || '') + '</figcaption></figure>';
      }).join('');
    } else if (sec.kind === 'forum') {
      hist.innerHTML = rows.slice(0, 30).map(function (r) {
        var topic = r.forum_topics || {};
        return escapeHtml((r.body || '').slice(0, 90)) + ' <span class="hint" style="margin:0">— в теме «' + escapeHtml(topic.title || '?') + '», ' + fmtDateTime(r.created_at) + '</span>';
      }).join('<br>');
    } else {
      hist.innerHTML = rows.slice(0, 30).map(function (r) {
        var text = sec.title && r[sec.title] ? r[sec.title] + (r[sec.body] ? ' — ' + r[sec.body] : '') : (r[sec.body] || '');
        var kindTag = sec.hasKind ? (r.kind === 'creative' ? ' [креатив]' : ' [цитата]') : '';
        return escapeHtml(text.slice(0, 90)) + kindTag + ' <span class="hint" style="margin:0">— ' + fmtDateTime(r.created_at) + '</span>';
      }).join('<br>');
    }
    row.insertAdjacentElement('afterend', hist);
    toggle.style.textDecoration = '';
    toggle.style.color = '';
    toggle.style.cursor = 'pointer';
    toggle.title = 'Показать/скрыть список';
    toggle.addEventListener('click', function () { hist.hidden = !hist.hidden; });
  }

  function runSequential(userId) {
    var m = null;

    return withTimeout(function () {
      return window.supa.from('profiles').select('id, member_no, nickname, quote, verified, is_admin, is_moderator, reputation, created_at, last_seen_at, faculty, enroll_year, speciality, real_name, gender, birthday, hobbies, vk_url').eq('id', userId).single();
    }, 8000, 'профиль')
      .then(function (res) {
        if (res.error || !res.data) {
          headerBox.innerHTML = '<p class="hint">Не удалось загрузить профиль: ' + escapeHtml((res.error || {}).message || '') + '</p>';
          return;
        }
        m = res.data;
        renderHeader(m);
      })
      .then(function () {
        if (!m) return;
        return withTimeout(function () { return window.supa.rpc('admin_get_user_email', { target_id: userId }); }, 8000, 'почта').then(function (r) {
          var emailEl = document.getElementById('emailField');
          if (!emailEl) return;
          emailEl.textContent = r.error ? ('нет доступа (' + r.error.message + ')') : (r.data || '—');
        });
      })
      .then(function () {
        var chain = Promise.resolve();
        CONTENT_SECTIONS.forEach(function (sec) {
          chain = chain.then(function () {
            var statusEl = renderSectionRow(sec);
            return withTimeout(function () { return buildQuery(sec, userId); }, 8000, sec.label).then(function (res) {
              renderSectionResult(sec, statusEl, res);
            });
          });
        });
        return chain;
      });
  }

  // ---------- вход в страницу: проверка прав ----------
  if (!targetId) {
    guardText.textContent = 'Не указан ?id= — откройте эту страницу по кнопке «История аккаунта» с чьего-нибудь профиля.';
    return;
  }

  window.supa.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) {
      guardText.textContent = 'Доступно только вошедшим админам и модераторам.';
      return;
    }
    myId = session.user.id;
    window.supa.from('profiles').select('is_admin, is_moderator').eq('id', myId).single().then(function (r) {
      if (r.error || !r.data || !(r.data.is_admin || r.data.is_moderator)) {
        guardText.textContent = 'Доступ только для админов и модераторов.';
        return;
      }
      myIsAdmin = !!r.data.is_admin;
      guard.hidden = true;
      historyArea.hidden = false;
      runSequential(targetId);
    });
  });
})();

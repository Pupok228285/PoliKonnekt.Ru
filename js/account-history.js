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
  var targetNick = '';

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
    { kind: 'conversations', label: 'Личные переписки', anchorId: 'chats' },
    { kind: 'groups', label: 'Группы' },
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
    if (sec.kind === 'conversations') {
      return window.supa.from('conversations')
        .select('id, user_a, user_b, status, last_message_at, a:profiles!user_a(id,nickname), b:profiles!user_b(id,nickname)')
        .or('user_a.eq.' + userId + ',user_b.eq.' + userId)
        .order('last_message_at', { ascending: false }).limit(100);
    }
    if (sec.kind === 'groups') {
      return window.supa.from('chat_group_members')
        .select('group_id, joined_at, chat_groups(id, title, last_message_at)')
        .eq('profile_id', userId)
        .order('joined_at', { ascending: false }).limit(100);
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
    if (sec.anchorId) row.id = sec.anchorId;
    row.innerHTML = '<span class="lbl"><a href="#" class="hist-toggle" style="text-decoration:none;color:inherit;cursor:default">' + escapeHtml(sec.label) + '</a></span><span class="val" data-status>Загрузка...</span>';
    sectionsBox.appendChild(row);
    return row.querySelector('[data-status]');
  }

  // Рисует реальную переписку как чат (пузыри слева/справа, фото по
  // подписанной ссылке) — тем же стилем .chatbox/.log/.me/.them, что и у
  // живого диалога в messages.html, чтобы админ видел ровно то же самое,
  // что видит сам участник.
  function renderMessageList(logEl, msgs, isRight, bucket) {
    logEl.innerHTML = '';
    if (!msgs.length) { logEl.innerHTML = '<p class="hint" style="margin:4px 0">Сообщений нет.</p>'; return; }
    msgs.forEach(function (m2) {
      var p = document.createElement('p');
      p.className = isRight(m2.sender_id) ? 'me' : 'them';
      p.innerHTML = '<b' + (!isRight(m2.sender_id) ? ' class="who"' : '') + '>' + escapeHtml(m2.who) + ':</b>' +
        (m2.body ? ' ' + escapeHtml(m2.body) : '') +
        '<br><span class="hint" style="margin:0;font-size:9px">' + fmtDateTime(m2.created_at) + '</span>';
      logEl.appendChild(p);
      if (m2.photo_path) {
        var img = document.createElement('img');
        img.className = 'msg-photo';
        img.alt = 'фото';
        img.title = 'Открыть в полный размер';
        p.insertBefore(img, p.lastChild);
        window.supa.storage.from(bucket).createSignedUrl(m2.photo_path, 600).then(function (signed) {
          if (signed.data && signed.data.signedUrl) {
            img.src = signed.data.signedUrl;
            img.addEventListener('click', function () { window.open(signed.data.signedUrl, '_blank'); });
          }
        });
      }
    });
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Переписка/группа — двухуровневое раскрытие: сама запись в списке тоже
  // кликабельна и подгружает настоящие сообщения только при первом клике.
  function renderConversationsHist(container, rows, userId) {
    rows.forEach(function (row) {
      var other = (String(row.user_a) === String(userId) ? row.b : row.a) || {};
      var line = document.createElement('div');
      line.style.cssText = 'padding:3px 0;border-bottom:1px dashed #e4e9ef';
      var head = document.createElement('a');
      head.href = '#';
      head.style.cssText = 'color:inherit;text-decoration:none;cursor:pointer;display:block';
      head.innerHTML = '<b>' + escapeHtml(other.nickname || '?') + '</b> <span class="hint" style="margin:0">— ' +
        (row.status === 'pending' ? 'заявка, ' : '') + fmtDateTime(row.last_message_at) + '</span>';
      var body = document.createElement('div');
      body.hidden = true;
      body.className = 'chatbox';
      body.style.cssText = 'margin:4px 0 6px 10px';
      body.innerHTML = '<div class="log" style="max-height:300px;overflow:auto"><p class="hint" style="margin:4px 0">Загрузка...</p></div>';
      line.appendChild(head);
      line.appendChild(body);
      container.appendChild(line);

      var loaded = false;
      head.addEventListener('click', function (e) {
        e.preventDefault();
        body.hidden = !body.hidden;
        if (body.hidden || loaded) return;
        loaded = true;
        var logEl = body.querySelector('.log');
        window.supa.from('messages')
          .select('id, sender_id, body, photo_path, created_at')
          .eq('conversation_id', row.id).order('created_at', { ascending: true }).limit(300)
          .then(function (res) {
            if (res.error) { logEl.innerHTML = '<p class="hint">не удалось: ' + escapeHtml(res.error.message) + '</p>'; return; }
            var msgs = (res.data || []).map(function (m2) {
              return { sender_id: m2.sender_id, body: m2.body, photo_path: m2.photo_path, created_at: m2.created_at,
                who: String(m2.sender_id) === String(userId) ? targetNick : (other.nickname || '?') };
            });
            renderMessageList(logEl, msgs, function (sid) { return String(sid) === String(userId); }, 'pm-photos');
          });
      });
    });
  }

  function renderGroupsHist(container, rows, userId) {
    rows.forEach(function (row) {
      var g = row.chat_groups || {};
      var line = document.createElement('div');
      line.style.cssText = 'padding:3px 0;border-bottom:1px dashed #e4e9ef';
      var head = document.createElement('a');
      head.href = '#';
      head.style.cssText = 'color:inherit;text-decoration:none;cursor:pointer;display:block';
      head.innerHTML = '<b>' + escapeHtml(g.title || '?') + '</b> <span class="hint" style="margin:0">— ' + fmtDateTime(g.last_message_at) + '</span>';
      var body = document.createElement('div');
      body.hidden = true;
      body.className = 'chatbox';
      body.style.cssText = 'margin:4px 0 6px 10px';
      body.innerHTML = '<div class="log" style="max-height:300px;overflow:auto"><p class="hint" style="margin:4px 0">Загрузка...</p></div>';
      line.appendChild(head);
      line.appendChild(body);
      container.appendChild(line);

      var loaded = false;
      head.addEventListener('click', function (e) {
        e.preventDefault();
        body.hidden = !body.hidden;
        if (body.hidden || loaded || !g.id) return;
        loaded = true;
        var logEl = body.querySelector('.log');
        window.supa.from('chat_group_messages')
          .select('id, sender_id, body, photo_path, created_at, profiles!sender_id(nickname)')
          .eq('group_id', g.id).order('created_at', { ascending: true }).limit(300)
          .then(function (res) {
            if (res.error) { logEl.innerHTML = '<p class="hint">не удалось: ' + escapeHtml(res.error.message) + '</p>'; return; }
            var msgs = (res.data || []).map(function (m2) {
              return { sender_id: m2.sender_id, body: m2.body, photo_path: m2.photo_path, created_at: m2.created_at,
                who: (m2.profiles && m2.profiles.nickname) || '?' };
            });
            renderMessageList(logEl, msgs, function (sid) { return String(sid) === String(userId); }, 'group-photos');
          });
      });
    });
  }

  // Раздел по умолчанию показывает только число — сам список того, что
  // человек писал (или фото), открывается по клику на название раздела,
  // чтобы страница сразу не была длиннющей простынёй у активных авторов.
  function renderSectionResult(sec, statusEl, res, userId) {
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
    } else if (sec.kind === 'conversations') {
      renderConversationsHist(hist, rows, userId);
    } else if (sec.kind === 'groups') {
      renderGroupsHist(hist, rows, userId);
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
        targetNick = m.nickname || '';
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
              renderSectionResult(sec, statusEl, res, userId);
            });
          });
        });
        return chain;
      })
      .then(function () {
        if (window.location.hash === '#chats') {
          var toggle = document.querySelector('#chats .hist-toggle');
          if (toggle) { toggle.click(); toggle.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }
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

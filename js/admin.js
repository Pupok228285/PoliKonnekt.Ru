/*
 * Админ-панель. Доступ проверяется дважды: тут в интерфейсе (для удобства) и,
 * по-настоящему, правилами RLS в базе — обычный человек данные не получит,
 * даже если откроет эту страницу напрямую.
 */
(function () {
  if (!window.supa) return;

  var SUPPORT_KIND_LABELS = { complaint: 'Жалоба', question: 'Вопрос', suggestion: 'Предложение' };

  var guard = document.getElementById('adminGuard');
  var guardText = document.getElementById('adminGuardText');
  var area = document.getElementById('adminArea');
  if (!guard || !area) return;

  var roleNote = document.getElementById('adminRoleNote');
  var membersSection = document.getElementById('membersSection');
  var onlineCount = document.getElementById('onlineCount');
  var onlineList = document.getElementById('onlineList');
  var queueBox = document.getElementById('queueBox');
  var supportBox = document.getElementById('supportBox');
  var memberRows = document.getElementById('memberRows');
  var memberCount = document.getElementById('memberCount');
  var memberSearch = document.getElementById('memberSearch');
  var memberSearchForm = document.getElementById('memberSearchForm');
  var memberShowAll = document.getElementById('memberShowAll');
  var memberRoleTabs = document.getElementById('memberRoleTabs');
  var memberDetailBox = document.getElementById('memberDetailBox');
  var memberDetail = document.getElementById('memberDetail');
  var albumsAdminSection = document.getElementById('albumsAdminSection');
  var albumsAdminList = document.getElementById('albumsAdminList');
  var newAlbumTitle = document.getElementById('newAlbumTitle');
  var newAlbumBtn = document.getElementById('newAlbumBtn');
  var newAlbumStatus = document.getElementById('newAlbumStatus');
  var albumSubsSection = document.getElementById('albumSubsSection');
  var albumSubsList = document.getElementById('albumSubsList');

  var adsAdminSection = document.getElementById('adsAdminSection');
  var adsAdminList = document.getElementById('adsAdminList');

  var artelModeSection = document.getElementById('artelModeSection');
  var artelLeaderModeSelect = document.getElementById('artelLeaderModeSelect');
  var artelLeaderModeStatus = document.getElementById('artelLeaderModeStatus');

  var allMembers = [];
  var artelLeaderIds = {}; // profile_id -> true, для фильтра "Главари К'Артелей"
  var activeRoleFilter = '';
  var myIsAdmin = false;
  var myId = null;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function checkAccess() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) {
        guardText.textContent = 'Сначала войдите вверху страницы.';
        return;
      }
      myId = session.user.id;
      window.supa.from('profiles').select('is_admin, is_moderator').eq('id', session.user.id).single().then(function (pr) {
        if (pr.error || !pr.data || !(pr.data.is_admin || pr.data.is_moderator)) {
          guardText.textContent = 'Эта страница только для администратора или модератора.';
          return;
        }
        guard.hidden = true;
        area.hidden = false;
        myIsAdmin = !!pr.data.is_admin;
        if (myIsAdmin) {
          roleNote.textContent = 'Вы вошли как администратор — полный доступ.';
          loadMembers();
          if (albumsAdminSection) { albumsAdminSection.hidden = false; loadAlbumsAdmin(); }
          if (albumSubsSection) { albumSubsSection.hidden = false; loadAlbumSubs(); }
          if (adsAdminSection) { adsAdminSection.hidden = false; loadAdsAdmin(); updateAdPreview(); }
          if (artelModeSection) { artelModeSection.hidden = false; loadArtelLeaderMode(); }
        } else {
          roleNote.textContent = 'Вы вошли как модератор — список участников с почтой виден только администратору.';
          if (membersSection) membersSection.hidden = true;
        }
        loadOnline();
        loadQueue();
        loadSupport();
      });
    });
  }

  // ---------- онлайн ----------
  function loadOnline() {
    var since = new Date(Date.now() - 2 * 60000).toISOString();
    window.supa.from('profiles').select('nickname, last_seen_at').gte('last_seen_at', since).order('last_seen_at', { ascending: false })
      .then(function (res) {
        if (res.error) { onlineCount.textContent = 'ошибка загрузки'; return; }
        onlineCount.innerHTML = '<span class="red">' + res.data.length + '</span> чел. онлайн за последние 2 минуты';
        onlineList.textContent = res.data.map(function (r) { return r.nickname; }).join(', ') || '—';
      });
  }

  // ---------- очередь зачёток ----------
  function loadQueue() {
    window.supa.from('verification_requests')
      .select('id, photo_path, created_at, profiles!profile_id(id, nickname, member_no)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) { queueBox.innerHTML = '<p class="hint">' + escapeHtml(res.error.message) + '</p>'; return; }
        if (!res.data.length) { queueBox.innerHTML = '<p class="hint" style="padding:4px 2px">Очередь пуста.</p>'; return; }
        queueBox.innerHTML = '';
        res.data.forEach(function (row) { renderQueueCard(row); });
      });
  }

  function renderQueueCard(row) {
    var card = document.createElement('div');
    card.className = 'queue-card';
    var prof = row.profiles || {};
    card.innerHTML =
      '<a class="ph" href="#" target="_blank" rel="noopener" title="Открыть фото в полный размер" style="cursor:zoom-in"></a>' +
      '<div class="body">' +
        '<div class="name">' + escapeHtml(prof.nickname || '?') + ' <span class="hint" style="margin:0">(№' + prof.member_no + ')</span></div>' +
        '<div class="meta">Прислано: ' + fmtDateTime(row.created_at) + '</div>' +
        '<div class="hint" style="margin:0 0 4px">Клик по фото — открыть в полный размер</div>' +
        '<div class="acts">' +
          '<button class="submit" type="button" data-approve>Подтвердить</button>' +
          '<button class="submit" type="button" data-reject>Отклонить</button>' +
        '</div>' +
      '</div>';
    queueBox.appendChild(card);

    var phEl = card.querySelector('.ph');
    window.supa.storage.from('id-cards').createSignedUrl(row.photo_path, 600).then(function (signed) {
      if (signed.data && signed.data.signedUrl) {
        phEl.style.backgroundImage = 'url(' + signed.data.signedUrl + ')';
        phEl.href = signed.data.signedUrl;
      }
    });

    async function finish(newStatus) {
      var rpcRes = await window.supa.rpc('review_verification_request', { req_id: row.id, decision: newStatus });
      if (rpcRes.error) { alert(rpcRes.error.message); return; }
      await window.supa.storage.from('id-cards').remove([row.photo_path]);
      loadQueue();
    }

    card.querySelector('[data-approve]').addEventListener('click', function () { finish('approved'); });
    card.querySelector('[data-reject]').addEventListener('click', function () { finish('rejected'); });
  }

  // ---------- поддержка (жалобы/вопросы) ----------
  // Очередь показывает только открытые — это список того, что реально ждёт
  // действия. Решённые никуда не пропадают — их и вообще ВСЮ историю
  // обращений (любого статуса, любого автора) можно посмотреть одной общей
  // кнопкой «История всех обращений» ниже, а не искать кнопку на каждой
  // отдельной карточке.
  function loadSupport() {
    window.supa.from('support_messages')
      .select('id, author_id, kind, subject, body, status, context_url, created_at, profiles!author_id(nickname)')
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) { supportBox.innerHTML = '<p class="hint">' + escapeHtml(res.error.message) + '</p>'; return; }
        if (!res.data.length) { supportBox.innerHTML = '<p class="hint" style="padding:4px 2px">Открытых обращений нет.</p>'; return; }
        supportBox.innerHTML = '';
        res.data.forEach(renderSupportCard);
      });
  }

  function renderSupportCard(row) {
    var card = document.createElement('div');
    card.className = 'queue-card';
    var prof = row.profiles || {};
    var kindLabel = SUPPORT_KIND_LABELS[row.kind] || 'Вопрос';
    var resolved = row.status === 'resolved';
    if (resolved) card.style.opacity = '.7';
    card.innerHTML =
      '<div class="ph" style="background:none;display:flex;align-items:center;justify-content:center;font-size:11px;text-align:center">' + kindLabel + '</div>' +
      '<div class="body">' +
        '<div class="name">' + escapeHtml(row.subject) + ' <span class="hint" style="margin:0">— <a href="profile.html?id=' + row.author_id + '" target="_blank">' + escapeHtml(prof.nickname || '?') + '</a>' +
          (resolved ? ' · <span style="color:#1d7813">решено</span>' : '') + '</span></div>' +
        '<div class="meta">Прислано: ' + fmtDateTime(row.created_at) + (row.context_url ? (' · <a href="' + escapeHtml(row.context_url) + '" target="_blank" rel="noopener">страница</a>') : '') + '</div>' +
        '<div class="hint" style="margin:4px 0">' + escapeHtml(row.body) + '</div>' +
        '<div class="chatbox" style="margin:6px 0">' +
          '<div class="log" data-log style="min-height:20px;padding:6px"><p class="hint">Загрузка...</p></div>' +
          '<div class="row2">' +
            '<input class="field" type="text" data-reply-input placeholder="Ответить автору...">' +
            '<button class="submit" type="button" data-reply-btn>Отправить</button>' +
          '</div>' +
        '</div>' +
        '<div class="acts">' +
          (resolved ? '' : '<button class="submit" type="button" data-resolve>Решено</button> ') +
          '<a class="submit" href="messages.html?to=' + encodeURIComponent(prof.nickname || '') + '">Написать</a>' +
        '</div>' +
      '</div>';
    supportBox.appendChild(card);

    function refreshThread() {
      window.supa.from('support_replies')
        .select('id, author_id, body, created_at, profiles!author_id(nickname, is_admin, is_moderator)')
        .eq('ticket_id', row.id)
        .order('created_at', { ascending: true })
        .then(function (res) {
          var logEl = card.querySelector('[data-log]');
          if (res.error) { logEl.innerHTML = '<p class="hint">' + escapeHtml(res.error.message) + '</p>'; return; }
          if (!res.data.length) { logEl.innerHTML = '<p class="hint" style="margin:2px 4px">Пока без ответа.</p>'; return; }
          logEl.innerHTML = '';
          res.data.forEach(function (r) {
            var rprof = r.profiles || {};
            var mine = r.author_id === myId;
            var who = mine ? 'Вы' : ((rprof.is_admin || rprof.is_moderator) ? 'Поддержка' : ('<a href="profile.html?id=' + r.author_id + '" target="_blank">' + escapeHtml(rprof.nickname || '?') + '</a>'));
            var p = document.createElement('p');
            p.className = mine ? 'me' : 'them';
            p.innerHTML = '<b>' + who + ':</b> ' + escapeHtml(r.body);
            logEl.appendChild(p);
          });
        });
    }
    refreshThread();

    card.querySelector('[data-reply-btn]').addEventListener('click', function () {
      var input = card.querySelector('[data-reply-input]');
      var text = (input.value || '').trim();
      if (!text) return;
      window.supa.from('support_replies').insert({ ticket_id: row.id, author_id: myId, body: text }).then(function (r) {
        if (r.error) { alert(r.error.message); return; }
        input.value = '';
        refreshThread();
      });
    });

    var resolveBtn = card.querySelector('[data-resolve]');
    if (resolveBtn) {
      resolveBtn.addEventListener('click', function () {
        window.supa.from('support_messages').update({ status: 'resolved' }).eq('id', row.id).then(loadSupport);
      });
    }
  }

  // Одна общая кнопка вместо кнопки на каждой карточке — открывает историю
  // ВСЕХ обращений (любой статус, любой автор), не только текущей очереди.
  var supportHistoryBtn = document.getElementById('supportHistoryBtn');
  var supportHistoryPanel = document.getElementById('supportHistoryPanel');
  var supportHistoryLoaded = false;
  if (supportHistoryBtn && supportHistoryPanel) {
    supportHistoryBtn.addEventListener('click', function () {
      supportHistoryPanel.hidden = !supportHistoryPanel.hidden;
      if (supportHistoryPanel.hidden || supportHistoryLoaded) return;
      supportHistoryLoaded = true;
      loadSupportHistory();
    });
  }

  function loadSupportHistory() {
    supportHistoryPanel.innerHTML = '<p class="hint" style="padding:4px 2px">Загрузка истории...</p>';
    window.supa.from('support_messages')
      .select('id, author_id, kind, subject, body, status, created_at, profiles!author_id(nickname), support_replies(id, author_id, body, created_at, profiles!author_id(nickname, is_admin, is_moderator))')
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error || !res.data) { supportHistoryPanel.innerHTML = '<p class="hint">Не удалось загрузить историю.</p>'; return; }
        if (!res.data.length) { supportHistoryPanel.innerHTML = '<p class="hint" style="padding:4px 2px">Обращений ещё не было.</p>'; return; }
        supportHistoryPanel.innerHTML = res.data.map(function (t) {
          var tProf = t.profiles || {};
          var tKind = SUPPORT_KIND_LABELS[t.kind] || 'Вопрос';
          var tStatus = t.status === 'resolved' ? 'решено' : 'открыто';
          var tNickHtml = '<a href="profile.html?id=' + t.author_id + '" target="_blank">' + escapeHtml(tProf.nickname || '?') + '</a>';
          var replies = (t.support_replies || [])
            .slice()
            .sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); })
            .map(function (r) {
              var rprof = r.profiles || {};
              var who = (rprof.is_admin || rprof.is_moderator) ? 'Поддержка' : ('<a href="profile.html?id=' + r.author_id + '" target="_blank">' + escapeHtml(rprof.nickname || '?') + '</a>');
              return '<p class="hint" style="margin:2px 0 2px 12px">&#8618; <b>' + who + ':</b> ' + escapeHtml(r.body) + '</p>';
            }).join('');
          return '<div style="padding:6px 4px;border-bottom:1px solid #e3e9f0">' +
            '<b>' + tKind + ': ' + escapeHtml(t.subject) + '</b> <span class="hint" style="margin:0">— ' + tNickHtml + ', ' + tStatus + ', ' + fmtDateTime(t.created_at) + '</span>' +
            '<div class="hint" style="margin:2px 0">' + escapeHtml(t.body) + '</div>' +
            replies +
          '</div>';
        }).join('');
      });
  }

  // ---------- альбомы (фото грузит только админ, см. решение в TODO.md) ----------
  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) {
            if (!blob) { reject(new Error('Не удалось сжать изображение.')); return; }
            resolve(blob);
          }, 'image/jpeg', quality);
        };
        img.onerror = function () { reject(new Error('Не удалось прочитать изображение.')); };
        img.src = e.target.result;
      };
      reader.onerror = function () { reject(new Error('Не удалось прочитать файл.')); };
      reader.readAsDataURL(file);
    });
  }

  function loadAlbumsAdmin() {
    if (!albumsAdminList) return;
    albumsAdminList.innerHTML = '<p class="hint" style="padding:4px 2px">Загрузка...</p>';
    window.supa.from('albums').select('id, title, created_at, album_photos(id, url)').order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { albumsAdminList.innerHTML = '<p class="hint">' + escapeHtml(res.error.message) + '</p>'; return; }
        if (!res.data.length) { albumsAdminList.innerHTML = '<p class="hint" style="padding:4px 2px">Пока нет альбомов — создайте первый выше.</p>'; return; }
        albumsAdminList.innerHTML = '';
        res.data.forEach(function (a) { albumsAdminList.appendChild(renderAlbumAdminBlock(a)); });
      });
  }

  function renderAlbumAdminBlock(a) {
    var photos = a.album_photos || [];
    var box = document.createElement('div');
    box.style.cssText = 'margin:0 0 12px;padding:8px;border:1px solid #d7e2ee;background:var(--row1)';

    var head = document.createElement('div');
    head.className = 'btns';
    head.style.cssText = 'justify-content:space-between;margin:0 0 6px';
    head.innerHTML = '<b>' + escapeHtml(a.title) + '</b> <span class="hint" style="margin:0">(' + photos.length + ' фото)</span>';
    var delBtn = document.createElement('a');
    delBtn.href = '#'; delBtn.className = 'hint'; delBtn.textContent = 'удалить альбом';
    delBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (!confirm('Удалить альбом «' + a.title + '» вместе со всеми фото?')) return;
      window.supa.from('albums').delete().eq('id', a.id).then(function (r) {
        if (r.error) { alert(r.error.message); return; }
        loadAlbumsAdmin();
      });
    });
    head.appendChild(delBtn);
    box.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'p-photos';
    photos.forEach(function (p) {
      var fig = document.createElement('figure');
      var ph = document.createElement('div');
      ph.className = 'ph';
      ph.style.backgroundImage = 'url(' + p.url + ')';
      ph.style.backgroundSize = 'cover';
      ph.style.backgroundPosition = 'center';
      var cap = document.createElement('figcaption');
      var rm = document.createElement('a');
      rm.href = '#'; rm.textContent = 'удалить';
      rm.addEventListener('click', function (e) {
        e.preventDefault();
        window.supa.from('album_photos').delete().eq('id', p.id).then(function (r) {
          if (r.error) { alert(r.error.message); return; }
          loadAlbumsAdmin();
        });
      });
      cap.appendChild(rm);
      fig.appendChild(ph);
      fig.appendChild(cap);
      grid.appendChild(fig);
    });
    box.appendChild(grid);

    var uploadRow = document.createElement('div');
    uploadRow.className = 'btns';
    uploadRow.style.cssText = 'justify-content:flex-start;margin-top:6px';
    var fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.multiple = true;
    var statusSpan = document.createElement('span');
    statusSpan.className = 'hint';
    uploadRow.appendChild(fileInput);
    uploadRow.appendChild(statusSpan);
    box.appendChild(uploadRow);

    fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInput.files || []);
      if (!files.length) return;
      // лимит фото — только для заявок от участников (см. album_submissions);
      // у админа своего альбома лимита нет, он и так осознанно наполняет сам
      var done = 0;
      statusSpan.textContent = 'Сжимаем и загружаем 0/' + files.length + '...';
      Promise.all(files.map(function (file) {
        return compressImage(file, 1600, 0.75).then(function (blob) {
          var path = a.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg';
          return window.supa.storage.from('album-photos').upload(path, blob, { contentType: 'image/jpeg' }).then(function (upRes) {
            if (upRes.error) throw upRes.error;
            var url = window.supa.storage.from('album-photos').getPublicUrl(path).data.publicUrl;
            return window.supa.from('album_photos').insert({ album_id: a.id, url: url }).then(function (insRes) {
              if (insRes.error) throw insRes.error;
              done++;
              statusSpan.textContent = 'Сжимаем и загружаем ' + done + '/' + files.length + '...';
            });
          });
        });
      })).then(function () {
        statusSpan.textContent = 'Готово.';
        loadAlbumsAdmin();
      }).catch(function (err) {
        statusSpan.textContent = 'Ошибка: ' + (err && err.message ? err.message : err);
      });
    });

    return box;
  }

  // ---------- заявки на альбомы (рисунки/фото от участников) ----------
  function loadAlbumSubs() {
    if (!albumSubsList) return;
    albumSubsList.innerHTML = '<p class="hint" style="padding:4px 2px">Загрузка...</p>';
    Promise.all([
      window.supa.from('album_submissions').select('id, photo_url, caption, created_at, profiles!author_id(id, nickname)').order('created_at', { ascending: true }),
      window.supa.from('albums').select('id, title').order('title', { ascending: true })
    ]).then(function (results) {
      var subsRes = results[0], albumsRes = results[1];
      if (subsRes.error) { albumSubsList.innerHTML = '<p class="hint">' + escapeHtml(subsRes.error.message) + '</p>'; return; }
      if (!subsRes.data.length) { albumSubsList.innerHTML = '<p class="hint" style="padding:4px 2px">Заявок пока нет.</p>'; return; }
      var albumOptions = (albumsRes.data || []);
      albumSubsList.innerHTML = '';
      subsRes.data.forEach(function (s) { albumSubsList.appendChild(renderAlbumSubRow(s, albumOptions)); });
    });
  }

  function renderAlbumSubRow(s, albumOptions) {
    var prof = s.profiles || {};
    var box = document.createElement('div');
    box.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin:0 0 10px;padding:8px;border:1px solid #d7e2ee;background:var(--row1)';

    var ph = document.createElement('div');
    ph.style.cssText = 'width:100px;height:100px;flex:none;background-size:cover;background-position:center;border:1px solid #ccc';
    ph.style.backgroundImage = 'url(' + s.photo_url + ')';
    box.appendChild(ph);

    var right = document.createElement('div');
    right.style.cssText = 'flex:1;min-width:0';
    var nickHtml = prof.id
      ? '<a href="profile.html?id=' + prof.id + '">' + escapeHtml(prof.nickname || '?') + '</a>'
      : escapeHtml(prof.nickname || '?');
    right.innerHTML =
      '<div>' + nickHtml + ' <span class="hint" style="margin:0">— ' + fmtDateTime(s.created_at) + '</span></div>' +
      (s.caption ? '<div style="margin:4px 0">' + escapeHtml(s.caption) + '</div>' : '');

    var actRow = document.createElement('div');
    actRow.className = 'btns';
    actRow.style.cssText = 'justify-content:flex-start;margin-top:6px';

    var select = document.createElement('select');
    select.className = 'field';
    if (!albumOptions.length) {
      var opt0 = document.createElement('option');
      opt0.textContent = 'сначала создайте альбом выше';
      opt0.disabled = true;
      select.appendChild(opt0);
      select.disabled = true;
    } else {
      albumOptions.forEach(function (a) {
        var opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.title;
        select.appendChild(opt);
      });
    }
    actRow.appendChild(select);

    var addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'submit'; addBtn.textContent = 'Добавить в альбом';
    addBtn.disabled = !albumOptions.length;
    addBtn.addEventListener('click', function () {
      var albumId = Number(select.value);
      if (!albumId) return;
      addBtn.disabled = true;
      window.supa.from('album_photos').insert({ album_id: albumId, url: s.photo_url }).then(function (insRes) {
        if (insRes.error) { alert(insRes.error.message); addBtn.disabled = false; return; }
        window.supa.from('album_submissions').delete().eq('id', s.id).then(function () { loadAlbumSubs(); });
      });
    });
    actRow.appendChild(addBtn);

    var rejectBtn = document.createElement('a');
    rejectBtn.href = '#'; rejectBtn.className = 'hint'; rejectBtn.style.marginLeft = '10px'; rejectBtn.textContent = 'отклонить';
    rejectBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (!confirm('Отклонить эту заявку? Файл удалится.')) return;
      window.supa.from('album_submissions').delete().eq('id', s.id).then(function (r) {
        if (r.error) { alert(r.error.message); return; }
        loadAlbumSubs();
      });
    });
    actRow.appendChild(rejectBtn);

    right.appendChild(actRow);
    box.appendChild(right);
    return box;
  }

  if (newAlbumBtn) {
    newAlbumBtn.addEventListener('click', function () {
      var title = (newAlbumTitle.value || '').trim();
      if (!title) { setStatusHint(newAlbumStatus, 'Введите название.', false); return; }
      newAlbumBtn.disabled = true;
      window.supa.from('albums').insert({ title: title, created_by: myId }).then(function (r) {
        newAlbumBtn.disabled = false;
        if (r.error) { setStatusHint(newAlbumStatus, r.error.message, false); return; }
        setStatusHint(newAlbumStatus, 'Создан.', true);
        newAlbumTitle.value = '';
        loadAlbumsAdmin();
      });
    });
  }

  function setStatusHint(el, text, ok) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = ok ? '#1d7813' : '#b23e00';
  }

  // ---------- реклама (поп-ап на главной) ----------
  var DESKTOP_PREVIEW_SCALE = 240 / 1280;
  var MOBILE_PREVIEW_SCALE = 90 / 375;

  function updateAdPreview() {
    var dwEl = document.getElementById('adDesktopW'), dhEl = document.getElementById('adDesktopH');
    var mwEl = document.getElementById('adMobileW'), mhEl = document.getElementById('adMobileH');
    var dBox = document.getElementById('adPreviewDesktopBox'), mBox = document.getElementById('adPreviewMobileBox');
    if (!dwEl || !dBox) return;
    var dw = Math.max(1, Number(dwEl.value) || 0), dh = Math.max(1, Number(dhEl.value) || 0);
    var mw = Math.max(1, Number(mwEl.value) || 0), mh = Math.max(1, Number(mhEl.value) || 0);
    dBox.style.width = Math.min(240, dw * DESKTOP_PREVIEW_SCALE) + 'px';
    dBox.style.height = Math.min(150, dh * DESKTOP_PREVIEW_SCALE) + 'px';
    mBox.style.width = Math.min(90, mw * MOBILE_PREVIEW_SCALE) + 'px';
    mBox.style.height = Math.min(195, mh * MOBILE_PREVIEW_SCALE) + 'px';
  }

  function bindAdPreset(selectId, wId, hId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.addEventListener('change', function () {
      if (sel.value === 'custom') return;
      var parts = sel.value.split('x');
      document.getElementById(wId).value = parts[0];
      document.getElementById(hId).value = parts[1];
      updateAdPreview();
    });
  }
  bindAdPreset('adDesktopPreset', 'adDesktopW', 'adDesktopH');
  bindAdPreset('adMobilePreset', 'adMobileW', 'adMobileH');
  ['adDesktopW', 'adDesktopH', 'adMobileW', 'adMobileH'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', updateAdPreview);
  });

  // ---------- К'Артель — режим назначения главаря ----------
  function loadArtelLeaderMode() {
    if (!artelLeaderModeSelect) return;
    window.supa.from('site_settings').select('artel_leader_mode').eq('id', true).single().then(function (res) {
      if (res.error || !res.data) {
        if (artelLeaderModeStatus) artelLeaderModeStatus.textContent = 'не удалось загрузить (миграция ещё не применена?)';
        return;
      }
      artelLeaderModeSelect.value = res.data.artel_leader_mode;
    });
  }

  if (artelLeaderModeSelect) {
    artelLeaderModeSelect.addEventListener('change', function () {
      var mode = artelLeaderModeSelect.value;
      artelLeaderModeSelect.disabled = true;
      if (artelLeaderModeStatus) artelLeaderModeStatus.textContent = 'сохраняем...';
      window.supa.from('site_settings').update({ artel_leader_mode: mode }).eq('id', true).then(function (r) {
        artelLeaderModeSelect.disabled = false;
        if (r.error) { if (artelLeaderModeStatus) artelLeaderModeStatus.textContent = 'ошибка: ' + r.error.message; return; }
        if (artelLeaderModeStatus) artelLeaderModeStatus.textContent = 'сохранено';
        setTimeout(function () { if (artelLeaderModeStatus) artelLeaderModeStatus.textContent = ''; }, 2000);
      });
    });
  }

  function loadAdsAdmin() {
    if (!adsAdminList) return;
    adsAdminList.innerHTML = '<p class="hint" style="padding:4px 2px">Загрузка...</p>';
    window.supa.from('ads').select('*').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { adsAdminList.innerHTML = '<p class="hint">' + escapeHtml(res.error.message) + '</p>'; return; }
      if (!res.data.length) { adsAdminList.innerHTML = '<p class="hint" style="padding:4px 2px">Пока нет объявлений — пока висит старая шутка.</p>'; return; }
      var now = Date.now();
      adsAdminList.innerHTML = res.data.map(function (ad) {
        var expired = new Date(ad.active_until).getTime() < now;
        var label = (ad.image_url ? '[фото]' : '') + (ad.image_url && ad.text_body ? ' + ' : '') + (ad.text_body ? '«' + escapeHtml(ad.text_body.slice(0, 60)) + '»' : '');
        return '<div class="p-row"><span class="lbl">' + (expired ? '<span class="hint">истекло</span>' : '<b style="color:#1d7813">активно</b>') + '</span>' +
          '<span class="val">' + label + ' <span class="hint" style="margin:0">до ' + fmtDateTime(ad.active_until) +
          ' · ПК ' + ad.desktop_w + '×' + ad.desktop_h + ', тел. ' + ad.mobile_w + '×' + ad.mobile_h + '</span> ' +
          '<a href="#" class="ad-del" data-id="' + ad.id + '" style="margin-left:6px">удалить</a></span></div>';
      }).join('');
      adsAdminList.querySelectorAll('.ad-del').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          window.supa.from('ads').delete().eq('id', btn.getAttribute('data-id')).then(function (r) {
            if (r.error) { alert(r.error.message); return; }
            loadAdsAdmin();
          });
        });
      });
    });
  }

  var adCreateBtn = document.getElementById('adCreateBtn');
  if (adCreateBtn) {
    adCreateBtn.addEventListener('click', function () {
      var statusEl = document.getElementById('adCreateStatus');
      var untilVal = document.getElementById('adUntilInput').value;
      if (!untilVal) { setStatusHint(statusEl, 'Укажите дату, до которой висит.', false); return; }
      var textVal = (document.getElementById('adTextInput').value || '').trim();
      var hasFile = !!(document.getElementById('adImageInput').files && document.getElementById('adImageInput').files[0]);
      if (!textVal && !hasFile) { setStatusHint(statusEl, 'Заполните текст, добавьте фото — или и то, и то.', false); return; }

      var payload = {
        content_type: hasFile ? 'image' : 'text',
        text_body: textVal || null,
        link_url: (document.getElementById('adLinkInput').value || '').trim() || null,
        active_until: new Date(untilVal + 'T23:59:59').toISOString(),
        desktop_w: Number(document.getElementById('adDesktopW').value) || 300,
        desktop_h: Number(document.getElementById('adDesktopH').value) || 250,
        mobile_w: Number(document.getElementById('adMobileW').value) || 320,
        mobile_h: Number(document.getElementById('adMobileH').value) || 50,
        created_by: myId
      };

      function insertAd(imageUrl) {
        if (imageUrl) payload.image_url = imageUrl;
        window.supa.from('ads').insert(payload).then(function (r) {
          adCreateBtn.disabled = false;
          if (r.error) { setStatusHint(statusEl, r.error.message, false); return; }
          setStatusHint(statusEl, 'Опубликовано.', true);
          document.getElementById('adTextInput').value = '';
          document.getElementById('adLinkInput').value = '';
          var imgInput = document.getElementById('adImageInput');
          if (imgInput) imgInput.value = '';
          loadAdsAdmin();
        });
      }

      adCreateBtn.disabled = true;
      if (hasFile) {
        var file = document.getElementById('adImageInput').files[0];
        setStatusHint(statusEl, 'Сжимаем и загружаем...', true);
        compressImage(file, 1200, 0.8).then(function (blob) {
          var path = Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg';
          return window.supa.storage.from('ad-photos').upload(path, blob, { contentType: 'image/jpeg' }).then(function (upRes) {
            if (upRes.error) throw upRes.error;
            insertAd(window.supa.storage.from('ad-photos').getPublicUrl(path).data.publicUrl);
          });
        }).catch(function (err) {
          adCreateBtn.disabled = false;
          setStatusHint(statusEl, 'Ошибка: ' + (err && err.message ? err.message : err), false);
        });
      } else {
        setStatusHint(statusEl, 'Публикуем...', true);
        insertAd(null);
      }
    });
  }

  // ---------- участники ----------
  function loadMembers() {
    Promise.all([
      window.supa.rpc('admin_list_profiles'),
      window.supa.from('artel_members').select('profile_id').eq('role', 'leader')
    ]).then(function (results) {
      var res = results[0], leadersRes = results[1];
      if (res.error) { memberRows.innerHTML = '<tr><td colspan="6">' + escapeHtml(res.error.message) + '</td></tr>'; return; }
      allMembers = res.data || [];
      artelLeaderIds = {};
      (leadersRes.data || []).forEach(function (r) { artelLeaderIds[r.profile_id] = true; });
      applyMemberFilters();
    });
  }

  function applyMemberFilters() {
    var q = (memberSearch.value || '').trim().toLowerCase();
    var list = allMembers.filter(function (m) {
      if (activeRoleFilter === 'admin' && !m.is_admin) return false;
      if (activeRoleFilter === 'moderator' && !m.is_moderator) return false;
      if (activeRoleFilter === 'leader' && !artelLeaderIds[m.id]) return false;
      if (activeRoleFilter === 'verified' && !m.verified) return false;
      if (q) {
        var hay = m.nickname.toLowerCase().indexOf(q) !== -1 || String(m.member_no) === q ||
          m.id === q || (m.email || '').toLowerCase().indexOf(q) !== -1;
        if (!hay) return false;
      }
      return true;
    });
    renderMembers(list);
  }

  function renderMembers(list) {
    memberCount.textContent = '(' + list.length + ')';
    memberRows.innerHTML = '';
    list.forEach(function (m, i) {
      var tr = document.createElement('tr');
      tr.className = 'mrow';
      var rowClass = i % 2 === 0 ? 'row1' : 'row2';
      var roleParts = [];
      if (m.is_admin) roleParts.push('★ админ');
      if (m.is_moderator) roleParts.push('M модер.');
      if (artelLeaderIds[m.id]) roleParts.push('Г главарь');
      var roleLabel = roleParts.length ? roleParts.join('<br>') : '—';
      tr.innerHTML =
        '<td class="' + rowClass + '">' + m.member_no + '</td>' +
        '<td class="' + rowClass + '"><b>' + escapeHtml(m.nickname) + '</b></td>' +
        '<td class="' + rowClass + ' hide-m">' + escapeHtml(m.email) + '</td>' +
        '<td class="' + rowClass + ' c">' + (m.verified ? '✅' : '—') + '</td>' +
        '<td class="' + rowClass + ' c">' + roleLabel + '</td>' +
        '<td class="' + rowClass + ' hide-m">' + fmtDateTime(m.last_seen_at) + '</td>';
      tr.addEventListener('click', function () { showMemberDetail(m); });
      memberRows.appendChild(tr);
    });
  }

  // ---------- карточка участника ----------
  // Простая и надёжная версия: только данные, уже загруженные списком
  // (без десятка параллельных запросов по всем разделам сайта — та
  // многоисточниковая версия «Истории аккаунта» зависала у пользователя на
  // «Загрузка...» без объяснений и по прямой просьбе убрана целиком).
  function showMemberDetail(m) {
    if (!memberDetailBox || !memberDetail) return;
    memberDetailBox.hidden = false;
    memberDetailBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    var html = '';
    html += '<div class="p-row" style="border-top:0"><span class="lbl">Ник</span><span class="val"><b><a href="profile.html?id=' + m.id + '" target="_blank">' + escapeHtml(m.nickname) + '</a></b> (№' + m.member_no + ')</span></div>';
    html += '<div class="p-row"><span class="lbl">Почта</span><span class="val">' + escapeHtml(m.email) + '</span></div>';
    html += '<div class="p-row"><span class="lbl">Регистрация</span><span class="val">' + fmtDateTime(m.created_at) + '</span></div>';
    html += '<div class="p-row"><span class="lbl">Был онлайн</span><span class="val">' + fmtDateTime(m.last_seen_at) + '</span></div>';
    html += '<div class="p-row"><span class="lbl">Студент подтверждён</span><span class="val">' + (m.verified ? 'да' : 'нет') + '</span></div>';
    html += '<div class="p-row"><span class="lbl">Репутация</span><span class="val">' + (m.reputation > 0 ? '+' : '') + (m.reputation || 0) + '</span></div>';
    html += '<div class="p-row"><span class="lbl">Роль</span><span class="val">' + (m.is_admin ? 'Администратор' : (m.is_moderator ? 'Модератор' : 'Обычный участник')) + '</span></div>';
    memberDetail.innerHTML = html;

    if (myIsAdmin && m.id !== myId) {
      var roleBox = document.createElement('div');
      roleBox.className = 'p-row';
      roleBox.innerHTML = '<span class="lbl">Управление</span><span class="val" id="roleActs"></span>';
      memberDetail.appendChild(roleBox);
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
            m.is_admin = role === 'admin' ? value : m.is_admin;
            m.is_moderator = role === 'moderator' ? value : m.is_moderator;
            showMemberDetail(m);
            loadMembers();
          });
        });
        actsEl.appendChild(btn);
      }

      if (m.is_moderator) addRoleBtn('Снять модератора', 'moderator', false);
      else addRoleBtn('Сделать модератором', 'moderator', true);

      if (m.is_admin) addRoleBtn('Снять админа', 'admin', false);
      else addRoleBtn('Сделать админом', 'admin', true);
    }
  }

  if (memberSearchForm) {
    memberSearchForm.addEventListener('submit', function () { applyMemberFilters(); });
  }
  if (memberShowAll) {
    memberShowAll.addEventListener('click', function () {
      memberSearch.value = '';
      activeRoleFilter = '';
      if (memberRoleTabs) {
        memberRoleTabs.querySelectorAll('a').forEach(function (x) { x.classList.remove('on'); });
        memberRoleTabs.querySelector('a[data-role=""]').classList.add('on');
      }
      applyMemberFilters();
    });
  }
  if (memberRoleTabs) {
    memberRoleTabs.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-role]');
      if (!a) return;
      e.preventDefault();
      activeRoleFilter = a.getAttribute('data-role');
      memberRoleTabs.querySelectorAll('a').forEach(function (x) { x.classList.remove('on'); });
      a.classList.add('on');
      applyMemberFilters();
    });
  }

  checkAccess();
})();

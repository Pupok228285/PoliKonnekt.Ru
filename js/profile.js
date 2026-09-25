/*
 * Мой профиль — настоящие данные из Supabase: ник, цитата, аватар, фото,
 * история изменений (пишется триггером в базе) и приватность истории.
 */
(function () {
  if (!window.supa) { console.error('profile: supa client не инициализирован'); return; }

  var guestNotice = document.getElementById('profileGuestNotice');
  var loggedArea = document.getElementById('profileLoggedInArea');
  if (!guestNotice || !loggedArea) return; // не та страница

  var pAv = document.getElementById('pAv');
  var pNick = document.getElementById('pNick');
  var pTick = document.getElementById('pTick');
  var pVerifyNote = document.getElementById('pVerifyNote');
  var pQuote = document.getElementById('pQuote');
  var pStats = document.getElementById('pStats');
  var nickInput = document.getElementById('nickInput');
  var nickSave = document.getElementById('nickSave');
  var nickStatus = document.getElementById('nickStatus');
  var quoteInput = document.getElementById('quoteInput');
  var quoteSave = document.getElementById('quoteSave');
  var quoteStatus = document.getElementById('quoteStatus');
  var avatarInput = document.getElementById('avatarInput');
  var avatarStatus = document.getElementById('avatarStatus');
  var photoList = document.getElementById('photoList');
  var photoInput = document.getElementById('photoInput');
  var photoCaption = document.getElementById('photoCaption');
  var photoAdd = document.getElementById('photoAdd');
  var photoStatus = document.getElementById('photoStatus');
  var pOtherActions = document.getElementById('pOtherActions');
  var pWriteBtn = document.getElementById('pWriteBtn');
  var pOwnSettingsSection = document.getElementById('pOwnSettingsSection');
  var pFavoritesSection = document.getElementById('pFavoritesSection');
  var pFavoritesList = document.getElementById('pFavoritesList');
  var pAnonBtn = document.getElementById('pAnonBtn');
  var pDossierLink = document.getElementById('pDossierLink');
  var pAnonComposeBox = document.getElementById('pAnonComposeBox');
  var pAnonText = document.getElementById('pAnonText');
  var pAnonHint = document.getElementById('pAnonHint');
  var pAnonSendBtn = document.getElementById('pAnonSendBtn');
  var pAnonSection = document.getElementById('pAnonSection');
  var pAnonList = document.getElementById('pAnonList');
  var pPhotoAddRow = document.getElementById('pPhotoAddRow');
  var pRecentBox = document.getElementById('pRecentBox');
  var pAboutEdit = document.getElementById('pAboutEdit');
  var pAboutView = document.getElementById('pAboutView');

  var currentUserId = null;
  var isOwnProfile = true;
  var viewerId = null; // id того, кто сейчас смотрит (может быть null — гость)
  var viewBumped = false;
  var urlId = new URLSearchParams(window.location.search).get('id');
  var FIELD_LABEL = { nickname: 'Ник', avatar_url: 'Аватар', quote: 'Цитата' };
  var RECENT_SOURCES = [
    { table: 'feed_posts', label: 'в Ленте' },
    { table: 'quote_posts', label: 'в Цитатах и Креативе' },
    { table: 'canteen_posts', label: 'в Столовой' },
    { table: 'forum_replies', label: 'на форуме' },
    { table: 'artel_posts', label: 'на стене артели' },
    { table: 'diary_posts', label: 'в Дневнике' },
    { table: 'review_topics', label: 'в Отзывах' }
  ];

  function setMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = ok ? '#1d7813' : '#b23e00';
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function setAvatarBox(el, url, letter) {
    if (url) {
      el.style.backgroundImage = 'url(' + url + ')';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = letter;
    }
  }

  function loadHistory() {
    ['nickname', 'avatar_url', 'quote'].forEach(function (field) {
      var target = document.getElementById('hist-' + field);
      if (!target) return;
      window.supa.from('profile_history')
        .select('old_value, changed_at')
        .eq('profile_id', currentUserId)
        .eq('field', field)
        .order('changed_at', { ascending: false })
        .then(function (res) {
          if (res.error) { target.textContent = 'Не удалось загрузить.'; return; }
          if (!res.data.length) { target.textContent = 'Изменений пока не было.'; return; }
          target.innerHTML = res.data.map(function (row) {
            var val = row.old_value ? escapeHtml(row.old_value) : '(пусто)';
            return val + ' — до ' + fmtDate(row.changed_at);
          }).join(' &nbsp;&middot;&nbsp; ');
        });
    });
  }

  function loadPhotos() {
    window.supa.from('profile_photos')
      .select('id, url, caption')
      .eq('profile_id', currentUserId)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { console.error('photos load error', res.error); return; }
        photoList.innerHTML = '';
        if (!res.data.length) {
          photoList.innerHTML = '<p class="hint" style="padding:4px 2px">Фото пока нет — добавьте первое ниже.</p>';
          return;
        }
        res.data.forEach(function (row) {
          var fig = document.createElement('figure');
          var ph = document.createElement('div');
          ph.className = 'ph';
          ph.style.backgroundImage = 'url(' + row.url + ')';
          ph.style.backgroundSize = 'cover';
          ph.style.backgroundPosition = 'center';
          var cap = document.createElement('figcaption');
          cap.textContent = row.caption || '';
          fig.appendChild(ph);
          fig.appendChild(cap);
          photoList.appendChild(fig);
        });
      });
  }

  function applyPrivacyState(p) {
    var map = { name: p.name_history_public, avatar: p.avatar_history_public, quote: p.quote_history_public };
    document.querySelectorAll('.seg[data-hist]').forEach(function (seg) {
      var key = seg.getAttribute('data-hist') === 'avatar_url' ? 'avatar' : seg.getAttribute('data-hist');
      var isPublic = map[key];
      seg.querySelectorAll('button').forEach(function (btn) {
        var wants = btn.getAttribute('data-show') === '1';
        btn.classList.toggle('on', wants === !!isPublic);
      });
    });
  }

  function rankFor(rep) {
    if (rep >= 50) return 'Легенда Политеха';
    if (rep >= 20) return 'Душа факультета';
    if (rep >= 5) return 'Активный студент';
    if (rep >= 0) return 'Студент';
    return 'Ищет себя';
  }

  function courseLabel(year) {
    if (!year) return '';
    var now = new Date();
    var course = now.getFullYear() - year + (now.getMonth() >= 8 ? 1 : 0);
    if (course < 1) return 'ещё не начал(а)';
    if (course > 6) return 'выпустился(лась)';
    return course + ' курс';
  }

  function renderAboutView(p) {
    var rows = [];
    if (p.faculty) rows.push(['Факультет', escapeHtml(p.faculty)]);
    if (p.enroll_year) rows.push(['Год поступления', p.enroll_year + (courseLabel(p.enroll_year) ? ' (' + courseLabel(p.enroll_year) + ')' : '')]);
    if (p.speciality) rows.push(['Специальность', escapeHtml(p.speciality)]);
    if (p.real_name) rows.push(['Имя', escapeHtml(p.real_name)]);
    if (p.gender) rows.push(['Пол', p.gender === 'm' ? 'Мужской' : 'Женский']);
    if (p.birthday) rows.push(['Дата рождения', fmtDate(p.birthday)]);
    if (p.hobbies) rows.push(['Увлечения', escapeHtml(p.hobbies)]);
    if (p.vk_url) {
      var href = /^https?:\/\//.test(p.vk_url) ? p.vk_url : 'https://' + p.vk_url;
      rows.push(['ВКонтакте', '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' + escapeHtml(p.vk_url) + '</a>']);
    }
    if (!rows.length) return '<p class="hint" style="padding:4px 2px">Анкета не заполнена.</p>';
    return rows.map(function (r) {
      return '<div class="p-row"><span class="lbl">' + r[0] + '</span><span class="val">' + r[1] + '</span></div>';
    }).join('');
  }

  // ---------- друзья ----------
  function loadFriends(userId, viewingOwn, myId) {
    var listEl = document.getElementById('pFriendsList');
    var countEl = document.getElementById('pFriendsCount');
    var reqBox = document.getElementById('pFriendRequests');
    var actionRow = document.getElementById('pFriendActionRow');
    if (!listEl) return;

    window.supa.from('friendships')
      .select('id, requester_id, addressee_id, status, requester:profiles!requester_id(id, nickname, avatar_url), addressee:profiles!addressee_id(id, nickname, avatar_url)')
      .or('requester_id.eq.' + userId + ',addressee_id.eq.' + userId)
      .then(function (res) {
        if (res.error || !res.data) { listEl.innerHTML = '<p class="hint" style="padding:4px 2px">Не удалось загрузить.</p>'; return; }
        var rows = res.data;
        var accepted = rows.filter(function (r) { return r.status === 'accepted'; });
        countEl.textContent = accepted.length ? '(' + accepted.length + ')' : '';
        if (!accepted.length) {
          listEl.className = '';
          listEl.innerHTML = '<p class="hint" style="padding:4px 2px">Пока никого — можно добавить со страницы профиля знакомого.</p>';
        } else {
          listEl.className = 'roster';
          listEl.innerHTML = '';
          accepted.forEach(function (r) {
            var other = (r.requester_id === userId) ? r.addressee : r.requester;
            if (!other) return;
            var letter = (other.nickname || '?').charAt(0).toUpperCase();
            var avStyle = other.avatar_url ? ' style="background-image:url(' + other.avatar_url + ');background-size:cover;background-position:center"' : '';
            var div = document.createElement('div');
            div.className = 'm';
            div.innerHTML = '<a href="profile.html?id=' + other.id + '"><span class="av"' + avStyle + '>' + (other.avatar_url ? '' : letter) +
              '</span><span class="nm">' + escapeHtml(other.nickname || '?') + '</span></a>';
            listEl.appendChild(div);
          });
        }

        // входящие заявки — видны только на своей странице
        if (reqBox) {
          if (!viewingOwn) { reqBox.hidden = true; reqBox.innerHTML = ''; }
          else {
            var incoming = rows.filter(function (r) { return r.status === 'pending' && r.addressee_id === userId; });
            if (!incoming.length) { reqBox.hidden = true; reqBox.innerHTML = ''; }
            else {
              reqBox.hidden = false;
              reqBox.innerHTML = '<p class="hint" style="padding:2px 2px 4px">Заявки в друзья:</p>' + incoming.map(function (r) {
                var other = r.requester || {};
                return '<div class="p-row"><span class="lbl"><a href="profile.html?id=' + other.id + '">' + escapeHtml(other.nickname || '?') + '</a></span>' +
                  '<span class="val"><a href="#" class="submit fr-accept" data-id="' + r.id + '" style="margin-right:6px">Принять</a>' +
                  '<a href="#" class="fr-decline" data-id="' + r.id + '">Отклонить</a></span></div>';
              }).join('');
              reqBox.querySelectorAll('.fr-accept').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                  e.preventDefault();
                  window.supa.from('friendships').update({ status: 'accepted' }).eq('id', btn.getAttribute('data-id'))
                    .then(function () { loadFriends(userId, viewingOwn, myId); });
                });
              });
              reqBox.querySelectorAll('.fr-decline').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                  e.preventDefault();
                  window.supa.from('friendships').delete().eq('id', btn.getAttribute('data-id'))
                    .then(function () { loadFriends(userId, viewingOwn, myId); });
                });
              });
            }
          }
        }

        // кнопка действия — только на чужой странице, для залогиненных
        if (!actionRow) return;
        if (viewingOwn || !myId) { actionRow.style.display = 'none'; actionRow.innerHTML = ''; return; }
        actionRow.style.display = 'flex';
        var rel = rows.find(function (r) { return r.requester_id === myId || r.addressee_id === myId; });
        if (!rel) {
          actionRow.innerHTML = '<a class="submit" href="#" id="pFriendAddBtn">Добавить в друзья</a><span class="hint" id="pFriendStatus" style="margin:0 0 0 6px"></span>';
          document.getElementById('pFriendAddBtn').addEventListener('click', function (e) {
            e.preventDefault();
            window.supa.from('friendships').insert({ requester_id: myId, addressee_id: userId }).then(function (r) {
              if (r.error) { setMsg(document.getElementById('pFriendStatus'), r.error.message, false); return; }
              loadFriends(userId, viewingOwn, myId);
            });
          });
        } else if (rel.status === 'accepted') {
          actionRow.innerHTML = '<span class="hint" style="margin:0">Вы уже друзья &middot; </span><a href="#" id="pFriendRemoveBtn">удалить из друзей</a>';
          document.getElementById('pFriendRemoveBtn').addEventListener('click', function (e) {
            e.preventDefault();
            window.supa.from('friendships').delete().eq('id', rel.id).then(function () { loadFriends(userId, viewingOwn, myId); });
          });
        } else if (rel.requester_id === myId) {
          actionRow.innerHTML = '<span class="hint" style="margin:0">Заявка отправлена &middot; </span><a href="#" id="pFriendCancelBtn">отменить</a>';
          document.getElementById('pFriendCancelBtn').addEventListener('click', function (e) {
            e.preventDefault();
            window.supa.from('friendships').delete().eq('id', rel.id).then(function () { loadFriends(userId, viewingOwn, myId); });
          });
        } else {
          actionRow.innerHTML = '<a class="submit" href="#" id="pFriendAcceptBtn">Принять заявку в друзья</a> <a href="#" id="pFriendDeclineBtn" style="margin-left:6px">отклонить</a>';
          document.getElementById('pFriendAcceptBtn').addEventListener('click', function (e) {
            e.preventDefault();
            window.supa.from('friendships').update({ status: 'accepted' }).eq('id', rel.id).then(function () { loadFriends(userId, viewingOwn, myId); });
          });
          document.getElementById('pFriendDeclineBtn').addEventListener('click', function (e) {
            e.preventDefault();
            window.supa.from('friendships').delete().eq('id', rel.id).then(function () { loadFriends(userId, viewingOwn, myId); });
          });
        }
      });
  }

  // ---------- отзывы ----------
  function loadReviews(userId, viewingOwn, myId) {
    var listEl = document.getElementById('pReviewsList');
    var countEl = document.getElementById('pReviewsCount');
    var composeRow = document.getElementById('pReviewComposeRow');
    if (!listEl) return;
    if (composeRow) composeRow.style.display = (!viewingOwn && myId) ? 'flex' : 'none';

    window.supa.from('profile_reviews')
      .select('id, body, created_at, author_id, profiles!author_id(id, nickname, verified)')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error || !res.data) { listEl.innerHTML = '<p class="hint" style="padding:4px 2px">Не удалось загрузить.</p>'; return; }
        countEl.textContent = res.data.length ? '(' + res.data.length + ')' : '';
        if (!res.data.length) { listEl.innerHTML = '<p class="hint" style="padding:4px 2px">Пока пусто.</p>'; return; }
        listEl.innerHTML = res.data.map(function (r) {
          var prof = r.profiles || {};
          var nameHtml = prof.id
            ? '<a href="profile.html?id=' + prof.id + '">' + escapeHtml(prof.nickname || '?') + '</a>'
            : escapeHtml(prof.nickname || '?');
          var canDelete = myId && r.author_id === myId;
          return '<div class="p-row"><span class="lbl">' + nameHtml +
            (prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="">' : '') + '</span>' +
            '<span class="val">' + escapeHtml(r.body) + ' <span class="hint" style="margin:0">— ' + fmtDate(r.created_at) + '</span>' +
            (canDelete ? ' <a href="#" class="rv-del" data-id="' + r.id + '" style="margin-left:6px">удалить</a>' : '') + '</span></div>';
        }).join('');
        listEl.querySelectorAll('.rv-del').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            window.supa.from('profile_reviews').delete().eq('id', btn.getAttribute('data-id'))
              .then(function () { loadReviews(userId, viewingOwn, myId); });
          });
        });
      });
  }

  function loadAnonMessages() {
    if (!pAnonList) return;
    window.supa.rpc('get_my_anonymous_messages').then(function (res) {
      if (res.error) { pAnonList.innerHTML = '<p class="hint" style="padding:4px 2px">Не удалось загрузить.</p>'; return; }
      var rows = res.data || [];
      if (!rows.length) { pAnonList.innerHTML = '<p class="hint" style="padding:4px 2px">Пока ничего не написали.</p>'; return; }
      pAnonList.innerHTML = rows.map(function (r) {
        return '<div class="p-row"><span class="lbl">' + fmtDate(r.created_at) + '</span><span class="val">' +
          escapeHtml(r.body).replace(/\n/g, '<br>') +
          ' <a href="#" class="anon-del" data-id="' + r.id + '" style="margin-left:6px">удалить</a>' +
          ' <a href="#" style="margin-left:6px">Пожаловаться</a></span></div>';
      }).join('');
      pAnonList.querySelectorAll('.anon-del').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          window.supa.from('anonymous_messages').delete().eq('id', a.getAttribute('data-id')).then(loadAnonMessages);
        });
      });
    });
  }

  if (pAnonBtn) {
    pAnonBtn.addEventListener('click', function () {
      window.supa.auth.getSession().then(function (res) {
        if (!res.data || !res.data.session) { alert('Сначала войдите вверху страницы.'); return; }
        pAnonComposeBox.hidden = !pAnonComposeBox.hidden;
      });
    });
  }
  if (pAnonSendBtn) {
    pAnonSendBtn.addEventListener('click', function () {
      var body = (pAnonText.value || '').trim();
      if (!body) return;
      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) { setMsg(pAnonHint, 'Сначала войдите вверху страницы.', false); return; }
        pAnonSendBtn.disabled = true;
        window.supa.from('anonymous_messages').insert({
          recipient_id: currentUserId,
          sender_id: session.user.id,
          body: body
        }).then(function (r) {
          pAnonSendBtn.disabled = false;
          if (r.error) { setMsg(pAnonHint, r.error.message, false); return; }
          pAnonText.value = '';
          setMsg(pAnonHint, 'Отправлено анонимно.', true);
          pAnonComposeBox.hidden = true;
        });
      });
    });
  }

  function loadFavorites(userId) {
    if (!pFavoritesList) return;
    window.supa.from('favorites')
      .select('id, content_type, content_id, created_at')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { pFavoritesList.innerHTML = '<p class="hint" style="padding:4px 2px">Не удалось загрузить.</p>'; return; }
        var rows = res.data || [];
        if (!rows.length) { pFavoritesList.innerHTML = '<p class="hint" style="padding:4px 2px">Пока пусто — кнопка «В избранное» есть под постами в Ленте.</p>'; return; }
        var feedIds = rows.filter(function (r) { return r.content_type === 'feed_post'; }).map(function (r) { return r.content_id; });
        window.supa.from('feed_posts').select('id, body, profiles(id, nickname)').in('id', feedIds.length ? feedIds : [0])
          .then(function (postsRes) {
            var postsById = {};
            (postsRes.data || []).forEach(function (p) { postsById[p.id] = p; });
            var html = rows.map(function (r) {
              if (r.content_type !== 'feed_post') return '';
              var post = postsById[r.content_id];
              if (!post) return '';
              var prof = post.profiles || {};
              var nameHtml = prof.id
                ? '<a href="profile.html?id=' + prof.id + '">' + escapeHtml(prof.nickname || '?') + '</a>'
                : escapeHtml(prof.nickname || '?');
              var snippet = escapeHtml((post.body || '').slice(0, 100));
              return '<div class="p-row"><span class="lbl">' + nameHtml + '</span><span class="val">' +
                snippet + ((post.body || '').length > 100 ? '…' : '') +
                ' <span class="hint" style="margin:0">— из Ленты, ' + fmtDate(r.created_at) + '</span>' +
                ' <a href="index.html#lenta" style="margin-left:6px">открыть</a>' +
                ' <a href="#" class="fav-del" data-id="' + r.id + '" style="margin-left:6px">убрать</a></span></div>';
            }).join('');
            pFavoritesList.innerHTML = html || '<p class="hint" style="padding:4px 2px">Пока пусто — кнопка «В избранное» есть под постами в Ленте.</p>';
            pFavoritesList.querySelectorAll('.fav-del').forEach(function (btn) {
              btn.addEventListener('click', function (e) {
                e.preventDefault();
                window.supa.from('favorites').delete().eq('id', btn.getAttribute('data-id'))
                  .then(function () { loadFavorites(userId); });
              });
            });
          });
      });
  }

  function loadRecent(userId) {
    if (!pRecentBox) return;
    Promise.all(RECENT_SOURCES.map(function (src) {
      return window.supa.from(src.table).select('id, body, created_at').eq('author_id', userId)
        .order('created_at', { ascending: false }).limit(8)
        .then(function (res) { return (res.data || []).map(function (r) { return { body: r.body, created_at: r.created_at, label: src.label }; }); });
    })).then(function (lists) {
      var all = [].concat.apply([], lists).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }).slice(0, 8);
      if (!all.length) { pRecentBox.innerHTML = '<p class="hint" style="padding:4px 2px">Пока ничего не публиковал(а).</p>'; return; }
      pRecentBox.innerHTML = all.map(function (r) {
        var snippet = escapeHtml((r.body || '').slice(0, 90));
        return '<div class="p-row"><span class="lbl">' + fmtDate(r.created_at) + '</span><span class="val">' + snippet +
          (r.body && r.body.length > 90 ? '…' : '') + ' <span class="hint" style="margin:0">— ' + r.label + '</span></span></div>';
      }).join('');
    });
  }

  function loadProfile(userId, viewingOwn, myId) {
    currentUserId = userId;
    isOwnProfile = viewingOwn;
    viewerId = myId;
    Promise.all([
      window.supa.from('profiles').select('nickname, quote, avatar_url, verified, created_at, reputation, profile_views, name_history_public, avatar_history_public, quote_history_public, real_name, gender, birthday, hobbies, vk_url, faculty, enroll_year, speciality, anon_messages_enabled').eq('id', userId).single(),
      Promise.all(RECENT_SOURCES.map(function (src) {
        return window.supa.from(src.table).select('id', { count: 'exact', head: true }).eq('author_id', userId)
          .then(function (res) { return res.count || 0; });
      })).then(function (counts) { return counts.reduce(function (a, b) { return a + b; }, 0); })
    ]).then(function (results) {
      var profRes = results[0], totalPosts = results[1];
      if (profRes.error || !profRes.data) { console.error('profile load error', profRes.error); return; }
      var p = profRes.data;
      setAvatarBox(pAv, p.avatar_url, p.nickname.charAt(0).toUpperCase());
      pNick.textContent = p.nickname;
      document.title = p.nickname + ' — профиль — ПолиКоннект';
      pTick.style.display = p.verified ? '' : 'none';
      if (pVerifyNote) {
        if (p.verified) {
          pVerifyNote.innerHTML = '<img src="img/icons/i-verified.svg" width="16" height="16" alt="" style="vertical-align:-4px"> Студент подтверждён по зачётке.';
        } else if (viewingOwn) {
          pVerifyNote.innerHTML = 'Пока не подтверждён. <a href="index.html">Отправить фото зачётки</a> — проверит администратор.';
        } else {
          pVerifyNote.textContent = 'Пока не подтверждён.';
        }
      }
      pQuote.textContent = p.quote ? ('«' + p.quote + '»') : '';
      var rep = p.reputation || 0;
      var repColor = rep > 0 ? '#1d7813' : (rep < 0 ? '#b23e00' : '#2c4568');
      var days = Math.max(1, Math.round((Date.now() - new Date(p.created_at)) / 86400000));
      var perDay = totalPosts / days;
      pStats.innerHTML = 'На сайте с <b>' + fmtDate(p.created_at) + '</b> &middot; Постов: <b>' + totalPosts +
        '</b> <span class="hint" style="margin:0">(~' + perDay.toFixed(perDay < 1 ? 2 : 1) + '/день)</span>' +
        ' &middot; Репутация: <b style="color:' + repColor + '">' + (rep > 0 ? '+' : '') + rep + '</b>' +
        ' &middot; Группа: <b style="color:#496c9f">' + rankFor(rep) + '</b>' +
        ' &middot; Просмотров: <b>' + (p.profile_views || 0) + '</b>';

      if (viewingOwn) {
        if (pOtherActions) pOtherActions.style.display = 'none';
        if (pAnonComposeBox) pAnonComposeBox.hidden = true;
        if (pAnonSection) { pAnonSection.hidden = false; loadAnonMessages(); }
        if (pOwnSettingsSection) pOwnSettingsSection.hidden = false;
        if (pFavoritesSection) { pFavoritesSection.hidden = false; loadFavorites(userId); }
        if (pPhotoAddRow) pPhotoAddRow.style.display = '';
        nickInput.value = p.nickname;
        quoteInput.value = p.quote || '';
        applyPrivacyState(p);
        loadHistory();
        if (pAboutEdit) {
          pAboutEdit.hidden = false;
          document.getElementById('facultyInput').value = p.faculty || '';
          document.getElementById('enrollYearInput').value = p.enroll_year || '';
          document.getElementById('specialityInput').value = p.speciality || '';
          document.getElementById('realNameInput').value = p.real_name || '';
          document.getElementById('genderInput').value = p.gender || '';
          document.getElementById('birthdayInput').value = p.birthday || '';
          document.getElementById('hobbiesInput').value = p.hobbies || '';
          document.getElementById('vkInput').value = p.vk_url || '';
        }
        if (pAboutView) pAboutView.hidden = true;
      } else {
        if (pOtherActions) pOtherActions.style.display = 'flex';
        if (pWriteBtn) pWriteBtn.href = 'messages.html?to=' + encodeURIComponent(p.nickname);
        var pDiaryBtn = document.getElementById('pDiaryBtn');
        if (pDiaryBtn) pDiaryBtn.href = 'diary.html?id=' + userId;
        if (pAnonBtn) pAnonBtn.style.display = p.anon_messages_enabled ? '' : 'none';
        if (pAnonComposeBox) pAnonComposeBox.hidden = true;
        if (pAnonSection) pAnonSection.hidden = true;
        if (pOwnSettingsSection) pOwnSettingsSection.hidden = true;
        if (pFavoritesSection) pFavoritesSection.hidden = true;
        if (pPhotoAddRow) pPhotoAddRow.style.display = 'none';
        if (pAboutEdit) pAboutEdit.hidden = true;
        if (pAboutView) { pAboutView.hidden = false; pAboutView.innerHTML = renderAboutView(p); }
        if (!viewBumped) { viewBumped = true; window.supa.rpc('bump_profile_views', { target_id: userId }).then(function () {}); }
      }
      loadPhotos();
      loadRecent(userId);
      loadFriends(userId, viewingOwn, myId);
      loadReviews(userId, viewingOwn, myId);
    });
  }

  function refresh() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      var myId = session ? session.user.id : null;

      if (urlId) {
        // смотрим чью-то (может быть и свою) страницу — доступно и гостю
        guestNotice.hidden = true;
        loggedArea.hidden = false;
        loadProfile(urlId, myId === urlId, myId);
        // «История аккаунта» — ссылка на отдельную страницу, видна только
        // если смотрящий сам админ/модератор и смотрит НЕ на себя. Один
        // простой запрос по уже готовому паттерну (как amStaff в
        // artel-view.js), без единого лишнего похода в базу.
        if (pDossierLink && myId && myId !== urlId) {
          window.supa.from('profiles').select('is_admin, is_moderator').eq('id', myId).single().then(function (r) {
            if (r.error || !r.data) return;
            if (r.data.is_admin || r.data.is_moderator) {
              pDossierLink.style.display = '';
              pDossierLink.href = 'account-history.html?id=' + urlId;
            }
          });
        }
        return;
      }
      if (session) {
        guestNotice.hidden = true;
        loggedArea.hidden = false;
        loadProfile(myId, true, myId);
      } else {
        guestNotice.hidden = false;
        loggedArea.hidden = true;
        currentUserId = null;
      }
    });
  }

  refresh();
  window.supa.auth.onAuthStateChange(function () { refresh(); });

  // --- ник ---
  if (nickSave) {
    nickSave.addEventListener('click', function () {
      if (!currentUserId) return;
      var value = (nickInput.value || '').trim();
      if (!value) { setMsg(nickStatus, 'Ник не может быть пустым.', false); return; }
      setMsg(nickStatus, 'Сохраняем...', true);
      window.supa.from('profiles').update({ nickname: value }).eq('id', currentUserId).then(function (res) {
        if (res.error) {
          setMsg(nickStatus, res.error.code === '23505' ? 'Этот ник уже занят, выберите другой.' : res.error.message, false);
          return;
        }
        setMsg(nickStatus, 'Сохранено.', true);
        pNick.textContent = value;
        if (!document.getElementById('pAv').style.backgroundImage) pAv.textContent = value.charAt(0).toUpperCase();
        loadHistory();
      });
    });
  }

  // --- цитата ---
  if (quoteSave) {
    quoteSave.addEventListener('click', function () {
      if (!currentUserId) return;
      var value = (quoteInput.value || '').trim();
      setMsg(quoteStatus, 'Сохраняем...', true);
      window.supa.from('profiles').update({ quote: value || null }).eq('id', currentUserId).then(function (res) {
        if (res.error) { setMsg(quoteStatus, res.error.message, false); return; }
        setMsg(quoteStatus, 'Сохранено.', true);
        pQuote.textContent = value ? ('«' + value + '»') : '';
        loadHistory();
      });
    });
  }

  // --- переключатели приватности истории: сохраняются сразу по клику ---
  document.querySelectorAll('.seg[data-hist]').forEach(function (seg) {
    var histKey = seg.getAttribute('data-hist'); // nickname | avatar_url | quote
    var column = histKey === 'nickname' ? 'name_history_public' : (histKey === 'avatar_url' ? 'avatar_history_public' : 'quote_history_public');
    var statusId = histKey === 'nickname' ? 'nameHistStatus' : (histKey === 'avatar_url' ? 'avatarHistStatus' : 'quoteHistStatus');
    var statusEl = document.getElementById(statusId);
    seg.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!currentUserId) return;
        var wantPublic = btn.getAttribute('data-show') === '1';
        var patch = {};
        patch[column] = wantPublic;
        setMsg(statusEl, 'Сохраняем...', true);
        window.supa.from('profiles').update(patch).eq('id', currentUserId).then(function (res) {
          if (res.error) { setMsg(statusEl, res.error.message, false); return; }
          seg.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
          btn.classList.add('on');
          setMsg(statusEl, 'Сохранено.', true);
        });
      });
    });
  });

  // --- аватар ---
  if (avatarInput) {
    avatarInput.addEventListener('change', function () {
      var file = avatarInput.files && avatarInput.files[0];
      if (!file || !currentUserId) return;
      setMsg(avatarStatus, 'Загружаем...', true);
      var path = currentUserId + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      window.supa.storage.from('avatars').upload(path, file, { upsert: true }).then(function (upRes) {
        if (upRes.error) { setMsg(avatarStatus, upRes.error.message, false); return; }
        var url = window.supa.storage.from('avatars').getPublicUrl(path).data.publicUrl;
        window.supa.from('profiles').update({ avatar_url: url }).eq('id', currentUserId).then(function (res) {
          if (res.error) { setMsg(avatarStatus, res.error.message, false); return; }
          setMsg(avatarStatus, 'Готово.', true);
          setAvatarBox(pAv, url, pNick.textContent.charAt(0).toUpperCase());
          loadHistory();
        });
      });
    });
  }

  // --- анкета и образование ---
  var aboutSave = document.getElementById('aboutSave');
  if (aboutSave) {
    aboutSave.addEventListener('click', function () {
      if (!currentUserId) return;
      var statusEl = document.getElementById('aboutStatus');
      var patch = {
        faculty: document.getElementById('facultyInput').value || null,
        enroll_year: document.getElementById('enrollYearInput').value ? Number(document.getElementById('enrollYearInput').value) : null,
        speciality: (document.getElementById('specialityInput').value || '').trim() || null,
        real_name: (document.getElementById('realNameInput').value || '').trim() || null,
        gender: document.getElementById('genderInput').value || null,
        birthday: document.getElementById('birthdayInput').value || null,
        hobbies: (document.getElementById('hobbiesInput').value || '').trim() || null,
        vk_url: (document.getElementById('vkInput').value || '').trim() || null
      };
      setMsg(statusEl, 'Сохраняем...', true);
      window.supa.from('profiles').update(patch).eq('id', currentUserId).then(function (res) {
        if (res.error) { setMsg(statusEl, res.error.message, false); return; }
        setMsg(statusEl, 'Сохранено.', true);
      });
    });
  }

  // --- отзыв на чужом профиле ---
  var reviewSend = document.getElementById('reviewSend');
  var reviewInput = document.getElementById('reviewInput');
  if (reviewSend) {
    reviewSend.addEventListener('click', function () {
      var body = (reviewInput.value || '').trim();
      if (!body || !currentUserId) return;
      window.supa.auth.getSession().then(function (res) {
        var session = res.data.session;
        if (!session) { alert('Сначала войдите вверху страницы.'); return; }
        var statusEl = document.getElementById('reviewStatus');
        setMsg(statusEl, 'Отправляем...', true);
        window.supa.from('profile_reviews').insert({ profile_id: currentUserId, author_id: session.user.id, body: body }).then(function (r) {
          if (r.error) { setMsg(statusEl, r.error.message, false); return; }
          reviewInput.value = '';
          setMsg(statusEl, 'Отправлено.', true);
          loadReviews(currentUserId, isOwnProfile, session.user.id);
        });
      });
    });
  }

  // --- фото в профиле ---
  if (photoAdd) {
    photoAdd.addEventListener('click', function (e) {
      e.preventDefault();
      var file = photoInput.files && photoInput.files[0];
      if (!file || !currentUserId) { setMsg(photoStatus, 'Выберите файл.', false); return; }
      setMsg(photoStatus, 'Загружаем...', true);
      var path = currentUserId + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      window.supa.storage.from('profile-photos').upload(path, file).then(function (upRes) {
        if (upRes.error) { setMsg(photoStatus, upRes.error.message, false); return; }
        var url = window.supa.storage.from('profile-photos').getPublicUrl(path).data.publicUrl;
        window.supa.from('profile_photos').insert({ profile_id: currentUserId, url: url, caption: (photoCaption.value || '').trim() || null }).then(function (res) {
          if (res.error) { setMsg(photoStatus, res.error.message, false); return; }
          setMsg(photoStatus, 'Добавлено.', true);
          photoInput.value = '';
          photoCaption.value = '';
          loadPhotos();
        });
      });
    });
  }
})();

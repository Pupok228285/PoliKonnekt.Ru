/*
 * Знакомства — настоящие анкеты (лайк/дизлайк) и случайный текстовый чат.
 * Только для подтверждённых студентов (проверяется и здесь, и в каждой
 * RPC на сервере — на клиенте только для удобства интерфейса).
 * Чат без вебсокет-сервера — обновляется поллингом, как и весь остальной
 * сайт; подбор собеседника — через dating_find_match() на сервере.
 */
(function () {
  if (!window.supa) return;

  var guestNotice = document.getElementById('datingGuestNotice');
  var guestText = document.getElementById('datingGuestText');
  var datingArea = document.getElementById('datingArea');
  var noProfileNotice = document.getElementById('datingNoProfileNotice');
  var mainArea = document.getElementById('datingMainArea');

  var myGenderSeg = document.getElementById('myGenderSeg');
  var interestedSeg = document.getElementById('interestedSeg');
  var nameKindSeg = document.getElementById('nameKindSeg');
  var dispNameInput = document.getElementById('dispNameInput');
  var bioInput = document.getElementById('bioInput');
  var dpPhotoInput = document.getElementById('dpPhotoInput');
  var saveProfileBtn = document.getElementById('saveProfileBtn');
  var dpStatus = document.getElementById('dpStatus');

  var cardsBox = document.getElementById('cardsBox');

  var findChatBtn = document.getElementById('findChatBtn');
  var chatFindRow = document.getElementById('chatFindRow');
  var chatBox = document.getElementById('chatBox');
  var chatLog = document.getElementById('chatLog');
  var chatInput = document.getElementById('chatInput');
  var chatSendBtn = document.getElementById('chatSendBtn');
  var chatNextBtn = document.getElementById('chatNextBtn');
  var chatFootHint = document.getElementById('chatFootHint');

  if (!datingArea) return; // не та страница

  var myId = null;
  var myProfile = null;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function setMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = ok ? '#1d7813' : '#b23e00';
  }

  function segVal(seg) {
    var on = seg.querySelector('button.on');
    return on ? on.getAttribute('data-val') : null;
  }
  function setSeg(seg, val) {
    seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-val') === String(val)); });
  }

  // ---------- сжатие фото анкеты перед загрузкой (как в альбомах/рекламе) ----------
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

  // ==================== вход и статус анкеты ====================
  function init() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) {
        guestText.textContent = 'Чтобы попасть в раздел, сначала войдите или зарегистрируйтесь вверху страницы.';
        guestNotice.hidden = false;
        datingArea.hidden = true;
        return;
      }
      myId = session.user.id;
      window.supa.from('profiles').select('verified').eq('id', myId).single().then(function (pres) {
        if (!pres.data || !pres.data.verified) {
          guestText.textContent = 'Раздел открыт только подтверждённым студентам — сначала подтвердите зачётку (кнопка на главной).';
          guestNotice.hidden = false;
          datingArea.hidden = true;
          return;
        }
        guestNotice.hidden = true;
        datingArea.hidden = false;
        loadMyProfile();
      });
    });
  }

  function loadMyProfile() {
    window.supa.from('dating_profiles').select('*').eq('profile_id', myId).maybeSingle().then(function (res) {
      myProfile = res.data;
      if (myProfile) {
        setSeg(myGenderSeg, myProfile.gender);
        setSeg(interestedSeg, myProfile.interested_in);
        setSeg(nameKindSeg, myProfile.use_real_name ? '1' : '0');
        dispNameInput.value = myProfile.display_name || '';
        bioInput.value = myProfile.bio || '';
        mainArea.hidden = false;
        noProfileNotice.hidden = true;
        loadCards();
      } else {
        mainArea.hidden = true;
        noProfileNotice.hidden = false;
      }
    });
  }

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', function () {
      var gender = segVal(myGenderSeg);
      if (!gender) { setMsg(dpStatus, 'Укажите свой пол.', false); return; }
      var payload = {
        profile_id: myId,
        gender: gender,
        interested_in: segVal(interestedSeg) || 'any',
        use_real_name: segVal(nameKindSeg) === '1',
        display_name: (dispNameInput.value || '').trim() || null,
        bio: (bioInput.value || '').trim() || null
      };
      setMsg(dpStatus, 'Сохраняем...', true);
      saveProfileBtn.style.pointerEvents = 'none';

      function upsert() {
        window.supa.from('dating_profiles').upsert(payload).then(function (r) {
          saveProfileBtn.style.pointerEvents = '';
          if (r.error) { setMsg(dpStatus, r.error.message, false); return; }
          setMsg(dpStatus, 'Сохранено.', true);
          loadMyProfile();
        });
      }

      var file = dpPhotoInput.files && dpPhotoInput.files[0];
      if (file) {
        compressImage(file, 1000, 0.8).then(function (blob) {
          var path = myId + '/' + Date.now() + '.jpg';
          return window.supa.storage.from('dating-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true }).then(function (upRes) {
            if (upRes.error) throw upRes.error;
            payload.photo_url = window.supa.storage.from('dating-photos').getPublicUrl(path).data.publicUrl;
            upsert();
          });
        }).catch(function (err) {
          saveProfileBtn.style.pointerEvents = '';
          setMsg(dpStatus, 'Ошибка фото: ' + (err && err.message ? err.message : err), false);
        });
      } else {
        upsert();
      }
    });
  }

  // ==================== анкеты (лайк/дизлайк) ====================
  var cardQueue = [];
  var mutualIds = {};

  function loadCards() {
    if (!cardsBox) return;
    cardsBox.innerHTML = '<p class="hint" style="padding:8px 2px">Загрузка...</p>';
    Promise.all([
      window.supa.from('dating_likes').select('liked_id').eq('liker_id', myId),
      window.supa.from('dating_likes').select('liker_id').eq('liked_id', myId).eq('liked', true)
    ]).then(function (results) {
      var alreadyActed = (results[0].data || []).map(function (r) { return r.liked_id; });
      var likedMe = {};
      (results[1].data || []).forEach(function (r) { likedMe[r.liker_id] = true; });
      mutualIds = likedMe;

      var myGender = myProfile.gender;
      var myInterest = myProfile.interested_in;
      var q = window.supa.from('dating_profiles')
        .select('profile_id, gender, interested_in, use_real_name, display_name, bio, photo_url, profiles!profile_id(id, nickname, verified)')
        .eq('is_active', true)
        .neq('profile_id', myId);
      if (myInterest !== 'any') q = q.eq('gender', myInterest);
      q.then(function (res) {
        if (res.error) { cardsBox.innerHTML = '<p class="hint" style="padding:8px 2px">Не удалось загрузить.</p>'; return; }
        cardQueue = (res.data || []).filter(function (row) {
          if (alreadyActed.indexOf(row.profile_id) !== -1) return false;
          if (row.interested_in !== 'any' && row.interested_in !== myGender) return false;
          return true;
        });
        renderNextCard();
      });
    });
  }

  function renderNextCard() {
    if (!cardQueue.length) {
      cardsBox.innerHTML = '<p class="hint" style="padding:8px 2px">Анкеты закончились — новые появятся, когда кто-то ещё заполнит свою.</p>';
      return;
    }
    var row = cardQueue[0];
    var prof = row.profiles || {};
    var name = row.use_real_name ? (prof.nickname || '?') : (row.display_name || 'Без имени');
    var letter = name.charAt(0).toUpperCase();
    var phStyle = row.photo_url ? ' style="background-image:url(' + row.photo_url + ');background-size:cover;background-position:center"' : '';
    var mutual = mutualIds[row.profile_id] ? '<span style="color:#1d7813;font-weight:bold">Уже лайкнул(а) вас! </span>' : '';
    var card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML =
      '<div class="ph"' + phStyle + '>' + (row.photo_url ? '' : escapeHtml(letter)) + '</div>' +
      '<div class="body">' +
        '<div class="name">' + escapeHtml(name) + '</div>' +
        '<div class="bio">' + mutual + escapeHtml(row.bio || '') + '</div>' +
        '<div class="acts">' +
          '<button class="submit" type="button" id="cardLikeBtn">Лайк</button>' +
          '<button class="submit" type="button" id="cardDislikeBtn">Дизлайк</button>' +
          (prof.id ? '<a href="messages.html?to=' + encodeURIComponent(prof.nickname || '') + '">Написать</a>' : '') +
          '<a href="#">Пожаловаться</a>' +
        '</div>' +
      '</div>';
    cardsBox.innerHTML = '';
    cardsBox.appendChild(card);

    function act(liked) {
      window.supa.from('dating_likes').upsert({ liker_id: myId, liked_id: row.profile_id, liked: liked }).then(function (r) {
        if (r.error) { alert(r.error.message); return; }
        cardQueue.shift();
        renderNextCard();
      });
    }
    document.getElementById('cardLikeBtn').addEventListener('click', function () { act(true); });
    document.getElementById('cardDislikeBtn').addEventListener('click', function () { act(false); });
  }

  // ==================== случайный чат ====================
  var currentRoomId = null;
  var currentOtherId = null;
  var searching = false;
  var searchTimer = null;
  var msgTimer = null;
  var lastMsgId = 0;

  function stopTimers() {
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
    if (msgTimer) { clearInterval(msgTimer); msgTimer = null; }
  }

  function showSearching() {
    searching = true;
    chatFindRow.innerHTML = '<span class="hint" style="margin:0">Ищем собеседника...</span> <a href="#" id="cancelSearchBtn" class="submit" style="margin-left:6px;font-size:10px;padding:3px 8px">Отменить</a>';
    document.getElementById('cancelSearchBtn').addEventListener('click', function (e) {
      e.preventDefault();
      stopTimers();
      searching = false;
      window.supa.rpc('dating_cancel_search', {}).then(function () {});
      resetFindRow();
    });
  }

  function resetFindRow() {
    chatFindRow.innerHTML = '<a class="submit" href="#" id="findChatBtn">Найти собеседника</a>';
    document.getElementById('findChatBtn').addEventListener('click', startSearch);
  }

  function startSearch(e) {
    if (e) e.preventDefault();
    showSearching();
    pollMatch();
  }

  function pollMatch() {
    if (!searching) return;
    window.supa.rpc('dating_find_match', {}).then(function (r) {
      if (!searching) return; // отменили, пока ждали ответ
      if (r.error) { alert(r.error.message); searching = false; resetFindRow(); return; }
      var row = r.data && r.data[0];
      if (row && row.room_id) {
        searching = false;
        enterRoom(row.room_id, row.other_id);
      } else {
        searchTimer = setTimeout(pollMatch, 3000);
      }
    });
  }

  function enterRoom(roomId, otherId) {
    currentRoomId = roomId;
    currentOtherId = otherId;
    lastMsgId = 0;
    chatFindRow.style.display = 'none';
    chatBox.hidden = false;
    chatFootHint.hidden = false;
    chatLog.innerHTML = '<p class="hint" style="margin:2px 0">Собеседник найден — переписка только текстом.</p>';
    pollMessages();
    msgTimer = setInterval(pollMessages, 2500);
  }

  function pollMessages() {
    if (!currentRoomId) return;
    window.supa.from('dating_chat_messages').select('id, sender_id, body, created_at')
      .eq('room_id', currentRoomId).order('created_at', { ascending: true }).then(function (res) {
        if (res.error || !res.data) return;
        if (!res.data.length) return;
        if (res.data[res.data.length - 1].id === lastMsgId) return; // ничего нового
        chatLog.innerHTML = '';
        res.data.forEach(function (m) {
          var mine = m.sender_id === myId;
          var p = document.createElement('p');
          p.className = mine ? 'me' : 'them';
          p.innerHTML = '<b>' + (mine ? 'Вы' : 'Собеседник') + ':</b> ' + escapeHtml(m.body);
          chatLog.appendChild(p);
        });
        lastMsgId = res.data[res.data.length - 1].id;
        chatLog.scrollTop = chatLog.scrollHeight;
      });
  }

  function leaveRoom(thenSearchAgain) {
    var roomId = currentRoomId;
    stopTimers();
    currentRoomId = null;
    currentOtherId = null;
    chatBox.hidden = true;
    chatFootHint.hidden = true;
    chatFindRow.style.display = '';
    if (roomId) window.supa.rpc('dating_leave_chat', { p_room_id: roomId }).then(function () {});
    resetFindRow();
    if (thenSearchAgain) startSearch();
  }

  if (findChatBtn) findChatBtn.addEventListener('click', startSearch);
  if (chatNextBtn) chatNextBtn.addEventListener('click', function () { leaveRoom(true); });
  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', function () {
      var body = (chatInput.value || '').trim();
      if (!body || !currentRoomId) return;
      window.supa.from('dating_chat_messages').insert({ room_id: currentRoomId, sender_id: myId, body: body }).then(function (r) {
        if (r.error) { alert(r.error.message); return; }
        chatInput.value = '';
        pollMessages();
      });
    });
  }
  if (chatInput) {
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); chatSendBtn.click(); }
    });
  }

  window.addEventListener('beforeunload', function () {
    if (searching) { try { window.supa.rpc('dating_cancel_search', {}); } catch (err) {} }
  });

  init();
})();

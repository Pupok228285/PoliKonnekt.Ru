/*
 * Личные сообщения — по-настоящему: заявки от незнакомцев (одобрить/
 * отклонить/заблокировать), входящие переписки, диалог, блокировка.
 * Пара участников хранится в conversations как (user_a, user_b) — это
 * просто отсортированная пара для уникальности, кто есть кто решает
 * поле initiator; "другой человек" вычисляется через myId.
 */
(function () {
  if (!window.supa) return;

  var guestNotice = document.getElementById('guestNotice');
  var pmArea = document.getElementById('pmArea');
  var requestsBox = document.getElementById('requestsBox');
  var requestsEmpty = document.getElementById('requestsEmpty');
  var reqCount = document.getElementById('reqCount');
  var inboxBox = document.getElementById('inboxBox');
  var inboxEmpty = document.getElementById('inboxEmpty');
  var pmChatShell = document.getElementById('pmChatShell');
  var dialogEmpty = document.getElementById('dialogEmpty');
  var dialogInner = document.getElementById('dialogInner');
  var dlgBackBtn = document.getElementById('dlgBackBtn');
  var dlgNick = document.getElementById('dlgNick');
  var dlgTick = document.getElementById('dlgTick');
  var blockLink = document.getElementById('blockLink');
  var blockedNote = document.getElementById('blockedNote');
  var chatRow = document.getElementById('chatRow');
  var chatLog = document.getElementById('chatLog');
  var chatInput = document.getElementById('chatInput');
  var chatSend = document.getElementById('chatSend');
  var chatEmojiBtn = document.getElementById('chatEmojiBtn');
  var chatEmojiPop = document.getElementById('chatEmojiPop');
  var chatPhotoBtn = document.getElementById('chatPhotoBtn');
  var chatPhotoInput = document.getElementById('chatPhotoInput');
  var chatPhotoPreview = document.getElementById('chatPhotoPreview');
  var newMsgNick = document.getElementById('newMsgNick');
  var newMsgBody = document.getElementById('newMsgBody');
  var newMsgBtn = document.getElementById('newMsgBtn');
  var newMsgHint = document.getElementById('newMsgHint');
  var newMsgEmojiBtn = document.getElementById('newMsgEmojiBtn');
  var newMsgEmojiPop = document.getElementById('newMsgEmojiPop');
  var newMsgPhotoBtn = document.getElementById('newMsgPhotoBtn');
  var newMsgPhotoInput = document.getElementById('newMsgPhotoInput');
  var newMsgPhotoPreview = document.getElementById('newMsgPhotoPreview');
  var newMsgPendingPhoto = null;
  if (!pmArea) return;

  var myId = null;
  var current = null; // { id, otherId, otherNick, otherVerified }
  var pendingPhoto = null;

  var EMOJI_LIST = ['😀','😂','🙂','😉','😍','😎','🤔','😢','😡','😱','🥳','😴','🤝','🙏','👍','👎','👀','🔥','💯','🎉','❤️','✅','❌','💩','🍕','☕','📚','🎓','⚡','🤯','😅','🙈'];

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtShort(iso) {
    var d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'вчера';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }

  function otherOf(row) {
    return row.user_a === myId ? row.b : row.a;
  }

  function setMsgHint(text, ok) {
    if (!newMsgHint) return;
    newMsgHint.textContent = text;
    newMsgHint.style.color = ok == null ? '' : (ok ? '#1d7813' : '#b23e00');
  }

  // ---------- заявки ----------
  function loadRequests() {
    window.supa.from('conversations')
      .select('id, user_a, user_b, initiator, created_at, a:profiles!user_a(id,nickname,verified), b:profiles!user_b(id,nickname,verified)')
      .eq('status', 'pending')
      .neq('initiator', myId)
      .or('user_a.eq.' + myId + ',user_b.eq.' + myId)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error || !res.data) return;
        reqCount.textContent = '(' + res.data.length + ')';
        requestsEmpty.hidden = res.data.length > 0;
        requestsBox.querySelectorAll('.match-card').forEach(function (c) { c.remove(); });
        res.data.forEach(renderRequestCard);
      });
  }

  function renderRequestCard(row) {
    var other = otherOf(row);
    var card = document.createElement('div');
    card.className = 'match-card';
    var nickname = other.nickname || '?';
    card.innerHTML =
      '<div class="ph">' + escapeHtml(nickname.charAt(0).toUpperCase()) + '</div>' +
      '<div class="body">' +
        '<div class="name">' + escapeHtml(nickname) + '</div>' +
        '<div class="bio" data-preview>Загрузка...</div>' +
        '<div class="acts">' +
          '<button class="submit" type="button" data-approve>Одобрить</button>' +
          '<button class="submit" type="button" data-decline>Отклонить</button>' +
          '<a href="#" data-block>Заблокировать</a>' +
        '</div>' +
      '</div>';
    requestsBox.insertBefore(card, requestsBox.querySelector('.catend'));

    window.supa.from('messages').select('body').eq('conversation_id', row.id).order('created_at', { ascending: true }).limit(1)
      .then(function (r) {
        var el = card.querySelector('[data-preview]');
        if (el && r.data && r.data[0]) el.textContent = '«' + r.data[0].body + '»';
      });

    card.querySelector('[data-approve]').addEventListener('click', function () {
      window.supa.from('conversations').update({ status: 'accepted' }).eq('id', row.id).then(loadAll);
    });
    card.querySelector('[data-decline]').addEventListener('click', function () {
      window.supa.from('conversations').update({ status: 'declined' }).eq('id', row.id).then(loadAll);
    });
    card.querySelector('[data-block]').addEventListener('click', function (e) {
      e.preventDefault();
      window.supa.from('blocks').insert({ blocker_id: myId, blocked_id: other.id }).then(function () {
        window.supa.from('conversations').update({ status: 'declined' }).eq('id', row.id).then(loadAll);
      });
    });
  }

  // ---------- входящие ----------
  function loadInbox() {
    window.supa.from('conversations')
      .select('id, user_a, user_b, last_message_at, a:profiles!user_a(id,nickname,verified), b:profiles!user_b(id,nickname,verified)')
      .eq('status', 'accepted')
      .or('user_a.eq.' + myId + ',user_b.eq.' + myId)
      .order('last_message_at', { ascending: false })
      .then(function (res) {
        if (res.error || !res.data) return;
        inboxEmpty.hidden = res.data.length > 0;
        inboxBox.querySelectorAll('.match-card').forEach(function (c) { c.remove(); });
        res.data.forEach(renderInboxRow);
      });
  }

  function renderInboxRow(row) {
    var other = otherOf(row);
    var nickname = other.nickname || '?';
    var el = document.createElement('div');
    el.className = 'match-card';
    el.setAttribute('data-conv-id', row.id);
    if (current && current.id === row.id) el.classList.add('active');
    el.innerHTML =
      '<div class="ph">' + escapeHtml(nickname.charAt(0).toUpperCase()) + '</div>' +
      '<div class="body">' +
        '<div class="name">' + escapeHtml(nickname) + '</div>' +
        '<div class="bio" data-preview>...</div>' +
      '</div>' +
      '<div class="time">' + fmtShort(row.last_message_at) + '</div>';
    inboxBox.insertBefore(el, inboxBox.querySelector('.catend'));

    window.supa.from('messages').select('body, sender_id').eq('conversation_id', row.id).order('created_at', { ascending: false }).limit(1)
      .then(function (r) {
        var pv = el.querySelector('[data-preview]');
        if (pv && r.data && r.data[0]) {
          var prefix = r.data[0].sender_id === myId ? 'Вы: ' : '';
          pv.textContent = prefix + r.data[0].body;
        }
      });

    el.addEventListener('click', function () { openConversation(row.id, other); });
  }

  // ---------- диалог: два окна рядом (список + переписка), как в ВК/Телеграме ----------
  function openConversation(convId, other) {
    current = { id: convId, otherId: other.id, otherNick: other.nickname || '?', otherVerified: other.verified };
    if (dialogEmpty) dialogEmpty.hidden = true;
    if (dialogInner) dialogInner.hidden = false;
    if (pmChatShell) pmChatShell.classList.add('dialog-open');
    if (inboxBox) {
      inboxBox.querySelectorAll('.match-card').forEach(function (c) {
        c.classList.toggle('active', c.getAttribute('data-conv-id') === String(convId));
      });
    }
    dlgNick.textContent = current.otherNick;
    dlgTick.style.display = other.verified ? '' : 'none';
    chatLog.innerHTML = '<p class="hint">Загрузка...</p>';
    clearPendingPhoto();
    if (chatEmojiPop) chatEmojiPop.classList.remove('show');
    refreshBlockState();
    loadMessages();
  }

  function closeConversation() {
    current = null;
    if (dialogInner) dialogInner.hidden = true;
    if (dialogEmpty) dialogEmpty.hidden = false;
    if (pmChatShell) pmChatShell.classList.remove('dialog-open');
    if (inboxBox) inboxBox.querySelectorAll('.match-card.active').forEach(function (c) { c.classList.remove('active'); });
  }

  if (dlgBackBtn) {
    dlgBackBtn.addEventListener('click', function (e) {
      e.preventDefault();
      closeConversation();
    });
  }

  function refreshBlockState() {
    window.supa.from('blocks').select('blocker_id, blocked_id')
      .or('and(blocker_id.eq.' + myId + ',blocked_id.eq.' + current.otherId + '),and(blocker_id.eq.' + current.otherId + ',blocked_id.eq.' + myId + ')')
      .then(function (res) {
        var rows = res.data || [];
        var iBlocked = rows.some(function (r) { return r.blocker_id === myId; });
        var theyBlocked = rows.some(function (r) { return r.blocker_id === current.otherId; });
        current.iBlocked = iBlocked;
        if (iBlocked) {
          blockLink.textContent = 'Разблокировать';
          blockedNote.hidden = false;
          blockedNote.textContent = current.otherNick + ' заблокирован(а). Писать вам он(а) больше не сможет, старую переписку видно.';
          chatRow.style.display = 'none';
        } else if (theyBlocked) {
          blockLink.textContent = 'Заблокировать';
          blockedNote.hidden = false;
          blockedNote.textContent = 'Вы не можете писать этому человеку.';
          chatRow.style.display = 'none';
        } else {
          blockLink.textContent = 'Заблокировать';
          blockedNote.hidden = true;
          chatRow.style.display = '';
        }
      });
  }

  function loadMessages() {
    window.supa.from('messages').select('id, sender_id, body, photo_path, created_at').eq('conversation_id', current.id).order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error || !res.data) { chatLog.innerHTML = '<p class="hint">Не удалось загрузить.</p>'; return; }
        chatLog.innerHTML = '';
        res.data.forEach(appendMessage);
        chatLog.scrollTop = chatLog.scrollHeight;
      });
  }

  function appendMessage(row) {
    var p = document.createElement('p');
    var mine = row.sender_id === myId;
    p.className = mine ? 'me' : 'them';
    p.innerHTML = '<b>' + (mine ? 'Вы' : escapeHtml(current.otherNick)) + ':</b>' + (row.body ? ' ' + escapeHtml(row.body) : '');
    chatLog.appendChild(p);
    if (row.photo_path) {
      var img = document.createElement('img');
      img.className = 'msg-photo';
      img.alt = 'фото';
      img.title = 'Открыть в полный размер';
      p.appendChild(img);
      window.supa.storage.from('pm-photos').createSignedUrl(row.photo_path, 600).then(function (signed) {
        if (signed.data && signed.data.signedUrl) {
          img.src = signed.data.signedUrl;
          img.addEventListener('click', function () { window.open(signed.data.signedUrl, '_blank'); });
        }
      });
    }
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  if (chatSend) {
    chatSend.addEventListener('click', sendChatMessage);
  }
  if (chatInput) {
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendChatMessage();
    });
  }

  function clearPendingPhoto() {
    pendingPhoto = null;
    if (chatPhotoInput) chatPhotoInput.value = '';
    if (chatPhotoPreview) { chatPhotoPreview.style.display = 'none'; chatPhotoPreview.textContent = ''; }
  }

  function sendChatMessage() {
    var body = (chatInput.value || '').trim();
    if (!current || (!body && !pendingPhoto)) return;
    var photo = pendingPhoto;
    chatSend.disabled = true;

    function insertMessage(photoPath) {
      var payload = { conversation_id: current.id, sender_id: myId };
      if (body) payload.body = body;
      if (photoPath) payload.photo_path = photoPath;
      window.supa.from('messages').insert(payload).then(function (res) {
        chatSend.disabled = false;
        if (res.error) { alert(res.error.message); return; }
        chatInput.value = '';
        clearPendingPhoto();
        loadMessages();
        loadInbox();
      });
    }

    if (photo) {
      var path = current.id + '/' + Date.now() + '-' + photo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      window.supa.storage.from('pm-photos').upload(path, photo).then(function (upRes) {
        if (upRes.error) { chatSend.disabled = false; alert(upRes.error.message); return; }
        insertMessage(path);
      });
    } else {
      insertMessage(null);
    }
  }

  // ---------- смайлики ----------
  if (chatEmojiPop) {
    EMOJI_LIST.forEach(function (em) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = em;
      b.addEventListener('click', function () {
        chatInput.value += em;
        chatInput.focus();
      });
      chatEmojiPop.appendChild(b);
    });
  }
  if (chatEmojiBtn) {
    chatEmojiBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      chatEmojiPop.classList.toggle('show');
    });
    document.addEventListener('click', function (e) {
      if (chatEmojiPop && !chatEmojiPop.contains(e.target) && e.target !== chatEmojiBtn) {
        chatEmojiPop.classList.remove('show');
      }
    });
  }

  // ---------- фото (без видео) ----------
  if (chatPhotoBtn) {
    chatPhotoBtn.addEventListener('click', function () { chatPhotoInput.click(); });
  }
  if (chatPhotoInput) {
    chatPhotoInput.addEventListener('change', function () {
      var f = chatPhotoInput.files && chatPhotoInput.files[0];
      if (!f) return;
      if (f.type.indexOf('image/') !== 0) { alert('Можно прикреплять только фото.'); chatPhotoInput.value = ''; return; }
      pendingPhoto = f;
      chatPhotoPreview.style.display = '';
      chatPhotoPreview.textContent = 'Фото: ' + f.name + ' ';
      var cancel = document.createElement('a');
      cancel.href = '#';
      cancel.textContent = '✕ убрать';
      cancel.addEventListener('click', function (e) { e.preventDefault(); clearPendingPhoto(); });
      chatPhotoPreview.appendChild(cancel);
    });
  }

  if (blockLink) {
    blockLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (!current) return;
      if (current.iBlocked) {
        window.supa.from('blocks').delete().eq('blocker_id', myId).eq('blocked_id', current.otherId).then(refreshBlockState);
      } else {
        window.supa.from('blocks').insert({ blocker_id: myId, blocked_id: current.otherId }).then(refreshBlockState);
      }
    });
  }

  // ---------- смайлики и фото в форме "Написать" ----------
  function clearNewMsgPhoto() {
    newMsgPendingPhoto = null;
    if (newMsgPhotoInput) newMsgPhotoInput.value = '';
    if (newMsgPhotoPreview) { newMsgPhotoPreview.style.display = 'none'; newMsgPhotoPreview.textContent = ''; }
  }

  if (newMsgEmojiPop) {
    EMOJI_LIST.forEach(function (em) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = em;
      b.addEventListener('click', function () {
        newMsgBody.value += em;
        newMsgBody.focus();
      });
      newMsgEmojiPop.appendChild(b);
    });
  }
  if (newMsgEmojiBtn) {
    newMsgEmojiBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      newMsgEmojiPop.classList.toggle('show');
    });
    document.addEventListener('click', function (e) {
      if (newMsgEmojiPop && !newMsgEmojiPop.contains(e.target) && e.target !== newMsgEmojiBtn) {
        newMsgEmojiPop.classList.remove('show');
      }
    });
  }
  if (newMsgPhotoBtn) {
    newMsgPhotoBtn.addEventListener('click', function () { newMsgPhotoInput.click(); });
  }
  if (newMsgPhotoInput) {
    newMsgPhotoInput.addEventListener('change', function () {
      var f = newMsgPhotoInput.files && newMsgPhotoInput.files[0];
      if (!f) return;
      if (f.type.indexOf('image/') !== 0) { alert('Можно прикреплять только фото.'); newMsgPhotoInput.value = ''; return; }
      newMsgPendingPhoto = f;
      newMsgPhotoPreview.style.display = '';
      newMsgPhotoPreview.textContent = 'Фото: ' + f.name + ' ';
      var cancel = document.createElement('a');
      cancel.href = '#';
      cancel.textContent = '✕ убрать';
      cancel.addEventListener('click', function (e) { e.preventDefault(); clearNewMsgPhoto(); });
      newMsgPhotoPreview.appendChild(cancel);
    });
  }

  // ---------- новое сообщение ----------
  if (newMsgBtn) {
    newMsgBtn.addEventListener('click', function () {
      var nick = (newMsgNick.value || '').trim();
      var body = (newMsgBody.value || '').trim();
      var photo = newMsgPendingPhoto;
      if (!nick || (!body && !photo)) { setMsgHint('Укажите ник и текст сообщения (или фото).', false); return; }
      newMsgBtn.disabled = true;
      setMsgHint('Ищем...', null);
      window.supa.from('profiles').select('id, nickname').eq('nickname', nick).maybeSingle().then(function (pr) {
        if (pr.error || !pr.data) { setMsgHint('Такого ника нет.', false); newMsgBtn.disabled = false; return; }
        var otherId = pr.data.id;
        if (otherId === myId) { setMsgHint('Это ваш собственный ник.', false); newMsgBtn.disabled = false; return; }
        var pair = [myId, otherId].sort();
        window.supa.from('conversations')
          .insert({ user_a: pair[0], user_b: pair[1], initiator: myId })
          .select('id').single()
          .then(function (cr) {
            if (cr.data) return cr.data.id;
            if (cr.error && /dm_friends_only/.test(cr.error.message || '')) return 'FRIENDS_ONLY';
            // уже есть разговор с этим человеком (unique-конфликт) — пишем в него
            return window.supa.from('conversations').select('id').eq('user_a', pair[0]).eq('user_b', pair[1]).single()
              .then(function (existing) { return existing.data ? existing.data.id : null; });
          })
          .then(function (convId) {
            if (convId === 'FRIENDS_ONLY') { setMsgHint('Этот человек принимает сообщения только от друзей.', false); newMsgBtn.disabled = false; return; }
            if (!convId) { setMsgHint('Не получилось создать разговор.', false); newMsgBtn.disabled = false; return; }

            function insertMessage(photoPath) {
              var payload = { conversation_id: convId, sender_id: myId };
              if (body) payload.body = body;
              if (photoPath) payload.photo_path = photoPath;
              window.supa.from('messages').insert(payload).then(function (mr) {
                newMsgBtn.disabled = false;
                if (mr.error) { setMsgHint(mr.error.message, false); return; }
                setMsgHint('Отправлено.', true);
                newMsgNick.value = '';
                newMsgBody.value = '';
                clearNewMsgPhoto();
                loadAll();
              });
            }

            if (photo) {
              var path = convId + '/' + Date.now() + '-' + photo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              window.supa.storage.from('pm-photos').upload(path, photo).then(function (upRes) {
                if (upRes.error) { newMsgBtn.disabled = false; setMsgHint(upRes.error.message, false); return; }
                insertMessage(path);
              });
            } else {
              insertMessage(null);
            }
          });
      });
    });
  }

  // ---------- инициализация ----------
  function loadAll() {
    loadRequests();
    loadInbox();
  }

  function init() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) {
        guestNotice.hidden = false;
        pmArea.hidden = true;
        return;
      }
      myId = session.user.id;
      guestNotice.hidden = true;
      pmArea.hidden = false;

      var params = new URLSearchParams(window.location.search);
      var to = params.get('to');
      if (to && newMsgNick) newMsgNick.value = to;

      loadAll();
    });
  }

  init();
  window.supa.auth.onAuthStateChange(init);
})();

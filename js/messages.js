/*
 * Личные сообщения — по-настоящему: заявки от незнакомцев (одобрить/
 * отклонить/заблокировать), входящие переписки, диалог, блокировка.
 * Пара участников хранится в conversations как (user_a, user_b) — это
 * просто отсортированная пара для уникальности, кто есть кто решает
 * поле initiator; "другой человек" вычисляется через myId.
 *
 * Группы (db/schema_v42.sql) живут в том же списке и в том же окне диалога:
 * current.kind — 'dm' или 'group'. Добавление людей — только через
 * add_chat_group_member(), она сама проверяет блокировки и настройку
 * «кто может добавлять меня в группы».
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
  var dlgReportLink = document.getElementById('dlgReportLink');
  var dlgDeleteLink = document.getElementById('dlgDeleteLink');
  var dlgMuteLink = document.getElementById('dlgMuteLink');
  var dlgFirstMsgHint = document.getElementById('dlgFirstMsgHint');
  var newGroupBtn = document.getElementById('newGroupBtn');
  var groupCreate = document.getElementById('groupCreate');
  var groupCreateBack = document.getElementById('groupCreateBack');
  var groupTitleInput = document.getElementById('groupTitleInput');
  var groupFriendsList = document.getElementById('groupFriendsList');
  var groupExtraNicks = document.getElementById('groupExtraNicks');
  var groupCreateBtn = document.getElementById('groupCreateBtn');
  var groupCreateHint = document.getElementById('groupCreateHint');
  var groupMembersLink = document.getElementById('groupMembersLink');
  var groupPanel = document.getElementById('groupPanel');
  var groupMembersList = document.getElementById('groupMembersList');
  var groupAddNick = document.getElementById('groupAddNick');
  var groupAddBtn = document.getElementById('groupAddBtn');
  var groupAddHint = document.getElementById('groupAddHint');
  var groupRenameRow = document.getElementById('groupRenameRow');
  var groupRenameInput = document.getElementById('groupRenameInput');
  var groupRenameBtn = document.getElementById('groupRenameBtn');
  var groupLeaveLink = document.getElementById('groupLeaveLink');
  var groupDeleteLink = document.getElementById('groupDeleteLink');
  if (!pmArea) return;

  attachNickAutocomplete(newMsgNick, document.getElementById('newMsgNickSuggest'));
  attachNickAutocomplete(groupAddNick, document.getElementById('groupAddNickSuggest'));

  var myId = null;
  var myAvatar = null;
  // { kind: 'dm', id, otherId, otherNick, otherVerified } или
  // { kind: 'group', id, title, ownerId, memberCount }
  var current = null;
  var pendingPhoto = null;
  var groupsAvailable = true; // false, если schema_v42.sql ещё не применена
  var openGroupFromUrl = null;
  var openConvFromUrl = null;
  var pendingGroupNotice = null; // кого не удалось добавить при создании группы

  var GROUP_ERRORS = {
    group_friends_only: 'принимает приглашения в группы только от друзей',
    group_blocked: 'нельзя добавить — кто-то из вас заблокировал другого',
    group_full: 'в группе уже 50 человек',
    group_not_member: 'вы не участник этой группы',
    group_no_such_user: 'такого ника нет'
  };
  function groupErrorText(err) {
    var msg = (err && err.message) || '';
    for (var key in GROUP_ERRORS) {
      if (msg.indexOf(key) !== -1) return GROUP_ERRORS[key];
    }
    return msg || 'ошибка';
  }

  var EMOJI_LIST = ['😀','😂','🙂','😉','😍','😎','🤔','😢','😡','😱','🥳','😴','🤝','🙏','👍','👎','👀','🔥','💯','🎉','❤️','✅','❌','💩','🍕','☕','📚','🎓','⚡','🤯','😅','🙈'];

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  // Подсказки похожих ников при вводе — переиспользуется и для «Написать
  // новому человеку», и для «Добавить» в группу.
  function attachNickAutocomplete(input, suggestBox) {
    if (!input || !suggestBox) return;
    var timer = null;

    function hide() { suggestBox.hidden = true; suggestBox.innerHTML = ''; }
    function pick(nick) { input.value = nick; hide(); input.focus(); }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(timer);
      if (q.length < 2) { hide(); return; }
      timer = setTimeout(function () {
        window.supa.from('profiles').select('id, nickname, avatar_url')
          .ilike('nickname', '%' + q + '%')
          .neq('id', myId || '00000000-0000-0000-0000-000000000000')
          .limit(6)
          .then(function (res) {
            if (input.value.trim() !== q) return; // пока грузилось, текст сменился
            var rows = res.data || [];
            if (!rows.length) { hide(); return; }
            suggestBox.innerHTML = rows.map(function (p) {
              var av = p.avatar_url ? ' style="background-image:url(' + escapeHtml(p.avatar_url) + ')"' : '';
              return '<a href="#" data-nick="' + escapeHtml(p.nickname) + '"><span class="msg-av"' + av + '>' +
                (p.avatar_url ? '' : escapeHtml(p.nickname.charAt(0).toUpperCase())) + '</span>' + escapeHtml(p.nickname) + '</a>';
            }).join('');
            suggestBox.hidden = false;
          });
      }, 250);
    });
    suggestBox.addEventListener('mousedown', function (e) {
      var a = e.target.closest('a[data-nick]');
      if (!a) return;
      e.preventDefault();
      pick(a.getAttribute('data-nick'));
    });
    input.addEventListener('blur', function () { setTimeout(hide, 150); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
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

  // ---------- список: личные переписки и группы вместе ----------
  function loadInbox() {
    Promise.all([
      window.supa.from('conversations')
        .select('id, user_a, user_b, last_message_at, a:profiles!user_a(id,nickname,verified,avatar_url), b:profiles!user_b(id,nickname,verified,avatar_url)')
        .eq('status', 'accepted')
        .or('user_a.eq.' + myId + ',user_b.eq.' + myId)
        .order('last_message_at', { ascending: false }),
      window.supa.rpc('my_chat_groups'),
      window.supa.from('dm_mutes').select('conversation_id').eq('profile_id', myId)
    ]).then(function (res) {
      var dms = res[0].error ? [] : (res[0].data || []);
      groupsAvailable = !res[1].error;
      var groups = res[1].error ? [] : (res[1].data || []);
      var mutedDmIds = {};
      (res[2].data || []).forEach(function (r) { mutedDmIds[r.conversation_id] = true; });
      dms.forEach(function (d) { d.muted = !!mutedDmIds[d.id]; });
      var items = dms.map(function (d) { return { kind: 'dm', at: d.last_message_at, row: d }; })
        .concat(groups.map(function (g) { return { kind: 'group', at: g.last_message_at, row: g }; }));
      items.sort(function (x, y) { return new Date(y.at) - new Date(x.at); });

      inboxEmpty.hidden = items.length > 0;
      inboxBox.querySelectorAll('.match-card').forEach(function (c) { c.remove(); });
      items.forEach(function (it) {
        if (it.kind === 'dm') renderInboxRow(it.row); else renderGroupRow(it.row);
      });

      if (openGroupFromUrl) {
        var target = groups.find(function (g) { return String(g.group_id) === openGroupFromUrl; });
        openGroupFromUrl = null;
        if (target) openGroup(target);
      }
      if (openConvFromUrl) {
        var targetConv = dms.find(function (d) { return String(d.id) === openConvFromUrl; });
        openConvFromUrl = null;
        if (targetConv) openConversation(targetConv.id, otherOf(targetConv));
      }
    });
  }

  function renderGroupRow(g) {
    var el = document.createElement('div');
    el.className = 'match-card' + (g.unread > 0 ? ' unread' : '');
    el.setAttribute('data-group-id', g.group_id);
    if (current && current.kind === 'group' && current.id === g.group_id) el.classList.add('active');
    var preview = '';
    if (g.last_sender_nick) {
      preview = (g.last_sender_nick + ': ') + (g.last_body || (g.last_has_photo ? '📷 фото' : ''));
    } else {
      preview = g.member_count + ' участн.';
    }
    el.innerHTML =
      '<div class="ph grp">👥</div>' +
      '<div class="body">' +
        '<div class="name">' + escapeHtml(g.title) +
          (g.unread > 0 ? ' <span class="badge">' + g.unread + '</span>' : '') +
          (g.muted ? ' <span class="muted-ico" title="Звук выключен">🔕</span>' : '') + '</div>' +
        '<div class="bio">' + escapeHtml(preview) + '</div>' +
      '</div>' +
      '<div class="time">' + fmtShort(g.last_message_at) + '</div>';
    inboxBox.insertBefore(el, inboxBox.querySelector('.catend'));
    el.addEventListener('click', function () { openGroup(g); });
  }

  function renderInboxRow(row) {
    var other = otherOf(row);
    var nickname = other.nickname || '?';
    var avStyle = other.avatar_url ? ' style="background-image:url(' + escapeHtml(other.avatar_url) + ');background-size:cover;background-position:center"' : '';
    var el = document.createElement('div');
    el.className = 'match-card';
    el.setAttribute('data-conv-id', row.id);
    if (current && current.kind === 'dm' && current.id === row.id) el.classList.add('active');
    el.innerHTML =
      '<div class="ph"' + avStyle + '>' + (other.avatar_url ? '' : escapeHtml(nickname.charAt(0).toUpperCase())) + '</div>' +
      '<div class="body">' +
        '<div class="name">' + escapeHtml(nickname) +
          (row.muted ? ' <span class="muted-ico" title="Звук выключен">🔕</span>' : '') + '</div>' +
        '<div class="bio" data-preview>...</div>' +
      '</div>' +
      '<div class="time">' + fmtShort(row.last_message_at) + '</div>';
    inboxBox.insertBefore(el, inboxBox.querySelector('.catend'));

    window.supa.from('messages').select('body, sender_id, photo_path').eq('conversation_id', row.id).order('created_at', { ascending: false }).limit(1)
      .then(function (r) {
        var pv = el.querySelector('[data-preview]');
        if (pv && r.data && r.data[0]) {
          var prefix = r.data[0].sender_id === myId ? 'Вы: ' : '';
          pv.textContent = prefix + (r.data[0].body || (r.data[0].photo_path ? '📷 фото' : ''));
        }
      });

    el.addEventListener('click', function () { openConversation(row.id, other); });
  }

  // ---------- диалог: два окна рядом (список + переписка), как в ВК/Телеграме ----------
  function showDialogPane() {
    if (dialogEmpty) dialogEmpty.hidden = true;
    if (groupCreate) groupCreate.hidden = true;
    if (dialogInner) dialogInner.hidden = false;
    if (pmChatShell) pmChatShell.classList.add('dialog-open');
    chatLog.innerHTML = '<p class="hint">Загрузка...</p>';
    clearPendingPhoto();
    if (chatEmojiPop) chatEmojiPop.classList.remove('show');
  }

  function markActiveRow() {
    if (!inboxBox) return;
    inboxBox.querySelectorAll('.match-card').forEach(function (c) {
      var on = current && (
        (current.kind === 'dm' && c.getAttribute('data-conv-id') === String(current.id)) ||
        (current.kind === 'group' && c.getAttribute('data-group-id') === String(current.id)));
      c.classList.toggle('active', !!on);
    });
  }

  function openConversation(convId, other) {
    current = { kind: 'dm', id: convId, otherId: other.id, otherNick: other.nickname || '?', otherVerified: other.verified, otherAvatar: other.avatar_url, otherLastReadAt: null };
    showDialogPane();
    markActiveRow();
    dlgNick.textContent = current.otherNick;
    dlgTick.style.display = other.verified ? '' : 'none';
    blockLink.style.display = '';
    if (dlgReportLink) { dlgReportLink.style.display = ''; dlgReportLink.setAttribute('data-target-user', other.id || ''); }
    if (dlgDeleteLink) dlgDeleteLink.hidden = false;
    if (dlgFirstMsgHint) dlgFirstMsgHint.hidden = false;
    if (groupMembersLink) groupMembersLink.hidden = true;
    if (groupPanel) groupPanel.hidden = true;
    refreshBlockState();
    // Конверт у своих сообщений зависит от того, когда собеседник последний
    // раз открывал этот диалог — сначала узнаём это, потом рисуем историю.
    window.supa.from('dm_read_state').select('last_read_at').eq('conversation_id', convId).eq('profile_id', other.id).maybeSingle().then(function (r) {
      if (!current || current.kind !== 'dm' || current.id !== convId) return;
      current.otherLastReadAt = r.data ? r.data.last_read_at : null;
      loadMessages();
    });
    window.supa.rpc('mark_dm_read', { p_conversation_id: convId }).then(function () {});
    renderMuteLink(false);
    window.supa.from('dm_mutes').select('conversation_id').eq('conversation_id', convId).eq('profile_id', myId).maybeSingle().then(function (r) {
      if (current && current.kind === 'dm' && current.id === convId) renderMuteLink(!!r.data);
    });
  }

  function renderMuteLink(muted) {
    if (!dlgMuteLink || !current) return;
    current.muted = muted;
    dlgMuteLink.textContent = muted ? '🔕 без звука' : '🔔 звук';
    dlgMuteLink.title = muted ? 'Включить звук уведомлений для этой переписки' : 'Отключить звук уведомлений для этой переписки';
  }

  if (dlgMuteLink) {
    dlgMuteLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (!current) return;
      var next = !current.muted;
      var rpc = current.kind === 'group'
        ? window.supa.rpc('set_chat_group_muted', { p_group_id: current.id, p_muted: next })
        : window.supa.rpc('set_dm_muted', { p_conversation_id: current.id, p_muted: next });
      rpc.then(function (r) {
        if (r.error) { alert(r.error.message); return; }
        renderMuteLink(next);
        if (window.PKNotifyRefreshMutes) window.PKNotifyRefreshMutes();
        loadInbox();
      });
    });
  }

  if (dlgDeleteLink) {
    dlgDeleteLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (!current || current.kind !== 'dm') return;
      var convId = current.id;
      var nick = current.otherNick;
      window.pkConfirm('Удалить переписку с «' + nick + '» насовсем? Сообщения исчезнут у обоих, это нельзя отменить.', function () {
        window.supa.from('conversations').delete().eq('id', convId).then(function (r) {
          if (r.error) { alert(r.error.message); return; }
          if (current && current.kind === 'dm' && current.id === convId) closeConversation();
          loadInbox();
        });
      });
    });
  }

  function openGroup(g) {
    current = { kind: 'group', id: g.group_id, title: g.title, ownerId: g.owner_id, memberCount: g.member_count };
    showDialogPane();
    markActiveRow();
    dlgNick.textContent = g.title;
    dlgTick.style.display = 'none';
    blockLink.style.display = 'none';
    if (dlgReportLink) dlgReportLink.style.display = 'none';
    if (dlgDeleteLink) dlgDeleteLink.hidden = true;
    if (dlgFirstMsgHint) dlgFirstMsgHint.hidden = true;
    blockedNote.hidden = true;
    chatRow.style.display = '';
    if (groupMembersLink) { groupMembersLink.hidden = false; groupMembersLink.textContent = g.member_count + ' участн. ▾'; }
    if (groupPanel) groupPanel.hidden = !pendingGroupNotice;
    if (groupAddHint) {
      groupAddHint.style.color = '#b23e00';
      groupAddHint.textContent = pendingGroupNotice || '';
    }
    pendingGroupNotice = null;
    var amOwner = g.owner_id === myId;
    if (groupRenameRow) groupRenameRow.hidden = !amOwner;
    if (groupRenameInput) groupRenameInput.value = g.title;
    if (groupLeaveLink) groupLeaveLink.hidden = amOwner;
    if (groupDeleteLink) groupDeleteLink.hidden = !amOwner;
    renderMuteLink(!!g.muted);
    loadGroupMembers();
    loadMessages();
  }

  function closeConversation() {
    current = null;
    if (dialogInner) dialogInner.hidden = true;
    if (groupCreate) groupCreate.hidden = true;
    if (dialogEmpty) dialogEmpty.hidden = false;
    if (pmChatShell) pmChatShell.classList.remove('dialog-open');
    if (inboxBox) inboxBox.querySelectorAll('.match-card.active').forEach(function (c) { c.classList.remove('active'); });
  }

  // ---------- группа: участники, добавить, переименовать, выйти/удалить ----------
  function loadGroupMembers() {
    if (!current || current.kind !== 'group' || !groupMembersList) return;
    var gid = current.id;
    window.supa.from('chat_group_members')
      .select('profile_id, joined_at, profiles!profile_id(id, nickname)')
      .eq('group_id', gid)
      .order('joined_at', { ascending: true })
      .then(function (res) {
        if (!current || current.kind !== 'group' || current.id !== gid) return;
        if (res.error) { groupMembersList.innerHTML = '<p class="hint" style="padding:4px 8px">Не удалось загрузить участников.</p>'; return; }
        var rows = res.data || [];
        current.memberCount = rows.length;
        if (groupMembersLink) groupMembersLink.textContent = rows.length + ' участн. ' + (groupPanel && !groupPanel.hidden ? '▴' : '▾');
        var amOwner = current.ownerId === myId;
        groupMembersList.innerHTML = '<div style="padding:4px 0">' + rows.map(function (m) {
          var p = m.profiles || {};
          var isOwner = m.profile_id === current.ownerId;
          return '<span class="pm-member"><a href="profile.html?id=' + m.profile_id + '">' + escapeHtml(p.nickname || '?') + '</a>' +
            (isOwner ? ' <span class="own">(создатель)</span>' : '') +
            (amOwner && !isOwner ? ' <a href="#" class="rm" data-rm="' + m.profile_id + '" title="Убрать из группы">✕</a>' : '') +
            '</span>';
        }).join('') + '</div>';
        groupMembersList.querySelectorAll('[data-rm]').forEach(function (a) {
          a.addEventListener('click', function (e) {
            e.preventDefault();
            window.pkConfirm('Убрать этого человека из группы?', function () {
              window.supa.from('chat_group_members').delete().eq('group_id', gid).eq('profile_id', a.getAttribute('data-rm')).then(function (r) {
                if (r.error) { alert(r.error.message); return; }
                loadGroupMembers();
                loadInbox();
              });
            });
          });
        });
      });
  }

  if (groupMembersLink) {
    groupMembersLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (!groupPanel) return;
      groupPanel.hidden = !groupPanel.hidden;
      groupMembersLink.textContent = (current ? current.memberCount : '') + ' участн. ' + (groupPanel.hidden ? '▾' : '▴');
    });
  }

  function findProfileByNick(nick) {
    return window.supa.from('profiles').select('id, nickname').eq('nickname', nick).maybeSingle();
  }

  if (groupAddBtn) {
    groupAddBtn.addEventListener('click', function () {
      if (!current || current.kind !== 'group') return;
      var nick = (groupAddNick.value || '').trim();
      if (!nick) return;
      var gid = current.id;
      groupAddBtn.disabled = true;
      findProfileByNick(nick).then(function (pr) {
        if (!pr.data) { groupAddBtn.disabled = false; groupAddHint.style.color = '#b23e00'; groupAddHint.textContent = 'Такого ника нет.'; return; }
        window.supa.rpc('add_chat_group_member', { p_group_id: gid, p_profile_id: pr.data.id }).then(function (r) {
          groupAddBtn.disabled = false;
          if (r.error) { groupAddHint.style.color = '#b23e00'; groupAddHint.textContent = pr.data.nickname + ': ' + groupErrorText(r.error); return; }
          groupAddHint.style.color = '#1d7813';
          groupAddHint.textContent = pr.data.nickname + ' добавлен(а).';
          groupAddNick.value = '';
          loadGroupMembers();
          loadInbox();
        });
      });
    });
  }

  if (groupRenameBtn) {
    groupRenameBtn.addEventListener('click', function () {
      if (!current || current.kind !== 'group') return;
      var title = (groupRenameInput.value || '').trim();
      if (!title) return;
      var gid = current.id;
      window.supa.from('chat_groups').update({ title: title }).eq('id', gid).then(function (r) {
        if (r.error) { alert(r.error.message); return; }
        if (current && current.id === gid) { current.title = title; dlgNick.textContent = title; }
        loadInbox();
      });
    });
  }

  if (groupLeaveLink) {
    groupLeaveLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (!current || current.kind !== 'group') return;
      window.pkConfirm('Покинуть группу «' + current.title + '»? Вернуть вас сможет только кто-то из участников.', function () {
        window.supa.from('chat_group_members').delete().eq('group_id', current.id).eq('profile_id', myId).then(function (r) {
          if (r.error) { alert(r.error.message); return; }
          closeConversation();
          loadInbox();
        });
      });
    });
  }

  if (groupDeleteLink) {
    groupDeleteLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (!current || current.kind !== 'group') return;
      window.pkConfirm('Удалить группу «' + current.title + '» вместе со всей перепиской? Это нельзя отменить.', function () {
        window.supa.from('chat_groups').delete().eq('id', current.id).then(function (r) {
          if (r.error) { alert(r.error.message); return; }
          closeConversation();
          loadInbox();
        });
      });
    });
  }

  // ---------- создание группы ----------
  function setGroupCreateHint(text, ok) {
    if (!groupCreateHint) return;
    groupCreateHint.textContent = text || '';
    groupCreateHint.style.color = ok == null ? '' : (ok ? '#1d7813' : '#b23e00');
  }

  function openGroupCreate() {
    current = null;
    markActiveRow();
    if (dialogEmpty) dialogEmpty.hidden = true;
    if (dialogInner) dialogInner.hidden = true;
    if (groupCreate) groupCreate.hidden = false;
    if (pmChatShell) pmChatShell.classList.add('dialog-open');
    groupTitleInput.value = '';
    groupExtraNicks.value = '';
    setGroupCreateHint('', null);
    if (!groupsAvailable) {
      setGroupCreateHint('Группы ещё не включены на сайте — загляните чуть позже.', false);
      groupCreateBtn.disabled = true;
      groupFriendsList.innerHTML = '';
      return;
    }
    groupCreateBtn.disabled = false;
    groupFriendsList.innerHTML = '<span class="hint">Загрузка...</span>';
    window.supa.from('friendships')
      .select('requester_id, addressee_id, r:profiles!requester_id(id,nickname), a:profiles!addressee_id(id,nickname)')
      .eq('status', 'accepted')
      .or('requester_id.eq.' + myId + ',addressee_id.eq.' + myId)
      .then(function (res) {
        var friends = (res.data || []).map(function (f) { return f.requester_id === myId ? f.a : f.r; })
          .filter(Boolean)
          .sort(function (x, y) { return String(x.nickname).localeCompare(String(y.nickname), 'ru'); });
        if (!friends.length) {
          groupFriendsList.innerHTML = '<span class="hint">Друзей пока нет — добавьте людей по нику ниже.</span>';
          return;
        }
        groupFriendsList.innerHTML = friends.map(function (f) {
          return '<label><input type="checkbox" value="' + f.id + '"> ' + escapeHtml(f.nickname) + '</label>';
        }).join('');
      });
  }

  if (newGroupBtn) newGroupBtn.addEventListener('click', openGroupCreate);
  if (groupCreateBack) {
    groupCreateBack.addEventListener('click', function (e) {
      e.preventDefault();
      closeConversation();
    });
  }

  if (groupCreateBtn) {
    groupCreateBtn.addEventListener('click', function () {
      var title = (groupTitleInput.value || '').trim();
      if (!title) { setGroupCreateHint('Придумайте название группы.', false); return; }
      var ids = Array.prototype.map.call(groupFriendsList.querySelectorAll('input[type=checkbox]:checked'), function (c) { return c.value; });
      var nicks = (groupExtraNicks.value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      groupCreateBtn.disabled = true;
      setGroupCreateHint('Создаём...', null);

      Promise.all(nicks.map(function (n) {
        return findProfileByNick(n).then(function (r) { return { nick: n, id: r.data ? r.data.id : null }; });
      })).then(function (found) {
        var problems = [];
        found.forEach(function (f) {
          if (!f.id) problems.push(f.nick + ' — такого ника нет');
          else if (f.id !== myId && ids.indexOf(f.id) === -1) ids.push(f.id);
        });
        return window.supa.rpc('create_chat_group', { p_title: title }).then(function (cr) {
          if (cr.error) throw cr.error;
          var gid = cr.data;
          // Добавляем по одному, чтобы понять, кого именно не пустила настройка.
          return ids.reduce(function (chain, pid) {
            return chain.then(function () {
              return window.supa.rpc('add_chat_group_member', { p_group_id: gid, p_profile_id: pid }).then(function (ar) {
                if (ar.error) problems.push(pid + '|' + groupErrorText(ar.error));
              });
            });
          }, Promise.resolve()).then(function () { return { gid: gid, problems: problems }; });
        });
      }).then(function (out) {
        groupCreateBtn.disabled = false;
        openGroupFromUrl = String(out.gid);
        if (out.problems.length) {
          // для отказов по id подставляем ники из списка друзей
          var names = {};
          groupFriendsList.querySelectorAll('label').forEach(function (l) {
            var cb = l.querySelector('input');
            if (cb) names[cb.value] = l.textContent.trim();
          });
          var text = 'Не добавлены: ' + out.problems.map(function (p) {
            var parts = p.split('|');
            return parts.length === 2 ? (names[parts[0]] || 'участник') + ' — ' + parts[1] : p;
          }).join('; ');
          pendingGroupNotice = text;
        }
        loadInbox();
      }).catch(function (err) {
        groupCreateBtn.disabled = false;
        setGroupCreateHint(groupErrorText(err), false);
      });
    });
  }

  if (dlgBackBtn) {
    dlgBackBtn.addEventListener('click', function (e) {
      e.preventDefault();
      closeConversation();
    });
  }

  function refreshBlockState() {
    var cur = current;
    if (!cur || cur.kind !== 'dm') return;
    window.supa.from('blocks').select('blocker_id, blocked_id')
      .or('and(blocker_id.eq.' + myId + ',blocked_id.eq.' + current.otherId + '),and(blocker_id.eq.' + current.otherId + ',blocked_id.eq.' + myId + ')')
      .then(function (res) {
        if (current !== cur) return;
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
    var cur = current;
    var q = cur.kind === 'group'
      ? window.supa.from('chat_group_messages').select('id, sender_id, body, photo_path, created_at, profiles!sender_id(nickname, avatar_url)').eq('group_id', cur.id)
      : window.supa.from('messages').select('id, sender_id, body, photo_path, created_at').eq('conversation_id', cur.id);
    q.order('created_at', { ascending: true })
      .then(function (res) {
        if (current !== cur) return; // пока грузилось, открыли другой диалог
        if (res.error || !res.data) { chatLog.innerHTML = '<p class="hint">Не удалось загрузить.</p>'; return; }
        chatLog.innerHTML = '';
        if (!res.data.length && cur.kind === 'group') chatLog.innerHTML = '<p class="hint">В группе пока тихо — напишите первым.</p>';
        res.data.forEach(appendMessage);
        chatLog.scrollTop = chatLog.scrollHeight;
        if (cur.kind === 'group') {
          window.supa.rpc('mark_chat_group_read', { p_group_id: cur.id }).then(function () {
            var row = inboxBox && inboxBox.querySelector('[data-group-id="' + cur.id + '"]');
            if (row) {
              row.classList.remove('unread');
              var b = row.querySelector('.name .badge');
              if (b) b.remove();
            }
            if (window.PKRefreshPmBadge) window.PKRefreshPmBadge();
          });
          if (res.data.length) renderReadBy(cur, res.data[res.data.length - 1].created_at);
        }
      });
  }

  // Аватарки тех, кто дочитал группу хотя бы до последнего сообщения — под
  // самим последним сообщением, как общий статус чата, а не у каждой
  // реплики по отдельности.
  function renderReadBy(cur, lastAt) {
    window.supa.from('chat_group_members')
      .select('profile_id, last_read_at, profiles(nickname, avatar_url)')
      .eq('group_id', cur.id)
      .then(function (res) {
        if (current !== cur || res.error) return;
        var readers = (res.data || []).filter(function (m) {
          return m.profile_id !== myId && m.last_read_at && new Date(m.last_read_at) >= new Date(lastAt);
        });
        if (!readers.length) return;
        var wrap = document.createElement('div');
        wrap.className = 'read-by';
        var shown = readers.slice(0, 4);
        wrap.innerHTML = shown.map(function (m) {
          var p = m.profiles || {};
          var av = p.avatar_url ? ' style="background-image:url(' + escapeHtml(p.avatar_url) + ')"' : '';
          return '<span class="msg-av"' + av + ' title="' + escapeHtml(p.nickname || '?') + '">' +
            (p.avatar_url ? '' : escapeHtml((p.nickname || '?').charAt(0).toUpperCase())) + '</span>';
        }).join('') +
        (readers.length > shown.length ? '<button type="button" class="read-by-more">+' + (readers.length - shown.length) + '</button>' : '') +
        '<span class="read-by-label">' + (readers.length === 1 ? 'прочитал(а)' : 'прочитали') + '</span>';
        chatLog.appendChild(wrap);
        chatLog.scrollTop = chatLog.scrollHeight;

        var moreBtn = wrap.querySelector('.read-by-more');
        if (moreBtn) {
          moreBtn.addEventListener('click', function () {
            var existing = wrap.querySelector('.read-by-list');
            if (existing) { existing.remove(); return; }
            var list = document.createElement('div');
            list.className = 'read-by-list';
            list.innerHTML = readers.map(function (m) {
              var p = m.profiles || {};
              var av = p.avatar_url ? ' style="background-image:url(' + escapeHtml(p.avatar_url) + ')"' : '';
              return '<div><span class="msg-av"' + av + '>' + (p.avatar_url ? '' : escapeHtml((p.nickname || '?').charAt(0).toUpperCase())) + '</span>' + escapeHtml(p.nickname || '?') + '</div>';
            }).join('');
            wrap.appendChild(list);
          });
        }
      });
  }

  function appendMessage(row) {
    var p = document.createElement('p');
    var mine = row.sender_id === myId;
    p.className = mine ? 'me' : 'them';
    var who, whoId, whoAvatar;
    if (mine) {
      who = 'Вы'; whoId = null; whoAvatar = myAvatar;
    } else if (current.kind === 'group') {
      var sp = row.profiles || {};
      who = sp.nickname || '?'; whoId = row.sender_id; whoAvatar = sp.avatar_url;
    } else {
      who = current.otherNick; whoId = current.otherId; whoAvatar = current.otherAvatar;
    }
    var avHtml = '<span class="msg-av"' + (whoAvatar ? ' style="background-image:url(' + escapeHtml(whoAvatar) + ')"' : '') + '>' +
      (whoAvatar ? '' : escapeHtml((who || '?').charAt(0).toUpperCase())) + '</span>';
    var nameHtml = whoId ? '<a href="profile.html?id=' + whoId + '">' + escapeHtml(who) + '</a>' : escapeHtml(who);
    var mailHtml = '';
    if (mine && current.kind === 'dm') {
      var read = current.otherLastReadAt && new Date(row.created_at) <= new Date(current.otherLastReadAt);
      mailHtml = '<img class="msg-mail" src="img/icons/i-mail-' + (read ? 'open' : 'sent') + '.svg" alt="" title="' + (read ? 'Прочитано' : 'Отправлено') + '">';
    }
    p.innerHTML = avHtml + '<b' + (!mine && current.kind === 'group' ? ' class="who"' : '') + '>' + nameHtml + ':</b>' + (row.body ? ' ' + escapeHtml(row.body) : '') + mailHtml;
    chatLog.appendChild(p);
    if (row.photo_path) {
      var img = document.createElement('img');
      img.className = 'msg-photo';
      img.alt = 'фото';
      img.title = 'Открыть в полный размер';
      p.appendChild(img);
      var bucket = current.kind === 'group' ? 'group-photos' : 'pm-photos';
      window.supa.storage.from(bucket).createSignedUrl(row.photo_path, 600).then(function (signed) {
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
    var isGroup = current.kind === 'group';
    chatSend.disabled = true;

    function insertMessage(photoPath) {
      var payload = isGroup ? { group_id: current.id, sender_id: myId } : { conversation_id: current.id, sender_id: myId };
      if (body) payload.body = body;
      if (photoPath) payload.photo_path = photoPath;
      window.supa.from(isGroup ? 'chat_group_messages' : 'messages').insert(payload).then(function (res) {
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
      window.supa.storage.from(isGroup ? 'group-photos' : 'pm-photos').upload(path, photo).then(function (upRes) {
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
      if (!current || current.kind !== 'dm') return;
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
      window.supa.from('profiles').select('avatar_url').eq('id', myId).single().then(function (r) {
        if (r.data) myAvatar = r.data.avatar_url;
      });

      var params = new URLSearchParams(window.location.search);
      var to = params.get('to');
      if (to && newMsgNick) newMsgNick.value = to;
      if (params.get('group')) openGroupFromUrl = params.get('group');
      if (params.get('conv')) openConvFromUrl = params.get('conv');

      loadAll();
    });
  }

  init();
  window.supa.auth.onAuthStateChange(init);
})();

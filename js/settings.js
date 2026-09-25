/*
 * Настройки. Микрофон — предпочтение этого браузера (localStorage), не
 * аккаунта: разрешение на микрофон в любом случае каждый раз спрашивает сам
 * браузер, отдельно на каждом устройстве. Невидимка/кто может писать первым
 * — реальные поля в profiles (hide_online/dm_policy, db/schema_v34.sql),
 * действуют на любом устройстве. Смена почты/пароля — обычный
 * supabase.auth.updateUser(), своей таблицы не требует. Удаление аккаунта —
 * через запрос в Поддержку (support_messages, как жалоба/вопрос), решает
 * администратор вручную.
 */
(function () {
  var MIC_KEY = 'pk_mic_enabled';
  var micSeg = document.getElementById('micSeg');

  function applySeg(seg, onValue) {
    if (!seg) return;
    seg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-on') === onValue);
    });
  }

  function readFlag(key) {
    try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
  }
  function writeFlag(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  applySeg(micSeg, readFlag(MIC_KEY) ? '1' : '0');
  if (micSeg) {
    micSeg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var on = b.getAttribute('data-on');
        writeFlag(MIC_KEY, on);
        applySeg(micSeg, on);
      });
    });
  }

  if (!window.supa) return;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function setHint(el, text, ok) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = ok ? '#1d7813' : '#b23e00';
  }

  var myId = null;

  // ---------- приватность: невидимка + кто может писать первым ----------
  var privacyGuestNotice = document.getElementById('privacyGuestNotice');
  var privacyArea = document.getElementById('privacyArea');
  var onlineSeg = document.getElementById('onlineSeg');
  var dmSeg = document.getElementById('dmSeg');

  if (onlineSeg) {
    onlineSeg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!myId) return;
        var on = b.getAttribute('data-on');
        applySeg(onlineSeg, on);
        window.supa.from('profiles').update({ hide_online: on === '0' }).eq('id', myId).then(function (r) {
          if (r.error) alert(r.error.message);
        });
      });
    });
  }
  if (dmSeg) {
    dmSeg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!myId) return;
        var policy = b.getAttribute('data-on');
        applySeg(dmSeg, policy);
        window.supa.from('profiles').update({ dm_policy: policy }).eq('id', myId).then(function (r) {
          if (r.error) alert(r.error.message);
        });
      });
    });
  }

  // ---------- анонимные сообщения (принимать/не принимать) ----------
  var anonGuestNotice = document.getElementById('anonGuestNotice');
  var anonArea = document.getElementById('anonArea');
  var anonSeg = document.getElementById('anonSeg');

  if (anonSeg) {
    anonSeg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!myId) return;
        var on = b.getAttribute('data-on');
        applySeg(anonSeg, on);
        window.supa.from('profiles').update({ anon_messages_enabled: on === '1' }).eq('id', myId).then(function (r) {
          if (r.error) alert(r.error.message);
        });
      });
    });
  }

  // ---------- заблокированные ----------
  var blockedGuestNotice = document.getElementById('blockedGuestNotice');
  var blockedArea = document.getElementById('blockedArea');
  var blockedList = document.getElementById('blockedList');

  function loadBlocked() {
    if (!blockedList) return;
    window.supa.from('blocks')
      .select('blocked_id, created_at, profiles!blocked_id(id, nickname, verified)')
      .eq('blocker_id', myId)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { blockedList.innerHTML = '<p class="hint">Не удалось загрузить.</p>'; return; }
        if (!res.data.length) { blockedList.innerHTML = '<p class="hint" style="padding:4px 2px">Никого не заблокировано.</p>'; return; }
        blockedList.innerHTML = res.data.map(function (r) {
          var prof = r.profiles || {};
          return '<div class="p-row"><span class="lbl">' +
            (prof.id ? '<a href="profile.html?id=' + prof.id + '">' + escapeHtml(prof.nickname || '?') + '</a>' : escapeHtml(prof.nickname || '?')) +
            '</span><span class="val"><a href="#" class="unblock-btn" data-id="' + r.blocked_id + '">Разблокировать</a></span></div>';
        }).join('');
        blockedList.querySelectorAll('.unblock-btn').forEach(function (a) {
          a.addEventListener('click', function (e) {
            e.preventDefault();
            window.supa.from('blocks').delete().eq('blocker_id', myId).eq('blocked_id', a.getAttribute('data-id')).then(loadBlocked);
          });
        });
      });
  }

  // ---------- почта и пароль ----------
  var credentialsGuestNotice = document.getElementById('credentialsGuestNotice');
  var credentialsArea = document.getElementById('credentialsArea');
  var newEmailInput = document.getElementById('newEmailInput');
  var changeEmailBtn = document.getElementById('changeEmailBtn');
  var changeEmailHint = document.getElementById('changeEmailHint');
  var newPasswordInput = document.getElementById('newPasswordInput');
  var changePasswordBtn = document.getElementById('changePasswordBtn');
  var changePasswordHint = document.getElementById('changePasswordHint');

  if (changeEmailBtn) {
    changeEmailBtn.addEventListener('click', function () {
      var email = (newEmailInput.value || '').trim();
      if (!email) { setHint(changeEmailHint, 'Введите новую почту.', false); return; }
      changeEmailBtn.disabled = true;
      window.supa.auth.updateUser({ email: email }).then(function (res) {
        changeEmailBtn.disabled = false;
        if (res.error) { setHint(changeEmailHint, res.error.message, false); return; }
        setHint(changeEmailHint, 'Письмо для подтверждения отправлено на новую почту.', true);
        newEmailInput.value = '';
      });
    });
  }
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', function () {
      var pass = newPasswordInput.value || '';
      if (pass.length < 6) { setHint(changePasswordHint, 'Пароль должен быть от 6 символов.', false); return; }
      changePasswordBtn.disabled = true;
      window.supa.auth.updateUser({ password: pass }).then(function (res) {
        changePasswordBtn.disabled = false;
        if (res.error) { setHint(changePasswordHint, res.error.message, false); return; }
        setHint(changePasswordHint, 'Пароль изменён.', true);
        newPasswordInput.value = '';
      });
    });
  }

  // ---------- аккаунт: удаление ----------
  var accountGuestNotice = document.getElementById('accountGuestNotice');
  var accountArea = document.getElementById('accountArea');
  var deleteBtn = document.getElementById('deleteAccountBtn');
  var deleteHint = document.getElementById('deleteAccountHint');

  if (deleteBtn) {
    deleteBtn.addEventListener('click', function () {
      if (!myId) return;
      if (!confirm('Отправить запрос на удаление аккаунта в поддержку? Решение примет администратор.')) return;
      deleteBtn.disabled = true;
      window.supa.from('support_messages').insert({
        author_id: myId,
        kind: 'question',
        subject: 'Запрос на удаление аккаунта',
        body: 'Прошу удалить мой аккаунт и связанные с ним данные.',
        context_url: window.location.href
      }).then(function (res) {
        deleteBtn.disabled = false;
        if (res.error) { setHint(deleteHint, res.error.message, false); return; }
        setHint(deleteHint, 'Отправлено — обращение увидят администраторы, ответят в Поддержке.', true);
      });
    });
  }

  // ---------- сессия: показать разделы вошедшего, подтянуть текущее состояние ----------
  window.supa.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) {
      if (accountGuestNotice) accountGuestNotice.hidden = false;
      if (privacyGuestNotice) privacyGuestNotice.hidden = false;
      if (anonGuestNotice) anonGuestNotice.hidden = false;
      if (blockedGuestNotice) blockedGuestNotice.hidden = false;
      if (credentialsGuestNotice) credentialsGuestNotice.hidden = false;
      return;
    }
    myId = session.user.id;
    if (accountArea) accountArea.hidden = false;
    if (privacyArea) privacyArea.hidden = false;
    if (anonArea) anonArea.hidden = false;
    if (blockedArea) blockedArea.hidden = false;
    if (credentialsArea) credentialsArea.hidden = false;

    window.supa.from('profiles').select('hide_online, dm_policy, anon_messages_enabled').eq('id', myId).single().then(function (r) {
      if (r.error || !r.data) return;
      applySeg(onlineSeg, r.data.hide_online ? '0' : '1');
      applySeg(dmSeg, r.data.dm_policy || 'all');
      applySeg(anonSeg, r.data.anon_messages_enabled ? '1' : '0');
    });
    loadBlocked();
  });
})();

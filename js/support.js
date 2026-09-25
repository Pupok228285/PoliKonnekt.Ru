/*
 * Поддержка: жалоба, вопрос или предложение. Реально сохраняется в базу
 * (support_messages), видит автор + админы/модераторы. У каждого обращения —
 * мини-переписка (support_replies): можно уточнить детали, а не только один
 * текст в одну сторону. Ответ автора в уже решённый тикет тихо открывает его
 * заново.
 */
(function () {
  if (!window.supa) return;

  var KIND_LABELS = { complaint: 'Жалоба', question: 'Вопрос', suggestion: 'Предложение' };

  var guestNotice = document.getElementById('guestNotice');
  var area = document.getElementById('supportArea');
  var kindSel = document.getElementById('supKind');
  var subjectInput = document.getElementById('supSubject');
  var bodyInput = document.getElementById('supBody');
  var submitBtn = document.getElementById('supSubmit');
  var hint = document.getElementById('supHint');
  var mineList = document.getElementById('supMineList');
  var mineEmpty = document.getElementById('supMineEmpty');
  if (!area) return;

  var myId = null;

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
    hint.textContent = text || '';
    hint.style.color = ok ? '#1d7813' : '#b23e00';
  }

  function loadMine() {
    window.supa.from('support_messages')
      .select('id, kind, subject, status, created_at')
      .eq('author_id', myId)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error || !res.data) return;
        mineEmpty.hidden = res.data.length > 0;
        mineList.querySelectorAll('.ipb[data-ticket]').forEach(function (el) { el.remove(); });
        res.data.forEach(renderTicket);
      });
  }

  function renderTicket(row) {
    var kindLabel = KIND_LABELS[row.kind] || 'Вопрос';
    var statusLabel = row.status === 'resolved' ? 'решено' : 'на рассмотрении';
    var wrap = document.createElement('div');
    wrap.className = 'ipb';
    wrap.style.marginTop = '8px';
    wrap.setAttribute('data-ticket', row.id);
    wrap.innerHTML =
      '<div class="maintitle">' + kindLabel + ': ' + escapeHtml(row.subject) + ' <span class="r">' + statusLabel + '</span></div>' +
      '<div class="chatbox">' +
        '<div class="log" data-log style="min-height:30px"><p class="hint">Загрузка...</p></div>' +
        '<div class="row2">' +
          '<input class="field" type="text" data-reply-input placeholder="Ответить...">' +
          '<button class="submit" type="button" data-reply-btn>Отправить</button>' +
        '</div>' +
      '</div>';
    mineList.appendChild(wrap);
    loadReplies(row.id, wrap.querySelector('[data-log]'));

    wrap.querySelector('[data-reply-btn]').addEventListener('click', function () {
      var input = wrap.querySelector('[data-reply-input]');
      var text = (input.value || '').trim();
      if (!text) return;
      window.supa.from('support_replies').insert({ ticket_id: row.id, author_id: myId, body: text }).then(function (r) {
        if (r.error) { alert(r.error.message); return; }
        input.value = '';
        loadReplies(row.id, wrap.querySelector('[data-log]'));
        loadMine();
      });
    });
  }

  function loadReplies(ticketId, logEl) {
    window.supa.from('support_replies')
      .select('id, author_id, body, created_at, profiles!author_id(nickname, is_admin, is_moderator)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) { logEl.innerHTML = '<p class="hint">' + escapeHtml(res.error.message) + '</p>'; return; }
        if (!res.data.length) { logEl.innerHTML = '<p class="hint" style="margin:4px 8px">Пока без ответа.</p>'; return; }
        logEl.innerHTML = '';
        res.data.forEach(function (r) {
          var prof = r.profiles || {};
          var mine = r.author_id === myId;
          var who = mine ? 'Вы' : ((prof.is_admin || prof.is_moderator) ? 'Поддержка' : escapeHtml(prof.nickname || '?'));
          var p = document.createElement('p');
          p.className = mine ? 'me' : 'them';
          p.innerHTML = '<b>' + who + ':</b> ' + escapeHtml(r.body);
          logEl.appendChild(p);
        });
      });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      var subject = (subjectInput.value || '').trim();
      var body = (bodyInput.value || '').trim();
      if (!subject || !body) { setHint('Заполните тему и текст обращения.', false); return; }
      submitBtn.disabled = true;
      setHint('Отправляем...', true);
      window.supa.from('support_messages').insert({
        author_id: myId,
        kind: kindSel.value,
        subject: subject,
        body: body,
        context_url: window.location.href
      }).then(function (res) {
        submitBtn.disabled = false;
        if (res.error) { setHint(res.error.message, false); return; }
        setHint('Отправлено, спасибо — рассмотрим и ответим здесь же.', true);
        subjectInput.value = '';
        bodyInput.value = '';
        loadMine();
      });
    });
  }

  window.supa.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) { guestNotice.hidden = false; area.hidden = true; return; }
    myId = session.user.id;
    guestNotice.hidden = true;
    area.hidden = false;
    loadMine();
  });
})();

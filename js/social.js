/*
 * Общий модуль для оценок (стрелочки ▲/▼ → настоящая "Репутация" автора,
 * до этого просто нарисованное число) и комментариев. Работает на любом
 * посте, у которого есть подходящие data-атрибуты — один скрипт на все
 * страницы (Лента/Цитаты/Столовая/стена артели/ответы форума).
 *
 * Использование из другого js-файла:
 *   в HTML поста добавить
 *     <span class="vote-widget" data-vtype="feed_post" data-vid="123">
 *       <button type="button" class="vote-up">▲</button>
 *       <b class="vote-score">0</b>
 *       <button type="button" class="vote-down">▼</button>
 *     </span>
 *     <a href="#" class="comment-toggle" data-ctype="feed_post" data-cid="123">Комментарии (0)</a>
 *     <a href="#" class="fav-toggle" data-ftype="feed_post" data-fid="123">В избранное</a>
 *   и после отрисовки списка вызвать PKSocial.scan(контейнер).
 *   content_type для оценок: feed_post/quote_post/canteen_post/artel_post/forum_reply.
 *   content_type для комментариев (без forum_reply — там уже есть темы):
 *     feed_post/quote_post/canteen_post/artel_post.
 *   content_type для избранного: любой из вышеперечисленных, добавляется по мере надобности.
 */
(function () {
  if (!window.supa) return;

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

  // ---------- оценки ----------
  function attachVote(el) {
    var vtype = el.getAttribute('data-vtype');
    var vid = el.getAttribute('data-vid');
    var upBtn = el.querySelector('.vote-up');
    var downBtn = el.querySelector('.vote-down');
    var scoreEl = el.querySelector('.vote-score');
    var current = null;

    function render() {
      upBtn.classList.toggle('active', current === 1);
      downBtn.classList.toggle('active', current === -1);
    }

    function stamp(btn) {
      btn.classList.remove('just-stamped');
      // force reflow, чтобы анимация перезапустилась при повторном клике подряд
      void btn.offsetWidth;
      btn.classList.add('just-stamped');
      setTimeout(function () { btn.classList.remove('just-stamped'); }, 350);
    }

    function vote(value, btn) {
      window.supa.auth.getSession().then(function (res) {
        if (!res.data.session) { alert('Сначала войдите вверху страницы.'); return; }
        var next = (current === value) ? 0 : value;
        upBtn.disabled = downBtn.disabled = true;
        window.supa.rpc('cast_vote', { p_content_type: vtype, p_content_id: Number(vid), p_value: next }).then(function (r) {
          upBtn.disabled = downBtn.disabled = false;
          if (r.error) { alert(r.error.message); return; }
          var row = r.data && r.data[0];
          if (row) {
            current = row.my_vote;
            scoreEl.textContent = row.new_score;
            render();
            if (next !== 0) stamp(btn);
          }
        });
      });
    }

    upBtn.addEventListener('click', function () { vote(1, upBtn); });
    downBtn.addEventListener('click', function () { vote(-1, downBtn); });

    window.supa.auth.getSession().then(function (res) {
      var session = res.data.session;
      if (!session) { render(); return; }
      window.supa.from('votes').select('value')
        .eq('content_type', vtype).eq('content_id', vid).eq('voter_id', session.user.id)
        .maybeSingle().then(function (r) {
          current = r.data ? r.data.value : null;
          render();
        });
    });
  }

  // ---------- избранное ----------
  function attachFavorite(el) {
    var ftype = el.getAttribute('data-ftype');
    var fid = el.getAttribute('data-fid');
    var active = false;
    var busy = false;

    function render() {
      el.textContent = active ? 'В избранном ✓' : 'В избранное';
      el.classList.toggle('active', active);
    }

    el.addEventListener('click', function (e) {
      e.preventDefault();
      if (busy) return;
      window.supa.auth.getSession().then(function (res) {
        var session = res.data.session;
        if (!session) { alert('Сначала войдите вверху страницы.'); return; }
        busy = true;
        var op = active
          ? window.supa.from('favorites').delete().eq('profile_id', session.user.id).eq('content_type', ftype).eq('content_id', fid)
          : window.supa.from('favorites').insert({ profile_id: session.user.id, content_type: ftype, content_id: fid });
        op.then(function (r) {
          busy = false;
          if (r.error) { alert(r.error.message); return; }
          active = !active;
          render();
        });
      });
    });

    window.supa.auth.getSession().then(function (res) {
      var session = res.data.session;
      if (!session) { render(); return; }
      window.supa.from('favorites').select('id')
        .eq('profile_id', session.user.id).eq('content_type', ftype).eq('content_id', fid)
        .maybeSingle().then(function (r) {
          active = !!r.data;
          render();
        });
    });
  }

  // ---------- комментарии ----------
  function attachComments(toggle) {
    var ctype = toggle.getAttribute('data-ctype');
    var cid = toggle.getAttribute('data-cid');
    var wrap = document.createElement('div');
    wrap.className = 'comment-thread';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="comment-list"></div>' +
      '<div class="comment-compose"><input class="field" type="text" placeholder="Комментарий..." maxlength="1000">' +
      '<button class="submit" type="button">Отправить</button></div>';
    toggle.insertAdjacentElement('afterend', wrap);

    var list = wrap.querySelector('.comment-list');
    var input = wrap.querySelector('input');
    var sendBtn = wrap.querySelector('button');
    var loaded = false;

    function loadComments() {
      list.innerHTML = '<p class="hint" style="margin:2px 0">Загрузка...</p>';
      window.supa.from('comments')
        .select('id, body, created_at, profiles!author_id(id, nickname, verified)')
        .eq('content_type', ctype).eq('content_id', cid)
        .order('created_at', { ascending: true })
        .then(function (res) {
          if (res.error || !res.data) { list.innerHTML = '<p class="hint">Не удалось загрузить.</p>'; return; }
          if (!res.data.length) { list.innerHTML = '<p class="hint" style="margin:2px 0">Пока без комментариев — начните первым.</p>'; return; }
          list.innerHTML = '';
          res.data.forEach(function (c) {
            var prof = c.profiles || {};
            var nameHtml = prof.id
              ? '<a href="profile.html?id=' + prof.id + '">' + escapeHtml(prof.nickname || '?') + '</a>'
              : escapeHtml(prof.nickname || '?');
            var p = document.createElement('p');
            p.className = 'comment-row';
            p.innerHTML = '<b>' + nameHtml + '</b>' +
              (prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="" style="vertical-align:-2px">' : '') +
              ': ' + escapeHtml(c.body) + ' <span class="hint" style="margin:0">' + fmtDateTime(c.created_at) + '</span>';
            list.appendChild(p);
          });
        });
    }

    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      wrap.hidden = !wrap.hidden;
      if (!wrap.hidden && !loaded) { loaded = true; loadComments(); }
    });

    sendBtn.addEventListener('click', function () {
      var body = (input.value || '').trim();
      if (!body) return;
      window.supa.auth.getSession().then(function (res) {
        var session = res.data.session;
        if (!session) { alert('Сначала войдите вверху страницы.'); return; }
        sendBtn.disabled = true;
        window.supa.from('comments').insert({ content_type: ctype, content_id: cid, author_id: session.user.id, body: body })
          .then(function (r) {
            sendBtn.disabled = false;
            if (r.error) { alert(r.error.message); return; }
            input.value = '';
            var m = toggle.textContent.match(/\((\d+)\)/);
            var n = m ? parseInt(m[1], 10) + 1 : 1;
            toggle.textContent = 'Комментарии (' + n + ')';
            loadComments();
          });
      });
    });
  }

  function scan(root) {
    (root || document).querySelectorAll('[data-vtype]').forEach(function (el) {
      if (el.getAttribute('data-attached')) return;
      el.setAttribute('data-attached', '1');
      attachVote(el);
    });
    (root || document).querySelectorAll('[data-ctype]').forEach(function (el) {
      if (el.getAttribute('data-attached')) return;
      el.setAttribute('data-attached', '1');
      attachComments(el);
    });
    (root || document).querySelectorAll('[data-ftype]').forEach(function (el) {
      if (el.getAttribute('data-attached')) return;
      el.setAttribute('data-attached', '1');
      attachFavorite(el);
    });
  }

  window.PKSocial = { scan: scan };
})();

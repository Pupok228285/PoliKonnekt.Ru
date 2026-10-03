/*
 * Всплывающие уведомления поверх сайта (db/schema_v50.sql) — дополняют звук
 * (js/notify-sound.js). Звук иногда не играет: Web Audio API в некоторых
 * браузерах молчит, пока не было явного клика по странице после открытия
 * вкладки (политика автовоспроизведения) — поэтому у одних людей звук есть,
 * у других нет, хотя код одинаковый. Попап не зависит от этого — виден
 * всегда. Клик по попапу — переход по ссылке; у личных сообщений и групп
 * есть мини-форма "ответить" прямо в уведомлении, без перехода на страницу.
 */
(function () {
  var HOST_ID = 'pkToastHost';

  function host() {
    var h = document.getElementById(HOST_ID);
    if (!h) {
      h = document.createElement('div');
      h.id = HOST_ID;
      document.body.appendChild(h);
    }
    return h;
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  // Z-index у попапа и так выше рекламного блока (550 против 90) — реклама
  // его никогда не закроет. Но если оба в одном углу (bottom-right), чтобы
  // не наезжать друг на друга текстом, поднимаем попап над рекламой.
  function adjustPosition(h) {
    var ad = document.querySelector('.ad-popup.corner-bottom-right.show');
    h.style.bottom = ad ? (window.innerHeight - ad.getBoundingClientRect().top + 10) + 'px' : '10px';
  }

  // opts: { title, body, href, avatar, icon, reply: { table, payload } }
  function show(opts) {
    var el = document.createElement('div');
    el.className = 'pk-toast';
    var avHtml = opts.avatar
      ? '<span class="pk-toast-av" style="background-image:url(' + escapeHtml(opts.avatar) + ')"></span>'
      : opts.icon
        ? '<span class="pk-toast-av pk-toast-ic"><img src="' + escapeHtml(opts.icon) + '" alt="" width="15" height="15"></span>'
        : '<span class="pk-toast-av">' + escapeHtml((opts.title || '?').charAt(0).toUpperCase()) + '</span>';
    el.innerHTML =
      '<div class="pk-toast-main">' + avHtml +
        '<span class="pk-toast-text"><b>' + escapeHtml(opts.title) + '</b>' +
        (opts.body ? '<span>' + escapeHtml(opts.body) + '</span>' : '') + '</span>' +
      '</div>' +
      '<i class="pk-toast-x" title="Скрыть">&times;</i>' +
      (opts.reply ? '<form class="pk-toast-reply"><input type="text" maxlength="500" placeholder="Ответить..."><button type="submit" title="Отправить">&#10148;</button></form>' : '');
    var h = host();
    adjustPosition(h);
    h.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });

    var timer = null;
    function arm() { timer = setTimeout(close, 7000); }
    function disarm() { if (timer) { clearTimeout(timer); timer = null; } }
    function close() {
      disarm();
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 220);
    }
    arm();
    el.addEventListener('mouseenter', disarm);
    el.addEventListener('mouseleave', arm);

    el.querySelector('.pk-toast-x').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      close();
    });
    el.querySelector('.pk-toast-main').addEventListener('click', function () {
      if (opts.href) window.location.href = opts.href;
    });

    var form = el.querySelector('.pk-toast-reply');
    if (form && opts.reply) {
      form.addEventListener('click', function (e) { e.stopPropagation(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = form.querySelector('input');
        var val = (input.value || '').trim();
        if (!val || !window.supa) return;
        var btn = form.querySelector('button');
        input.disabled = true;
        btn.disabled = true;
        var payload = {};
        for (var k in opts.reply.payload) payload[k] = opts.reply.payload[k];
        payload.body = val;
        window.supa.from(opts.reply.table).insert(payload).then(function (r) {
          if (r.error) {
            input.disabled = false; btn.disabled = false;
            input.placeholder = 'Не вышло: ' + r.error.message;
            return;
          }
          disarm();
          form.innerHTML = '<span class="pk-toast-sent">Отправлено ✓</span>';
          setTimeout(close, 1400);
        });
      });
    }
  }

  window.PKNotifyToast = { show: show };
})();

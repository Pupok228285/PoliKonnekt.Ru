/*
 * Единая обработка ссылок "Пожаловаться" по всему сайту (посты, темы,
 * объявления, стена артели, диалоги) — раньше были декоративными,
 * теперь реально уходят в Поддержку с привязкой к странице, где нажали.
 * Один скрипт, без переделки разметки на каждой странице.
 */
(function () {
  if (!window.supa) return;

  var REPORT_TEXTS = ['Пожаловаться', 'Пожаловаться в поддержку', 'Пожаловаться на объявление', 'Пожаловаться на собеседника'];
  var openPop = null;

  function closePop() {
    if (openPop) { openPop.remove(); openPop = null; }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (a && REPORT_TEXTS.indexOf((a.textContent || '').trim()) !== -1) {
      e.preventDefault();
      openReportPop(a);
      return;
    }
    if (openPop && !openPop.contains(e.target) && e.target !== a) closePop();
  });

  function openReportPop(anchor) {
    closePop();
    var rect = anchor.getBoundingClientRect();
    var pop = document.createElement('div');
    pop.className = 'report-pop';
    pop.innerHTML =
      '<b>Пожаловаться</b>' +
      '<textarea placeholder="Коротко, что не так..." maxlength="500"></textarea>' +
      '<div class="rp-row"><span class="hint" style="margin:0" data-msg></span>' +
      '<button class="submit" type="button" style="font-size:10px;padding:2px 8px">Отправить</button></div>';
    document.body.appendChild(pop);
    var top = rect.bottom + window.scrollY + 4;
    var left = Math.min(rect.left + window.scrollX, window.innerWidth - 260);
    pop.style.top = top + 'px';
    pop.style.left = Math.max(8, left) + 'px';
    openPop = pop;

    var textarea = pop.querySelector('textarea');
    var msgEl = pop.querySelector('[data-msg]');
    var btn = pop.querySelector('button');
    textarea.focus();

    btn.addEventListener('click', function () {
      var body = (textarea.value || '').trim();
      if (!body) { msgEl.textContent = 'Напишите пару слов.'; msgEl.style.color = '#b23e00'; return; }
      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) { msgEl.textContent = 'Сначала войдите вверху страницы.'; msgEl.style.color = '#b23e00'; return; }
        btn.disabled = true;
        window.supa.from('support_messages').insert({
          author_id: session.user.id,
          kind: 'complaint',
          subject: 'Жалоба со страницы «' + document.title + '»',
          body: body,
          context_url: window.location.href
        }).then(function (r) {
          btn.disabled = false;
          if (r.error) { msgEl.textContent = r.error.message; msgEl.style.color = '#b23e00'; return; }
          pop.innerHTML = '<span style="color:#1d7813">Спасибо, отправлено — рассмотрим в Поддержке.</span>';
          setTimeout(closePop, 2200);
        });
      });
    });
  }
})();

/*
 * ТОЛЬКО для локальной разработки. Плавающая панелька внизу слева —
 * одним кликом входит под одним из ваших тестовых аккаунтов, без
 * ручного набора почты/пароля каждый раз.
 *
 * Список аккаунтов панель читает из js/dev-accounts.local.js — файла,
 * которого нет в проекте по умолчанию (см. js/dev-accounts.example.js —
 * скопируйте его и впишите свои тестовые почту/пароль). Если файла нет,
 * панель просто не появляется, ошибок в консоли не будет.
 *
 * Панель включается только если сайт открыт как localhost/127.0.0.1 —
 * на настоящем домене этот скрипт ничего не делает, даже если случайно
 * останется подключён.
 */
(function () {
  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!isLocal) return;

  var s = document.createElement('script');
  s.src = 'js/dev-accounts.local.js';
  s.onload = init;
  s.onerror = function () {}; // файла ещё нет — тихо ничего не показываем
  document.head.appendChild(s);

  function init() {
    if (!window.supa || !window.DEV_ACCOUNTS || !window.DEV_ACCOUNTS.length) return;

    var box = document.createElement('div');
    box.id = 'devSwitchBox';
    box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;background:#fff;' +
      'border:2px solid #29527a;border-radius:4px;padding:6px 8px;' +
      'font:12px/1.4 Verdana,Arial,sans-serif;box-shadow:2px 2px 6px rgba(0,0,0,.35);max-width:210px';
    box.innerHTML =
      '<b style="color:#29527a">Dev: сменить аккаунт</b>' +
      '<div id="devSwitchWho" style="margin:2px 0 4px;color:#666"></div>' +
      '<div id="devSwitchList"></div>';
    document.body.appendChild(box);

    var who = document.getElementById('devSwitchWho');
    var list = document.getElementById('devSwitchList');

    function refreshWho() {
      window.supa.auth.getSession().then(function (res) {
        var sess = res.data && res.data.session;
        who.textContent = sess ? ('вы: ' + sess.user.email) : 'вы: гость';
      });
    }
    refreshWho();

    window.DEV_ACCOUNTS.forEach(function (acc) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = acc.label || acc.email;
      btn.style.cssText = 'display:block;width:100%;margin:2px 0;padding:3px;font-size:11px;cursor:pointer';
      btn.addEventListener('click', function () {
        btn.disabled = true;
        window.supa.auth.signOut().then(function () {
          return window.supa.auth.signInWithPassword({ email: acc.email, password: acc.password });
        }).then(function (r) {
          btn.disabled = false;
          if (r.error) { alert(r.error.message); return; }
          window.location.reload();
        });
      });
      list.appendChild(btn);
    });

    var outBtn = document.createElement('button');
    outBtn.type = 'button';
    outBtn.textContent = 'Выйти (гость)';
    outBtn.style.cssText = 'display:block;width:100%;margin:4px 0 0;padding:3px;font-size:11px;cursor:pointer';
    outBtn.addEventListener('click', function () {
      window.supa.auth.signOut().then(function () { window.location.reload(); });
    });
    list.appendChild(outBtn);
  }
})();

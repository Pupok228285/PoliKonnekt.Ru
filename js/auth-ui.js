/*
 * Настоящий вход/регистрация/выход — работает на всех страницах одинаково,
 * состояние сессии хранит сам supabase-js (localStorage), поэтому вход на
 * одной странице виден и на остальных после перехода.
 */
(function () {
  if (!window.supa) { console.error('auth-ui: supa client не инициализирован'); return; }

  var form = document.getElementById('authForm');
  if (!form) return;

  var guestFields = document.getElementById('authGuestFields');
  var userBar = document.getElementById('authUserBar');
  var emailInput = document.getElementById('authEmail');
  var passInput = document.getElementById('authPass');
  var registerBtn = document.getElementById('authRegister');
  var logoutLink = document.getElementById('authLogout');
  var statusEl = document.getElementById('authStatus');
  var nickEl = document.getElementById('authNick');
  var tickEl = document.getElementById('authTick');
  var adminWrap = document.getElementById('authAdminWrap');

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.style.color = isError ? '#b23e00' : '#1d7813';
  }

  function refreshProfile(userId) {
    if (!nickEl) return;
    nickEl.textContent = '…';
    window.supa.from('profiles').select('nickname, verified, is_admin, is_moderator').eq('id', userId).single()
      .then(function (res) {
        if (res.data) {
          nickEl.textContent = res.data.nickname;
          if (tickEl) tickEl.style.display = res.data.verified ? '' : 'none';
          if (adminWrap) adminWrap.hidden = !(res.data.is_admin || res.data.is_moderator);
        } else {
          nickEl.textContent = 'студент';
        }
      });
  }

  function showLoggedIn(session) {
    if (guestFields) guestFields.style.display = 'none';
    if (userBar) userBar.style.display = '';
    refreshProfile(session.user.id);
  }

  function showLoggedOut() {
    if (guestFields) guestFields.style.display = 'flex';
    if (userBar) userBar.style.display = 'none';
  }

  window.supa.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (session) { showLoggedIn(session); } else { showLoggedOut(); }
  });

  window.supa.auth.onAuthStateChange(function (_event, session) {
    if (session) { showLoggedIn(session); } else { showLoggedOut(); }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = (emailInput.value || '').trim();
    var pass = passInput.value || '';
    if (!email || !pass) { setStatus('Заполните почту и пароль.', true); return; }
    setStatus('Входим...');
    window.supa.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
      if (res.error) { setStatus(res.error.message, true); return; }
      setStatus('Готово, вы вошли.');
      passInput.value = '';
    });
  });

  if (registerBtn) {
    registerBtn.addEventListener('click', function () {
      var email = (emailInput.value || '').trim();
      var pass = passInput.value || '';
      if (!email || !pass) { setStatus('Заполните почту и пароль для регистрации.', true); return; }
      if (pass.length < 6) { setStatus('Пароль должен быть от 6 символов.', true); return; }
      setStatus('Регистрируем...');
      window.supa.auth.signUp({ email: email, password: pass }).then(function (res) {
        if (res.error) { setStatus(res.error.message, true); return; }
        if (res.data && res.data.session) {
          setStatus('Готово, вы зарегистрированы и вошли.');
        } else {
          setStatus('Почти готово: проверьте почту и подтвердите регистрацию по ссылке, потом войдите.');
        }
        passInput.value = '';
      });
    });
  }

  if (logoutLink) {
    logoutLink.addEventListener('click', function (e) {
      e.preventDefault();
      window.supa.auth.signOut().then(function () { showLoggedOut(); });
    });
  }
})();

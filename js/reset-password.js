/*
 * Страница reset-password.html — вторая половина восстановления пароля.
 * Ссылка из письма (см. auth-ui.js, resetPasswordForEmail) открывает эту
 * страницу с токеном в URL; supabase-js сам разбирает его при старте и
 * коротко логинит в специальную "recovery"-сессию — событие
 * PASSWORD_RECOVERY ниже это ловит. Без валидного токена событие не
 * придёт вообще, тогда через паузу честно показываем "ссылка не работает".
 */
(function () {
  if (!window.supa) return;

  var checkingBox = document.getElementById('rpChecking');
  var invalidBox = document.getElementById('rpInvalid');
  var formBox = document.getElementById('rpForm');
  var doneBox = document.getElementById('rpDone');
  var pass1 = document.getElementById('rpPass1');
  var pass2 = document.getElementById('rpPass2');
  var saveBtn = document.getElementById('rpSaveBtn');
  var statusEl = document.getElementById('rpStatus');

  var handled = false;

  function showForm() {
    if (handled) return;
    handled = true;
    checkingBox.hidden = true;
    formBox.hidden = false;
  }

  window.supa.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') showForm();
  });

  // Запасной путь: если событие почему-то не долетело, но recovery-сессия
  // уже есть на момент загрузки — всё равно покажем форму.
  window.supa.auth.getSession().then(function (res) {
    if (res.data && res.data.session) showForm();
  });

  setTimeout(function () {
    if (handled) return;
    handled = true;
    checkingBox.hidden = true;
    invalidBox.hidden = false;
  }, 4000);

  saveBtn.addEventListener('click', function () {
    var p1 = pass1.value || '';
    var p2 = pass2.value || '';
    if (p1.length < 6) { statusEl.textContent = 'Пароль должен быть от 6 символов.'; statusEl.style.color = '#b23e00'; return; }
    if (p1 !== p2) { statusEl.textContent = 'Пароли не совпадают.'; statusEl.style.color = '#b23e00'; return; }
    saveBtn.disabled = true;
    statusEl.textContent = 'Сохраняем...';
    statusEl.style.color = '#1d7813';
    window.supa.auth.updateUser({ password: p1 }).then(function (res) {
      saveBtn.disabled = false;
      if (res.error) { statusEl.textContent = res.error.message; statusEl.style.color = '#b23e00'; return; }
      formBox.hidden = true;
      doneBox.hidden = false;
    });
  });
})();

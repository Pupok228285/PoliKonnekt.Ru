/*
 * Отправка фото зачётки на проверку. Фото уходит в закрытое хранилище
 * (видит только сам человек и админ), заявка попадает в очередь в админке.
 */
(function () {
  if (!window.supa) return;

  var sidebox = document.getElementById('verifySidebox');
  var box = document.getElementById('verifyBox');
  var btn = document.getElementById('verifyBtn');
  var fileInput = document.getElementById('verifyFile');
  var statusEl = document.getElementById('verifyStatus');
  if (!box || !btn || !fileInput) return;

  function setMsg(text, ok) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.style.color = ok ? '#1d7813' : '#b23e00';
  }

  function refreshState() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) {
        btn.disabled = true;
        setMsg('Сначала войдите или зарегистрируйтесь.', false);
        return;
      }
      Promise.all([
        window.supa.from('profiles').select('verified').eq('id', session.user.id).single(),
        window.supa.from('verification_requests').select('status').eq('profile_id', session.user.id).order('created_at', { ascending: false }).limit(1)
      ]).then(function (results) {
        var prof = results[0].data;
        var lastReq = results[1].data && results[1].data[0];
        if (prof && prof.verified) {
          if (sidebox) sidebox.hidden = true;
          return;
        }
        if (sidebox) sidebox.hidden = false;
        if (lastReq && lastReq.status === 'pending') {
          btn.disabled = true;
          setMsg('Заявка на проверке, ждите решения администратора.', true);
        } else if (lastReq && lastReq.status === 'rejected') {
          btn.disabled = false;
          setMsg('Прошлую заявку отклонили — можно отправить ещё раз.', false);
        } else {
          btn.disabled = false;
          setMsg('', true);
        }
      });
    });
  }

  refreshState();
  window.supa.auth.onAuthStateChange(refreshState);

  btn.addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) { setMsg('Сначала войдите.', false); return; }
      setMsg('Загружаем...', true);
      var path = session.user.id + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      window.supa.storage.from('id-cards').upload(path, file).then(function (upRes) {
        if (upRes.error) { setMsg(upRes.error.message, false); return; }
        window.supa.from('verification_requests').insert({ profile_id: session.user.id, photo_path: path }).then(function (insRes) {
          if (insRes.error) { setMsg(insRes.error.message, false); return; }
          setMsg('Отправлено, ждите проверки администратором.', true);
          btn.disabled = true;
        });
      });
    });
  });
})();

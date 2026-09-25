/*
 * Отметка «онлайн» — обновляем свою метку времени и текущую страницу, пока
 * вкладка открыта и вы вошли. «Онлайн» в админке и на главной = last_seen_at
 * не старше пары минут. current_path (путь+якорь) используется на главной,
 * чтобы честно показать, кто в каком разделе — без этого пришлось бы рисовать
 * таблицу "Активные участники" по разделам из головы, как раньше.
 */
(function () {
  if (!window.supa) return;

  function ping() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) return;
      var path = window.location.pathname + window.location.hash;
      window.supa.from('profiles').update({ last_seen_at: new Date().toISOString(), current_path: path }).eq('id', session.user.id).then(function () {});
    });
  }

  ping();
  setInterval(ping, 60000);
})();

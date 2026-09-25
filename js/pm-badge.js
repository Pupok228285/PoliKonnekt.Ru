/*
 * Бейджик "Сообщения" в шапке (на всех страницах) — число заявок,
 * которые ждут решения именно от вас (кто-то новый вам написал).
 */
(function () {
  if (!window.supa) return;
  var badge = document.getElementById('pmBadge');
  if (!badge) return;

  function refresh() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) { badge.style.display = 'none'; return; }
      var uid = session.user.id;
      window.supa.from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .neq('initiator', uid)
        .or('user_a.eq.' + uid + ',user_b.eq.' + uid)
        .then(function (r) {
          var n = r.count || 0;
          badge.textContent = String(n);
          badge.style.display = n === 0 ? 'none' : '';
        });
    });
  }
  refresh();
  window.supa.auth.onAuthStateChange(refresh);
})();

/*
 * Бейджик "Сообщения" в шапке (на всех страницах) — число заявок,
 * которые ждут решения именно от вас (кто-то новый вам написал), плюс
 * непрочитанные сообщения в ваших группах.
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
      Promise.all([
        window.supa.from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .neq('initiator', uid)
          .or('user_a.eq.' + uid + ',user_b.eq.' + uid),
        window.supa.rpc('my_chat_groups')
      ]).then(function (r) {
        var n = r[0].count || 0;
        if (!r[1].error && r[1].data) {
          r[1].data.forEach(function (g) { n += Number(g.unread) || 0; });
        }
        badge.textContent = String(n);
        badge.style.display = n === 0 ? 'none' : '';
      });
    });
  }
  window.PKRefreshPmBadge = refresh;
  refresh();
  window.supa.auth.onAuthStateChange(refresh);
})();

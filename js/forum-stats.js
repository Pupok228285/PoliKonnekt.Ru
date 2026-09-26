/*
 * Два блока в духе старых форумов: «Сегодняшние именинники» (по полю
 * profiles.birthday, дата хранится без года — сверяем месяц/день с сегодня
 * без Date(), чтобы не словить сдвиг на часовой пояс) и «Статистика форума»
 * (сообщений всего, зарегистрировано, последний новичок). Оба поля уже
 * читаются всем по общей политике profiles_select_all — отдельного RPC не
 * нужно, как и у остальных подобных счётчиков на сайте (activity-ticker.js,
 * admin.js).
 */
(function () {
  if (!window.supa) return;

  var birthdaysCount = document.getElementById('birthdaysCount');
  var birthdaysList = document.getElementById('birthdaysList');
  var forumStatsText = document.getElementById('forumStatsText');
  if (!birthdaysCount && !forumStatsText) return;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function pluralForm(n, one, few, many) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  if (birthdaysCount) {
    window.supa.from('profiles').select('id, nickname, birthday').not('birthday', 'is', null)
      .then(function (res) {
        if (res.error) { birthdaysCount.textContent = 'Не удалось загрузить.'; return; }
        var now = new Date();
        var tMonth = now.getMonth() + 1, tDay = now.getDate(), tYear = now.getFullYear();
        var today = (res.data || []).filter(function (p) {
          var parts = String(p.birthday).split('-');
          return Number(parts[1]) === tMonth && Number(parts[2]) === tDay;
        }).map(function (p) {
          var parts = String(p.birthday).split('-');
          return { id: p.id, nickname: p.nickname, age: tYear - Number(parts[0]) };
        });

        if (!today.length) {
          birthdaysCount.textContent = 'Сегодня никто не празднует день рождения.';
          return;
        }
        birthdaysCount.textContent = today.length + ' ' +
          pluralForm(today.length, 'пользователь', 'пользователя', 'пользователей') + ' ' +
          pluralForm(today.length, 'празднует', 'празднуют', 'празднуют') + ' сегодня свой день рождения';
        if (birthdaysList) {
          birthdaysList.innerHTML = today.map(function (p) {
            return '<a href="profile.html?id=' + p.id + '">' + escapeHtml(p.nickname) + '</a>(' + p.age + ')';
          }).join(', ');
        }
      });
  }

  if (forumStatsText) {
    Promise.all([
      window.supa.from('forum_topics').select('id', { count: 'exact', head: true }),
      window.supa.from('forum_replies').select('id', { count: 'exact', head: true }),
      window.supa.from('profiles').select('id', { count: 'exact', head: true }),
      window.supa.from('profiles').select('id, nickname').order('created_at', { ascending: false }).limit(1)
    ]).then(function (results) {
      if (results.some(function (r) { return r.error; })) { forumStatsText.textContent = 'Не удалось загрузить.'; return; }
      var total = (results[0].count || 0) + (results[1].count || 0);
      var users = results[2].count || 0;
      var newest = (results[3].data || [])[0];
      var html = 'На форуме ' + total + ' ' + pluralForm(total, 'сообщение', 'сообщения', 'сообщений') + '.<br>' +
        'Зарегистрировано ' + users + ' ' + pluralForm(users, 'пользователь', 'пользователя', 'пользователей') + '.';
      if (newest) {
        html += '<br>Приветствуем новичка — <a href="profile.html?id=' + newest.id + '">' + escapeHtml(newest.nickname) + '</a>.';
      }
      forumStatsText.innerHTML = html;
    });
  }
})();

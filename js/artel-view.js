/*
 * Страница одной артели — целиком реальная: состав, стена, вступление/
 * подписка, настоящие выборы главаря и названия (db/schema_v25.sql). Пока
 * эта миграция не применена в базе — вместо реальных выборов честно
 * показываем «в разработке» (см. fetchElection). Без ?id= в адресе показывать
 * нечего — честно предлагаем выбрать артель из списка (#artelNotFound).
 */
(function () {
  if (!window.supa) return;

  var params = new URLSearchParams(window.location.search);
  var artelId = params.get('id');
  var notFoundBox = document.getElementById('artelNotFound');
  var realArea = document.getElementById('artelRealArea');
  var aboutBox = document.getElementById('artelAboutBox');
  if (!artelId) return; // #artelNotFound уже видна по умолчанию в HTML, делать больше нечего

  var crumbHere = document.getElementById('crumbHere');
  var artelNameEl = document.getElementById('artelName');
  var artelDescEl = document.getElementById('artelDesc');
  var tagCategory = document.getElementById('tagCategory');
  var tagMembers = document.getElementById('tagMembers');
  var artelHint = document.getElementById('artelHint');
  var joinBtn = document.getElementById('joinBtn');
  var subBtn = document.getElementById('subBtn');
  var writeLeaderBtn = document.getElementById('writeLeaderBtn');
  var deleteArtelBtn = document.getElementById('deleteArtelBtn');
  var sbCategory = document.getElementById('sbCategory');
  var sbFounded = document.getElementById('sbFounded');
  var sbMemberCount = document.getElementById('sbMemberCount');
  var sbLeaderSince = document.getElementById('sbLeaderSince');
  var votingComingSoon = document.getElementById('votingComingSoon');
  var votingRealSection = document.getElementById('votingRealSection');
  var votingRealBody = document.getElementById('votingRealBody');
  var rosterBox = document.getElementById('rosterBox');
  var rosterMoreHint = document.getElementById('rosterMoreHint');
  var wallBox = document.getElementById('wallBox');
  var wallForm = document.getElementById('wallForm');
  var wallText = document.getElementById('wallText');
  var wallHint = document.getElementById('wallHint');
  var wallSubmit = document.getElementById('wallSubmit');

  var CATEGORY_LABELS = { faculty: 'Факультетская', dorm: 'Общажная', interest: 'По интересам', course: 'Курсовая' };
  var ROLE_LABELS = { leader: 'главарь', deputy: 'зам' };

  var myId = null;
  var myArtelId = null; // артель, в которой я СЕЙЧАС состою (любая)
  var isMember = false; // состою именно в ЭТОЙ артели
  var amIAdmin = false;
  var amStaff = false; // админ ИЛИ модератор — может менять главаря в обход выборов и чистить стену
  var leaderMode = 'election'; // общесайтовый режим из site_settings: 'election' или 'appoint'
  var artel = null;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' - ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  if (votingRealSection) votingRealSection.hidden = false;

  function loadArtel() {
    return window.supa.from('artels')
      .select('id, name, description, category, member_count, leader_since, created_at, leader_id, profiles!leader_id(nickname, verified)')
      .eq('id', artelId)
      .single()
      .then(function (res) {
        if (res.error || !res.data) {
          if (notFoundBox) { notFoundBox.hidden = false; notFoundBox.querySelector('h2').textContent = 'Артель не найдена'; }
          return null;
        }
        if (notFoundBox) notFoundBox.hidden = true;
        if (realArea) realArea.hidden = false;
        if (aboutBox) aboutBox.hidden = false;
        artel = res.data;
        applyArtel();
        return artel;
      });
  }

  function applyArtel() {
    document.title = artel.name + ' — К’Артель — ПолиКоннект';
    if (crumbHere) crumbHere.textContent = artel.name;
    if (artelNameEl) artelNameEl.textContent = artel.name;
    if (artelDescEl) artelDescEl.textContent = artel.description;
    var catLabel = CATEGORY_LABELS[artel.category] || artel.category;
    if (tagCategory) tagCategory.textContent = catLabel;
    if (tagMembers) tagMembers.textContent = artel.member_count + ' участник' + (artel.member_count === 1 ? '' : (artel.member_count % 10 === 1 && artel.member_count % 100 !== 11 ? '' : 'ов'));
    if (sbCategory) sbCategory.textContent = catLabel;
    if (sbFounded) sbFounded.textContent = fmtDate(artel.created_at);
    if (sbMemberCount) sbMemberCount.textContent = artel.member_count;
    var leader = artel.profiles;
    if (sbLeaderSince) sbLeaderSince.textContent = leader ? fmtDate(artel.leader_since) : 'нет главаря';
    if (writeLeaderBtn) {
      if (leader && leader.nickname) {
        writeLeaderBtn.href = 'messages.html?to=' + encodeURIComponent(leader.nickname);
        writeLeaderBtn.style.display = '';
      } else {
        writeLeaderBtn.style.display = 'none';
      }
    }
  }

  function loadRoster() {
    window.supa.from('artel_members')
      .select('profile_id, role, joined_at, profiles!profile_id(id, nickname, verified)')
      .eq('artel_id', artelId)
      .then(function (res) {
        if (!rosterBox) return;
        if (res.error || !res.data) { rosterBox.innerHTML = '<p class="hint">Не удалось загрузить состав.</p>'; return; }
        var rows = res.data.slice().sort(function (a, b) {
          var order = { leader: 0, deputy: 1, member: 2 };
          return (order[a.role] - order[b.role]) || (new Date(a.joined_at) - new Date(b.joined_at));
        });
        rosterBox.innerHTML = '';
        var shown = rows.slice(0, 30);
        shown.forEach(function (m) {
          var prof = m.profiles || {};
          var nickname = prof.nickname || '?';
          var letter = nickname.charAt(0).toUpperCase();
          var crown = m.role === 'leader' ? '<img class="crown" src="img/icons/i-crown.svg" alt="главарь">' : '';
          var roleSpan = ROLE_LABELS[m.role] ? '<span class="role">' + ROLE_LABELS[m.role] + '</span>' : '';
          var nmHtml = prof.id ? '<a class="nm" href="profile.html?id=' + prof.id + '">' + escapeHtml(nickname) + '</a>' : '<span class="nm">' + escapeHtml(nickname) + '</span>';
          var el = document.createElement('div');
          el.className = 'm';
          el.innerHTML = '<span class="av">' + escapeHtml(letter) + crown + '</span>' + nmHtml + roleSpan;
          // главарь (или админ) может назначать/снимать замов — не выборно, по спецификации
          if ((myId === artel.leader_id || amIAdmin) && m.role !== 'leader') {
            var toggle = document.createElement('a');
            toggle.href = '#';
            toggle.className = 'role-toggle';
            toggle.style.cssText = 'display:block;font-size:9px;color:#8a9bb0';
            toggle.textContent = m.role === 'deputy' ? 'снять зама' : 'сделать замом';
            toggle.addEventListener('click', function (e) {
              e.preventDefault();
              window.supa.rpc('set_artel_deputy', { p_artel_id: Number(artelId), p_profile_id: m.profile_id, p_is_deputy: m.role !== 'deputy' })
                .then(function (r) { if (r.error) { alert(r.error.message); return; } loadRoster(); });
            });
            el.appendChild(toggle);
          }
          // модератор/админ — может назначить главаря напрямую, только если в
          // настройках сайта включён режим «назначение», а не «выборы»
          if (amStaff && leaderMode === 'appoint' && m.role !== 'leader') {
            var makeLeader = document.createElement('a');
            makeLeader.href = '#';
            makeLeader.className = 'role-toggle';
            makeLeader.style.cssText = 'display:block;font-size:9px;color:#b23e00';
            makeLeader.textContent = 'сделать главарём';
            makeLeader.addEventListener('click', function (e) {
              e.preventDefault();
              if (!confirm('Назначить «' + nickname + '» главарём?')) return;
              window.supa.rpc('set_artel_leader_admin', { p_artel_id: Number(artelId), p_profile_id: m.profile_id })
                .then(function (r) { if (r.error) { alert(r.error.message); return; } loadArtel().then(loadRoster); });
            });
            el.appendChild(makeLeader);
          }
          rosterBox.appendChild(el);
        });
        if (rosterMoreHint) {
          var rest = rows.length - shown.length;
          if (rest > 0) {
            rosterMoreHint.style.display = '';
            rosterMoreHint.innerHTML = 'И ещё ' + rest + ' человек';
          } else {
            rosterMoreHint.style.display = 'none';
          }
        }
      });
  }

  function loadWall() {
    window.supa.from('artel_posts')
      .select('id, body, created_at, score, comment_count, profiles!author_id(id, nickname, verified)')
      .eq('artel_id', artelId)
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error || !res.data || !wallBox) return;
        var catend = wallBox.querySelector('.catend');
        wallBox.querySelectorAll('.post').forEach(function (p) { p.remove(); });
        res.data.forEach(function (p) {
          var prof = p.profiles || {};
          var nickname = prof.nickname || '?';
          var nickHtml = prof.id
            ? '<a class="nick' + (prof.verified ? ' ok' : '') + '" href="profile.html?id=' + prof.id + '">' + escapeHtml(nickname) + '</a>'
            : '<span class="nick' + (prof.verified ? ' ok' : '') + '">' + escapeHtml(nickname) + '</span>';
          var el = document.createElement('div');
          el.className = 'post';
          el.innerHTML =
            '<div class="who">' +
              nickHtml +
              (prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="" title="Студент подтверждён">' : '') +
              '<span class="av">' + escapeHtml(nickname.charAt(0).toUpperCase()) + '</span>' +
            '</div>' +
            '<div class="top"><span class="no">Запись</span><span>' + fmtDateTime(p.created_at) + '</span></div>' +
            '<div class="body">' + escapeHtml(p.body) + '</div>' +
            '<div class="acts">' +
              '<span class="vote-widget" data-vtype="artel_post" data-vid="' + p.id + '">' +
                '<button type="button" class="vote-up" title="В плюс репутации">&#9650;</button>' +
                '<b class="vote-score">' + (p.score || 0) + '</b>' +
                '<button type="button" class="vote-down" title="В минус репутации">&#9660;</button>' +
              '</span>' +
              '<a href="#" class="comment-toggle" data-ctype="artel_post" data-cid="' + p.id + '">Комментарии (' + (p.comment_count || 0) + ')</a>' +
              '<a href="#">Пожаловаться</a>' +
              ((amStaff || prof.id === myId) ? '<a href="#" class="post-delete" data-pid="' + p.id + '">Удалить</a>' : '') +
            '</div>';
          wallBox.insertBefore(el, catend);
        });
        wallBox.querySelectorAll('.post-delete').forEach(function (a) {
          a.addEventListener('click', function (e) {
            e.preventDefault();
            if (!confirm('Удалить запись со стены?')) return;
            var pid = a.getAttribute('data-pid');
            window.supa.from('artel_posts').delete().eq('id', pid).then(function (r) {
              if (r.error) { alert(r.error.message); return; }
              loadWall();
            });
          });
        });
        if (window.PKSocial) window.PKSocial.scan(wallBox);
      });
  }

  function refreshMembershipUi() {
    window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) {
        myId = null;
        isMember = false;
        amIAdmin = false;
        amStaff = false;
        if (deleteArtelBtn) deleteArtelBtn.style.display = 'none';
        if (joinBtn) { joinBtn.textContent = 'Вступить'; joinBtn.title = 'Сначала войдите'; }
        if (subBtn) subBtn.textContent = 'Подписаться';
        if (wallForm) wallForm.style.display = 'none';
        if (wallHint) wallHint.textContent = 'Писать может только участник артели (и только вошедшим).';
        return;
      }
      myId = session.user.id;
      Promise.all([
        window.supa.from('profiles').select('is_admin, is_moderator').eq('id', myId).single().then(function (pres) {
          amIAdmin = !!(pres.data && pres.data.is_admin);
          amStaff = amIAdmin || !!(pres.data && pres.data.is_moderator);
          if (deleteArtelBtn) deleteArtelBtn.style.display = amStaff ? '' : 'none';
        }),
        window.supa.from('site_settings').select('artel_leader_mode').eq('id', true).single().then(function (sres) {
          if (sres.data && sres.data.artel_leader_mode) leaderMode = sres.data.artel_leader_mode;
        }),
        window.supa.from('artel_members').select('artel_id').eq('profile_id', myId).maybeSingle().then(function (mres) {
          myArtelId = mres.data ? String(mres.data.artel_id) : null;
          isMember = myArtelId === String(artelId);
          if (joinBtn) joinBtn.textContent = isMember ? 'Выйти из артели' : 'Вступить';
          if (wallForm) wallForm.style.display = isMember ? '' : 'none';
          if (wallHint) wallHint.textContent = isMember ? 'Писать может любой участник артели.' : 'Чтобы писать на стену, сначала вступите в артель.';
        })
      ]).then(function () {
        // amIAdmin/amStaff/isMember теперь настоящие — можно честно
        // перерисовать блок выборов и состав (кнопки зависят от этих флагов)
        loadElection();
        loadRoster();
        loadWall();
      });
      window.supa.from('artel_subscriptions').select('artel_id').eq('artel_id', artelId).eq('profile_id', myId).maybeSingle().then(function (sres) {
        if (subBtn) subBtn.textContent = sres.data ? 'Отписаться' : 'Подписаться';
      });
    });
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', function () {
      if (!myId) { alert('Сначала войдите вверху страницы.'); return; }
      joinBtn.disabled = true;
      var leaving = joinBtn.textContent.indexOf('Выйти') !== -1;
      var op = leaving ? window.supa.rpc('leave_artel') : window.supa.rpc('join_artel', { target_artel_id: Number(artelId) });
      op.then(function (r) {
        joinBtn.disabled = false;
        if (r.error) { alert(r.error.message); return; }
        loadArtel().then(loadRoster);
        refreshMembershipUi();
      });
    });
  }

  if (subBtn) {
    subBtn.addEventListener('click', function () {
      if (!myId) { alert('Сначала войдите вверху страницы.'); return; }
      subBtn.disabled = true;
      var subscribing = subBtn.textContent.indexOf('Отписаться') === -1;
      var op = subscribing
        ? window.supa.from('artel_subscriptions').insert({ artel_id: artelId, profile_id: myId })
        : window.supa.from('artel_subscriptions').delete().eq('artel_id', artelId).eq('profile_id', myId);
      op.then(function (r) {
        subBtn.disabled = false;
        if (r.error) { alert(r.error.message); return; }
        subBtn.textContent = subscribing ? 'Отписаться' : 'Подписаться';
      });
    });
  }

  if (deleteArtelBtn) {
    deleteArtelBtn.addEventListener('click', function () {
      if (!artel) return;
      if (!confirm('Удалить артель «' + artel.name + '» вместе со всем составом и стеной? Это нельзя отменить.')) return;
      deleteArtelBtn.disabled = true;
      window.supa.from('artels').delete().eq('id', artelId).then(function (r) {
        if (r.error) { alert(r.error.message); deleteArtelBtn.disabled = false; return; }
        window.location.href = 'artel.html';
      });
    });
  }

  if (wallSubmit) {
    wallSubmit.addEventListener('click', function () {
      var body = (wallText.value || '').trim();
      if (!body || !myId) return;
      wallSubmit.disabled = true;
      window.supa.from('artel_posts').insert({ artel_id: artelId, author_id: myId, body: body }).then(function (r) {
        wallSubmit.disabled = false;
        if (r.error) { alert(r.error.message); return; }
        wallText.value = '';
        loadWall();
      });
    });
  }

  // ---------- выборы главаря + голосование за название ----------
  function pct(n, total) { return total > 0 ? Math.round(n * 100 / total) : 0; }

  function loadElection() {
    if (!votingRealBody) return;
    // сначала лениво подводим итоги, если срок истёк — если ничего не
    // просрочено, RPC просто ничего не делает
    window.supa.rpc('close_artel_election_if_due', { p_artel_id: Number(artelId) }).then(function () {
      fetchElection();
    });
  }

  function fetchElection() {
    window.supa.from('artel_elections')
      .select('id, opens_at, closes_at, status, new_leader_id, name_changed, new_name, profiles!new_leader_id(nickname)')
      .eq('artel_id', artelId)
      .order('opens_at', { ascending: false })
      .limit(1)
      .then(function (res) {
        if (res.error) {
          // миграция ещё не применена — честно возвращаем старую заглушку
          if (votingRealSection) votingRealSection.hidden = true;
          if (votingComingSoon) votingComingSoon.hidden = false;
          return;
        }
        var el = (res.data || [])[0];
        if (!el || el.status === 'closed') { renderNoOpenElection(el); return; }
        renderOpenElection(el);
      });
  }

  function renderNoOpenElection(el) {
    var canOpen = myId && leaderMode === 'election' && (myId === (artel && artel.leader_id) || amIAdmin);
    var html = '';
    if (el) {
      var leaderName = el.new_leader_id && el.profiles ? el.profiles.nickname : null;
      html += '<div class="rules-note">Последние выборы закрылись ' + fmtDate(el.closes_at) + ': ' +
        (leaderName ? 'главарь — <b>' + escapeHtml(leaderName) + '</b>' : 'состав кандидатов был пуст, главарь не менялся') + '. ' +
        (el.name_changed ? 'Название сменили на «' + escapeHtml(el.new_name) + '».' : 'Название решили не менять.') + '</div>';
    } else {
      html += '<p class="hint" style="padding:0 2px">Выборов в этой артели ещё не было.</p>';
    }
    if (leaderMode !== 'election') {
      html += '<p class="hint" style="padding:4px 2px">Сейчас на сайте включён режим «назначение» — главаря назначает админ или модератор, выборы отключены.</p>';
    } else if (canOpen) {
      html += '<div class="btns" style="margin-top:8px"><button class="submit" type="button" id="openElectionBtn">Начать выборы главаря и голосование за название</button></div>' +
        '<p class="hint" style="padding:4px 2px 0">Голосование идёт 5 дней. Раз в месяц — по традиции, технически не ограничено.</p>';
    } else if (myId) {
      html += '<p class="hint" style="padding:4px 2px">Начать новые выборы может главарь артели или админ сайта.</p>';
    }
    votingRealBody.innerHTML = html;
    var openBtn = document.getElementById('openElectionBtn');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        openBtn.disabled = true;
        window.supa.rpc('open_artel_election', { p_artel_id: Number(artelId) }).then(function (r) {
          openBtn.disabled = false;
          if (r.error) { alert(r.error.message); return; }
          loadElection();
        });
      });
    }
  }

  function renderOpenElection(el) {
    Promise.all([
      window.supa.from('artel_leader_candidates').select('profile_id, profiles!profile_id(id, nickname, verified)').eq('election_id', el.id),
      window.supa.from('artel_leader_votes').select('candidate_id, voter_id').eq('election_id', el.id),
      window.supa.from('artel_name_stage1_votes').select('choice, voter_id').eq('election_id', el.id),
      window.supa.from('artel_name_candidates').select('id, text, proposed_by').eq('election_id', el.id),
      window.supa.from('artel_name_stage2_votes').select('candidate_id, voter_id').eq('election_id', el.id)
    ]).then(function (results) {
      var candidates = results[0].data || [];
      var leaderVotes = results[1].data || [];
      var stage1Votes = results[2].data || [];
      var nameCandidates = results[3].data || [];
      var stage2Votes = results[4].data || [];

      function myVote(list, key) {
        if (!myId) return null;
        var row = list.find(function (v) { return v.voter_id === myId; });
        return row ? row[key] : null;
      }
      var myLeaderVote = myVote(leaderVotes, 'candidate_id');
      var myStage1Vote = myVote(stage1Votes, 'choice');
      var myStage2Vote = myVote(stage2Votes, 'candidate_id');

      var canVote = isMember;
      var html = '<p class="hint" style="padding:0 2px 6px">Голосование открыто до ' + fmtDate(el.closes_at) + '.</p>';

      html += '<div class="vote-stage">Главарь</div>';
      var totalLeader = leaderVotes.length;
      candidates.forEach(function (c) {
        var count = leaderVotes.filter(function (v) { return v.candidate_id === c.profile_id; }).length;
        var prof = c.profiles || {};
        var mine = myLeaderVote === c.profile_id;
        html += '<div class="vote-row"><span class="name">' + escapeHtml(prof.nickname || '?') + (mine ? ' ✓' : '') + '</span>' +
          '<span class="bar"><i style="width:' + pct(count, totalLeader) + '%"></i></span><span class="pc">' + pct(count, totalLeader) + '%</span>' +
          (canVote ? ' <a href="#" class="lead-vote" data-id="' + c.profile_id + '" style="font-size:10px;margin-left:4px">голосовать</a>' : '') +
          '</div>';
      });
      if (canVote && !candidates.some(function (c) { return c.profile_id === myId; })) {
        html += '<div class="btns" style="justify-content:flex-start;margin:4px 0"><a href="#" id="nominateBtn" class="submit" style="font-size:10px;padding:3px 8px">Выдвинуть себя</a></div>';
      }

      html += '<div class="vote-stage">Название · этап 1 — менять?</div>';
      var yesCount = stage1Votes.filter(function (v) { return v.choice; }).length;
      var noCount = stage1Votes.filter(function (v) { return !v.choice; }).length;
      var totalStage1 = yesCount + noCount;
      html += '<div class="vote-row yn"><span class="name">Да, пора' + (myStage1Vote === true ? ' ✓' : '') + '</span><span class="bar"><i style="width:' + pct(yesCount, totalStage1) + '%"></i></span><span class="pc">' + pct(yesCount, totalStage1) + '%</span>' + (canVote ? ' <a href="#" class="stage1-vote" data-choice="1" style="font-size:10px;margin-left:4px">голосовать</a>' : '') + '</div>';
      html += '<div class="vote-row yn"><span class="name">Нет, оставить' + (myStage1Vote === false ? ' ✓' : '') + '</span><span class="bar"><i style="width:' + pct(noCount, totalStage1) + '%"></i></span><span class="pc">' + pct(noCount, totalStage1) + '%</span>' + (canVote ? ' <a href="#" class="stage1-vote" data-choice="0" style="font-size:10px;margin-left:4px">голосовать</a>' : '') + '</div>';

      html += '<div class="vote-stage">Название · этап 2 — вариант (посчитается, только если на этапе 1 победит «Да»)</div>';
      var totalStage2 = stage2Votes.length;
      nameCandidates.forEach(function (nc) {
        var count = stage2Votes.filter(function (v) { return v.candidate_id === nc.id; }).length;
        var mine = myStage2Vote === nc.id;
        html += '<div class="vote-row wide"><span class="name">' + escapeHtml(nc.text) + (nc.proposed_by === null ? ' (текущее)' : '') + (mine ? ' ✓' : '') + '</span>' +
          '<span class="bar"><i style="width:' + pct(count, totalStage2) + '%"></i></span><span class="pc">' + pct(count, totalStage2) + '%</span>' +
          (canVote ? ' <a href="#" class="stage2-vote" data-id="' + nc.id + '" style="font-size:10px;margin-left:4px">голосовать</a>' : '') +
          '</div>';
      });
      html += '<div id="proposeNameRow"></div>';

      html += '<div class="rules-note">Голосование проходит среди участников артели. За главаря побеждает набравший больше голосов (при ничьей — кто дольше в артели). Варианты названия предлагают главарь, замы или админ сайта — до пяти штук, текущее название участвует всегда.</div>';

      votingRealBody.innerHTML = html;

      votingRealBody.querySelectorAll('.lead-vote').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          window.supa.rpc('cast_leader_vote', { p_election_id: el.id, p_candidate_id: a.getAttribute('data-id') }).then(function (r) {
            if (r.error) { alert(r.error.message); return; }
            renderOpenElection(el);
          });
        });
      });
      votingRealBody.querySelectorAll('.stage1-vote').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          window.supa.rpc('cast_name_stage1_vote', { p_election_id: el.id, p_choice: a.getAttribute('data-choice') === '1' }).then(function (r) {
            if (r.error) { alert(r.error.message); return; }
            renderOpenElection(el);
          });
        });
      });
      votingRealBody.querySelectorAll('.stage2-vote').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          window.supa.rpc('cast_name_stage2_vote', { p_election_id: el.id, p_candidate_id: Number(a.getAttribute('data-id')) }).then(function (r) {
            if (r.error) { alert(r.error.message); return; }
            renderOpenElection(el);
          });
        });
      });
      var nominateBtn = document.getElementById('nominateBtn');
      if (nominateBtn) {
        nominateBtn.addEventListener('click', function (e) {
          e.preventDefault();
          window.supa.rpc('nominate_leader_self', { p_election_id: el.id }).then(function (r) {
            if (r.error) { alert(r.error.message); return; }
            renderOpenElection(el);
          });
        });
      }

      // право предлагать название — главарь, зам или админ; проверяем роль в
      // составе прямо сейчас, чтобы не полагаться только на artel.leader_id
      if (myId && nameCandidates.length < 5) {
        window.supa.from('artel_members').select('role').eq('artel_id', artelId).eq('profile_id', myId).maybeSingle().then(function (mres) {
          var role = mres.data && mres.data.role;
          if (!(role === 'leader' || role === 'deputy' || amIAdmin)) return;
          var row = document.getElementById('proposeNameRow');
          if (!row) return;
          row.innerHTML = '<div class="p-row" style="border-top:0"><span class="lbl">Предложить вариант</span><span class="val">' +
            '<input class="field" type="text" id="proposeNameInput" maxlength="60" style="width:220px"> ' +
            '<a href="#" id="proposeNameBtn" class="submit" style="font-size:10px;padding:3px 8px">Добавить</a></span></div>';
          document.getElementById('proposeNameBtn').addEventListener('click', function (e) {
            e.preventDefault();
            var input = document.getElementById('proposeNameInput');
            var text = (input.value || '').trim();
            if (!text) return;
            window.supa.rpc('propose_artel_name', { p_election_id: el.id, p_text: text }).then(function (r) {
              if (r.error) { alert(r.error.message); return; }
              renderOpenElection(el);
            });
          });
        });
      }
    });
  }

  loadArtel().then(function (a) {
    if (!a) return;
    loadRoster();
    loadWall();
    refreshMembershipUi();
    loadElection();
  });
  window.supa.auth.onAuthStateChange(refreshMembershipUi);
})();

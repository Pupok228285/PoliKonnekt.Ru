/*
 * Диск активности ПолиКоннекта — горизонтальная гистограмма в духе панели
 * Wayback Machine, во всю ширину шапки (только на главной).
 *
 * Сайту жить год и больше — скользящее окно в последние N дней через год
 * сделало бы всю раннюю историю недостижимой. Поэтому вместо окна —
 * настоящая навигация по месяцам и годам (как в самом Wayback Machine):
 * на экране всегда один календарный месяц, стрелки года и ссылки месяцев
 * переключают его, за раз с сервера тянется только этот один месяц (не
 * вся история сайта), так что нагрузка не растёт с возрастом сайта.
 * Честная механика подсчёта: считаем живые записи по всем разделам, у дня
 * без активности столбик минимальной высоты, а не отсутствует совсем.
 */
(function () {
  var root = document.getElementById('ringWidget');
  if (!root) return;

  var barsEl = document.getElementById('ringTicks');
  var monthsEl = document.getElementById('wbMonths');
  var dayEl = document.getElementById('ringDateDay');
  var subEl = document.getElementById('ringDateSub');
  var yearEl = document.getElementById('wbYear');
  var popEl = document.getElementById('ringPop');
  var todayBtn = document.getElementById('ringToday');
  var prevBtn = document.getElementById('wbPrev');
  var nextBtn = document.getElementById('wbNext');
  var yearPrevBtn = document.getElementById('wbYearPrev');
  var yearNextBtn = document.getElementById('wbYearNext');
  var MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONTHS_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  var BAR_MIN = 4, BAR_MAX = 32; // px — высота столбика: минимум/по максимуму месяца

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var siteBirth = new Date(today); // уточнится в determineSiteBirth()

  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth(); // какой месяц сейчас показан в гистограмме
  var selDate = new Date(today); // какой день выбран (большая цифра + попап)

  var monthCounts = [];
  var monthMax = 0;

  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function sameDate(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function clampDate(d) {
    if (d < siteBirth) return new Date(siteBirth);
    if (d > today) return new Date(today);
    return new Date(d);
  }
  function clampYM(y, m) {
    var by = siteBirth.getFullYear(), bm = siteBirth.getMonth();
    var ty = today.getFullYear(), tm = today.getMonth();
    if (y < by || (y === by && m < bm)) return { y: by, m: bm };
    if (y > ty || (y === ty && m > tm)) return { y: ty, m: tm };
    return { y: y, m: m };
  }
  function fmtDateObj(d) { return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function trim60(s) {
    s = s || '';
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
  }

  // Все разделы сайта с реальным контентом — гистограмма "привязана" ко
  // всему сразу, не только к Ленте. content_id есть только у форума и
  // отзывов (у них есть отдельная страница темы), остальные ведут на раздел.
  var DAY_SOURCES = [
    { table: 'feed_posts', field: 'body', label: 'в Ленте', href: 'index.html#lenta' },
    { table: 'quote_posts', field: 'body', label: 'в Цитатах и Креативе', href: 'quotes.html' },
    { table: 'canteen_posts', field: 'body', label: 'в Столовой', href: 'canteen.html' },
    { table: 'lost_found_posts', field: 'title', label: 'в Потеряшках', href: 'lostfound.html' },
    { table: 'forum_topics', field: 'title', label: 'на форуме', hrefPrefix: 'forum-topic.html?id=' },
    { table: 'review_topics', field: 'title', label: 'в Отзывах', hrefPrefix: 'review-topic.html?id=' },
    { table: 'diary_posts', field: 'body', label: 'в Дневнике', href: 'diary.html' },
    { table: 'library_items', field: 'title', label: 'в Библиотеке', href: 'library.html' },
    { table: 'listings', field: 'title', label: 'новое объявление', href: 'index.html#uslugi' }
  ];

  // Настоящие записи за конкретный день по ВСЕМ разделам сайта сразу.
  function loadRealDayInfo(d) {
    if (!window.supa) return Promise.resolve(null);
    var start = d.toISOString();
    var next = new Date(d);
    next.setDate(d.getDate() + 1);
    var end = next.toISOString();
    return Promise.all(DAY_SOURCES.map(function (src) {
      return window.supa.from(src.table).select('id, ' + src.field + ', created_at')
        .gte('created_at', start).lt('created_at', end)
        .order('created_at', { ascending: false }).limit(3)
        .then(function (res) {
          return (res.data || []).map(function (row) {
            return { label: src.label, text: row[src.field], href: src.hrefPrefix ? (src.hrefPrefix + row.id) : src.href };
          });
        })
        .catch(function () { return []; });
    })).then(function (lists) {
      var all = [].concat.apply([], lists);
      return all.length ? all : null;
    });
  }

  // Настоящая плотность по ОДНОМУ показанному месяцу — не по всей истории
  // сайта сразу, поэтому нагрузка не растёт, сколько бы сайт ни прожил.
  function loadMonthData(cb) {
    if (!window.supa) {
      monthCounts = new Array(daysInMonth(viewYear, viewMonth)).fill(0);
      monthMax = 0;
      if (cb) cb();
      return;
    }
    var mStart = new Date(viewYear, viewMonth, 1);
    var mEnd = new Date(viewYear, viewMonth + 1, 1);
    Promise.all(DAY_SOURCES.map(function (src) {
      return window.supa.from(src.table).select('created_at')
        .gte('created_at', mStart.toISOString()).lt('created_at', mEnd.toISOString())
        .then(function (res) { return res.data || []; })
        .catch(function () { return []; });
    })).then(function (lists) {
      var nDays = daysInMonth(viewYear, viewMonth);
      var counts = new Array(nDays).fill(0);
      lists.forEach(function (rows) {
        rows.forEach(function (row) {
          var d = new Date(row.created_at);
          var day = d.getDate();
          if (day >= 1 && day <= nDays) counts[day - 1]++;
        });
      });
      monthCounts = counts;
      monthMax = Math.max.apply(null, counts);
      if (cb) cb();
    });
  }

  function renderBars() {
    barsEl.innerHTML = '';
    var nDays = daysInMonth(viewYear, viewMonth);
    for (var day = 1; day <= nDays; day++) {
      var d = new Date(viewYear, viewMonth, day);
      var outside = d < siteBirth || d > today; // до рождения сайта или в будущем
      var count = monthCounts[day - 1] || 0;
      var slot = document.createElement('div');
      slot.className = 'wb-slot' + (outside ? ' outside' : (count ? '' : ' empty')) + (sameDate(d, selDate) ? ' selected' : '');
      slot.title = fmtDateObj(d) + (outside ? '' : (count ? ' — ' + count + (count === 1 ? ' запись' : ' записей') : ' — тихо'));
      if (!outside) slot.setAttribute('data-day', String(day));
      var bar = document.createElement('div');
      bar.className = 'wb-bar';
      var norm = monthMax > 0 ? count / monthMax : 0;
      bar.style.height = (!outside && count ? BAR_MIN + norm * (BAR_MAX - BAR_MIN) : 2) + 'px';
      slot.appendChild(bar);
      barsEl.appendChild(slot);
    }
  }

  function renderMonths() {
    if (!monthsEl) return;
    monthsEl.innerHTML = '';
    var by = siteBirth.getFullYear(), bm = siteBirth.getMonth();
    var ty = today.getFullYear(), tm = today.getMonth();
    for (var m = 0; m < 12; m++) {
      var withinRange = !(viewYear === ty && m > tm) && !(viewYear === by && m < bm);
      var a = document.createElement('a');
      a.href = '#';
      a.textContent = MONTHS_SHORT[m];
      a.title = MONTHS_FULL[m] + ' ' + viewYear;
      if (!withinRange) {
        a.className = 'disabled';
      } else {
        if (m === viewMonth) a.className = 'on';
        a.setAttribute('data-month', String(m));
      }
      monthsEl.appendChild(a);
    }
  }

  function updateBottom() {
    var dayText = String(selDate.getDate());
    var subText = sameDate(selDate, today) ? 'сегодня' : MONTHS_SHORT[selDate.getMonth()];
    if (dayEl.textContent !== dayText || subEl.textContent !== subText) {
      dayEl.textContent = dayText;
      subEl.textContent = subText;
      dayEl.classList.remove('flash');
      void dayEl.offsetWidth; // reflow, чтобы анимация проигралась заново
      dayEl.classList.add('flash');
      setTimeout(function () { dayEl.classList.remove('flash'); }, 150);
    }
    if (yearEl) yearEl.textContent = String(viewYear);
    if (prevBtn) prevBtn.disabled = sameDate(selDate, siteBirth);
    if (nextBtn) nextBtn.disabled = sameDate(selDate, today);
    if (yearPrevBtn) yearPrevBtn.disabled = viewYear <= siteBirth.getFullYear();
    if (yearNextBtn) yearNextBtn.disabled = viewYear >= today.getFullYear();
  }

  var popTimer = null;
  var POP_LIFETIME = 9000; // плашка сама прячется через 9 секунд

  function hidePop() {
    popEl.hidden = true;
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
  }

  popEl.addEventListener('mouseenter', function () {
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
  });
  popEl.addEventListener('mouseleave', function () {
    if (!popEl.hidden && !popTimer) popTimer = setTimeout(hidePop, POP_LIFETIME);
  });

  function renderPopContent(d, info) {
    var head = sameDate(d, today) ? 'Сегодня' : fmtDateObj(d);
    if (info && info.length) {
      var html = '<b>' + head + '</b>';
      html += info.slice(0, 14).map(function (r) {
        return '<a class="day-item" href="' + escapeHtml(r.href) + '">«' + escapeHtml(trim60(r.text)) +
          '»<span class="cat">' + escapeHtml(r.label) + '</span></a>';
      }).join('');
      if (info.length > 14) html += '<span style="opacity:.6">…и ещё ' + (info.length - 14) + '</span>';
      return html;
    }
    return '<b>' + head + '</b><span style="opacity:.65">В этот день на сайте не было активности.</span>';
  }

  var popRequestId = 0;

  function openPopupFor(d) {
    popRequestId++;
    var myRequest = popRequestId;
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
    popEl.innerHTML = '<b>' + (sameDate(d, today) ? 'Сегодня' : fmtDateObj(d)) + '</b>Загрузка...';
    popEl.hidden = false;
    loadRealDayInfo(d).then(function (info) {
      if (myRequest !== popRequestId) return; // пока грузилось, выбрали другой день
      popEl.innerHTML = renderPopContent(d, info);
      popTimer = setTimeout(hidePop, POP_LIFETIME);
    });
  }

  function afterSelect(showPop) {
    renderBars();
    renderMonths();
    updateBottom();
    if (showPop) openPopupFor(selDate); else hidePop();
  }

  // Выбрать день — если он в другом месяце, сначала подгружаем этот месяц.
  function selectDate(d, showPop) {
    d = clampDate(d);
    var reload = d.getFullYear() !== viewYear || d.getMonth() !== viewMonth;
    selDate = d;
    if (reload) {
      viewYear = d.getFullYear();
      viewMonth = d.getMonth();
      loadMonthData(function () { afterSelect(showPop); });
    } else {
      afterSelect(showPop);
    }
  }

  // Переключить месяц/год без обязательной смены выбранного дня (насколько
  // возможно — тот же день недели в новом месяце, иначе ближайший валидный).
  function navigateToMonth(y, m) {
    var c = clampYM(y, m);
    var day = Math.min(selDate.getDate(), daysInMonth(c.y, c.m));
    selectDate(new Date(c.y, c.m, day), false);
  }

  barsEl.addEventListener('click', function (e) {
    var el = e.target.closest('[data-day]');
    if (!el) return;
    selectDate(new Date(viewYear, viewMonth, parseInt(el.getAttribute('data-day'), 10)), true);
  });

  if (monthsEl) {
    monthsEl.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-month]');
      if (!a) return;
      e.preventDefault();
      navigateToMonth(viewYear, parseInt(a.getAttribute('data-month'), 10));
    });
  }

  if (prevBtn) prevBtn.addEventListener('click', function () {
    var d = new Date(selDate); d.setDate(d.getDate() - 1); selectDate(d, true);
  });
  if (nextBtn) nextBtn.addEventListener('click', function () {
    var d = new Date(selDate); d.setDate(d.getDate() + 1); selectDate(d, true);
  });
  if (yearPrevBtn) yearPrevBtn.addEventListener('click', function () { navigateToMonth(viewYear - 1, viewMonth); });
  if (yearNextBtn) yearNextBtn.addEventListener('click', function () { navigateToMonth(viewYear + 1, viewMonth); });

  root.tabIndex = 0;
  root.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { var d = new Date(selDate); d.setDate(d.getDate() + 1); selectDate(d, true); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { var d2 = new Date(selDate); d2.setDate(d2.getDate() - 1); selectDate(d2, true); e.preventDefault(); }
    else if (e.key === 'Home') { selectDate(today, true); e.preventDefault(); }
  });

  todayBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    selectDate(today, true);
  });

  // Возраст/"дата рождения" сайта — по дате регистрации самого первого
  // профиля. Не удалось узнать (гость без supa, ошибка, пустая база) —
  // считаем, что сайт "родился" сегодня же (навигация назад просто не даст хода).
  function determineSiteBirth() {
    if (!window.supa) { siteBirth = new Date(today); return Promise.resolve(); }
    return window.supa.from('profiles').select('created_at').order('created_at', { ascending: true }).limit(1)
      .then(function (res) {
        var row = res.data && res.data[0];
        if (!row) { siteBirth = new Date(today); return; }
        var b = new Date(row.created_at);
        b.setHours(0, 0, 0, 0);
        siteBirth = b;
      })
      .catch(function () { siteBirth = new Date(today); });
  }

  determineSiteBirth().then(function () {
    loadMonthData(function () { afterSelect(false); });
  });
})();

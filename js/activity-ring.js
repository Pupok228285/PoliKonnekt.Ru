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
  var scaleEl = document.getElementById('wbScale');
  var scale = 'days'; // 'days' | 'months' | 'hours'
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
  var yearCounts = []; // по месяцам текущего года (для масштаба "Месяцы")
  var yearMax = 0;
  var hourCounts = []; // по часам выбранного дня (для масштаба "Часы")
  var hourMax = 0;

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

  // Настоящие записи за конкретный промежуток времени по ВСЕМ разделам
  // сайта сразу — общий код для попапа дня и попапа часа.
  function loadRealRangeInfo(start, end) {
    if (!window.supa) return Promise.resolve(null);
    return Promise.all(DAY_SOURCES.map(function (src) {
      return window.supa.from(src.table).select('id, ' + src.field + ', created_at')
        .gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
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
  function loadRealDayInfo(d) {
    var next = new Date(d);
    next.setDate(d.getDate() + 1);
    return loadRealRangeInfo(d, next);
  }
  function loadRealHourInfo(d, hour) {
    var start = new Date(d);
    start.setHours(hour, 0, 0, 0);
    var end = new Date(start);
    end.setHours(end.getHours() + 1);
    return loadRealRangeInfo(start, end);
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

  // Плотность по МЕСЯЦАМ текущего года — узнать, какой месяц был самым
  // активным (масштаб "Месяцы").
  function loadYearData(cb) {
    if (!window.supa) { yearCounts = new Array(12).fill(0); yearMax = 0; if (cb) cb(); return; }
    var yStart = new Date(viewYear, 0, 1);
    var yEnd = new Date(viewYear + 1, 0, 1);
    Promise.all(DAY_SOURCES.map(function (src) {
      return window.supa.from(src.table).select('created_at')
        .gte('created_at', yStart.toISOString()).lt('created_at', yEnd.toISOString())
        .then(function (res) { return res.data || []; })
        .catch(function () { return []; });
    })).then(function (lists) {
      var counts = new Array(12).fill(0);
      lists.forEach(function (rows) {
        rows.forEach(function (row) { counts[new Date(row.created_at).getMonth()]++; });
      });
      yearCounts = counts;
      yearMax = Math.max.apply(null, counts);
      if (cb) cb();
    });
  }

  // Плотность по ЧАСАМ одного выбранного дня — в какое время было больше
  // всего активности (масштаб "Часы").
  function loadHourData(d, cb) {
    if (!window.supa) { hourCounts = new Array(24).fill(0); hourMax = 0; if (cb) cb(); return; }
    var dStart = new Date(d); dStart.setHours(0, 0, 0, 0);
    var dEnd = new Date(dStart); dEnd.setDate(dEnd.getDate() + 1);
    Promise.all(DAY_SOURCES.map(function (src) {
      return window.supa.from(src.table).select('created_at')
        .gte('created_at', dStart.toISOString()).lt('created_at', dEnd.toISOString())
        .then(function (res) { return res.data || []; })
        .catch(function () { return []; });
    })).then(function (lists) {
      var counts = new Array(24).fill(0);
      lists.forEach(function (rows) {
        rows.forEach(function (row) { counts[new Date(row.created_at).getHours()]++; });
      });
      hourCounts = counts;
      hourMax = Math.max.apply(null, counts);
      if (cb) cb();
    });
  }

  // Подгрузить данные под текущий масштаб (вызывается при смене масштаба
  // и при навигации, если сменился охватываемый период).
  function reloadForScale(cb) {
    if (scale === 'months') loadYearData(cb);
    else if (scale === 'hours') loadHourData(selDate, cb);
    else loadMonthData(cb);
  }

  function renderBars() {
    if (scale === 'months') { renderMonthBars(); return; }
    if (scale === 'hours') { renderHourBars(); return; }
    renderDayBars();
  }

  function renderMonthBars() {
    barsEl.innerHTML = '';
    var by = siteBirth.getFullYear(), bm = siteBirth.getMonth();
    var ty = today.getFullYear(), tm = today.getMonth();
    for (var m = 0; m < 12; m++) {
      var outside = viewYear < by || viewYear > ty || (viewYear === ty && m > tm) || (viewYear === by && m < bm);
      var count = yearCounts[m] || 0;
      var slot = document.createElement('div');
      slot.className = 'wb-slot' + (outside ? ' outside' : (count ? '' : ' empty')) +
        (!outside && viewYear === selDate.getFullYear() && m === selDate.getMonth() ? ' selected' : '');
      slot.title = MONTHS_FULL[m] + ' ' + viewYear + (outside ? '' : (count ? ' — ' + count + (count === 1 ? ' запись' : ' записей') : ' — тихо'));
      if (!outside) slot.setAttribute('data-month-bar', String(m));
      var bar = document.createElement('div');
      bar.className = 'wb-bar';
      var norm = yearMax > 0 ? count / yearMax : 0;
      bar.style.height = (!outside && count ? BAR_MIN + norm * (BAR_MAX - BAR_MIN) : 2) + 'px';
      slot.appendChild(bar);
      barsEl.appendChild(slot);
    }
  }

  function renderHourBars() {
    barsEl.innerHTML = '';
    for (var h = 0; h < 24; h++) {
      var count = hourCounts[h] || 0;
      var hh = (h < 10 ? '0' : '') + h;
      var slot = document.createElement('div');
      slot.className = 'wb-slot' + (count ? '' : ' empty');
      slot.title = hh + ':00–' + hh + ':59' + (count ? ' — ' + count + (count === 1 ? ' запись' : ' записей') : ' — тихо');
      slot.setAttribute('data-hour-bar', String(h));
      var bar = document.createElement('div');
      bar.className = 'wb-bar';
      var norm = hourMax > 0 ? count / hourMax : 0;
      bar.style.height = (count ? BAR_MIN + norm * (BAR_MAX - BAR_MIN) : 2) + 'px';
      slot.appendChild(bar);
      barsEl.appendChild(slot);
    }
  }

  function renderDayBars() {
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
  var POP_LIFETIME = 5000; // плашка сама прячется через 5 секунд без взаимодействия

  function hidePop() {
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
    if (popEl.hidden) return;
    popEl.classList.add('closing'); // сворачивается вверх, а не пропадает рывком
    setTimeout(function () {
      popEl.hidden = true;
      popEl.classList.remove('closing');
    }, 220);
  }

  popEl.addEventListener('mouseenter', function () {
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
  });
  popEl.addEventListener('mouseleave', function () {
    if (!popEl.hidden && !popTimer) popTimer = setTimeout(hidePop, POP_LIFETIME);
  });
  popEl.addEventListener('click', function (e) {
    if (e.target.closest('.pop-close')) hidePop();
  });

  var CLOSE_BTN = '<span class="pop-close">Скрыть</span>';

  function renderPopContent(d, info) {
    var head = sameDate(d, today) ? 'Сегодня' : fmtDateObj(d);
    if (info && info.length) {
      var html = '<b>' + head + '</b>';
      html += info.slice(0, 14).map(function (r) {
        return '<a class="day-item" href="' + escapeHtml(r.href) + '">«' + escapeHtml(trim60(r.text)) +
          '»<span class="cat">' + escapeHtml(r.label) + '</span></a>';
      }).join('');
      if (info.length > 14) html += '<span style="opacity:.6">…и ещё ' + (info.length - 14) + '</span>';
      return html + CLOSE_BTN;
    }
    return '<b>' + head + '</b><span style="opacity:.65">В этот день на сайте не было активности.</span>' + CLOSE_BTN;
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

  // Попап по конкретному часу выбранного дня (масштаб "Часы").
  function renderHourPopContent(hour, info) {
    var hh = (hour < 10 ? '0' : '') + hour;
    var head = (sameDate(selDate, today) ? 'Сегодня' : fmtDateObj(selDate)) + ', ' + hh + ':00–' + hh + ':59';
    if (info && info.length) {
      var html = '<b>' + head + '</b>';
      html += info.slice(0, 14).map(function (r) {
        return '<a class="day-item" href="' + escapeHtml(r.href) + '">«' + escapeHtml(trim60(r.text)) +
          '»<span class="cat">' + escapeHtml(r.label) + '</span></a>';
      }).join('');
      if (info.length > 14) html += '<span style="opacity:.6">…и ещё ' + (info.length - 14) + '</span>';
      return html + CLOSE_BTN;
    }
    return '<b>' + head + '</b><span style="opacity:.65">В этот час на сайте не было активности.</span>' + CLOSE_BTN;
  }

  function openHourPopup(hour) {
    popRequestId++;
    var myRequest = popRequestId;
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
    var hh = (hour < 10 ? '0' : '') + hour;
    popEl.innerHTML = '<b>' + hh + ':00–' + hh + ':59</b>Загрузка...';
    popEl.hidden = false;
    loadRealHourInfo(selDate, hour).then(function (info) {
      if (myRequest !== popRequestId) return;
      popEl.innerHTML = renderHourPopContent(hour, info);
      popTimer = setTimeout(hidePop, POP_LIFETIME);
    });
  }

  function afterSelect(showPop) {
    renderBars();
    renderMonths();
    updateBottom();
    if (showPop) openPopupFor(selDate); else hidePop();
  }

  // Выбрать день — если под текущий масштаб сменился охватываемый период
  // (месяц для "Дней", год для "Месяцев", сам день для "Часов"), сначала
  // подгружаем его данные.
  function selectDate(d, showPop) {
    d = clampDate(d);
    var prevYear = viewYear, prevMonth = viewMonth;
    var dayChanged = !sameDate(d, selDate);
    selDate = d;
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    var reload = scale === 'months' ? (viewYear !== prevYear)
      : scale === 'hours' ? dayChanged
      : (viewYear !== prevYear || viewMonth !== prevMonth);
    if (reload) {
      reloadForScale(function () { afterSelect(showPop); });
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

  function updateScaleButtons() {
    if (!scaleEl) return;
    var links = scaleEl.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('on', links[i].getAttribute('data-scale') === scale);
    }
  }

  function setScale(s) {
    if (scale === s) return;
    scale = s;
    updateScaleButtons();
    hidePop();
    reloadForScale(function () { renderBars(); });
  }

  barsEl.addEventListener('click', function (e) {
    var dEl = e.target.closest('[data-day]');
    if (dEl) { selectDate(new Date(viewYear, viewMonth, parseInt(dEl.getAttribute('data-day'), 10)), true); return; }
    var mEl = e.target.closest('[data-month-bar]');
    if (mEl) {
      // Клик по месяцу — проваливаемся в него по дням, чтобы посмотреть детали.
      scale = 'days';
      updateScaleButtons();
      hidePop();
      navigateToMonth(viewYear, parseInt(mEl.getAttribute('data-month-bar'), 10));
      return;
    }
    var hEl = e.target.closest('[data-hour-bar]');
    if (hEl) { openHourPopup(parseInt(hEl.getAttribute('data-hour-bar'), 10)); return; }
  });

  if (scaleEl) {
    scaleEl.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-scale]');
      if (!a) return;
      e.preventDefault();
      setScale(a.getAttribute('data-scale'));
    });
  }

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

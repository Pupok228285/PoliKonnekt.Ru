/*
 * Рекламные поп-апы. Выскакивают через секунду после захода и висят, пока не
 * закроют крестиком — сами по таймеру больше не прячутся. Пока вкладка
 * открыта, заново выскакивают каждые REAPPEAR_MS. Объявления из админки
 * (db/schema_v44.sql) могут висеть одновременно в разных углах экрана —
 * каждый угол со своими объявлениями крутится по очереди отдельно, как
 * рекламный блок по телевизору (ROTATE_MS), порядок каждый раз случайный.
 * Оба тайминга — настройка сайта (site_settings, db/schema_v46.sql),
 * меняются в админке, а не зашиты в коде. Если активных объявлений нет
 * вообще ни в одном углу — честно показывает старую шутку в углу
 * снизу-справа, как и было с самого начала.
 */
(function () {
  var FALLBACK_ADS = [
    'Здесь могла быть ваша реклама. Пишите: реклама@поликоннект.рф',
    'Скидка 146% на клавиатуры без буквы «Ё». Успей, пока не передумали.',
    'Сдаём общагу в аренду самим себе. Цена договорная, шумим бесплатно.',
    'Ищем спонсора для этого баннера. Предложения — в Поддержку.',
    'Конспекты по вышке — теперь и в чёрно-белом! Только сегодня.',
    'Пропал носок в прачечной. Розыск ведёт вся Столовая.'
  ];

  var ROTATE_MS = 30000; // запасное значение, пока не пришла настройка из site_settings
  var REAPPEAR_MS = 10 * 60 * 1000;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  // corner -> { pop, slot, rotateTimer, revealTimer }
  var corners = {};

  function getCorner(key) {
    if (corners[key]) return corners[key];
    var pop = document.createElement('div');
    pop.className = 'ad-popup corner-' + key;
    pop.innerHTML = '<div class="titlebar"><span>Реклама</span><button type="button" class="ad-popup-close" title="Закрыть">×</button></div>' +
      '<div class="adslot"><span class="adslot-tag">реклама</span><p></p></div>';
    document.body.appendChild(pop);
    var slot = pop.querySelector('.adslot');
    var state = { pop: pop, slot: slot, rotateTimer: null, revealTimer: null };
    pop.querySelector('.ad-popup-close').addEventListener('click', function () { hide(state); });
    corners[key] = state;
    return state;
  }

  function stopRotation(state) {
    if (state.rotateTimer) { clearInterval(state.rotateTimer); state.rotateTimer = null; }
  }

  function hide(state) {
    state.pop.classList.remove('show');
    stopRotation(state);
    if (state.revealTimer) { clearTimeout(state.revealTimer); state.revealTimer = null; }
  }

  function reveal(state) {
    state.revealTimer = setTimeout(function () {
      state.pop.classList.add('show');
    }, 1000);
  }

  function showFallback() {
    var state = getCorner('bottom-right');
    stopRotation(state);
    state.pop.style.width = '';
    state.slot.style.height = '';
    state.slot.innerHTML = '<span class="adslot-tag">реклама</span><p>' +
      escapeHtml(FALLBACK_ADS[Math.floor(Math.random() * FALLBACK_ADS.length)]) + '</p>';
    reveal(state);
  }

  function renderAd(state, ad) {
    var isMobile = window.innerWidth < 768;
    var w = isMobile ? ad.mobile_w : ad.desktop_w;
    var h = isMobile ? ad.mobile_h : ad.desktop_h;
    state.pop.style.width = w + 'px';
    state.slot.style.height = h + 'px';

    var inner = '<span class="adslot-tag">реклама</span>';
    if (ad.image_url) {
      inner += '<img src="' + escapeHtml(ad.image_url) + '" alt="" style="flex:1 1 auto;min-height:0;width:100%;object-fit:cover;display:block">';
    }
    if (ad.text_body) {
      inner += '<p style="flex:none">' + escapeHtml(ad.text_body) + '</p>';
    }
    if (ad.link_url) {
      state.slot.innerHTML = '<a href="' + escapeHtml(ad.link_url) + '" target="_blank" rel="noopener sponsored" style="display:block;color:inherit;text-decoration:none">' + inner + '</a>';
    } else {
      state.slot.innerHTML = inner;
    }
  }

  function showAdsInCorner(key, ads) {
    var state = getCorner(key);
    stopRotation(state);
    // Порядок каждый раз перемешиваем, чтобы не всегда одно и то же первым.
    ads = ads.slice().sort(function () { return Math.random() - 0.5; });
    var idx = 0;
    renderAd(state, ads[idx]);
    reveal(state);
    if (ads.length > 1) {
      state.rotateTimer = setInterval(function () {
        state.slot.classList.add('fading');
        setTimeout(function () {
          idx = (idx + 1) % ads.length;
          renderAd(state, ads[idx]);
          state.slot.classList.remove('fading');
        }, 300);
      }, ROTATE_MS);
    }
  }

  function runCycle() {
    Object.keys(corners).forEach(function (key) { hide(corners[key]); });
    if (!window.supa) { showFallback(); return; }
    window.supa.from('ads').select('*').eq('status', 'approved').gte('active_until', new Date().toISOString()).then(function (res) {
      if (res.error || !res.data || !res.data.length) { showFallback(); return; }
      var byCorner = {};
      res.data.forEach(function (ad) {
        var key = ad.position || 'bottom-right';
        (byCorner[key] = byCorner[key] || []).push(ad);
      });
      Object.keys(byCorner).forEach(function (key) { showAdsInCorner(key, byCorner[key]); });
    });
  }

  function init() {
    if (!window.supa) { runCycle(); setInterval(runCycle, REAPPEAR_MS); return; }
    window.supa.from('site_settings').select('ad_reappear_minutes, ad_rotate_seconds').eq('id', true).single().then(function (res) {
      if (res.data) {
        if (res.data.ad_reappear_minutes) REAPPEAR_MS = res.data.ad_reappear_minutes * 60 * 1000;
        if (res.data.ad_rotate_seconds) ROTATE_MS = res.data.ad_rotate_seconds * 1000;
      }
      runCycle();
      setInterval(runCycle, REAPPEAR_MS);
    });
  }
  init();
})();

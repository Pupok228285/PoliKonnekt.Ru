/*
 * Рекламный поп-ап. Выскакивает через секунду после захода и висит, пока не
 * закроют крестиком — сама по таймеру больше не прячется. Пока вкладка
 * открыта, заново выскакивает каждые REAPPEAR_MS. Сначала пробует показать
 * настоящие объявления из админки (размер свой для ПК/телефона, фото или
 * текст, до даты "висит") — если их несколько активных сразу, крутит по
 * очереди прямо в открытом поп-апе, как рекламный блок по телевизору, а не
 * только выбирает случайное одно. Если активных объявлений нет — честно
 * показывает старую шутку, как и было.
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

  var pop = document.getElementById('adPopup');
  if (!pop) return;
  var slot = document.getElementById('adPopupSlot');
  var closeBtn = document.getElementById('adPopupClose');
  var rotateTimer = null;
  var ROTATE_MS = 15000; // 15 секунд на объявление, пока их несколько

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function stopRotation() {
    if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
  }

  function hide() {
    pop.classList.remove('show');
    stopRotation();
  }
  closeBtn.addEventListener('click', hide);

  function reveal() {
    setTimeout(function () {
      pop.classList.add('show');
    }, 1000);
  }

  function showFallback() {
    pop.style.width = '';
    slot.style.height = '';
    slot.innerHTML = '<span class="adslot-tag">реклама</span><p>' +
      escapeHtml(FALLBACK_ADS[Math.floor(Math.random() * FALLBACK_ADS.length)]) + '</p>';
    reveal();
  }

  function renderAd(ad) {
    var isMobile = window.innerWidth < 768;
    var w = isMobile ? ad.mobile_w : ad.desktop_w;
    var h = isMobile ? ad.mobile_h : ad.desktop_h;
    pop.style.width = w + 'px';
    slot.style.height = h + 'px';

    var inner = '<span class="adslot-tag">реклама</span>';
    if (ad.image_url) {
      inner += '<img src="' + escapeHtml(ad.image_url) + '" alt="" style="flex:1 1 auto;min-height:0;width:100%;object-fit:cover;display:block">';
    }
    if (ad.text_body) {
      inner += '<p style="flex:none">' + escapeHtml(ad.text_body) + '</p>';
    }
    if (ad.link_url) {
      slot.innerHTML = '<a href="' + escapeHtml(ad.link_url) + '" target="_blank" rel="noopener sponsored" style="display:block;color:inherit;text-decoration:none">' + inner + '</a>';
    } else {
      slot.innerHTML = inner;
    }
  }

  function showRealAds(ads) {
    stopRotation();
    // Порядок каждый раз перемешиваем, чтобы не всегда одно и то же первым.
    ads = ads.slice().sort(function () { return Math.random() - 0.5; });
    var idx = 0;
    renderAd(ads[idx]);
    reveal();
    if (ads.length > 1) {
      rotateTimer = setInterval(function () {
        idx = (idx + 1) % ads.length;
        renderAd(ads[idx]);
      }, ROTATE_MS);
    }
  }

  var REAPPEAR_MS = 30 * 60 * 1000; // 30 минут

  function runCycle() {
    stopRotation();
    if (!window.supa) { showFallback(); return; }
    window.supa.from('ads').select('*').gte('active_until', new Date().toISOString()).then(function (res) {
      if (res.error || !res.data || !res.data.length) { showFallback(); return; }
      showRealAds(res.data);
    });
  }

  runCycle();
  setInterval(runCycle, REAPPEAR_MS);
})();

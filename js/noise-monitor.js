/*
 * Постоянный шумомер для Библиотеки — работает, только если включён в
 * Настройках (localStorage 'pk_mic_enabled'). Пока страница открыта, честно
 * слушает уровень шума через Web Audio API прямо в браузере — звук нигде не
 * записывается и не отправляется, наружу уходит только число громкости на
 * месте. Тихо — ничего не происходит. Нормально — жёлтая подсветка по краям
 * + подсказка "потише". Громко — красная мигающая дымка на весь экран и
 * крупная надпись ТИШЕ!!! по центру.
 *
 * Пороги громкости подобраны на глаз (в песочнице нет настоящего микрофона,
 * чтобы прогнать их вживую). Средний порог (QUIET_MAX) — чувствительный,
 * реагирует на негромкий шум по просьбе; громкий (LOUD_MIN) — с чуть большим
 * допуском, чтобы полноэкранная красная дымка не включалась от каждого
 * чиха. После реального запуска возможно захочется подстроить ещё раз.
 */
(function () {
  var statusEl = document.getElementById('noiseStatus');
  var overlay = document.getElementById('noiseOverlay');
  if (!statusEl || !overlay) return;

  var MIC_KEY = 'pk_mic_enabled';
  var QUIET_MAX = 0.015;
  var LOUD_MIN = 0.08;
  var SAMPLE_MS = 150;
  var WINDOW_SIZE = 3;

  function micEnabled() {
    try { return localStorage.getItem(MIC_KEY) === '1'; } catch (e) { return false; }
  }

  if (!micEnabled()) {
    statusEl.innerHTML = 'Шумомер выключен. Включить можно в <a href="settings.html">Настройках</a> — сайт будет честно следить за тишиной, пока вы на этой странице.';
    return;
  }

  statusEl.textContent = 'Прошу доступ к микрофону...';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = 'Ваш браузер не умеет слушать микрофон — шумомер тут не заработает.';
    return;
  }

  var stream = null;
  var ctx = null;
  var timer = null;
  var samples = [];
  var level = 'quiet';

  function setLevel(next) {
    if (next === level) return;
    level = next;
    overlay.classList.toggle('level-mid', level === 'mid');
    overlay.classList.toggle('level-loud', level === 'loud');
  }

  function stopAll() {
    if (timer) { clearInterval(timer); timer = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (ctx) { ctx.close(); ctx = null; }
    setLevel('quiet');
  }

  window.addEventListener('pagehide', stopAll);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopAll();
  });

  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
    stream = s;
    statusEl.textContent = 'Шумомер слушает тишину...';

    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
    var source = ctx.createMediaStreamSource(stream);
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    var data = new Uint8Array(analyser.frequencyBinCount);

    timer = setInterval(function () {
      analyser.getByteTimeDomainData(data);
      var sumSquares = 0;
      for (var i = 0; i < data.length; i++) {
        var v = (data[i] - 128) / 128;
        sumSquares += v * v;
      }
      samples.push(Math.sqrt(sumSquares / data.length));
      if (samples.length > WINDOW_SIZE) samples.shift();
      var avg = samples.reduce(function (a, b) { return a + b; }, 0) / samples.length;

      if (avg >= LOUD_MIN) setLevel('loud');
      else if (avg >= QUIET_MAX) setLevel('mid');
      else setLevel('quiet');
    }, SAMPLE_MS);
  }).catch(function () {
    statusEl.textContent = 'Не дали доступ к микрофону — шумомер не работает. Звук всё равно никуда бы не ушёл, это была только локальная проверка.';
  });
})();

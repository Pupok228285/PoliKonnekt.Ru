// ПолиКоннект — публичная страница заявки на рекламу (ad-submit.html).
// Доступ только по токену в ссылке (?token=...), выданному админом в
// панели — без аккаунта на сайте. db/schema_v44.sql.
(function () {
  var token = new URLSearchParams(window.location.search).get('token') || '';

  var loadingBox = document.getElementById('adSubmitLoading');
  var invalidBox = document.getElementById('adSubmitInvalid');
  var area = document.getElementById('adSubmitArea');
  var doneBox = document.getElementById('adSubmitDone');
  var labelEl = document.getElementById('adSubmitLabel');
  var expiryEl = document.getElementById('adSubmitExpiry');
  var noteEl = document.getElementById('adSubmitNote');

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function setStatusHint(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? '#1d7813' : '#b93b37';
  }

  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) {
            if (!blob) { reject(new Error('Не удалось сжать изображение.')); return; }
            resolve(blob);
          }, 'image/jpeg', quality);
        };
        img.onerror = function () { reject(new Error('Не удалось прочитать изображение.')); };
        img.src = e.target.result;
      };
      reader.onerror = function () { reject(new Error('Не удалось прочитать файл.')); };
      reader.readAsDataURL(file);
    });
  }

  function bindPreset(selectId, wId, hId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.addEventListener('change', function () {
      if (sel.value === 'custom') return;
      var parts = sel.value.split('x');
      document.getElementById(wId).value = parts[0];
      document.getElementById(hId).value = parts[1];
    });
  }
  bindPreset('asDesktopPreset', 'asDesktopW', 'asDesktopH');
  bindPreset('asMobilePreset', 'asMobileW', 'asMobileH');

  if (!token) {
    loadingBox.hidden = true;
    invalidBox.hidden = false;
    return;
  }

  window.supa.rpc('get_ad_grant_info', { p_token: token }).then(function (res) {
    loadingBox.hidden = true;
    var info = res.data && res.data[0];
    if (res.error || !info || !info.valid) {
      invalidBox.hidden = false;
      return;
    }
    area.hidden = false;
    labelEl.textContent = info.label;
    expiryEl.textContent = 'Ссылка действует до ' + fmtDate(info.expires_at) + '.';
    if (info.last_status === 'rejected') {
      noteEl.hidden = false;
      noteEl.innerHTML = '<b style="color:#b93b37">Прошлую заявку вернули на доработку' +
        (info.last_note ? ': «' + info.last_note.replace(/</g, '&lt;') + '»' : '.') +
        '</b> Отправьте новый вариант ниже.';
    }
  });

  var submitBtn = document.getElementById('asSubmitBtn');
  submitBtn.addEventListener('click', function () {
    var statusEl = document.getElementById('asSubmitStatus');
    var textVal = (document.getElementById('asTextInput').value || '').trim();
    var linkVal = (document.getElementById('asLinkInput').value || '').trim();
    var fileInput = document.getElementById('asImageInput');
    var hasFile = !!(fileInput.files && fileInput.files[0]);
    if (!textVal && !hasFile) { setStatusHint(statusEl, 'Добавьте текст или фото.', false); return; }

    var payload = {
      p_token: token,
      p_text: textVal || null,
      p_link: linkVal || null,
      p_image_url: null,
      p_desktop_w: Number(document.getElementById('asDesktopW').value) || 300,
      p_desktop_h: Number(document.getElementById('asDesktopH').value) || 250,
      p_mobile_w: Number(document.getElementById('asMobileW').value) || 320,
      p_mobile_h: Number(document.getElementById('asMobileH').value) || 50
    };

    function finish() {
      window.supa.rpc('submit_ad_via_grant', payload).then(function (r) {
        submitBtn.disabled = false;
        if (r.error) { setStatusHint(statusEl, r.error.message, false); return; }
        area.hidden = true;
        doneBox.hidden = false;
      });
    }

    submitBtn.disabled = true;
    if (hasFile) {
      setStatusHint(statusEl, 'Сжимаем и загружаем фото...', true);
      compressImage(fileInput.files[0], 1200, 0.8).then(function (blob) {
        var path = 'pending/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg';
        return window.supa.storage.from('ad-photos').upload(path, blob, { contentType: 'image/jpeg' }).then(function (upRes) {
          if (upRes.error) throw upRes.error;
          payload.p_image_url = window.supa.storage.from('ad-photos').getPublicUrl(path).data.publicUrl;
          setStatusHint(statusEl, 'Отправляем...', true);
          finish();
        });
      }).catch(function (err) {
        submitBtn.disabled = false;
        setStatusHint(statusEl, 'Ошибка: ' + (err && err.message ? err.message : err), false);
      });
    } else {
      setStatusHint(statusEl, 'Отправляем...', true);
      finish();
    }
  });
})();

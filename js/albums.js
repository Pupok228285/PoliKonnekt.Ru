/*
 * Альбомы — только просмотр (наполняет админ через admin.html, см. решение
 * в TODO.md про хранилище). Без ?id= — список альбомов, с ?id=N — сетка
 * фото одного альбома, без подписей.
 */
(function () {
  if (!window.supa) return;

  var listSection = document.getElementById('albumsListSection');
  var listEl = document.getElementById('albumsList');
  var viewSection = document.getElementById('albumViewSection');
  var titleEl = document.getElementById('albumTitle');
  var photosEl = document.getElementById('albumPhotos');
  var crumbCurrent = document.getElementById('crumbCurrent');
  if (!listEl) return;

  // ---------- лайтбокс: увеличенный просмотр фото альбома ----------
  var lightbox = document.getElementById('lightbox');
  var lbImg = document.getElementById('lbImg');
  var lbClose = document.getElementById('lbClose');
  var lbPrev = document.getElementById('lbPrev');
  var lbNext = document.getElementById('lbNext');
  var lbCount = document.getElementById('lbCount');
  var lbCaption = document.getElementById('lbCaption');
  var lbItems = []; // [{url, caption}]
  var lbIndex = 0;

  function showLb(i) {
    if (!lbItems.length) return;
    lbIndex = (i + lbItems.length) % lbItems.length;
    var item = lbItems[lbIndex];
    lbImg.src = item.url;
    if (lbCount) lbCount.textContent = (lbIndex + 1) + ' из ' + lbItems.length;
    if (lbCaption) {
      lbCaption.textContent = item.caption || '';
      lbCaption.hidden = !item.caption;
    }
  }

  function openLightbox(items, index) {
    lbItems = items;
    if (!lightbox) return;
    lightbox.hidden = false;
    showLb(index);
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    lbImg.src = '';
  }

  if (lbClose) lbClose.addEventListener('click', closeLightbox);
  if (lbPrev) lbPrev.addEventListener('click', function () { showLb(lbIndex - 1); });
  if (lbNext) lbNext.addEventListener('click', function () { showLb(lbIndex + 1); });
  if (lightbox) {
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox(); // клик по тёмному фону вокруг фото
    });
  }
  document.addEventListener('keydown', function (e) {
    if (!lightbox || lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') showLb(lbIndex - 1);
    else if (e.key === 'ArrowRight') showLb(lbIndex + 1);
  });

  var id = new URLSearchParams(window.location.search).get('id');

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

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  if (id) {
    listSection.hidden = true;
    viewSection.hidden = false;
    Promise.all([
      window.supa.from('albums').select('id, title').eq('id', id).single(),
      window.supa.from('album_photos').select('id, url, caption').eq('album_id', id).order('created_at', { ascending: false })
    ]).then(function (results) {
      var albRes = results[0], photosRes = results[1];
      if (albRes.error || !albRes.data) { titleEl.textContent = 'Альбом не найден'; return; }
      titleEl.textContent = albRes.data.title;
      if (crumbCurrent) { crumbCurrent.hidden = false; crumbCurrent.textContent = ' → ' + albRes.data.title; }
      if (photosRes.error || !photosRes.data || !photosRes.data.length) {
        photosEl.innerHTML = '<p class="hint" style="padding:4px 2px">Фото в этом альбоме пока нет.</p>';
        return;
      }
      photosEl.innerHTML = '';
      var items = photosRes.data.map(function (p) { return { url: p.url, caption: p.caption }; });
      photosRes.data.forEach(function (p, i) {
        var fig = document.createElement('figure');
        var ph = document.createElement('div');
        ph.className = 'ph';
        ph.style.backgroundImage = 'url(' + p.url + ')';
        ph.style.backgroundSize = 'cover';
        ph.style.backgroundPosition = 'center';
        ph.addEventListener('click', function () { openLightbox(items, i); });
        fig.appendChild(ph);
        if (p.caption) {
          var cap = document.createElement('figcaption');
          cap.textContent = p.caption;
          fig.appendChild(cap);
        }
        photosEl.appendChild(fig);
      });
    });
    return;
  }

  window.supa.from('albums')
    .select('id, title, created_at, album_photos(id), preview:album_photos(url, created_at)')
    .order('created_at', { ascending: false })
    .order('created_at', { foreignTable: 'preview', ascending: false })
    .limit(5, { foreignTable: 'preview' })
    .then(function (res) {
      if (res.error || !res.data) { listEl.innerHTML = '<p class="hint" style="padding:4px 2px">Не удалось загрузить.</p>'; return; }
      if (!res.data.length) { listEl.innerHTML = '<p class="hint" style="padding:4px 2px">Пока ни одного альбома — администрация ещё наполняет.</p>'; return; }
      listEl.innerHTML = '';
      res.data.forEach(function (a) {
        var count = (a.album_photos || []).length;
        var wrap = document.createElement('div');
        wrap.className = 'p-row';
        wrap.style.display = 'block';
        var head = document.createElement('div');
        head.innerHTML = '<span class="lbl"><a href="albums.html?id=' + a.id + '">' + escapeHtml(a.title) + '</a></span>' +
          '<span class="val">' + count + ' фото <span class="hint" style="margin:0">— ' + fmtDate(a.created_at) + '</span></span>';
        wrap.appendChild(head);
        var preview = a.preview || [];
        if (preview.length) {
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:6px;align-items:center;margin:6px 0 2px 138px;flex-wrap:wrap';
          preview.forEach(function (p) {
            var thumb = document.createElement('a');
            thumb.href = 'albums.html?id=' + a.id;
            thumb.style.cssText = 'display:block;width:48px;height:48px;background:url(' + p.url + ') center/cover;border:1px solid #93a8c6';
            row.appendChild(thumb);
          });
          if (count > preview.length) {
            var more = document.createElement('a');
            more.href = 'albums.html?id=' + a.id;
            more.className = 'submit';
            more.style.cssText = 'font-size:10px;padding:2px 8px';
            more.textContent = 'Все фото →';
            row.appendChild(more);
          }
          wrap.appendChild(row);
        }
        listEl.appendChild(wrap);
      });
    });

  // ---------- прислать рисунок/фото на модерацию ----------
  var subPickBtn = document.getElementById('subPickBtn');
  var subPhotoInput = document.getElementById('subPhotoInput');
  var subPhotoPreview = document.getElementById('subPhotoPreview');
  var subCaption = document.getElementById('subCaption');
  var subSubmitBtn = document.getElementById('subSubmitBtn');
  var subHint = document.getElementById('subHint');
  var pendingSubPhoto = null;

  function setSubHint(text, ok) {
    if (!subHint) return;
    subHint.textContent = text || '';
    subHint.style.color = ok == null ? '' : (ok ? '#1d7813' : '#b23e00');
  }

  if (subPickBtn) {
    subPickBtn.addEventListener('click', function () { subPhotoInput.click(); });
    subPhotoInput.addEventListener('change', function () {
      var f = subPhotoInput.files && subPhotoInput.files[0];
      if (!f) return;
      if (f.type.indexOf('image/') !== 0) { alert('Можно прикреплять только фото.'); subPhotoInput.value = ''; return; }
      pendingSubPhoto = f;
      subPhotoPreview.style.display = '';
      subPhotoPreview.textContent = 'Фото: ' + f.name + ' ';
      var cancel = document.createElement('a');
      cancel.href = '#';
      cancel.textContent = '✕ убрать';
      cancel.addEventListener('click', function (e) {
        e.preventDefault();
        pendingSubPhoto = null;
        subPhotoInput.value = '';
        subPhotoPreview.style.display = 'none';
        subPhotoPreview.textContent = '';
      });
      subPhotoPreview.appendChild(cancel);
    });
  }

  var SUBMISSION_LIMIT = 20; // лимит незакрытых заявок на человека — только для участников, у админа лимита нет

  if (subSubmitBtn) {
    subSubmitBtn.addEventListener('click', function () {
      if (!pendingSubPhoto) { setSubHint('Сначала выберите фото.', false); return; }
      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) { setSubHint('Сначала войдите вверху страницы.', false); return; }
        subSubmitBtn.disabled = true;
        setSubHint('Отправляем...', null);
        window.supa.from('album_submissions').select('id', { count: 'exact', head: true }).eq('author_id', session.user.id).then(function (cntRes) {
          if ((cntRes.count || 0) >= SUBMISSION_LIMIT) {
            throw new Error('Достигнут лимит — ' + SUBMISSION_LIMIT + ' заявок на рассмотрении. Дождитесь, пока админ разберёт очередь.');
          }
          return compressImage(pendingSubPhoto, 1600, 0.75);
        }).then(function (blob) {
          var path = session.user.id + '/' + Date.now() + '-' + pendingSubPhoto.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          return window.supa.storage.from('album-submissions').upload(path, blob, { contentType: 'image/jpeg' }).then(function (upRes) {
            if (upRes.error) throw upRes.error;
            var url = window.supa.storage.from('album-submissions').getPublicUrl(path).data.publicUrl;
            return window.supa.from('album_submissions').insert({
              author_id: session.user.id,
              photo_url: url,
              caption: (subCaption.value || '').trim() || null
            });
          });
        }).then(function (insRes) {
          subSubmitBtn.disabled = false;
          if (insRes && insRes.error) { setSubHint(insRes.error.message, false); return; }
          setSubHint('Отправлено на модерацию, спасибо!', true);
          pendingSubPhoto = null;
          subPhotoInput.value = '';
          subPhotoPreview.style.display = 'none';
          subPhotoPreview.textContent = '';
          subCaption.value = '';
        }).catch(function (err) {
          subSubmitBtn.disabled = false;
          setSubHint(err.message || 'Не удалось отправить.', false);
        });
      });
    });
  }
})();

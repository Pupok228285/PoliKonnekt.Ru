/*
 * Свежие объявления на главной — по-настоящему: список грузится из базы
 * один раз, фильтры (вкладки/категория/поиск) работают на клиенте по уже
 * загруженным данным. Публикация — реальная, с необязательным фото.
 */
(function () {
  if (!window.supa) return;

  var tabsBox = document.getElementById('listingTabs');
  var categoryBox = document.getElementById('categoryBox');
  var listingsBody = document.getElementById('listingsBody');
  var listingsMainTitle = document.getElementById('listingsMainTitle');
  var statCount = document.getElementById('statListingsCount');
  var searchInput = document.getElementById('listingSearch');
  var searchCategory = document.getElementById('listingSearchCategory');
  var searchBtn = document.getElementById('listingSearchBtn');

  var openBtn = document.getElementById('newListingOpenBtn');
  var section = document.getElementById('newListingSection');
  var form = document.getElementById('newListingForm');
  var nlTitle = document.getElementById('nlTitle');
  var nlKind = document.getElementById('nlKind');
  var nlCategory = document.getElementById('nlCategory');
  var nlDealType = document.getElementById('nlDealType');
  var nlPrice = document.getElementById('nlPrice');
  var nlDescription = document.getElementById('nlDescription');
  var nlPhotoBtn = document.getElementById('nlPhotoBtn');
  var nlPhotoInput = document.getElementById('nlPhotoInput');
  var nlPhotoPreview = document.getElementById('nlPhotoPreview');
  var submitBtn = document.getElementById('newListingSubmit');
  var hint = document.getElementById('newListingHint');
  if (!listingsBody) return;

  var allListings = [];
  var myListings = [];
  var myListingsLoaded = false;
  var editingId = null; // id объявления, которое сейчас редактируем (null — форма создаёт новое)
  var editingPhotoUrl = null; // старое фото редактируемого объявления — сохраняем, если новое не выбрали
  var activeTab = '';
  var activeCategory = '';
  var searchQuery = '';
  var pendingPhoto = null;

  var TAB_LABELS = { '': 'Услуги, помощь и вещи', service: 'Услуги', thing: 'Вещи', free: 'Отдают даром', wanted: 'Ищут', mine: 'Мои объявления' };
  var STATUS_LABELS = { active: '', closed: '<span style="color:#b23e00">(снято с публикации)</span>' };

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' - ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function setHint(text, ok) {
    if (!hint) return;
    hint.textContent = text || '';
    hint.style.color = ok == null ? '' : (ok ? '#1d7813' : '#b23e00');
  }

  // ---------- загрузка ----------
  function loadListings() {
    window.supa.from('listings')
      .select('id, kind, deal_type, category, title, description, price_text, photo_url, created_at, profiles!author_id(nickname, verified)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error || !res.data) {
          listingsBody.innerHTML = '<tr><td colspan="5" class="hint" style="padding:8px">Не удалось загрузить объявления.</td></tr>';
          return;
        }
        allListings = res.data;
        updateCounts();
        render();
      });
  }

  // Свои объявления — все статусы (включая снятые с публикации), не только
  // активные, поэтому отдельный запрос, а не фильтр по уже загруженным.
  function loadMyListings() {
    return window.supa.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) { myListings = []; myListingsLoaded = true; return; }
      return window.supa.from('listings')
        .select('id, kind, deal_type, category, title, description, price_text, photo_url, status, created_at')
        .eq('author_id', session.user.id)
        .order('created_at', { ascending: false })
        .then(function (r) {
          myListings = r.data || [];
          myListingsLoaded = true;
        });
    });
  }

  function updateCounts() {
    if (statCount) statCount.textContent = String(allListings.length);
    if (!categoryBox) return;
    var byCat = {};
    allListings.forEach(function (it) { byCat[it.category] = (byCat[it.category] || 0) + 1; });
    categoryBox.querySelectorAll('[data-cnt]').forEach(function (el) {
      var cat = el.getAttribute('data-cnt');
      el.textContent = cat === '' ? String(allListings.length) : String(byCat[cat] || 0);
    });
  }

  function matches(item) {
    if (activeTab === 'service' || activeTab === 'thing') { if (item.kind !== activeTab) return false; }
    if (activeTab === 'free' || activeTab === 'wanted') { if (item.deal_type !== activeTab) return false; }
    if (activeCategory && item.category !== activeCategory) return false;
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      var hay = (item.title + ' ' + item.description).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function render() {
    listingsMainTitle.textContent = TAB_LABELS[activeTab] || TAB_LABELS[''];
    listingsBody.innerHTML = '';

    if (activeTab === 'mine') {
      if (!myListings.length) {
        listingsBody.innerHTML = '<tr><td colspan="5" class="hint" style="padding:8px">У вас пока нет объявлений.</td></tr>';
        return;
      }
      myListings.forEach(function (item) { listingsBody.appendChild(renderMyRow(item)); });
      return;
    }

    var list = allListings.filter(matches);
    if (!list.length) {
      listingsBody.innerHTML = '<tr><td colspan="5" class="hint" style="padding:8px">Пока ничего не нашлось.</td></tr>';
      return;
    }
    list.forEach(function (item) { listingsBody.appendChild(renderRow(item)); });
  }

  function renderMyRow(item) {
    var tr = document.createElement('tr');
    var icon = item.kind === 'service' ? 'img/icons/i-arrow.svg' : 'img/icons/i-things.svg';
    var priceHtml;
    if (item.deal_type === 'free') priceHtml = '<span class="price free">даром</span>';
    else if (item.deal_type === 'wanted') priceHtml = '<span class="price wanted">ищу</span>';
    else priceHtml = '<span class="price">' + escapeHtml(item.price_text || '—') + '</span>';
    var iconCell = item.photo_url
      ? '<img class="listing-photo" src="' + escapeHtml(item.photo_url) + '" alt="">'
      : '<img src="' + icon + '" alt="">';
    tr.innerHTML =
      '<td class="row2 ic">' + iconCell + '</td>' +
      '<td class="row1"><span class="ttl">' + escapeHtml(item.title) + '</span> ' + (STATUS_LABELS[item.status] || '') +
        '<span class="desc">' + escapeHtml(item.category) + ' · ' + escapeHtml(item.description) + '</span></td>' +
      '<td class="row2"><a href="#" class="my-edit" data-id="' + item.id + '" style="font-size:10px">Редактировать</a><br>' +
        '<a href="#" class="my-delete" data-id="' + item.id + '" style="font-size:10px;color:#b23e00">Удалить</a></td>' +
      '<td class="row1 c">' + priceHtml + '</td>' +
      '<td class="row2 upd hide-m">' + fmtDateTime(item.created_at) + '</td>';
    return tr;
  }

  listingsBody.addEventListener('click', function (e) {
    var editA = e.target.closest('a.my-edit');
    if (editA) { e.preventDefault(); startEdit(parseInt(editA.getAttribute('data-id'), 10)); return; }
    var delA = e.target.closest('a.my-delete');
    if (delA) { e.preventDefault(); deleteListing(parseInt(delA.getAttribute('data-id'), 10)); return; }
  });

  function startEdit(id) {
    var item = myListings.filter(function (x) { return x.id === id; })[0];
    if (!item) return;
    editingId = id;
    editingPhotoUrl = item.photo_url || null;
    nlTitle.value = item.title;
    nlKind.value = item.kind;
    nlCategory.value = item.category;
    nlDealType.value = item.deal_type;
    nlPrice.value = item.price_text || '';
    nlDescription.value = item.description;
    clearPendingPhoto();
    syncDealTypeUi();
    document.getElementById('newListingHeading').textContent = 'Редактирование объявления';
    submitBtn.textContent = 'Сохранить';
    setHint('', null);
    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function deleteListing(id) {
    if (!confirm('Удалить объявление? Это нельзя отменить.')) return;
    window.supa.from('listings').delete().eq('id', id).then(function (r) {
      if (r.error) { alert(r.error.message); return; }
      loadMyListings().then(render);
      loadListings();
    });
  }

  function renderRow(item) {
    var tr = document.createElement('tr');
    var icon = item.kind === 'service' ? 'img/icons/i-arrow.svg' : 'img/icons/i-things.svg';
    var priceHtml;
    if (item.deal_type === 'free') priceHtml = '<span class="price free">даром</span>';
    else if (item.deal_type === 'wanted') priceHtml = '<span class="price wanted">ищу</span>';
    else priceHtml = '<span class="price">' + escapeHtml(item.price_text || '—') + '</span>';
    var prof = item.profiles || {};
    var nickname = prof.nickname || '?';
    var tick = prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="" title="Студент подтверждён">' : '';
    var to = 'messages.html?to=' + encodeURIComponent(nickname);
    var iconCell = item.photo_url
      ? '<img class="listing-photo" src="' + escapeHtml(item.photo_url) + '" alt="">'
      : '<img src="' + icon + '" alt="">';
    tr.innerHTML =
      '<td class="row2 ic">' + iconCell + '</td>' +
      '<td class="row1"><a class="ttl" href="' + to + '">' + escapeHtml(item.title) + '</a><span class="desc">' + escapeHtml(item.category) + ' · ' + escapeHtml(item.description) + '</span></td>' +
      '<td class="row2"><span class="nick' + (prof.verified ? ' ok' : '') + '">' + escapeHtml(nickname) + '</span>' + tick + '<br><a href="' + to + '" style="font-size:10px">Написать</a></td>' +
      '<td class="row1 c">' + priceHtml + '</td>' +
      '<td class="row2 upd hide-m">' + fmtDateTime(item.created_at) + '</td>';
    return tr;
  }

  // ---------- фильтры ----------
  if (tabsBox) {
    tabsBox.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-tab]');
      if (!a) return;
      e.preventDefault();
      var tab = a.getAttribute('data-tab');
      if (tab === 'mine') {
        window.supa.auth.getSession().then(function (res) {
          if (!res.data || !res.data.session) { alert('Сначала войдите вверху страницы.'); return; }
          activeTab = tab;
          tabsBox.querySelectorAll('a').forEach(function (x) { x.classList.remove('on'); });
          a.classList.add('on');
          if (myListingsLoaded) { render(); } else { loadMyListings().then(render); }
        });
        return;
      }
      activeTab = tab;
      tabsBox.querySelectorAll('a').forEach(function (x) { x.classList.remove('on'); });
      a.classList.add('on');
      render();
    });
  }
  if (categoryBox) {
    categoryBox.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-cat]');
      if (!a) return;
      e.preventDefault();
      activeCategory = a.getAttribute('data-cat');
      categoryBox.querySelectorAll('a.item').forEach(function (x) { x.classList.remove('now'); });
      a.classList.add('now');
      render();
    });
  }
  if (searchBtn) {
    searchBtn.addEventListener('click', function () {
      searchQuery = (searchInput.value || '').trim();
      activeCategory = searchCategory.value || '';
      render();
    });
  }

  // ---------- публикация ----------
  function clearPendingPhoto() {
    pendingPhoto = null;
    if (nlPhotoInput) nlPhotoInput.value = '';
    if (nlPhotoPreview) { nlPhotoPreview.style.display = 'none'; nlPhotoPreview.textContent = ''; }
  }

  function syncDealTypeUi() {
    var paid = nlDealType.value === 'paid';
    nlPrice.style.display = paid ? '' : 'none';
    if (!paid) nlPrice.value = '';
  }

  if (openBtn) {
    openBtn.addEventListener('click', function () {
      window.supa.auth.getSession().then(function (res) {
        if (!res.data || !res.data.session) { alert('Сначала войдите вверху страницы.'); return; }
        // всегда открывает форму именно под НОВОЕ объявление, даже если до
        // этого редактировали своё — иначе можно случайно перезаписать чужое
        editingId = null;
        editingPhotoUrl = null;
        nlTitle.value = ''; nlDescription.value = ''; nlPrice.value = '';
        clearPendingPhoto();
        document.getElementById('newListingHeading').textContent = 'Новое объявление';
        submitBtn.textContent = 'Опубликовать';
        setHint('', null);
        section.style.display = section.style.display === 'none' ? 'block' : 'none';
        if (section.style.display === 'block') section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
  if (nlDealType) { nlDealType.addEventListener('change', syncDealTypeUi); syncDealTypeUi(); }
  if (nlPhotoBtn) nlPhotoBtn.addEventListener('click', function () { nlPhotoInput.click(); });
  if (nlPhotoInput) {
    nlPhotoInput.addEventListener('change', function () {
      var f = nlPhotoInput.files && nlPhotoInput.files[0];
      if (!f) return;
      if (f.type.indexOf('image/') !== 0) { alert('Можно прикреплять только фото.'); nlPhotoInput.value = ''; return; }
      pendingPhoto = f;
      nlPhotoPreview.style.display = '';
      nlPhotoPreview.textContent = 'Фото: ' + f.name + ' ';
      var cancel = document.createElement('a');
      cancel.href = '#';
      cancel.textContent = '✕ убрать';
      cancel.addEventListener('click', function (e) { e.preventDefault(); clearPendingPhoto(); });
      nlPhotoPreview.appendChild(cancel);
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      var title = (nlTitle.value || '').trim();
      var description = (nlDescription.value || '').trim();
      var dealType = nlDealType.value;
      var priceText = (nlPrice.value || '').trim();
      if (!title || !description) { setHint('Заполните заголовок и описание.', false); return; }
      if (dealType === 'paid' && !priceText) { setHint('Укажите цену или выберите «Отдам даром»/«Ищу».', false); return; }

      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) { setHint('Сначала войдите вверху страницы.', false); return; }
        submitBtn.disabled = true;
        setHint(editingId ? 'Сохраняем...' : 'Публикуем...', null);
        var wasEditing = editingId;

        function saveListing(photoUrl) {
          var op;
          if (wasEditing) {
            op = window.supa.from('listings').update({
              kind: nlKind.value,
              deal_type: dealType,
              category: nlCategory.value,
              title: title,
              description: description,
              price_text: dealType === 'paid' ? priceText : null,
              photo_url: photoUrl
            }).eq('id', wasEditing);
          } else {
            op = window.supa.from('listings').insert({
              author_id: session.user.id,
              kind: nlKind.value,
              deal_type: dealType,
              category: nlCategory.value,
              title: title,
              description: description,
              price_text: dealType === 'paid' ? priceText : null,
              photo_url: photoUrl
            });
          }
          op.then(function (ir) {
            submitBtn.disabled = false;
            if (ir.error) { setHint(ir.error.message, false); return; }
            setHint(wasEditing ? 'Сохранено.' : 'Опубликовано.', true);
            editingId = null;
            nlTitle.value = '';
            nlDescription.value = '';
            nlPrice.value = '';
            clearPendingPhoto();
            document.getElementById('newListingHeading').textContent = 'Новое объявление';
            submitBtn.textContent = 'Опубликовать';
            section.style.display = 'none';
            loadListings();
            if (wasEditing) loadMyListings().then(function () { if (activeTab === 'mine') render(); });
          });
        }

        if (pendingPhoto) {
          var path = session.user.id + '/' + Date.now() + '-' + pendingPhoto.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          window.supa.storage.from('listing-photos').upload(path, pendingPhoto).then(function (upRes) {
            if (upRes.error) { submitBtn.disabled = false; setHint(upRes.error.message, false); return; }
            var pub = window.supa.storage.from('listing-photos').getPublicUrl(path);
            saveListing(pub.data ? pub.data.publicUrl : null);
          });
        } else {
          saveListing(wasEditing ? editingPhotoUrl : null);
        }
      });
    });
  }

  loadListings();
})();

/*
 * Библиотека — конспекты/методички, бесплатно. Список грузится один раз,
 * поиск и список предметов в сайдбаре — на клиенте (тот же приём, что
 * в Услугах/К'Артели). Файлы — в публичном бакете library-files.
 */
(function () {
  if (!window.supa) return;

  var libTabsBox = document.getElementById('libTabsBox');
  var libSubjectsEmpty = document.getElementById('libSubjectsEmpty');
  var body = document.getElementById('libBody');
  var mainTitle = document.getElementById('libMainTitle');
  var searchForm = document.getElementById('libSearchForm');
  var searchInput = document.getElementById('libSearch');
  var subjectList = document.getElementById('subjectList');

  var openBtn = document.getElementById('newItemOpenBtn');
  var form = document.getElementById('newItemForm');
  var titleInput = document.getElementById('liTitle');
  var subjectInput = document.getElementById('liSubject');
  var descInput = document.getElementById('liDescription');
  var fileInput = document.getElementById('liFile');
  var submitBtn = document.getElementById('liSubmit');
  var hint = document.getElementById('liHint');
  if (!body) return;

  var MAX_SIZE = 20 * 1024 * 1024; // 20 МБ
  var all = [];
  var activeSubject = '';
  var searchQuery = '';

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' КБ';
    return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
  }

  function setHint(text, ok) {
    if (!hint) return;
    hint.textContent = text || '';
    hint.style.color = ok == null ? '' : (ok ? '#1d7813' : '#b23e00');
  }

  function load() {
    window.supa.from('library_items')
      .select('id, title, description, subject, file_path, file_name, file_size, downloads, created_at, profiles!author_id(nickname, verified)')
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error || !res.data) {
          body.innerHTML = '<tr><td colspan="5" class="hint" style="padding:8px">Не удалось загрузить.</td></tr>';
          return;
        }
        all = res.data;
        updateSubjects();
        render();
      });
  }

  function updateSubjects() {
    var subjects = {};
    all.forEach(function (it) { subjects[it.subject] = (subjects[it.subject] || 0) + 1; });
    var names = Object.keys(subjects).sort();
    if (!names.length) {
      libSubjectsEmpty.style.display = '';
      libTabsBox.querySelectorAll('a.item').forEach(function (a) { a.remove(); });
      return;
    }
    libSubjectsEmpty.style.display = 'none';
    libTabsBox.querySelectorAll('a.item').forEach(function (a) { a.remove(); });
    var allLink = document.createElement('a');
    allLink.className = 'item dot' + (activeSubject === '' ? ' now' : '');
    allLink.href = '#';
    allLink.setAttribute('data-subj', '');
    allLink.innerHTML = 'Все <span class="cnt">' + all.length + '</span>';
    libTabsBox.appendChild(allLink);
    names.forEach(function (name) {
      var a = document.createElement('a');
      a.className = 'item dot' + (activeSubject === name ? ' now' : '');
      a.href = '#';
      a.setAttribute('data-subj', name);
      a.innerHTML = escapeHtml(name) + ' <span class="cnt">' + subjects[name] + '</span>';
      libTabsBox.appendChild(a);
    });
    if (subjectList) {
      subjectList.innerHTML = names.map(function (n) { return '<option value="' + escapeHtml(n) + '">'; }).join('');
    }
  }

  libTabsBox.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-subj]');
    if (!a) return;
    e.preventDefault();
    activeSubject = a.getAttribute('data-subj');
    libTabsBox.querySelectorAll('a.item').forEach(function (x) { x.classList.remove('now'); });
    a.classList.add('now');
    render();
  });

  function render() {
    var list = all.filter(function (it) {
      if (activeSubject && it.subject !== activeSubject) return false;
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        var hay = (it.title + ' ' + it.subject + ' ' + (it.description || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    mainTitle.textContent = activeSubject ? activeSubject : (searchQuery ? 'Результаты поиска' : 'Все материалы');
    body.innerHTML = '';
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="5" class="hint" style="padding:8px">Пока ничего не нашлось. Будьте первым, кто поделится конспектом!</td></tr>';
      return;
    }
    list.forEach(function (it) { body.appendChild(renderRow(it)); });
  }

  function renderRow(it) {
    var tr = document.createElement('tr');
    var prof = it.profiles || {};
    var nickname = prof.nickname || '?';
    var tick = prof.verified ? '<img class="tick" src="img/icons/i-verified.svg" alt="" title="Студент подтверждён">' : '';
    tr.innerHTML =
      '<td class="row2 ic"><img src="img/icons/i-doc.svg" alt=""></td>' +
      '<td class="row1"><b>' + escapeHtml(it.title) + '</b><span class="desc">' + escapeHtml(it.subject) +
        (it.description ? ' · ' + escapeHtml(it.description) : '') +
        (it.file_size ? ' · ' + fmtSize(it.file_size) : '') + ' · ' + fmtDate(it.created_at) + '</span></td>' +
      '<td class="row2 hide-m"><span class="nick' + (prof.verified ? ' ok' : '') + '">' + escapeHtml(nickname) + '</span>' + tick + '</td>' +
      '<td class="row1 c">' + it.downloads + '</td>' +
      '<td class="row2 c"></td>';
    var dlBtn = document.createElement('a');
    dlBtn.className = 'submit';
    dlBtn.style.fontSize = '10px';
    dlBtn.style.padding = '1px 8px';
    dlBtn.textContent = 'Скачать';
    dlBtn.href = '#';
    dlBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var pub = window.supa.storage.from('library-files').getPublicUrl(it.file_path);
      if (pub.data && pub.data.publicUrl) {
        window.open(pub.data.publicUrl, '_blank');
        window.supa.rpc('bump_library_downloads', { item_id: it.id }).then(function () {
          it.downloads++;
          render();
        });
      }
    });
    tr.lastElementChild.appendChild(dlBtn);
    return tr;
  }

  if (searchForm) {
    searchForm.addEventListener('submit', function () {
      searchQuery = (searchInput.value || '').trim();
      render();
    });
  }

  if (openBtn) {
    openBtn.addEventListener('click', function () {
      window.supa.auth.getSession().then(function (res) {
        if (!res.data || !res.data.session) { alert('Сначала войдите вверху страницы.'); return; }
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      var title = (titleInput.value || '').trim();
      var subject = (subjectInput.value || '').trim();
      var file = fileInput.files && fileInput.files[0];
      if (!title || !subject || !file) { setHint('Заполните название, предмет и выберите файл.', false); return; }
      if (file.size > MAX_SIZE) { setHint('Файл слишком большой (максимум 20 МБ).', false); return; }
      window.supa.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) { setHint('Сначала войдите вверху страницы.', false); return; }
        submitBtn.disabled = true;
        setHint('Загружаем...', true);
        var path = session.user.id + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        window.supa.storage.from('library-files').upload(path, file).then(function (upRes) {
          if (upRes.error) { submitBtn.disabled = false; setHint(upRes.error.message, false); return; }
          window.supa.from('library_items').insert({
            author_id: session.user.id,
            title: title,
            subject: subject,
            description: (descInput.value || '').trim() || null,
            file_path: path,
            file_name: file.name,
            file_size: file.size
          }).then(function (ir) {
            submitBtn.disabled = false;
            if (ir.error) { setHint(ir.error.message, false); return; }
            setHint('Готово, спасибо за вклад в общее дело!', true);
            titleInput.value = '';
            subjectInput.value = '';
            descInput.value = '';
            fileInput.value = '';
            form.style.display = 'none';
            load();
          });
        });
      });
    });
  }

  load();
})();

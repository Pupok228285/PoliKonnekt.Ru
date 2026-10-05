/*
 * Объявление целиком (listing-view.html?id=) — детальный просмотр:
 * фото крупнее, полное описание, автор. Сама таблица объявлений
 * (listings.html/главная) теперь ведёт сюда по клику на фото/заголовок.
 */
(function () {
  if (!window.supa) return;

  var params = new URLSearchParams(window.location.search);
  var id = params.get('id');

  var notFoundBox = document.getElementById('listingNotFound');
  var box = document.getElementById('listingBox');
  var crumbHere = document.getElementById('crumbHere');
  if (!box) return;
  if (!id) return; // #listingNotFound уже видна по умолчанию в HTML

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

  window.supa.from('listings')
    .select('id, kind, deal_type, category, title, description, price_text, photo_url, status, created_at, profiles!author_id(id, nickname, verified, avatar_url)')
    .eq('id', id)
    .single()
    .then(function (res) {
      if (res.error || !res.data) return; // #listingNotFound остаётся видна

      var item = res.data;
      var prof = item.profiles || {};
      var closed = item.status === 'closed';

      notFoundBox.hidden = true;
      box.hidden = false;
      document.title = item.title + ' — ПолиКоннект.ru';
      if (crumbHere) crumbHere.textContent = item.title;

      document.getElementById('lvTitle').textContent = item.title + (closed ? ' (снято с публикации)' : '');

      var kindLabel = item.kind === 'service' ? 'Услуга' : 'Вещь';
      document.getElementById('lvMeta').textContent = kindLabel + ' · ' + item.category + ' · ' + fmtDateTime(item.created_at);

      var priceEl = document.getElementById('lvPrice');
      if (item.deal_type === 'free') priceEl.textContent = 'Отдам даром';
      else if (item.deal_type === 'wanted') priceEl.textContent = 'Ищут';
      else priceEl.textContent = item.price_text || '—';

      document.getElementById('lvDescription').textContent = item.description;

      var authorEl = document.getElementById('lvAuthor');
      var nickname = prof.nickname || 'студент';
      authorEl.innerHTML = prof.id ? '<a href="profile.html?id=' + prof.id + '">' + escapeHtml(nickname) + '</a>' : escapeHtml(nickname);
      if (prof.verified) authorEl.innerHTML += ' <img class="tick" src="img/icons/i-verified.svg" alt="" title="Студент подтверждён">';

      var contactBtn = document.getElementById('lvContactBtn');
      if (contactBtn) contactBtn.href = 'messages.html?to=' + encodeURIComponent(nickname);

      if (item.photo_url) {
        document.getElementById('lvPhoto').src = item.photo_url;
        document.getElementById('lvPhotoWrap').hidden = false;
      }
    });
})();

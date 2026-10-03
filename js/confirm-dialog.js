/*
 * Замена нативного window.confirm() — в вебвью некоторых приложений (например,
 * встроенный браузер Telegram) confirm()/alert() молча блокируются: клик
 * ничего не делает, без единой ошибки в консоли. Кнопки "Удалить" на сайте
 * были именно на confirm() — отсюда жалобы "кнопка не реагирует". Свой
 * попап с Да/Отмена работает одинаково везде.
 */
(function () {
  function pkConfirm(message, onYes) {
    var overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML =
      '<div class="confirm-box">' +
        '<p></p>' +
        '<div class="confirm-row">' +
          '<button type="button" class="submit confirm-yes">Да</button>' +
          '<button type="button" class="submit confirm-no">Отмена</button>' +
        '</div>' +
      '</div>';
    overlay.querySelector('p').textContent = message;
    document.body.appendChild(overlay);

    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.confirm-no').addEventListener('click', close);
    overlay.querySelector('.confirm-yes').addEventListener('click', function () {
      close();
      onYes();
    });
  }

  window.pkConfirm = pkConfirm;
})();

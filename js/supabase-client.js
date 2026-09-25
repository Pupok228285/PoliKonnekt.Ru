/*
 * Подключение к Supabase. URL и publishable-ключ безопасно светить в браузере —
 * это не секрет, доступ к данным ограничивают правила RLS на стороне базы
 * (см. db/schema.sql). Секретный ключ (sb_secret_...) здесь быть не должен никогда.
 */
(function () {
  if (typeof window.supabase === 'undefined') {
    console.error('supabase-js не загрузился — проверьте подключение CDN-скрипта перед этим файлом.');
    return;
  }
  var SUPABASE_URL = 'https://ecdyocxbswvdficyuohu.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_YP6I0x720N0cLHr23OFkCQ_rTN2dDC7';
  window.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
})();

/*!
 * CAT API 站点访客计数器
 * 基于 countapi.mileshilliard.com 免费 API —— 仅记录计数，无追踪 cookie
 * 用 sessionStorage 去重避免刷新狂刷（每次新会话才 +1）
 * 失败静默：API 不可达时不破坏页面布局
 */
(function () {
  var KEY = 'cat-api-spec-homepage-visits';
  var BASE = 'https://countapi.mileshilliard.com/api/v1';
  var HIT_URL = BASE + '/hit/' + KEY;
  var GET_URL = BASE + '/get/' + KEY;
  var SESSION_FLAG = 'catapi_counted';

  function fmtNum(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function render(el, total) {
    el.innerHTML =
      '<span class="vc-stat">' +
        '<svg class="vc-icon" viewBox="0 0 16 16" aria-hidden="true" width="15" height="15">' +
          '<path fill="currentColor" d="M8 3.5c1.38 0 2.5 1.12 2.5 2.5S9.38 8.5 8 8.5 5.5 7.38 5.5 6 6.62 3.5 8 3.5zM8 0C4.69 0 2 2.69 2 6c0 4.5 6 9.5 6 9.5s6-5 6-9.5c0-3.31-2.69-6-6-6z"/>' +
        '</svg>' +
        '<span class="vc-label">站点访问量</span>' +
        '<span class="vc-count">' + fmtNum(total) + '</span>' +
        '<span class="vc-unit">次</span>' +
      '</span>';
  }

  function fail(el) {
    // 静默失败：隐藏容器不破坏布局
    if (el) el.style.display = 'none';
  }

  function start() {
    var el = document.querySelector('[data-visitor-counter]');
    if (!el) return;

    var sessionCounted = sessionStorage.getItem(SESSION_FLAG);
    var url = sessionCounted ? GET_URL : HIT_URL;

    fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (typeof data.value !== 'number') throw new Error('bad payload');
        render(el, data.value);
        if (!sessionCounted) sessionStorage.setItem(SESSION_FLAG, '1');
      })
      .catch(function () { fail(el); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

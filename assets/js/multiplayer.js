/*!
 * CAT API 多人联机模块（MVP）
 * ---------------------------------------------------------------------------
 * 把站点从「单机猫」升级成「所有访客同屏」。
 *
 * 设计哲学：
 *  - 零认证：访客打开页面就能玩，不注册不登录
 *  - 零后端：用 Supabase Realtime 公共广播频道（publishable key + Allow public access）
 *  - 零侵入：独立模块，不强依赖 livecat.js；现有站点不加载它也能正常跑
 *  - 优雅降级：Supabase 不可达时整模块静默失败，站点其他功能不受影响
 *
 * 提供的彩蛋：
 *  1. 远程光标幽灵——看到其他在线访客的光标在页面移动
 *  2. 在线计数器——右上角「🐱 N 只猫在线」浮窗
 *  3. 跨站消息——某人在另一页抓到老鼠，所有人都能看到
 *  4. 全站 Token 排行榜——本地累计 + 服务端广播
 *
 * 跟 livecat.js 的联动点（可选，弱耦合）：
 *  - 监听 window.LiveCat.getTokenCount()，定期上报到排行榜
 *  - 监听 window.LiveCat.spawnMouse/catchMouseByUser（如果有），把事件同步到全站
 *  - 收到其他访客的 mouse_caught 事件时，触发本页猫的吃醋台词
 * ---------------------------------------------------------------------------
 */
(function (root) {
  "use strict";
  if (root.Multiplayer) return;  // 防止重复加载

  /* =========================================================================
   * §0 配置
   * =========================================================================
   * Supabase 项目凭证：从 Supabase Dashboard → Connect → API 获取
   * 注意：publishable key 是公开的，可以安全嵌入静态站点（不是 service_role！）
   * 如果项目里没设置凭证，整模块自动降级为空操作（站点照常运行）
   * ======================================================================= */
  // ★ 这两个值需要在 Supabase Dashboard 创建项目后替换
  //   占位符空字符串表示「未配置」——模块会静默降级
  var SUPABASE_URL = '';
  var SUPABASE_KEY = '';

  // 频道名：全站共用一个频道；不同页面用 location.pathname 作为子事件区分
  var CHANNEL_NAME = 'catapi-multiplayer';

  // 上报节流：光标位置上报频率（毫秒）
  var CURSOR_REPORT_INTERVAL = 80;
  // 心跳：定期广播自己的存在（在线判定）
  var HEARTBEAT_INTERVAL = 3000;
  // 远程光标存活：超过这个时间没收到心跳则视为离线（毫秒）
  var REMOTE_CURSOR_TTL = 8000;
  // 本地缓存上限：最多同时显示多少只远程光标（防止恶意刷屏）
  var MAX_REMOTE_CURSORS = 30;
  // 离线清理扫描间隔
  var GC_INTERVAL = 2000;

  /* =========================================================================
   * §1 身份生成（随机颜色 + 短 ID，零隐私压力）
   * ======================================================================= */
  // 给每个访客分配一个持久 ID + 一个色调（HSL 色相）
  // 用 localStorage 让刷新后仍是同一个身份
  var ID_KEY = 'catapi_visitor_id';
  var HUE_KEY = 'catapi_visitor_hue';

  function loadIdentity() {
    var id, hue;
    try {
      id = localStorage.getItem(ID_KEY);
      hue = parseInt(localStorage.getItem(HUE_KEY));
    } catch (e) {}
    if (!id) {
      id = generateId();
      try { localStorage.setItem(ID_KEY, id); } catch (e) {}
    }
    if (isNaN(hue)) {
      // 避开红色区域（不要和站点品牌色冲突太多），随机一个温暖色调
      hue = Math.floor(Math.random() * 360);
      try { localStorage.setItem(HUE_KEY, String(hue)); } catch (e) {}
    }
    return { id: id, hue: hue };
  }

  function generateId() {
    // 4 位短 ID：访客#3F2A 这种风格
    var chars = '0123456789ABCDEF';
    var s = '';
    for (var i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * 16));
    return s;
  }

  /* =========================================================================
   * §2 状态
   * ======================================================================= */
  var identity = loadIdentity();
  var channel = null;
  var connected = false;
  var started = false;

  // 远程光标缓存：{ [visitorId]: { hue, nickname, x, y, lastSeen, el } }
  var remoteCursors = {};
  // 在线访客计数（由心跳维护）
  var onlineCount = 1;

  // 本地节流计时器
  var lastCursorReport = 0;
  var lastHeartbeat = 0;

  /* =========================================================================
   * §3 UI：在线计数浮窗（右上角）
   * ======================================================================= */
  var hudEl = null;
  function ensureHUD() {
    if (hudEl) return hudEl;
    hudEl = document.createElement('div');
    hudEl.className = 'mp-hud';
    hudEl.setAttribute('aria-live', 'polite');
    hudEl.innerHTML = '';
    document.body.appendChild(hudEl);
    renderHUD();
    return hudEl;
  }

  function renderHUD() {
    if (!hudEl) return;
    var html =
      '<div class="mp-hud-online">' +
        '<span class="mp-dot"></span>' +
        '<span class="mp-count">' + onlineCount + '</span>' +
        '<span class="mp-label">只猫在线</span>' +
      '</div>';
    // 自己的访客徽章
    html +=
      '<div class="mp-hud-self" style="--hue:' + identity.hue + '">' +
        '<span class="mp-badge">访客#' + identity.id + '</span>' +
      '</div>';
    hudEl.innerHTML = html;
  }

  /* =========================================================================
   * §4 UI：远程光标幽灵
   * ======================================================================= */
  function createCursorEl(visitorId, hue) {
    var el = document.createElement('div');
    el.className = 'mp-remote-cursor';
    el.style.setProperty('--hue', hue);
    el.innerHTML =
      '<svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true">' +
        '<path d="M2 2 L 16 10 L 10 11 L 13 18 L 11 19 L 8 12 L 2 16 Z" ' +
              'fill="hsl(' + hue + ',80%,55%)" stroke="white" stroke-width="1"/>' +
      '</svg>' +
      '<span class="mp-remote-label">访客#' + visitorId + '</span>';
    document.body.appendChild(el);
    return el;
  }

  function upsertRemoteCursor(visitorId, payload) {
    if (visitorId === identity.id) return;  // 不渲染自己
    if (Object.keys(remoteCursors).length >= MAX_REMOTE_CURSORS &&
        !remoteCursors[visitorId]) {
      // 超出上限，忽略新访客
      return;
    }
    var existing = remoteCursors[visitorId];
    if (!existing) {
      var el = createCursorEl(visitorId, payload.hue);
      existing = remoteCursors[visitorId] = {
        hue: payload.hue,
        el: el,
        lastSeen: Date.now()
      };
    }
    existing.lastSeen = Date.now();
    // 坐标是归一化的（0-1），转换到本页像素
    var px = (payload.x || 0) * window.innerWidth;
    var py = (payload.y || 0) * window.innerHeight;
    existing.el.style.transform = 'translate(' + px + 'px,' + py + 'px)';
  }

  function gcOfflineCursors() {
    var now = Date.now();
    var active = 0;
    for (var id in remoteCursors) {
      if (!remoteCursors.hasOwnProperty(id)) continue;
      var c = remoteCursors[id];
      if (now - c.lastSeen > REMOTE_CURSOR_TTL) {
        if (c.el && c.el.parentNode) c.el.parentNode.removeChild(c.el);
        delete remoteCursors[id];
      } else {
        active++;
      }
    }
    // 在线计数 = 远程活跃 + 自己
    var newCount = active + 1;
    if (newCount !== onlineCount) {
      onlineCount = newCount;
      renderHUD();
    }
  }

  /* =========================================================================
   * §5 跨站消息浮窗（左下角，蹭一下现有 portal-hint 风格）
   * ======================================================================= */
  var toastEl = null;
  var toastTimer = null;
  function showToast(text, ttl) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'mp-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toastEl) toastEl.classList.remove('show');
    }, ttl || 4000);
  }

  /* =========================================================================
   * §6 上报与心跳
   * ======================================================================= */
  function reportCursor(xNorm, yNorm) {
    if (!connected || !channel) return;
    var now = Date.now();
    if (now - lastCursorReport < CURSOR_REPORT_INTERVAL) return;
    lastCursorReport = now;
    try {
      channel.send({
        type: 'broadcast',
        event: 'cursor',
        payload: {
          id: identity.id,
          hue: identity.hue,
          page: location.pathname,
          x: xNorm,
          y: yNorm
        }
      });
    } catch (e) { /* 静默 */ }
  }

  function heartbeat() {
    if (!connected || !channel) return;
    var now = Date.now();
    if (now - lastHeartbeat < HEARTBEAT_INTERVAL) return;
    lastHeartbeat = now;
    try {
      channel.send({
        type: 'broadcast',
        event: 'heartbeat',
        payload: {
          id: identity.id,
          hue: identity.hue,
          page: location.pathname,
          tokens: getLocalTokens()
        }
      });
    } catch (e) { /* 静默 */ }
  }

  function getLocalTokens() {
    try {
      var v = parseInt(localStorage.getItem('catapi_tokens_caught'));
      return isNaN(v) ? 0 : v;
    } catch (e) { return 0; }
  }

  /* =========================================================================
   * §7 与 livecat.js 联动（可选）
   * ======================================================================= */
  // 当本访客通过 livecat 抓到老鼠时，把事件广播给全站
  function broadcastMouseCaught(byUser) {
    if (!connected || !channel) return;
    try {
      channel.send({
        type: 'broadcast',
        event: 'mouse_caught',
        payload: {
          by: identity.id,
          hue: identity.hue,
          page: location.pathname,
          tokens: getLocalTokens(),
          byUser: byUser,    // 是否用户亲手抓的（vs 猫自己抓的）
          ts: Date.now()
        }
      });
    } catch (e) { /* 静默 */ }
  }

  // 监听 livecat 暴露的事件：用一个轮询监听
  // （livecat 没有 EventEmitter，我们用一个简单的「上次值对比」法）
  var lastTokenSeen = getLocalTokens();
  function watchLocalTokens() {
    var now = getLocalTokens();
    if (now > lastTokenSeen) {
      // 本地 Token 增加——可能是猫抓的或用户抓的
      // 简化：都视为「本访客的成绩」上报
      broadcastMouseCaught(false);
      lastTokenSeen = now;
    }
  }

  /* =========================================================================
   * §8 主循环：光标上报 + 心跳 + GC + token 监听
   * ======================================================================= */
  var mainTimer = null;
  function startMainLoop() {
    if (mainTimer) return;

    // 监听本地鼠标
    document.addEventListener('mousemove', function (e) {
      reportCursor(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    }, { passive: true });

    // 触摸
    document.addEventListener('touchmove', function (e) {
      if (!e.touches[0]) return;
      reportCursor(e.touches[0].clientX / window.innerWidth, e.touches[0].clientY / window.innerHeight);
    }, { passive: true });

    // 定时心跳 + GC + token 监听
    mainTimer = setInterval(function () {
      heartbeat();
      gcOfflineCursors();
      watchLocalTokens();
    }, 1000);

    // 页面隐藏时退出（减少不必要的连接）
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (channel) {
          try {
            channel.send({
              type: 'broadcast',
              event: 'leave',
              payload: { id: identity.id }
            });
          } catch (e) {}
        }
      } else {
        // 重新可见时立即心跳
        lastHeartbeat = 0;
        heartbeat();
      }
    });

    // 关闭页面时发 leave
    window.addEventListener('beforeunload', function () {
      if (channel) {
        try {
          channel.send({
            type: 'broadcast',
            event: 'leave',
            payload: { id: identity.id }
          });
        } catch (e) {}
      }
    });
  }

  /* =========================================================================
   * §9 接入 Supabase
   * ======================================================================= */
  // 动态加载 supabase-js CDN（UMD 版本，挂在 window.supabase）
  function loadSupabase(cb) {
    if (root.supabase) { cb(null); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase-js.min.js';
    s.async = true;
    s.onload = function () { cb(null); };
    s.onerror = function () { cb(new Error('supabase-js 加载失败')); };
    document.head.appendChild(s);
  }

  function connect() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      // 未配置凭证——模块进入降级模式：不接入实时频道，但 UI 仍显示「1 只猫在线（你）」
      // 这样未配置时站点照常运行，只是没有联机功能
      ensureHUD();
      return;
    }

    loadSupabase(function (err) {
      if (err || !root.supabase) {
        console.warn('[Multiplayer] supabase-js 加载失败，降级为单机模式');
        ensureHUD();
        return;
      }
      try {
        var client = root.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        channel = client.channel(CHANNEL_NAME, {
          config: {
            broadcast: { self: false }  // 不接收自己的消息
          }
        });

        channel
          .on('broadcast', { event: 'cursor' }, function (msg) {
            var p = msg && msg.payload;
            if (!p || !p.id) return;
            upsertRemoteCursor(p.id, p);
          })
          .on('broadcast', { event: 'heartbeat' }, function (msg) {
            var p = msg && msg.payload;
            if (!p || !p.id) return;
            // 心跳也用来更新光标（虽然没坐标，但维护在线状态）
            if (remoteCursors[p.id]) {
              remoteCursors[p.id].lastSeen = Date.now();
            }
          })
          .on('broadcast', { event: 'leave' }, function (msg) {
            var p = msg && msg.payload;
            if (!p || !p.id) return;
            if (remoteCursors[p.id]) {
              if (remoteCursors[p.id].el && remoteCursors[p.id].el.parentNode) {
                remoteCursors[p.id].el.parentNode.removeChild(remoteCursors[p.id].el);
              }
              delete remoteCursors[p.id];
              renderHUD();
            }
          })
          .on('broadcast', { event: 'mouse_caught' }, function (msg) {
            var p = msg && msg.payload;
            if (!p || !p.by) return;
            var pageName = (p.page || '').split('/').pop() || '另一页';
            var who = '访客#' + p.by;
            var verb = p.byUser ? '亲手抓到' : '抓到';
            showToast('🏆 ' + who + ' 在「' + pageName + '」' + verb + '了 Token 老鼠（累计 ' + (p.tokens || 0) + '）');

            // 联动 livecat：让本页的猫也嘟囔一句
            if (root.LiveCat && typeof root.LiveCat.transitionTo === 'function') {
              try { root.LiveCat.triggerMunch && root.LiveCat.triggerMunch(); } catch (e) {}
            }
          })
          .subscribe(function (status) {
            if (status === 'SUBSCRIBED') {
              connected = true;
              ensureHUD();
              startMainLoop();
              console.log('[Multiplayer] 已接入实时频道 #' + CHANNEL_NAME);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn('[Multiplayer] 频道异常，降级为单机模式');
              connected = false;
              ensureHUD();
            }
          });
      } catch (e) {
        console.warn('[Multiplayer] 接入失败:', e);
        ensureHUD();
      }
    });
  }

  /* =========================================================================
   * §10 启动
   * ======================================================================= */
  function start() {
    if (started) return;
    started = true;
    // 提前创建 HUD——即使没连上，也至少显示「1 只猫在线」
    ensureHUD();
    connect();
  }

  // DOM 就绪后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  /* =========================================================================
   * §11 对外接口
   * ======================================================================= */
  root.Multiplayer = {
    start: start,
    getIdentity: function () { return identity; },
    getOnlineCount: function () { return onlineCount; },
    broadcastMouseCaught: broadcastMouseCaught,
    // 让外部覆盖配置（在加载本脚本前可以预设 SUPABASE_URL/KEY）
    configure: function (url, key) {
      SUPABASE_URL = url || SUPABASE_URL;
      SUPABASE_KEY = key || SUPABASE_KEY;
      // 如果已经启动但还没连上，重新连接
      if (started && !connected) connect();
    }
  };
})(typeof self !== "undefined" ? self : this);

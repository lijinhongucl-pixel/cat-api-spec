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
  var NAME_KEY = 'catapi_visitor_name';  // 用户自定义名字（可选，比如 GitHub 用户名）

  function loadIdentity() {
    var id, hue, name;
    try {
      id = localStorage.getItem(ID_KEY);
      hue = parseInt(localStorage.getItem(HUE_KEY));
      name = localStorage.getItem(NAME_KEY);
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
    return { id: id, hue: hue, name: name || null };
  }

  function setCustomName(name) {
    name = (name || '').trim().slice(0, 32);   // 限制 32 字符
    try {
      if (name) {
        localStorage.setItem(NAME_KEY, name);
        identity.name = name;
      } else {
        localStorage.removeItem(NAME_KEY);
        identity.name = null;
      }
    } catch (e) {}
    renderHUD();
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
      '<button class="mp-close-btn mp-hud-close" type="button" aria-label="关闭在线计数" title="关闭（刷新恢复）">×</button>' +
      '<div class="mp-hud-online">' +
        '<span class="mp-dot"></span>' +
        '<span class="mp-count">' + onlineCount + '</span>' +
        '<span class="mp-label">只猫在线</span>' +
      '</div>';
    // 自己的访客徽章——可点击编辑名字
    var displayName = identity.name || ('访客#' + identity.id);
    html +=
      '<div class="mp-hud-self" style="--hue:' + identity.hue + '">' +
        '<button class="mp-badge mp-badge-editable" type="button" ' +
                'aria-label="点击修改名字" title="点击修改名字（比如 GitHub 用户名）">' +
          escapeHtml(displayName) +
        '</button>' +
      '</div>';
    hudEl.innerHTML = html;
    // 绑定关闭按钮
    var closeBtn = hudEl.querySelector('.mp-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        if (hudEl) hudEl.classList.add('mp-hidden');
      });
    }
    // 绑定徽章点击编辑
    var badgeBtn = hudEl.querySelector('.mp-badge-editable');
    if (badgeBtn) {
      badgeBtn.addEventListener('click', promptForName);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function promptForName() {
    // 自定义弹窗：不用浏览器 prompt()，做一个轻量浮层
    var existing = document.getElementById('mp-name-dialog');
    if (existing) existing.remove();

    var dialog = document.createElement('div');
    dialog.id = 'mp-name-dialog';
    dialog.className = 'mp-name-dialog';
    var current = identity.name || '';
    dialog.innerHTML =
      '<div class="mp-name-dialog-card">' +
        '<div class="mp-name-dialog-title">给自己起个名字</div>' +
        '<input type="text" class="mp-name-input" maxlength="32" ' +
               'placeholder="比如 GitHub 用户名" value="' + escapeHtml(current) + '">' +
        '<div class="mp-name-dialog-hint">最多 32 字符；留空恢复默认「访客#' + identity.id + '」</div>' +
        '<div class="mp-name-dialog-actions">' +
          '<button type="button" class="mp-name-cancel">取消</button>' +
          '<button type="button" class="mp-name-save">保存</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);
    var input = dialog.querySelector('.mp-name-input');
    if (input) { input.focus(); input.select(); }
    function close() { if (dialog.parentNode) dialog.remove(); }
    dialog.querySelector('.mp-name-cancel').addEventListener('click', close);
    dialog.querySelector('.mp-name-save').addEventListener('click', function () {
      var val = input ? input.value : '';
      setCustomName(val);
      close();
    });
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { setCustomName(input.value); close(); }
        if (e.key === 'Escape') { close(); }
      });
    }
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) close();
    });
  }

  /* =========================================================================
   * §4 UI：远程光标幽灵
   * ======================================================================= */
  function createCursorEl(visitorId, hue, name) {
    var el = document.createElement('div');
    el.className = 'mp-remote-cursor';
    el.style.setProperty('--hue', hue);
    var label = name || ('访客#' + visitorId);
    el.innerHTML =
      '<svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true">' +
        '<path d="M2 2 L 16 10 L 10 11 L 13 18 L 11 19 L 8 12 L 2 16 Z" ' +
              'fill="hsl(' + hue + ',80%,55%)" stroke="white" stroke-width="1"/>' +
      '</svg>' +
      '<span class="mp-remote-label">' + escapeHtml(label) + '</span>';
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
      var el = createCursorEl(visitorId, payload.hue, payload.name);
      existing = remoteCursors[visitorId] = {
        hue: payload.hue,
        name: payload.name || null,
        el: el,
        lastSeen: Date.now()
      };
    }
    existing.lastSeen = Date.now();
    // 如果收到新名字，更新标签
    if (payload.name && payload.name !== existing.name) {
      existing.name = payload.name;
      var labelEl = existing.el.querySelector('.mp-remote-label');
      if (labelEl) labelEl.textContent = payload.name;
    }
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
          name: identity.name,
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
          name: identity.name,
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
          name: identity.name,
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
      gcOfflineCats();
      gcHerdCursors();
      watchLocalTokens();
      reportCatState();      // §12 多猫同屏
      reportHerdCursor();    // §14 协作围捕
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
          channel.send({
            type: 'broadcast',
            event: 'cat_leave',
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
            }
            // 同步移除远程猫
            removeRemoteCat(p.id);
            // 同步移除围捕光标
            if (herdCursors[p.id]) delete herdCursors[p.id];
            renderHUD();
          })
          .on('broadcast', { event: 'mouse_caught' }, function (msg) {
            var p = msg && msg.payload;
            if (!p || !p.by) return;
            var pageName = (p.page || '').split('/').pop() || '另一页';
            var who = p.name || ('访客#' + p.by);
            var verb = p.byUser ? '亲手抓到' : '抓到';
            showToast('🏆 ' + escapeHtml(who) + ' 在「' + pageName + '」' + verb + '了 Token 老鼠（累计 ' + (p.tokens || 0) + '）');

            // 联动 livecat：让本页的猫也嘟囔一句
            if (root.LiveCat && typeof root.LiveCat.transitionTo === 'function') {
              try { root.LiveCat.triggerMunch && root.LiveCat.triggerMunch(); } catch (e) {}
            }
          })
          // §12 多猫同屏：别人的猫上报自己位置 / 状态
          .on('broadcast', { event: 'cat_state' }, function (msg) {
            var p = msg && msg.payload;
            if (!p || !p.id) return;
            handleRemoteCatState(p);
          })
          .on('broadcast', { event: 'cat_leave' }, function (msg) {
            var p = msg && msg.payload;
            if (!p || !p.id) return;
            removeRemoteCat(p.id);
          })
          // §13 今日猫碗：有人投喂 / 进度同步
          .on('broadcast', { event: 'bowl_feed' }, function (msg) {
            var p = msg && msg.payload;
            if (!p) return;
            handleBowlFeed(p);
          })
          .on('broadcast', { event: 'bowl_state' }, function (msg) {
            var p = msg && msg.payload;
            if (!p || typeof p.level !== 'number') return;
            setBowlLevel(p.level, p.fromBroadcast);
          })
          // §14 协作围捕：别人的光标位置用于驱赶老鼠 AI
          .on('broadcast', { event: 'herd_cursor' }, function (msg) {
            var p = msg && msg.payload;
            if (!p || !p.id) return;
            herdCursors[p.id] = { x: p.x, y: p.y, ts: Date.now() };
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
   * §12 多猫同屏——每个访客一只自己的猫，互相能看到
   * ======================================================================= */
  // 复用现有 LiveCat 的 SVG 角色做"远程猫"——同一个角色，但用 CSS hue-rotate 滤镜染色
  // 这样做的好处：不需要重新画一只猫，只需要把现有猫节点复制 + 染色
  // 远程猫用更小、更透明的版本，避免抢戏
  var remoteCats = {};   // { [id]: { el, hue, x, y, state, lastSeen } }
  var lastCatReport = 0;
  var CAT_REPORT_INTERVAL = 500;  // 上报间隔：500ms（不像光标那么频繁，避免带宽爆炸）

  function createRemoteCatEl(visitorId, hue, name) {
    var el = document.createElement('div');
    el.className = 'mp-remote-cat';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--hue', hue);
    var label = name || ('访客#' + visitorId);
    // 复用本站已加载的 LiveCat SVG——如果没有，用一个简化版
    var svg = '';
    if (root.LiveCat && root.LiveCat.STATES) {
      // 借用本页 livecat.js 的猫形状（通过临时拷贝 DOM）
      var localCat = document.querySelector('.lc2-cat');
      if (localCat) {
        svg = localCat.innerHTML;
      }
    }
    if (!svg) {
      // fallback：一个简化的小猫 SVG
      svg =
        '<svg viewBox="0 0 80 56" xmlns="http://www.w3.org/2000/svg">' +
          '<ellipse cx="40" cy="36" rx="20" ry="13" fill="hsl(' + hue + ',60%,55%)" stroke="hsl(' + hue + ',70%,30%)" stroke-width="1"/>' +
          '<circle cx="40" cy="22" r="12" fill="hsl(' + hue + ',65%,60%)" stroke="hsl(' + hue + ',70%,30%)" stroke-width="1"/>' +
          '<polygon points="32,15 30,8 35,12" fill="hsl(' + hue + ',70%,40%)"/>' +
          '<polygon points="48,15 50,8 45,12" fill="hsl(' + hue + ',70%,40%)"/>' +
          '<circle cx="36" cy="22" r="1.5" fill="#222"/>' +
          '<circle cx="44" cy="22" r="1.5" fill="#222"/>' +
          '<path d="M 38 26 Q 40 28 42 26" fill="none" stroke="#222" stroke-width="0.8"/>' +
          '<path d="M 60 38 Q 72 34 70 28" fill="none" stroke="hsl(' + hue + ',70%,30%)" stroke-width="2"/>' +
        '</svg>';
    }
    el.innerHTML =
      '<div class="mp-remote-cat-body">' + svg + '</div>' +
      '<span class="mp-remote-cat-label" style="--hue:' + hue + '">' + escapeHtml(label) + '</span>';
    document.body.appendChild(el);
    return el;
  }

  function handleRemoteCatState(payload) {
    var visitorId = payload.id;
    if (visitorId === identity.id) return;
    var existing = remoteCats[visitorId];
    if (!existing) {
      var el = createRemoteCatEl(visitorId, payload.hue || 200, payload.name);
      existing = remoteCats[visitorId] = {
        el: el,
        hue: payload.hue || 200,
        name: payload.name || null,
        x: payload.x, y: payload.y,
        state: payload.state,
        lastSeen: Date.now()
      };
    } else if (payload.name && payload.name !== existing.name) {
      // 收到新名字——更新远程猫标签
      existing.name = payload.name;
      var catLabel = existing.el.querySelector('.mp-remote-cat-label');
      if (catLabel) catLabel.textContent = payload.name;
    }
    existing.lastSeen = Date.now();
    existing.x = payload.x;
    existing.y = payload.y;
    existing.state = payload.state;
    // 归一化坐标 → 像素
    var px = (payload.x || 0) * window.innerWidth;
    var py = (payload.y || 0) * window.innerHeight;
    existing.el.style.transform = 'translate(' + px + 'px,' + py + 'px)';
    existing.el.setAttribute('data-cat-state', payload.state || 'idle');
    existing.el.classList.toggle('mp-remote-cat-sleeping', payload.state === 'sleep');
  }

  function removeRemoteCat(visitorId) {
    var c = remoteCats[visitorId];
    if (!c) return;
    if (c.el && c.el.parentNode) c.el.parentNode.removeChild(c.el);
    delete remoteCats[visitorId];
  }

  function gcOfflineCats() {
    var now = Date.now();
    for (var id in remoteCats) {
      if (!remoteCats.hasOwnProperty(id)) continue;
      if (now - remoteCats[id].lastSeen > REMOTE_CURSOR_TTL) {
        removeRemoteCat(id);
      }
    }
  }

  // 上报本访客的猫状态（如果有 livecat）
  function reportCatState() {
    if (!connected || !channel) return;
    if (!root.LiveCat) return;
    var now = Date.now();
    if (now - lastCatReport < CAT_REPORT_INTERVAL) return;
    lastCatReport = now;
    // 通过 livecat 的接口拿当前位置
    var state = root.LiveCat.getState ? root.LiveCat.getState() : 'idle';
    // 归一化坐标——livecat 没暴露位置 getter，我们从 DOM 读取
    var localCat = document.querySelector('.lc2-cat');
    var nx = 0.5, ny = 0.5;
    if (localCat) {
      var r = localCat.getBoundingClientRect();
      nx = (r.left + r.width / 2) / window.innerWidth;
      ny = (r.top + r.height / 2) / window.innerHeight;
    }
    try {
      channel.send({
        type: 'broadcast',
        event: 'cat_state',
        payload: {
          id: identity.id,
          name: identity.name,
          hue: identity.hue,
          page: location.pathname,
          state: state,
          x: nx, y: ny
        }
      });
    } catch (e) {}
  }

  /* =========================================================================
   * §13 今日猫碗——全站共同填满进度条，满了触发限定事件
   * ======================================================================= */
  // 规则：
  //  - 任何访客点「投喂」按钮 → 本地进度 +N，广播给所有人
  //  - 全站进度同步——通过广播的累计效应，所有人进度近似一致
  //  - 满 100% → 触发全站「金色猫碗」事件（站点 logo 变金 + 庆祝粒子 + 所有人听到）
  //  - 满 1000% → 解锁限定徽章一周
  //  - 每日凌晨 4 点自动重置（猫饭点）
  var BOWL_KEY = 'catapi_bowl_state';
  var BOWL_MAX = 100;      // 满 100 触发第一档
  var BOWL_LEGENDARY = 1000;  // 传说档
  var BOWL_RESET_HOUR = 4;   // 凌晨 4 点重置

  var bowlState = { level: 0, totalFed: 0, lastReset: 0, legendaryUnlocked: false };
  var bowlWidgetEl = null;

  function loadBowlState() {
    try {
      var raw = localStorage.getItem(BOWL_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed.level === 'number') {
          bowlState = parsed;
        }
      }
    } catch (e) {}
    // 检查跨日重置
    var today4am = new Date();
    today4am.setHours(BOWL_RESET_HOUR, 0, 0, 0);
    var today4amTs = today4am.getTime();
    if (bowlState.lastReset < today4amTs && Date.now() > today4amTs) {
      // 过了今天的凌晨 4 点，重置
      bowlState.level = 0;
      bowlState.lastReset = Date.now();
      saveBowlState();
    } else if (!bowlState.lastReset) {
      bowlState.lastReset = Date.now();
    }
  }

  function saveBowlState() {
    try { localStorage.setItem(BOWL_KEY, JSON.stringify(bowlState)); } catch (e) {}
  }

  function setBowlLevel(level, fromBroadcast) {
    var wasFull = bowlState.level >= BOWL_MAX;
    bowlState.level = Math.max(0, level);
    if (fromBroadcast) saveBowlState();
    renderBowlWidget();
    var isFull = bowlState.level >= BOWL_MAX;
    if (!wasFull && isFull && !fromBroadcast) {
      // 本地刚触达满——广播给其他人让他们也庆祝
      triggerBowlCelebration();
    }
    if (bowlState.level >= BOWL_LEGENDARY && !bowlState.legendaryUnlocked) {
      bowlState.legendaryUnlocked = true;
      saveBowlState();
      showToast('🌟 全站解锁传说徽章：金色猫碗！站点 logo 变金一周', 8000);
    }
  }

  function handleBowlFeed(payload) {
    // 收到别人的投喂：累加到本地进度
    if (typeof payload.delta !== 'number') return;
    bowlState.totalFed += payload.delta;
    setBowlLevel(bowlState.level + payload.delta, true);
    // 不弹 toast——避免每次投喂都刷屏；只在进度条上做视觉反馈
  }

  function feedBowl(delta) {
    delta = delta || 1;
    bowlState.totalFed += delta;
    setBowlLevel(bowlState.level + delta, false);
    saveBowlState();
    if (connected && channel) {
      try {
        channel.send({
          type: 'broadcast',
          event: 'bowl_feed',
          payload: { by: identity.id, name: identity.name, delta: delta, ts: Date.now() }
        });
      } catch (e) {}
    }
  }

  function triggerBowlCelebration() {
    showToast('🎉 全站今日猫碗已填满！所有猫进入吃饱喝足模式', 6000);
    // 撒金币粒子
    for (var i = 0; i < 16; i++) {
      setTimeout(spawnBowlParticle, i * 80);
    }
    // 广播给全站
    if (connected && channel) {
      try {
        channel.send({
          type: 'broadcast',
          event: 'bowl_state',
          payload: { level: bowlState.level, fromBroadcast: true, ts: Date.now() }
        });
      } catch (e) {}
    }
  }

  function spawnBowlParticle() {
    var p = document.createElement('div');
    p.className = 'mp-bowl-particle';
    p.style.left = (Math.random() * window.innerWidth) + 'px';
    p.style.top = '-20px';
    p.style.setProperty('--drift', ((Math.random() - 0.5) * 60) + 'px');
    p.style.setProperty('--rot', (360 + Math.random() * 720) + 'deg');
    document.body.appendChild(p);
    setTimeout(function () { if (p.parentNode) p.remove(); }, 3500);
  }

  function ensureBowlWidget() {
    if (bowlWidgetEl) return bowlWidgetEl;
    bowlWidgetEl = document.createElement('div');
    bowlWidgetEl.className = 'mp-bowl-widget';
    bowlWidgetEl.innerHTML =
      '<button class="mp-close-btn" type="button" aria-label="关闭猫碗" title="关闭（刷新恢复）">×</button>' +
      '<div class="mp-bowl-header">' +
        '<span class="mp-bowl-icon">🥣</span>' +
        '<span class="mp-bowl-title">今日猫碗</span>' +
        '<button class="mp-bowl-feed-btn" type="button" aria-label="投喂">投喂 +1</button>' +
      '</div>' +
      '<div class="mp-bowl-progress">' +
        '<div class="mp-bowl-progress-fill"></div>' +
        '<span class="mp-bowl-progress-label"></span>' +
      '</div>' +
      '<div class="mp-bowl-stats">' +
        '<span class="mp-bowl-total">累计 <b>0</b></span>' +
      '</div>';
    document.body.appendChild(bowlWidgetEl);
    // 绑定投喂按钮
    var btn = bowlWidgetEl.querySelector('.mp-bowl-feed-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        feedBowl(1 + Math.floor(Math.random() * 3));   // 每次投喂 +1~3
      });
    }
    // 关闭按钮：本会话隐藏，刷新后恢复（不写 localStorage，让用户每次访问都能重新看到）
    var closeBtn = bowlWidgetEl.querySelector('.mp-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        if (bowlWidgetEl) bowlWidgetEl.classList.add('mp-hidden');
      });
    }
    return bowlWidgetEl;
  }

  function renderBowlWidget() {
    if (!bowlWidgetEl) return;
    var fill = bowlWidgetEl.querySelector('.mp-bowl-progress-fill');
    var label = bowlWidgetEl.querySelector('.mp-bowl-progress-label');
    var total = bowlWidgetEl.querySelector('.mp-bowl-total b');
    if (fill) {
      var pct = Math.min(100, (bowlState.level / BOWL_MAX) * 100);
      fill.style.width = pct + '%';
    }
    if (label) {
      label.textContent = Math.floor(bowlState.level) + ' / ' + BOWL_MAX;
    }
    if (total) {
      total.textContent = bowlState.totalFed || 0;
    }
    // 满了之后给按钮加个特效
    if (bowlState.level >= BOWL_MAX) {
      bowlWidgetEl.classList.add('mp-bowl-full');
    } else {
      bowlWidgetEl.classList.remove('mp-bowl-full');
    }
  }

  /* =========================================================================
   * §14 协作围捕——多人光标驱赶老鼠 AI
   * ======================================================================= */
  // 把所有在线访客的光标位置广播出来（共享给一个虚拟的"老鼠 AI"）
  // 这个老鼠 AI 不在服务端——直接在客户端跑：根据所有光标位置选择逃跑方向
  // 所以需要每个客户端都收集 herd 光标——通过 broadcast 实时同步
  // 一旦全站有一只共享老鼠出没，它会"避开所有在线玩家的光标"，必须协作围堵
  var herdCursors = {};  // { [id]: { x, y, ts } }
  var HERD_CURSOR_INTERVAL = 120;  // 120ms 上报一次围捕光标（比普通光标稍快）
  var lastHerdReport = 0;

  function reportHerdCursor() {
    if (!connected || !channel) return;
    var now = Date.now();
    if (now - lastHerdReport < HERD_CURSOR_INTERVAL) return;
    lastHerdReport = now;
    try {
      channel.send({
        type: 'broadcast',
        event: 'herd_cursor',
        payload: {
          id: identity.id,
          x: lastMouseXNorm,
          y: lastMouseYNorm,
          ts: now
        }
      });
    } catch (e) {}
  }

  // 缓存本访客最近的鼠标位置（归一化）
  var lastMouseXNorm = 0.5, lastMouseYNorm = 0.5;
  document.addEventListener('mousemove', function (e) {
    lastMouseXNorm = e.clientX / window.innerWidth;
    lastMouseYNorm = e.clientY / window.innerHeight;
  }, { passive: true });

  // 给外部用：拿到所有在线玩家的光标位置（像素坐标）
  // 这是给 livecat.js 或其他模块的接口——如果某只老鼠想躲所有人，调用这个
  function getHerdCursors() {
    var result = [];
    var now = Date.now();
    for (var id in herdCursors) {
      if (!herdCursors.hasOwnProperty(id)) continue;
      var c = herdCursors[id];
      if (now - c.ts > REMOTE_CURSOR_TTL) continue;
      result.push({
        id: id,
        x: c.x * window.innerWidth,
        y: c.y * window.innerHeight
      });
    }
    // 加上自己的光标
    result.push({
      id: identity.id,
      x: lastMouseXNorm * window.innerWidth,
      y: lastMouseYNorm * window.innerHeight
    });
    return result;
  }

  // 定时清理过期的围捕光标
  function gcHerdCursors() {
    var now = Date.now();
    for (var id in herdCursors) {
      if (!herdCursors.hasOwnProperty(id)) continue;
      if (now - herdCursors[id].ts > REMOTE_CURSOR_TTL) {
        delete herdCursors[id];
      }
    }
  }

  /* =========================================================================
   * §10 启动
   * ======================================================================= */
  function start() {
    if (started) return;
    started = true;
    // 提前创建 UI——即使没连上，也至少显示「1 只猫在线」+ 今日猫碗（单机模式也能投喂）
    ensureHUD();
    loadBowlState();
    ensureBowlWidget();
    renderBowlWidget();
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
    // §12 多猫同屏
    getRemoteCats: function () { return remoteCats; },
    // §13 今日猫碗
    feedBowl: feedBowl,
    getBowlLevel: function () { return bowlState.level; },
    getBowlTotal: function () { return bowlState.totalFed; },
    // §14 协作围捕
    getHerdCursors: getHerdCursors,
    // 让外部覆盖配置（在加载本脚本前可以预设 SUPABASE_URL/KEY）
    configure: function (url, key) {
      SUPABASE_URL = url || SUPABASE_URL;
      SUPABASE_KEY = key || SUPABASE_KEY;
      // 如果已经启动但还没连上，重新连接
      if (started && !connected) connect();
    }
  };
})(typeof self !== "undefined" ? self : this);

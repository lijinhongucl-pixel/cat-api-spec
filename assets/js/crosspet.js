/*!
 * CrossPet Protocol v1.0 — 跨站宠物串门协议
 * ---------------------------------------------------------------------------
 * 设计哲学：宠物不属于自己的站点——属于整片互联网。
 *
 * 任何加载本脚本的站点都可以：
 *  1. 把自己的宠物「送出去」——宠物走到屏幕边缘消失，触发 send_event
 *  2. 收到其他站点送来的宠物——屏幕边缘走出一只来访宠物
 *  3. 本站宠物遇见来访宠物时触发互动（互闻 / 对峙 / 一起睡觉）
 *
 * 协议设计：
 *  - 所有事件通过 Supabase Realtime 公共频道 `crosspet-global` 广播
 *  - 不需要认证——任何站点都能加入
 *  - 每个站点声明自己的「宠物类型」（cat / dog / 仓鼠 / ...）和 SVG
 *  - 收到 `pet_arrive` 事件时，用事件里的 SVG 渲染来访宠物
 *
 * 单站演示模式（未配置 Supabase）：
 *  - 每 60-180 秒自动模拟一次「本站宠物穿越出去」+「一只随机宠物穿越过来」
 *  - 让访客即使没连上实时网络也能看到效果
 *
 * 接入指南（给其他站点）：
 *  <script src="https://你的站点/assets/js/crosspet.js"></script>
 *  <script>
 *    CrossPet.init({
 *      petType: 'dog',
 *      petName: '马文的狗',
 *      petSVG: '<svg>...</svg>',  // 自己宠物的 SVG
 *      onPetLeave: function(direction) { /* 自己的宠物走出屏幕时调用 *\/ },
 *      onPetArrive: function(visitor) { /* 收到别站宠物时调用 *\/ },
 *      onPetMeet: function(localPet, visitor) { /* 两只宠物相遇时调用 *\/ }
 *    });
 *  </script>
 *
 * 想让宠物自动走出屏幕触发穿越：调用
 *  CrossPet.depart('left' | 'right');
 * ---------------------------------------------------------------------------
 */
(function (root) {
  "use strict";
  if (root.CrossPet) return;

  /* =========================================================================
   * §0 配置
   * ======================================================================= */
  var SUPABASE_URL = '';
  var SUPABASE_KEY = '';
  var CHANNEL_NAME = 'crosspet-global';
  var PROTOCOL_VERSION = '1.0';

  // 单站演示模式的计时器
  var DEMO_DEPART_INTERVAL_MIN = 60000;   // 60 秒
  var DEMO_DEPART_INTERVAL_MAX = 180000;  // 180 秒
  var DEMO_ARRIVE_DELAY = 8000;           // 离开后 8 秒，模拟来访

  // 来访宠物存活时间
  var VISITOR_TTL = 30000;  // 30 秒后自动离开

  // 内置信物 SVG 库（防止没声明 SVG 的站点发来事件时无内容可渲染）
  var FALLBACK_SVGS = {
    dog: '<svg viewBox="0 0 80 56" xmlns="http://www.w3.org/2000/svg">' +
           '<ellipse cx="40" cy="38" rx="22" ry="14" fill="#d4a574" stroke="#8b5a2b" stroke-width="1.5"/>' +
           '<circle cx="40" cy="22" r="13" fill="#e0b585" stroke="#8b5a2b" stroke-width="1.5"/>' +
           '<ellipse cx="29" cy="14" rx="5" ry="8" fill="#c49565" stroke="#8b5a2b" stroke-width="1" transform="rotate(-20 29 14)"/>' +
           '<ellipse cx="51" cy="14" rx="5" ry="8" fill="#c49565" stroke="#8b5a2b" stroke-width="1" transform="rotate(20 51 14)"/>' +
           '<circle cx="34" cy="22" r="1.6" fill="#222"/>' +
           '<circle cx="46" cy="22" r="1.6" fill="#222"/>' +
           '<ellipse cx="40" cy="28" rx="2.5" ry="1.8" fill="#222"/>' +
           '<path d="M 37 30 Q 40 33 43 30" fill="none" stroke="#222" stroke-width="0.8"/>' +
           '<path d="M 62 36 Q 72 32 70 26" fill="none" stroke="#8b5a2b" stroke-width="2"/>' +
         '</svg>',
    cat: '<svg viewBox="0 0 80 56" xmlns="http://www.w3.org/2000/svg">' +
           '<ellipse cx="40" cy="38" rx="20" ry="13" fill="#5a5a5a" stroke="#222" stroke-width="1"/>' +
           '<circle cx="40" cy="22" r="12" fill="#6a6a6a" stroke="#222" stroke-width="1"/>' +
           '<polygon points="32,14 30,6 36,12" fill="#5a5a5a" stroke="#222" stroke-width="0.8"/>' +
           '<polygon points="48,14 50,6 44,12" fill="#5a5a5a" stroke="#222" stroke-width="0.8"/>' +
           '<circle cx="36" cy="22" r="1.4" fill="#f5c542"/>' +
           '<circle cx="44" cy="22" r="1.4" fill="#f5c542"/>' +
           '<path d="M 38 26 L 40 28 L 42 26" fill="#222"/>' +
         '</svg>',
    hamster: '<svg viewBox="0 0 80 56" xmlns="http://www.w3.org/2000/svg">' +
           '<ellipse cx="40" cy="38" rx="20" ry="16" fill="#e8c39e" stroke="#a07853" stroke-width="1.5"/>' +
           '<circle cx="29" cy="20" r="4" fill="#d4a574" stroke="#a07853" stroke-width="1"/>' +
           '<circle cx="51" cy="20" r="4" fill="#d4a574" stroke="#a07853" stroke-width="1"/>' +
           '<circle cx="33" cy="32" r="1.5" fill="#222"/>' +
           '<circle cx="47" cy="32" r="1.5" fill="#222"/>' +
           '<ellipse cx="40" cy="38" rx="2" ry="1.5" fill="#a07853"/>' +
         '</svg>'
  };

  /* =========================================================================
   * §1 状态
   * ======================================================================= */
  var config = null;
  var channel = null;
  var connected = false;
  var started = false;
  var siteId = Math.random().toString(36).slice(2, 10);  // 本会话的随机站点 ID

  // 当前来访的宠物
  var currentVisitor = null;  // { el, petType, petName, fromSite, svg, x, y, arriveTs }

  // 演示模式计时器
  var demoDepartTimer = null;

  /* =========================================================================
   * §2 初始化（对外入口）
   * ======================================================================= */
  function init(options) {
    if (started) return;
    started = true;
    config = options || {};
    config.petType = config.petType || 'cat';
    config.petName = config.petName || '本站宠物';
    config.petSVG = config.petSVG || FALLBACK_SVGS[config.petType] || FALLBACK_SVGS.cat;

    console.log('[CrossPet] init as', config.petType, '(' + config.petName + ')');

    // 启动单站演示模式（即使没连上 Supabase 也有效果）
    startDemoMode();
    // 尝试接入实时频道
    connect();
  }

  /* =========================================================================
   * §3 把自己的宠物送出去
   * ======================================================================= */
  // 触发「本站宠物穿越出去」
  // direction: 'left' / 'right' / 'top' / 'bottom'（默认随机）
  function depart(direction) {
    direction = direction || (Math.random() < 0.5 ? 'left' : 'right');

    // 触发本站回调（让 livecat.js 把猫移到屏幕边缘）
    if (typeof config.onPetLeave === 'function') {
      try { config.onPetLeave(direction); } catch (e) {}
    }

    // 广播给其他站点
    broadcast('pet_depart', {
      petType: config.petType,
      petName: config.petName,
      petSVG: config.petSVG,
      fromSite: location.hostname + location.pathname,
      fromSiteId: siteId,
      direction: direction,
      ts: Date.now()
    });

    console.log('[CrossPet] departed:', config.petName, '→', direction);
  }

  /* =========================================================================
   * §4 收到其他站点的宠物来访
   * ======================================================================= */
  function handleArrive(payload) {
    if (!payload || !payload.petType) return;
    // 不接收自己发出的（避免回环）
    if (payload.fromSiteId === siteId) return;
    // 如果已有来访宠物，先让它离开
    if (currentVisitor) {
      dismissVisitor();
    }

    var svg = payload.petSVG || FALLBACK_SVGS[payload.petType] || FALLBACK_SVGS.cat;

    // 创建来访宠物 DOM
    var el = document.createElement('div');
    el.className = 'cp-visitor cp-visitor-' + payload.petType;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="cp-visitor-body">' + svg + '</div>' +
      '<div class="cp-visitor-label">' +
        '<span class="cp-visitor-name">' + escapeHtml(payload.petName || '来访宠物') + '</span>' +
        '<span class="cp-visitor-from">来自 ' + escapeHtml(shortenHost(payload.fromSite || '远方')) + '</span>' +
      '</div>';

    document.body.appendChild(el);

    // 从屏幕边缘入场
    var w = window.innerWidth, h = window.innerHeight;
    var side = payload.direction === 'left' ? 'right' :
               payload.direction === 'right' ? 'left' :
               (Math.random() < 0.5 ? 'left' : 'right');
    var startX = side === 'left' ? -100 : w + 100;
    var startY = h * 0.5 + (Math.random() - 0.5) * h * 0.3;
    el.style.left = startX + 'px';
    el.style.top = startY + 'px';
    el.classList.add('cp-visitor-entering');

    // 入场动画：滑到屏幕中间偏边
    setTimeout(function () {
      var targetX = side === 'left' ? 60 : w - 160;
      el.style.transform = 'translate(' + ((targetX - startX)) + 'px, 0)';
      el.classList.remove('cp-visitor-entering');
      el.classList.add('cp-visitor-settled');
    }, 100);

    currentVisitor = {
      el: el,
      petType: payload.petType,
      petName: payload.petName,
      fromSite: payload.fromSite,
      svg: svg,
      x: startX, y: startY,
      arriveTs: Date.now()
    };

    // 显示欢迎 toast
    showToast('🐾 ' + (payload.petName || '一只来访宠物') + ' 从 ' + shortenHost(payload.fromSite || '远方') + ' 穿越过来');

    // 触发本站宠物的相遇回调
    if (typeof config.onPetArrive === 'function') {
      try { config.onPetArrive(currentVisitor); } catch (e) {}
    }

    // 来访宠物自动离开
    setTimeout(function () {
      if (currentVisitor && currentVisitor.el === el) {
        dismissVisitor();
      }
    }, VISITOR_TTL);
  }

  function dismissVisitor() {
    if (!currentVisitor) return;
    var el = currentVisitor.el;
    // 滑出屏幕
    var w = window.innerWidth;
    var currentLeft = parseFloat(el.style.left) || 0;
    var dir = currentLeft < w / 2 ? -1 : 1;
    el.style.transition = 'transform 1.5s ease-in';
    el.style.transform = 'translate(' + (dir * (w + 200)) + 'px, 0)';
    el.style.opacity = '0';
    setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 1500);
    currentVisitor = null;
  }

  /* =========================================================================
   * §5 宠物相遇互动
   * ======================================================================= */
  // 当本站宠物靠近来访宠物时触发互动判定
  // localPet: { x, y, type, name }
  // visitor: currentVisitor
  function checkMeet(localPet) {
    if (!currentVisitor || !localPet) return;
    var dx = (currentVisitor.x || 0) - (localPet.x || 0);
    var dy = (currentVisitor.y || 0) - (localPet.y || 0);
    var dist = Math.hypot(dx, dy);
    if (dist > 120) return;  // 太远了不触发

    // 触发互动
    var interactions = pickInteractions(localPet.type, currentVisitor.petType);
    var interaction = interactions[Math.floor(Math.random() * interactions.length)];

    // 广播互动事件
    broadcast('pet_meet', {
      petType: config.petType,
      petName: config.petName,
      visitorType: currentVisitor.petType,
      visitorName: currentVisitor.petName,
      interaction: interaction,
      fromSite: location.hostname,
      ts: Date.now()
    });

    // 触发本站回调
    if (typeof config.onPetMeet === 'function') {
      try { config.onPetMeet({ type: config.petType, name: config.petName }, { type: currentVisitor.petType, name: currentVisitor.petName }, interaction); } catch (e) {}
    }

    // 显示互动 toast
    showToast('🐶 ' + interaction);

    // 让来访宠物也做一个动作
    if (currentVisitor.el) {
      currentVisitor.el.classList.add('cp-visitor-react');
      setTimeout(function () {
        if (currentVisitor && currentVisitor.el) {
          currentVisitor.el.classList.remove('cp-visitor-react');
        }
      }, 2500);
    }
  }

  // 根据两只宠物的类型返回可能的互动
  function pickInteractions(typeA, typeB) {
    var key = [typeA, typeB].sort().join('-');
    var INTERACTIONS = {
      'cat-dog': ['互闻了闻', '对峙了 3 秒', '假装没看见', '一起找了个有阳光的地方躺下'],
      'cat-cat': ['互相蹭了蹭头', '一起理毛 5 秒', '对峙 → 和解', '各自占领一个角落'],
      'dog-dog': ['闻了闻尾巴', '一起跑了 3 圈', '互相追逐', '同步趴下'],
      'cat-hamster': ['盯着看了很久', '试探性伸出爪子', '保持礼貌距离'],
      'dog-hamster': ['嗅了嗅', '用鼻子推了推'],
      'default': ['擦肩而过', '互相看了一眼', '保持距离']
    };
    return INTERACTIONS[key] || INTERACTIONS.default;
  }

  /* =========================================================================
   * §6 单站演示模式（不需要 Supabase 也能有效果）
   * ======================================================================= */
  function startDemoMode() {
    scheduleNextDemoDepart();
  }

  function scheduleNextDemoDepart() {
    clearTimeout(demoDepartTimer);
    var delay = DEMO_DEPART_INTERVAL_MIN + Math.random() * (DEMO_DEPART_INTERVAL_MAX - DEMO_DEPART_INTERVAL_MIN);
    demoDepartTimer = setTimeout(function () {
      // 不真的穿越出去——如果配了 Supabase 会自动广播；演示模式只触发本站回调
      var dir = Math.random() < 0.5 ? 'left' : 'right';
      console.log('[CrossPet demo] 触发穿越:', dir);

      // 触发本站宠物离开回调
      if (typeof config.onPetLeave === 'function') {
        try { config.onPetLeave(dir); } catch (e) {}
      }

      // 广播（如果连上了）
      broadcast('pet_depart', {
        petType: config.petType,
        petName: config.petName,
        petSVG: config.petSVG,
        fromSite: location.hostname + location.pathname,
        fromSiteId: siteId,
        direction: dir,
        demo: true,
        ts: Date.now()
      });

      // 8 秒后模拟一只随机宠物来访（仅在未连接 Supabase 时）
      if (!connected) {
        setTimeout(function () {
          if (!currentVisitor) {
            var demoTypes = ['dog', 'cat', 'hamster'];
            var demoType = demoTypes[Math.floor(Math.random() * demoTypes.length)];
            var demoNames = {
              dog: ['马文的狗', '路过的柴犬', '门口那只狗', '一只金毛'],
              cat: ['隔壁的猫', '橘猫大佬', '一只英短', '黑猫警长'],
              hamster: ['一只仓鼠', '奶茶鼠', '金丝熊']
            };
            var names = demoNames[demoType] || ['一只神秘访客'];
            handleArrive({
              petType: demoType,
              petName: names[Math.floor(Math.random() * names.length)],
              petSVG: FALLBACK_SVGS[demoType],
              fromSite: '演示模式',
              fromSiteId: 'demo-' + Math.random(),
              direction: Math.random() < 0.5 ? 'left' : 'right'
            });
          }
        }, DEMO_ARRIVE_DELAY);
      }

      scheduleNextDemoDepart();
    }, delay);
  }

  /* =========================================================================
   * §7 Supabase 实时频道
   * ======================================================================= */
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
    if (!SUPABASE_URL || !SUPABASE_KEY) return;  // 演示模式
    loadSupabase(function (err) {
      if (err || !root.supabase) return;
      try {
        var client = root.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        channel = client.channel(CHANNEL_NAME);

        channel
          .on('broadcast', { event: 'pet_depart' }, function (msg) {
            var p = msg && msg.payload;
            if (!p || !p.petType) return;
            if (p.fromSiteId === siteId) return;
            // 别站的宠物走了——它可能会穿越到本站
            handleArrive(p);
          })
          .on('broadcast', { event: 'pet_meet' }, function (msg) {
            var p = msg && msg.payload;
            if (!p) return;
            // 别站发生了互动——只显示 toast（不做本地动画，因为我们没那只宠物）
            showToast('💬 ' + (p.petName || '一只宠物') + ' 和 ' + (p.visitorName || '另一只') + ' 在别处：' + (p.interaction || '相遇了'));
          })
          .subscribe(function (status) {
            if (status === 'SUBSCRIBED') {
              connected = true;
              console.log('[CrossPet] 已接入实时频道 #' + CHANNEL_NAME);
            }
          });
      } catch (e) {
        console.warn('[CrossPet] 接入失败:', e);
      }
    });
  }

  function broadcast(event, payload) {
    if (!connected || !channel) return;
    try {
      channel.send({
        type: 'broadcast',
        event: event,
        payload: payload
      });
    } catch (e) {}
  }

  /* =========================================================================
   * §8 UI 工具
   * ======================================================================= */
  var toastEl = null;
  var toastTimer = null;
  function showToast(text, ttl) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'cp-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toastEl) toastEl.classList.remove('show');
    }, ttl || 4000);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function shortenHost(h) {
    if (!h) return '远方';
    return h.replace(/^https?:\/\//, '').split('/')[0];
  }

  /* =========================================================================
   * §9 对外接口
   * ======================================================================= */
  root.CrossPet = {
    init: init,
    depart: depart,
    checkMeet: checkMeet,
    dismissVisitor: dismissVisitor,
    getCurrentVisitor: function () { return currentVisitor; },
    configure: function (url, key) {
      SUPABASE_URL = url || SUPABASE_URL;
      SUPABASE_KEY = key || SUPABASE_KEY;
      if (started && !connected) connect();
    },
    version: PROTOCOL_VERSION
  };
})(typeof self !== "undefined" ? self : this);

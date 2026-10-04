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

  // 频道凭证。anon key 本身就是公开密钥（设计如此），写入静态文件不算泄露。
  // 想接自己的频道就填自己的；留空则自动读 assets/crosspet-credentials.json。
  var SUPABASE_URL = 'https://mpkcvkqiimxhrlsvjasr.supabase.co';
  var SUPABASE_KEY = '';
  var CHANNEL_NAME = 'crosspet-global';
  var PROTOCOL_VERSION = '1.0';

  // 单站演示模式的计时器
  var DEMO_DEPART_INTERVAL_MIN = 60000;   // 60 秒
  var DEMO_DEPART_INTERVAL_MAX = 180000;  // 180 秒
  var DEMO_ARRIVE_DELAY = 8000;           // 离开后 8 秒，模拟来访

  // 来访宠物存活时间
  var VISITOR_TTL = 30000;  // 30 秒后自动离开

  // 全部标 HEURISTIC —— 这些数字没有一条来自公开信源
  var HEURISTIC = {
    maxNameLen: 24,          // 名字截断长度
    maxSvgLen: 20000,        // 外来 SVG 长度上限
    switchAfter: 2,          // 单条通道试几次后换下一条
    backoffBase: 1000,       // 退避基数
    backoffCap: 30000,       // 退避封顶
    jitter: 500,             // 退避抖动
    visitorTtl: VISITOR_TTL
  };

  /* =========================================================================
   * §0.5 SVG 净化 —— 频道是公共的，进来的造型一律当不可信
   * ---------------------------------------------------------------------------
   * 三道防线：
   *   1. 剥掉所有危险标签（script / foreignObject / iframe / use / animate…）
   *   2. 剥掉所有 on* 事件属性与 href（含 javascript: 伪协议）
   *   3. 长度封顶 + 强制外框（缺 viewBox 会撑满舞台）
   * ======================================================================= */
  var DANGER_TAGS = 'script|foreignObject|iframe|object|embed|use|animate|animateMotion|animateTransform|set|handler|style';

  function sanitizeSvg(svg) {
    if (!svg || typeof svg !== 'string') return '';
    var s = svg.slice(0, HEURISTIC.maxSvgLen);

    // 1. 危险标签整段剥掉（连内容一起）
    s = s.replace(new RegExp('<\\s*(' + DANGER_TAGS + ')\\b[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>', 'gi'), '');
    s = s.replace(new RegExp('<\\s*(' + DANGER_TAGS + ')\\b[^>]*\\/?>', 'gi'), '');

    // 2. 事件属性与链接属性
    s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
    s = s.replace(/\s(xlink:)?href\s*=\s*"[^"]*"/gi, '');
    s = s.replace(/\s(xlink:)?href\s*=\s*'[^']*'/gi, '');
    s = s.replace(/javascript\s*:/gi, '');

    return s.trim();
  }

  // 补外框：没有 viewBox 的 SVG 嵌进舞台会撑满
  function fitSvg(svg) {
    if (!svg) return '';
    if (/viewBox\s*=/.test(svg)) return svg;
    return svg.replace(/<svg\b([^>]*)>/i, '<svg$1 viewBox="0 0 80 56">');
  }

  /* =========================================================================
   * §0.6 来访者检查 —— 宽进严出的「宽进」
   * ---------------------------------------------------------------------------
   * 规则只有三条：
   *   1. 不是自己发的
   *   2. 带了 petType
   *   3. 名字与造型过了净化
   * ======================================================================= */
  function inspectVisitor(payload, selfId) {
    if (!payload || typeof payload !== 'object') {
      return { accept: false, reason: '空帧' };
    }
    if (payload.fromSiteId && payload.fromSiteId === selfId) {
      return { accept: false, reason: '自己发的，回环忽略' };
    }
    if (!payload.petType) {
      return { accept: false, reason: '没有 petType，无法确定是什么' };
    }
    var name = String(payload.petName || '').slice(0, HEURISTIC.maxNameLen).trim();
    if (!name) name = '一只没报名字的' + payload.petType;
    // 造型：优先用他站送来的（净化后），没有就用本站内置的同类型兜底。
    // 这一步是「宽进」的最后一环——净化不过就退回内置，绝不放行。
    var type = String(payload.petType).slice(0, 16);
    var svg = fitSvg(sanitizeSvg(payload.petSVG || ''));
    if (!svg) svg = FALLBACK_SVGS[type] || FALLBACK_SVGS.cat;

    return {
      accept: true,
      visitor: {
        petType: type,
        petName: name,
        fromSite: String(payload.fromSite || '').slice(0, 80),
        fromSiteId: payload.fromSiteId || '',
        ts: Number(payload.ts) || Date.now(),
        svg: svg,
        // 标记：造型是他站送的还是内置兜底的
        svgFallback: !payload.petSVG
      }
    };
  }

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

    // 启动单站演示模式（即使没连上频道也有效果）
    startDemoMode();
    // 取凭证后尝试接入实时频道
    loadCredentials(connect);
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
    showToast((payload.petName || '一只来访宠物') + ' 从 ' + shortenHost(payload.fromSite || '远方') + ' 穿越过来');

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
    showToast(' ' + interaction);

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
    running = true;
    attempt = 0;
    if (!SUPABASE_URL || !SUPABASE_KEY) { startDemoMode(); return; }  // 演示模式
    openSocket();
  }

  /* ---- 原生 WebSocket 直连 Supabase Realtime ----
   * 不用 CDN 上的 supabase-js：本页只允许自己带的脚本。
   * 协议是 Phoenix 帧（topic / event / payload / ref），
   * 我们只用到 join 和 broadcast 两种，见 wsEndpoint 与 frame。
   */
  function wsEndpoint(base, key, version) {
    return String(base).replace(/^http/, 'ws') +
      '/realtime/v1/websocket?apikey=' + encodeURIComponent(key) +
      '&vsn=' + encodeURIComponent(version || '1.0.0');
  }

  function frame(topic, event, payload, ref) {
    return JSON.stringify({ topic: topic, event: event, payload: payload, ref: ref });
  }

  var refCounter = 1;
  function nextRef() { return String(refCounter++); }

  // 把收到的一帧归类：reply / broadcast / system / ignore
  function routeFrame(raw) {
    var o;
    try { o = JSON.parse(raw); } catch (e) { return { kind: 'ignore' }; }
    if (!o || !o.event) return { kind: 'ignore' };
    var p = o.payload || {};
    if (o.event === 'phx_reply') {
      return { kind: 'heartbeat', ok: p.status === 'ok' };
    }
    if (o.event === 'broadcast') {
      return { kind: 'broadcast', event: p.event, payload: p.payload || {} };
    }
    if (o.event === 'phx_error') return { kind: 'system', event: o.event };
    return { kind: 'ignore' };
  }

  // 退避 + 抖动，避免一群站点同时重连把频道打爆
  function backoffDelay(attempt) {
    var base = Math.min(HEURISTIC.backoffCap,
                        HEURISTIC.backoffBase * Math.pow(2, Math.max(0, attempt - 1)));
    return base + Math.floor(Math.random() * HEURISTIC.jitter);
  }

  var socket = null;
  var retryTimer = null;
  var running = false;

  function openSocket() {
    if (!running) return;
    try {
      socket = new WebSocket(wsEndpoint(SUPABASE_URL, SUPABASE_KEY, '1.0.0'));
    } catch (e) {
      scheduleRetry();
      return;
    }

    socket.onopen = function () {
      // self:true 才能收到自己发的，方便回环自检
      socket.send(frame('realtime:' + CHANNEL_NAME, 'phx_join', {
        config: { broadcast: { ack: false, self: true } }
      }, nextRef()));
    };

    socket.onmessage = function (ev) {
      var r = routeFrame(ev.data);
      if (r.kind === 'heartbeat' && r.ok) {
        connected = true;
        log('已接入实时频道 #' + CHANNEL_NAME);
        return;
      }
      if (r.kind === 'broadcast' && r.event === 'pet_depart') {
        var verdict = inspectVisitor(r.payload, siteId);
        if (verdict.accept) handleArrive(verdict.visitor);
        else log('略过一条广播：' + verdict.reason);
        return;
      }
      if (r.kind === 'broadcast' && r.event === 'pet_meet') {
        var p = r.payload || {};
        if (!p.petName) return;
        showToast(p.petName + ' 和 ' + (p.visitorName || '另一只') +
                  ' 在别处：' + (p.interaction || '相遇了'));
      }
    };

    socket.onclose = function () { connected = false; scheduleRetry(); };
    socket.onerror = function () { try { socket.close(); } catch (e) {} };
  }

  var attempt = 0;
  function scheduleRetry() {
    if (!running) return;
    attempt++;
    // 先退避，别一路爬到 30 秒一档
    if (attempt > 6) { running = false; log('连不上频道，进入演示模式'); startDemoMode(); return; }
    var d = backoffDelay(attempt);
    log('第 ' + attempt + ' 次重连在 ' + Math.round(d / 1000) + ' 秒后');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(openSocket, d);
  }

  function log(text) {
    try { if (config && config.onLog) config.onLog(text); } catch (e) {}
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

  /* ---- 发送广播（WebSocket 帧） ---- */
  function broadcast(event, payload) {
    if (!connected || !socket || socket.readyState !== 1) return false;
    try {
      socket.send(frame('realtime:' + CHANNEL_NAME, 'broadcast', {
        type: 'broadcast', event: event, payload: payload
      }, nextRef()));
      return true;
    } catch (e) { return false; }
  }

  /* ---- 凭证加载：优先 window 配置，其次 assets/crosspet-credentials.json ----
   * anon key 本身就是公开密钥（Supabase 设计如此），写进静态文件不算泄露。
   * 想接自己的频道就建一个 credentials 文件覆盖它。
   */
  function loadCredentials(done) {
    if (SUPABASE_KEY) { done(); return; }
    if (typeof fetch !== 'function') { done(); return; }
    fetch('../assets/crosspet-credentials.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.url && j.anonKey) { SUPABASE_URL = j.url; SUPABASE_KEY = j.anonKey; }
        done();
      })
      .catch(function () { done(); });
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
    isConnected: function () { return connected; },
    configure: function (url, key) {
      SUPABASE_URL = url || SUPABASE_URL;
      SUPABASE_KEY = key || SUPABASE_KEY;
      if (started && !connected) connect();
    },

    /* ---- 协议自检：纯函数，断网也能跑 ---- */
    selfCheck: function () {
      var out = [], pass = 0, fail = 0;
      function t(name, ok) {
        if (ok) { pass++; out.push({ ok: true, name: name }); }
        else { fail++; out.push({ ok: false, name: name }); }
      }

      // 净化
      t('净化去 script', sanitizeSvg('<svg><script>alert(1)</script><circle r="1"/></svg>').indexOf('script') < 0);
      t('净化去 foreignObject', sanitizeSvg('<svg><foreignObject/><circle r="1"/></svg>').indexOf('foreignObject') < 0);
      t('净化去事件属性', sanitizeSvg('<svg><circle onload="x=1" r="1"/></svg>').indexOf('onload') < 0);
      t('净化去 href', sanitizeSvg('<svg><a href="javascript:x">a</a></svg>').indexOf('href') < 0);
      t('净化去 javascript:', sanitizeSvg('<svg><a href="javascript:x">a</a></svg>').indexOf('javascript') < 0);
      t('净化保留形状', sanitizeSvg('<svg><circle r="1"/></svg>').indexOf('<circle r="1"/>') > 0);
      t('净化封顶', sanitizeSvg('<svg>' + new Array(HEURISTIC.maxSvgLen + 100).join('x') + '</svg>').length <= HEURISTIC.maxSvgLen);

      // 补外框
      t('补 viewBox', fitSvg('<svg><circle r="1"/></svg>').indexOf('viewBox') > 0);
      t('保留已有 viewBox', fitSvg('<svg viewBox="0 0 10 10"><circle r="1"/></svg>').match(/viewBox/g).length === 1);

      // 来访者检查
      t('回绝自己发的', inspectVisitor({ petType: 'cat', fromSiteId: 'me' }, 'me').accept === false);
      t('回绝无 petType', inspectVisitor({ petName: 'x' }, 'me').accept === false);
      t('回绝空帧', inspectVisitor(null, 'me').accept === false);
      var ok = inspectVisitor({ petType: 'dog', petName: '阿黄', fromSiteId: 'other' }, 'me');
      t('接待正常的', ok.accept === true);
      t('匿名来客有兜底名', inspectVisitor({ petType: 'dog' }, 'me').visitor.petName.length > 0);
      t('名字截断', inspectVisitor({ petType: 'dog', petName: new Array(60).join('长') }, 'me').visitor.petName.length === HEURISTIC.maxNameLen);
      t('净化后才进舞台', inspectVisitor({ petType: 'cat', petSVG: '<svg><script>x</script><circle r="1"/></svg>', fromSiteId: 'o' }, 'me').visitor.svg.indexOf('script') < 0);

      // 帧归类
      t('归类心跳回执', routeFrame('{"event":"phx_reply","payload":{"status":"ok"}}').kind === 'heartbeat');
      t('归类广播', routeFrame('{"event":"broadcast","payload":{"event":"pet_depart","payload":{}}}').event === 'pet_depart');
      t('归类系统消息', routeFrame('{"event":"phx_error","payload":{}}').kind === 'system');
      t('归类垃圾帧', routeFrame('not json').kind === 'ignore');
      t('归类空帧', routeFrame(null).kind === 'ignore');

      // 端点与退避
      t('端点把 http 换 ws', wsEndpoint('https://a.co', 'K1', '1.0.0').indexOf('wss://a.co/realtime/v1/websocket') === 0);
      t('端点带 apikey', wsEndpoint('https://a.co', 'K1', '1.0.0').indexOf('apikey=K1') > 0);
      t('退避有下限', backoffDelay(1) >= HEURISTIC.backoffBase);
      t('退避封顶', backoffDelay(99) <= HEURISTIC.backoffCap + HEURISTIC.jitter);
      t('退避递增', backoffDelay(3) > backoffDelay(1));

      return { pass: pass, fail: fail, total: pass + fail, items: out };
    },

    // 内部件暴露出来给自检和二次开发
    _internal: {
      sanitizeSvg: sanitizeSvg,
      fitSvg: fitSvg,
      inspectVisitor: inspectVisitor,
      routeFrame: routeFrame,
      backoffDelay: backoffDelay,
      wsEndpoint: wsEndpoint,
      frame: frame,
      HEURISTIC: HEURISTIC,
      loadCredentials: loadCredentials
    },

    version: PROTOCOL_VERSION
  };
})(typeof self !== "undefined" ? self : this);

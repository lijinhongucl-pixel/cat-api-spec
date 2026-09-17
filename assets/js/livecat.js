/*!
 * LIVECAT — 活猫 v1
 * ---------------------------------------------------------------------------
 * 一只活在页面右下角的猫。状态机驱动自动切换：
 *   SLEEP → PATROL → GROOM → PLAY → STARE → EAT → BOXED → ZOOMIES → (回到 SLEEP)
 *
 * 每次切换状态时调用 CatExpression 引擎实时渲染对应的猫脸，
 * 所以同一只猫在不同状态下真的会换表情：
 *   SLEEP  → CLOSED 眼（眯成线）
 *   PLAY   → CURIOUS（瞳孔圆睁、耳朵前倾）
 *   STARE  → ALERT（瞳孔收缩成竖线）
 *   GROOM  → SMUG（半眯眼、嘴角上扬）
 *   EAT    → HUNGRY（舌头吐出）
 *   BOXED  → LOAF（一团毛球）
 *   ZOOMIES→ CRAZY（耳朵平、瞳孔全圆）
 *
 * 戳它会切换到 PETTED（被摸）状态并吐一句台词。
 * 移动鼠标到它附近会让它转头看你（STARE 触发）。
 *
 * 引擎依赖：CatExpression（同目录 expression.js）
 * 零外部依赖，纯原生 JS。
 */
(function (root) {
  "use strict";
  if (!root.CatExpression) { console.warn("LiveCat needs CatExpression."); return; }
  var X = root.CatExpression;

  /* ---------- 状态机：动作序列 + 持续时长 + 对应表情 + 台词 ---------- */
  // expr 映射到 CatExpression 的 14 个状态之一；
  // duration 是这个动作持续多少毫秒（有随机抖动 ±40%）；
  // pose 是身体姿势（CSS 动画的 className）；
  // lines 是戳它时可能吐的台词。
  var STATES = [
    {
      id: "SLEEP",   label: "睡觉",   expr: "LOAF",     duration: 9000, pose: "sleep",
      lines: ["呼噜噜…别戳…", "zzz…", "我在开 503 会议…", "凌晨三点才睡的…"]
    },
    {
      id: "PATROL",  label: "巡视领地", expr: "CURIOUS", duration: 4500, pose: "walk",
      lines: ["这片是我的。", "查岗。", "无异常，继续躺。", "领地完整。"]
    },
    {
      id: "GROOM",   label: "理毛",   expr: "SLOW_BLINK", duration: 5500, pose: "groom",
      lines: ["我每天花 30% 醒着的时间做这件事。", "你看得见的地方都干净了。", "毛是第一接口。"]
    },
    {
      id: "PLAY",    label: "玩耍",   expr: "PLAYFUL",  duration: 4000, pose: "play",
      lines: ["刚才那个光点是我的。", "上一次我抓住了。", "逗猫棒的正确收尾是让我咬到。"]
    },
    {
      id: "STARE",   label: "凝视你",  expr: "ALERT",    duration: 3000, pose: "stare",
      lines: ["…", "你在看什么？", "我也在看你。", "评估中。"]
    },
    {
      id: "EAT",     label: "吃东西",   expr: "HUNGRY",  duration: 4000, pose: "eat",
      lines: ["RER = 70 × 4.5^0.75。", "我又不傻。", "配方在 §7。", "罐头优先。"]
    },
    {
      id: "BOXED",   label: "钻纸箱",   expr: "BOXED",   duration: 7000, pose: "box",
      lines: ["纸箱 MUST。", "MUST 意思是必须。", "纸箱优先级高于你买的所有外设。", "请勿将系统从纸箱中取出。"]
    },
    {
      id: "ZOOMIES", label: "疯跑",     expr: "ZOOMIES", duration: 2500, pose: "zoom",
      lines: ["能量溢出。", "凌晨三点。", "你没看见。", "这不是我能控制的。"]
    }
  ];

  // 特殊态：被戳 / 被摸 / 收到零食 —— 不进入主循环，独立打断。
  var PETTED = {
    id: "PETTED", label: "被摸", expr: "KNEADING", pose: "pet",
    lines: ["…可以。", "额度已扣。", "今天配额还剩 1 次。", "再摸就 429。"]
  };
  var TREATED = {
    id: "TREATED", label: "收到零食", expr: "HUNGRY", pose: "treat",
    lines: ["这个我接受。", "200 OK。", "再来一个试试。", "通讯正常。"]
  };

  /* ---------- 状态切换 ---------- */
  var idx = 0;              // 当前在 STATES 数组里的位置
  var current = STATES[0];  // 当前状态对象
  var stateTimer = null;    // setTimeout 句柄
  var uiEls = {};           // DOM 节点缓存

  function next() {
    idx = (idx + 1) % STATES.length;
    enter(STATES[idx]);
  }

  function enter(state) {
    current = state;
    render();
    var jitter = 0.6 + Math.random() * 0.8;  // 0.6× ~ 1.4×
    clearTimeout(stateTimer);
    stateTimer = setTimeout(next, state.duration * jitter);
  }

  // 特殊态：进入后短暂回到主循环。
  function interrupt(special) {
    clearTimeout(stateTimer);
    current = special;
    render();
    stateTimer = setTimeout(function () { enter(current === special ? STATES[idx] : current); }, 2200);
  }

  /* ---------- 渲染 ---------- */
  function render() {
    if (!uiEls.face) return;
    // 用 CatExpression 引擎画当前状态对应的猫脸
    var svg = X.toSVG(current.expr, { scale: 1, label: current.label });
    uiEls.face.innerHTML = svg;
    uiEls.label.textContent = current.label;
    // 切身体姿势
    uiEls.body.className = "cat-body pose-" + current.pose;
  }

  /* ---------- 对白气泡 ---------- */
  function speak() {
    var pool = current.lines || ["…"];
    var line = pool[Math.floor(Math.random() * pool.length)];
    if (!uiEls.bubble) return;
    uiEls.bubble.textContent = line;
    uiEls.bubble.classList.add("show");
    clearTimeout(uiEls.bubbleTimer);
    uiEls.bubbleTimer = setTimeout(function () {
      uiEls.bubble.classList.remove("show");
    }, 2800);
  }

  /* ---------- 鼠标接近触发 STARE ---------- */
  function onMove(e) {
    if (!uiEls.wrap) return;
    var rect = uiEls.wrap.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    // 离 220px 以内、当前不在特殊态时，切到 STARE
    if (dist < 220 && current.id !== "STARE" && current.id !== "SLEEP" &&
        current.id !== "ZOOMIES" && current.id !== "BOXED" &&
        current.id !== "PETTED" && current.id !== "TREATED") {
      var target = STATES.find(function (s) { return s.id === "STARE"; });
      if (target) { idx = STATES.indexOf(target); enter(target); }
    }
  }

  /* ---------- 装配 DOM ---------- */
  function mount() {
    var wrap = document.createElement("div");
    wrap.className = "livecat";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="lc-bubble"></div>' +
      '<div class="lc-stage">' +
        '<div class="cat-body pose-sleep">' +
          '<div class="cat-face"></div>' +
        '</div>' +
      '</div>' +
      '<div class="lc-label">睡觉</div>' +
      '<div class="lc-ctrls">' +
        '<button class="lc-btn" data-action="pet" title="戳一下">👋</button>' +
        '<button class="lc-btn" data-action="treat" title="给零食">🐟</button>' +
        '<button class="lc-btn" data-action="hide" title="收起来">×</button>' +
      '</div>';
    document.body.appendChild(wrap);

    uiEls.wrap   = wrap;
    uiEls.bubble = wrap.querySelector(".lc-bubble");
    uiEls.body   = wrap.querySelector(".cat-body");
    uiEls.face   = wrap.querySelector(".cat-face");
    uiEls.label  = wrap.querySelector(".lc-label");

    // 戳 → 被摸
    wrap.querySelector('[data-action="pet"]').addEventListener("click", function (e) {
      e.stopPropagation();
      interrupt(PETTED);
      speak();
    });
    // 零食 → 收到
    wrap.querySelector('[data-action="treat"]').addEventListener("click", function (e) {
      e.stopPropagation();
      interrupt(TREATED);
      speak();
    });
    // 收起
    wrap.querySelector('[data-action="hide"]').addEventListener("click", function (e) {
      e.stopPropagation();
      wrap.classList.add("lc-hidden");
      createLauncher();
    });
    // 整个身体可点 → 戳一下
    uiEls.body.addEventListener("click", function () {
      interrupt(PETTED);
      speak();
    });

    document.addEventListener("mousemove", onMove, { passive: true });
  }

  function createLauncher() {
    var btn = document.createElement("button");
    btn.className = "lc-launcher";
    btn.setAttribute("aria-label", "把猫放出来");
    btn.textContent = "🐱";
    btn.addEventListener("click", function () {
      uiEls.wrap.classList.remove("lc-hidden");
      btn.remove();
    });
    document.body.appendChild(btn);
  }

  /* ---------- 启动 ---------- */
  function start() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { mount(); enter(STATES[0]); });
    } else {
      mount(); enter(STATES[0]);
    }
  }

  root.LiveCat = { start: start, STATES: STATES };
  start();
})(typeof self !== "undefined" ? self : this);

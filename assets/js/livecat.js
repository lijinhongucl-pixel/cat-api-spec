/*!
 * LIVECAT v2 — 自由活动猫
 * ---------------------------------------------------------------------------
 * v1 是右下角圆形舱里换表情的猫。v2 升级成完整身体的猫，
 * 在整个页面上自由活动，有自己的行为准则。
 *
 *  - 完整身体：头 + 身体 + 4 条腿 + 尾巴 + 耳朵 + 表情
 *  - 状态机决定下一步去哪：巡视 / 睡觉 / 追鼠标 / 玩耍 / 吃东西 / 钻纸箱 / 疯跑
 *  - 物理移动：CSS transition + 自定义路径插值
 *  - 行为准则：12 条规则（见 BEHAVIOR_RULES）
 *  - 与页面共存：会绕过页面顶栏、响应鼠标快速移动
 */
(function (root) {
  "use strict";
  if (root.LiveCat) return;  // 防止重复加载

  /* ---------- 行为准则（猫的灵魂）---------- */
  var BEHAVIOR_RULES = [
    "1. 领地完整时优先睡觉。",
    "2. 鼠标移动太快会触发追猎判定。",
    "3. 没人看时才会疯跑。",
    "4. 钻进纸箱后任何输入延迟 5 分钟。",
    "5. 凌晨三点自动进入 ZOOMIES 状态。",
    "6. 被戳一次扣 1 次今日抚摸配额。",
    "7. 配额耗尽返回 429。",
    "8. 看到鱼形物体会判定为食物。",
    "9. 巡视路线优先沿墙边走。",
    "10. 睡觉地点偏好温暖区域（屏幕右下/左下）。",
    "11. 收到激光点会无视一切去追。",
    "12. 在被禁止的区域（屏幕中央）停留超过 3 秒会自动撤离。"
  ];

  /* ---------- DOM ---------- */
  var cat = null;       // 猫节点
  var bubble = null;    // 对白气泡
  var label = null;     // 状态标签
  var x = 0, y = 0;     // 当前位置（页面坐标系）
  var targetX = 0, targetY = 0;  // 目标位置
  var facing = 1;       // 朝向：1 右 / -1 左
  var mouseX = -1, mouseY = -1;
  var lastMouseTime = 0;
  var mouseSpeed = 0;

  /* ---------- 状态机 ---------- */
  // 每个状态有：名字 / 持续时长 / 身体姿势 class / 表情 / 进入时调用的行为函数
  // behavior 函数会被传入 (ctx) 决定猫要去哪里。
  var STATES = {
    SLEEP: {
      label: "睡觉", duration: 14000, pose: "sleep", face: "LOAF",
      lines: ["呼噜噜…", "503…", "凌晨三点才睡的…", "zzz…"],
      behavior: function () { pickSleepSpot(); }
    },
    PATROL: {
      label: "巡视领地", duration: 8000, pose: "walk", face: "CURIOUS",
      lines: ["查岗。", "这片是我的。", "无异常。", "继续躺。"],
      behavior: function () { pickPatrolPoint(); }
    },
    GROOM: {
      label: "理毛", duration: 6000, pose: "sit", face: "SLOW_BLINK",
      lines: ["30% 醒着的时间在做这件事。", "干净了。", "接口维护。"],
      behavior: function () { stayStill(); }
    },
    HUNT: {
      label: "追鼠标", duration: 3500, pose: "run", face: "PLAYFUL",
      lines: ["那是我的。", "抓住它。", "STALK→POUNCE。"],
      behavior: function () { chaseMouse(); }
    },
    EAT: {
      label: "吃东西", duration: 5000, pose: "eat", face: "HUNGRY",
      lines: ["RER 公式。", "罐头优先。", "配方在 §7。"],
      behavior: function () { pickEatSpot(); }
    },
    PLAY: {
      label: "玩耍", duration: 4500, pose: "play", face: "PLAYFUL",
      lines: ["刚才那个光点是我的。", "再逗一下。"],
      behavior: function () { roamRandomly(); }
    },
    BOXED: {
      label: "钻纸箱", duration: 9000, pose: "box", face: "BOXED",
      lines: ["纸箱 MUST。", "请勿将系统从纸箱中取出。", "MUST 意思是必须。"],
      behavior: function () { pickBoxSpot(); }
    },
    ZOOMIES: {
      label: "疯跑", duration: 3000, pose: "zoom", face: "ZOOMIES",
      lines: ["能量溢出。", "这不是我能控制的。", "你没看见。"],
      behavior: function () { zoomAround(); }
    },
    STARE: {
      label: "凝视你", duration: 2500, pose: "sit", face: "ALERT",
      lines: ["…", "评估中。", "我也在看你。"],
      behavior: function () { faceMouse(); }
    }
  };

  // 特殊态：打断主循环
  var SPECIAL = {
    PETTED: {
      label: "被摸", pose: "pet", face: "KNEADING",
      lines: ["…可以。", "额度已扣。", "再摸就 429。", "今天配额剩 1 次。"]
    },
    TREATED: {
      label: "收到零食", pose: "eat", face: "HUNGRY",
      lines: ["200 OK。", "通讯正常。", "再来一个。"]
    }
  };

  // 状态循环顺序（不完全是顺序，会按行为准则随机跳）
  var CYCLE = ["PATROL", "GROOM", "PLAY", "STARE", "EAT", "BOXED", "SLEEP"];
  var cycleIdx = 0;
  var current = STATES.SLEEP;
  var currentStateName = "SLEEP";
  var stateStart = 0;
  var stateTimer = null;
  var rafId = null;
  var zoomTimer = null;

  /* ---------- 创建猫的 DOM ---------- */
  function createCat() {
    cat = document.createElement("div");
    cat.className = "lc2-cat";
    cat.setAttribute("aria-hidden", "true");
    cat.innerHTML = svgCat();   // 内置 SVG 猫身体

    bubble = document.createElement("div");
    bubble.className = "lc2-bubble";

    label = document.createElement("div");
    label.className = "lc2-label";
    label.textContent = "睡觉";

    var ctrls = document.createElement("div");
    ctrls.className = "lc2-ctrls";
    ctrls.innerHTML =
      '<button class="lc2-btn" data-act="pet" title="戳一下">👋</button>' +
      '<button class="lc2-btn" data-act="treat" title="给零食">🐟</button>' +
      '<button class="lc2-btn" data-act="rules" title="行为准则">📜</button>' +
      '<button class="lc2-btn" data-act="hide" title="让它消失">×</button>';

    var wrap = document.createElement("div");
    wrap.className = "lc2-wrap";
    wrap.appendChild(bubble);
    wrap.appendChild(cat);
    wrap.appendChild(label);
    wrap.appendChild(ctrls);
    document.body.appendChild(wrap);

    // 事件
    cat.addEventListener("click", onPet);
    ctrls.querySelector('[data-act="pet"]').addEventListener("click", function (e) { e.stopPropagation(); onPet(); });
    ctrls.querySelector('[data-act="treat"]').addEventListener("click", function (e) { e.stopPropagation(); onTreat(); });
    ctrls.querySelector('[data-act="hide"]').addEventListener("click", function (e) { e.stopPropagation(); hideCat(); });
    ctrls.querySelector('[data-act="rules"]').addEventListener("click", function (e) { e.stopPropagation(); showRules(); });

    document.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
  }

  /* ---------- SVG 猫身体 ---------- */
  // 一个简化的 8-bit 风格侧视角猫，所有部位分组以便单独动画
  function svgCat() {
    return '' +
    '<svg class="lc2-body" width="100" height="70" viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
      // 尾巴（独立分组，可单独动画）
      '<g class="lc2-tail">' +
        '<path d="M 86 38 Q 96 30 96 22 Q 96 14 90 12" stroke="#3a3a38" stroke-width="5" fill="none" stroke-linecap="round"/>' +
        '<path d="M 86 38 Q 96 30 96 22 Q 96 14 90 12" stroke="#5a5a55" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '</g>' +
      // 后腿
      '<g class="lc2-leg lc2-back-leg">' +
        '<rect x="64" y="48" width="8" height="14" rx="3" fill="#3a3a38"/>' +
        '<rect x="62" y="58" width="12" height="4" rx="2" fill="#2a2a28"/>' +  // 爪
      '</g>' +
      // 身体
      '<ellipse cx="50" cy="42" rx="32" ry="14" fill="#3a3a38"/>' +
      '<ellipse cx="50" cy="40" rx="32" ry="13" fill="#4a4a45"/>' +  // 高光
      // 前腿
      '<g class="lc2-leg lc2-front-leg">' +
        '<rect x="28" y="48" width="8" height="14" rx="3" fill="#3a3a38"/>' +
        '<rect x="26" y="58" width="12" height="4" rx="2" fill="#2a2a28"/>' +
      '</g>' +
      '<g class="lc2-leg lc2-front-leg2">' +
        '<rect x="40" y="48" width="7" height="14" rx="3" fill="#2a2a28"/>' +
      '</g>' +
      '<g class="lc2-leg lc2-back-leg2">' +
        '<rect x="76" y="48" width="7" height="14" rx="3" fill="#2a2a28"/>' +
      '</g>' +
      // 头部（分组，可转头）
      '<g class="lc2-head">' +
        // 耳朵
        '<path class="lc2-ear lc2-ear-l" d="M 14 22 L 18 8 L 24 18 Z" fill="#3a3a38"/>' +
        '<path class="lc2-ear lc2-ear-l-inner" d="M 16 19 L 19 12 L 22 17 Z" fill="#ffb3b3"/>' +
        '<path class="lc2-ear lc2-ear-r" d="M 26 18 L 32 8 L 34 22 Z" fill="#3a3a38"/>' +
        '<path class="lc2-ear lc2-ear-r-inner" d="M 28 16 L 31 12 L 32 19 Z" fill="#ffb3b3"/>' +
        // 头
        '<circle cx="22" cy="26" r="13" fill="#3a3a38"/>' +
        '<circle cx="22" cy="24" r="12" fill="#4a4a45"/>' +
        // 眼睛
        '<g class="lc2-eyes">' +
          '<ellipse class="lc2-eye lc2-eye-l" cx="17" cy="24" rx="2.5" ry="3" fill="#ffd75e"/>' +
          '<ellipse class="lc2-eye lc2-eye-r" cx="27" cy="24" rx="2.5" ry="3" fill="#ffd75e"/>' +
          // 竖线瞳孔（可缩放）
          '<rect class="lc2-pupil lc2-pupil-l" x="16.4" y="22" width="1.2" height="4" fill="#0a0a08"/>' +
          '<rect class="lc2-pupil lc2-pupil-r" x="26.4" y="22" width="1.2" height="4" fill="#0a0a08"/>' +
        '</g>' +
        // 鼻头
        '<path d="M 21 29 L 23 29 L 22 31 Z" fill="#ff8080"/>' +
        // 嘴
        '<path class="lc2-mouth" d="M 22 31 Q 19 33 17 32 M 22 31 Q 25 33 27 32" stroke="#1a1a18" stroke-width="1" fill="none" stroke-linecap="round"/>' +
        // 胡须
        '<g class="lc2-whiskers" stroke="#aaa" stroke-width="0.5" fill="none">' +
          '<line x1="12" y1="28" x2="4" y2="26"/>' +
          '<line x1="12" y1="30" x2="4" y2="30"/>' +
          '<line x1="32" y1="28" x2="40" y2="26"/>' +
          '<line x1="32" y1="30" x2="40" y2="30"/>' +
        '</g>' +
        // 虎斑 M 纹
        '<path d="M 18 16 L 20 19 L 22 16 L 24 19 L 26 16" stroke="#1a1a18" stroke-width="1" fill="none"/>' +
      '</g>' +
    '</svg>';
  }

  /* ---------- 行为函数 ---------- */
  function stayStill() { targetX = x; targetY = y; }

  function pickSleepSpot() {
    // 行为准则 10：偏好温暖区域（屏幕底部角落）
    var w = window.innerWidth, h = window.innerHeight;
    var corner = Math.random() < 0.5 ? 0 : 1;
    targetX = corner === 0 ? 30 + Math.random() * 120 : w - 150 - Math.random() * 120;
    targetY = h - 110;
  }

  function pickPatrolPoint() {
    // 行为准则 9：巡视优先沿墙边走
    var w = window.innerWidth, h = window.innerHeight;
    var side = Math.floor(Math.random() * 4);
    if (side === 0) { targetX = 40; targetY = 80 + Math.random() * (h - 200); }
    else if (side === 1) { targetX = w - 100; targetY = 80 + Math.random() * (h - 200); }
    else if (side === 2) { targetX = 40 + Math.random() * (w - 200); targetY = 80; }
    else { targetX = 40 + Math.random() * (w - 200); targetY = h - 110; }
  }

  function pickEatSpot() {
    var w = window.innerWidth, h = window.innerHeight;
    targetX = Math.max(40, Math.min(w - 100, x + (Math.random() - 0.5) * 200));
    targetY = h - 110;
  }

  function pickBoxSpot() {
    // 找一个角落
    var w = window.innerWidth, h = window.innerHeight;
    targetX = Math.random() < 0.5 ? 40 : w - 100;
    targetY = h - 110;
  }

  function roamRandomly() {
    var w = window.innerWidth, h = window.innerHeight;
    targetX = 60 + Math.random() * (w - 160);
    targetY = 80 + Math.random() * (h - 200);
  }

  function zoomAround() {
    var w = window.innerWidth, h = window.innerHeight;
    targetX = Math.random() < 0.5 ? 40 : w - 100;
    targetY = 80 + Math.random() * (h - 200);
  }

  function chaseMouse() {
    // 行为准则 2：鼠标移动太快触发追猎
    if (mouseX < 0) { roamRandomly(); return; }
    targetX = Math.max(20, Math.min(window.innerWidth - 80, mouseX - 30));
    targetY = Math.max(60, Math.min(window.innerHeight - 80, mouseY - 30));
  }

  function faceMouse() {
    if (mouseX < 0) return;
    targetX = x;
    targetY = y;
    // 朝向鼠标
    facing = (mouseX > x) ? 1 : -1;
  }

  /* ---------- 主循环 ---------- */
  function tick() {
    if (!cat) return;
    var dx = targetX - x;
    var dy = targetY - y;
    var dist = Math.hypot(dx, dy);

    // 朝向
    if (Math.abs(dx) > 5) facing = dx > 0 ? 1 : -1;

    // 移动速度取决于状态
    var speed = currentStateName === "ZOOMIES" ? 4 :
                currentStateName === "HUNT" ? 3 :
                currentStateName === "PATROL" ? 1.8 :
                currentStateName === "PLAY" ? 2.5 : 1.2;

    if (dist > speed) {
      x += (dx / dist) * speed;
      y += (dy / dist) * speed;
    } else {
      x = targetX;
      y = targetY;
    }

    // 应用变换
    cat.style.transform = 'translate(' + x + 'px,' + y + 'px) scaleX(' + facing + ')';
    cat.setAttribute("data-state", currentStateName);
    cat.className = "lc2-cat state-" + current.pose;

    // 同步气泡 / 标签 / 按钮组的位置跟着猫走
    var bw = 200, bh = 50;
    if (bubble) bubble.style.left = (x + 50) + 'px', bubble.style.top = (y - 12) + 'px';
    if (label)  label.style.left  = (x + 50) + 'px', label.style.top  = (y + 72) + 'px';
    var ctrls = cat.parentNode.querySelector('.lc2-ctrls');
    if (ctrls) ctrls.style.left = (x + 70) + 'px', ctrls.style.top = (y - 12) + 'px';

    // 鼠标速度衰减
    mouseSpeed *= 0.92;
    if (mouseSpeed > 8 && currentStateName !== "ZOOMIES" && currentStateName !== "HUNT" &&
        currentStateName !== "BOXED" && currentStateName !== "PETTED") {
      // 触发追猎
      transitionTo("HUNT");
    }

    rafId = requestAnimationFrame(tick);
  }

  /* ---------- 状态切换 ---------- */
  function transitionTo(name) {
    var next = STATES[name];
    if (!next) return;
    current = next;
    currentStateName = name;
    stateStart = Date.now();
    label.textContent = current.label;
    if (current.behavior) current.behavior();
    scheduleNext();
  }

  function scheduleNext() {
    clearTimeout(stateTimer);
    var jitter = 0.7 + Math.random() * 0.6;
    stateTimer = setTimeout(function () {
      // 凌晨三点强制 ZOOMIES（行为准则 5）
      var hour = new Date().getHours();
      if (hour === 3 && Math.random() < 0.3 && currentStateName !== "ZOOMIES") {
        transitionTo("ZOOMIES");
        return;
      }
      cycleIdx = (cycleIdx + 1) % CYCLE.length;
      transitionTo(CYCLE[cycleIdx]);
    }, current.duration * jitter);
  }

  function interrupt(special) {
    clearTimeout(stateTimer);
    current = Object.assign({}, special);
    currentStateName = special.label;
    label.textContent = special.label;
    cat.className = "lc2-cat state-" + current.pose;
    speak(current.lines);
    stateTimer = setTimeout(function () {
      transitionTo(cycleIdx >= 0 ? CYCLE[cycleIdx] : "SLEEP");
    }, 2400);
  }

  function speak(lines) {
    if (!bubble || !lines) return;
    bubble.textContent = lines[Math.floor(Math.random() * lines.length)];
    bubble.classList.add("show");
    setTimeout(function () { bubble.classList.remove("show"); }, 2800);
  }

  /* ---------- 事件 ---------- */
  function onPet() {
    interrupt(SPECIAL.PETTED);
  }
  function onTreat() {
    interrupt(SPECIAL.TREATED);
    // 鱼按钮位置成为下一个吃东西的目标
    setTimeout(function () { pickEatSpot(); }, 2400);
  }
  function onMouseMove(e) {
    var now = Date.now();
    var dt = Math.max(1, now - lastMouseTime);
    var dx = e.clientX - mouseX;
    var dy = e.clientY - mouseY;
    mouseSpeed = Math.hypot(dx, dy) / dt * 16;  // 单位/帧
    mouseX = e.clientX;
    mouseY = e.clientY;
    lastMouseTime = now;
  }
  function onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else {
      rafId = requestAnimationFrame(tick);
    }
  }
  function hideCat() {
    var wrap = cat.parentNode;
    wrap.classList.add("lc2-hidden");
    setTimeout(showCat, 10000);  // 10 秒后自动回来
  }
  function showCat() {
    var wrap = cat.parentNode;
    wrap.classList.remove("lc2-hidden");
  }
  function showRules() {
    if (bubble) {
      bubble.innerHTML = BEHAVIOR_RULES.slice(0, 4).join('<br>') + '<br><span style="color:#999;font-size:11px">…完整 12 条在控制台</span>';
      bubble.classList.add("show");
      console.log("%c🐱 CAT API · 活猫行为准则\n", "color:#4b5563;font-size:14px;font-weight:bold");
      BEHAVIOR_RULES.forEach(function (r) { console.log(r); });
      setTimeout(function () { bubble.classList.remove("show"); }, 5000);
    }
  }

  /* ---------- 启动 ---------- */
  function start() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }

  function boot() {
    createCat();
    // 初始位置：屏幕底部偏右
    x = window.innerWidth - 200;
    y = window.innerHeight - 110;
    targetX = x;
    targetY = y;
    facing = 1;
    transitionTo("SLEEP");
    rafId = requestAnimationFrame(tick);
  }

  root.LiveCat = {
    start: start,
    STATES: STATES,
    BEHAVIOR_RULES: BEHAVIOR_RULES,
    getState: function () { return currentStateName; },
    getRules: function () { return BEHAVIOR_RULES; }
  };

  start();
})(typeof self !== "undefined" ? self : this);

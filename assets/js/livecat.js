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
  var ctrlsEl = null;   // 控制按钮组（缓存引用，避免 tick 里每帧 querySelector）
  var x = 0, y = 0;     // 当前位置（页面坐标系）
  var targetX = 0, targetY = 0;  // 目标位置
  var facing = 1;       // 朝向：1 右 / -1 左
  var mouseX = -1, mouseY = -1;
  var lastMouseTime = 0;
  var mouseSpeed = 0;

  // 脏检查：只有真正切换了状态，才需要重写 className / data-state。
  // 否则 tick 每帧都会重写一遍样式字符串，哪怕猫根本没换姿势。
  var lastAppliedState = null;
  var lastAppliedPose = null;

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
    },
    HEADBUNT: {
      label: "蹭你", duration: 6500, pose: "bunt", face: "SLOW_BLINK",
      lines: ["重新写入你的标签。", "化学接口已更新。", "你属于我了。", "HEADBUNT ok。"],
      behavior: function () { pickBuntSpot(); }
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
    },
    HAIRBALL: {
      label: "清理缓存", pose: "hack", face: "HUNGRY",
      lines: ["409 CONFLICT。", "正在清理缓存…", "吐毛球中…", "请稍候。"]
    }
  };

  /* ---------- 状态权重（真实猫作息分布）---------- */
  // 此前 CYCLE 等概率轮转 7 个状态，SLEEP 只占 1/7 ≈ 14%——但真实猫一天睡
  // 13-16 小时（54-67%）。spec §5 里自己写的「日均睡眠 13-16 小时」。
  // GROOM 也只占 14%，但真实是醒着时间的 30%（spec §4.1）。
  //
  // 现在按真实猫作息给权重：
  //   SLEEP 50% · GROOM 20% · PATROL 10% · PLAY 8% ·
  //   EAT 5% · STARE 4% · BOXED 3%
  // crepuscular（晨昏活跃）会让 SLEEP 权重在 5-7 点和 17-19 点降到 25%，
  // 其他状态权重同步上调（spec §6.2 真实猫是晨昏动物）。
  var WEIGHTS = {
    SLEEP:  50,
    GROOM:  20,
    PATROL: 10,
    PLAY:    8,
    EAT:     5,
    STARE:   4,
    BOXED:   3
  };

  // crepuscular：晨昏时段（5-7 点 / 17-19 点）SLEEP 降到 25，
  // 其他状态按原比例放大。spec §6.2。
  function currentWeights() {
    var h = new Date().getHours();
    var dawn = (h >= 5 && h <= 7);
    var dusk = (h >= 17 && h <= 19);
    if (!dawn && !dusk) return WEIGHTS;
    var w = {};
    var sleepW = 25;
    var scale = (100 - sleepW) / (100 - WEIGHTS.SLEEP);
    for (var k in WEIGHTS) {
      if (k === "SLEEP") w[k] = sleepW;
      else w[k] = WEIGHTS[k] * scale;
    }
    return w;
  }

  // 按权重随机选一个状态（不一定是当前状态）
  function pickWeightedState(exclude) {
    var w = currentWeights();
    var total = 0;
    var keys = [];
    for (var k in w) {
      if (k === exclude) continue;
      total += w[k];
      keys.push({ k: k, cum: total });
    }
    var r = Math.random() * total;
    for (var i = 0; i < keys.length; i++) {
      if (r < keys[i].cum) return keys[i].k;
    }
    return keys[keys.length - 1].k;
  }

  /* ---------- 抚摸配额（行为准则 6+7）---------- */
  // 每日配额 5 次。戳一次扣一次。配额耗尽返回 429。
  // 用 localStorage 按日持久化——关页面再打开，配额不重置。
  var PET_QUOTA_DEFAULT = 5;
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
  }
  function getQuota() {
    try {
      var raw = localStorage.getItem('catapi_pet_quota');
      if (!raw) return PET_QUOTA_DEFAULT;
      var data = JSON.parse(raw);
      if (data.day !== todayKey()) return PET_QUOTA_DEFAULT;  // 跨日重置
      return data.remaining;
    } catch (e) { return PET_QUOTA_DEFAULT; }
  }
  function setQuota(n) {
    try {
      localStorage.setItem('catapi_pet_quota', JSON.stringify({
        day: todayKey(), remaining: n
      }));
    } catch (e) { /* 无痕模式禁用了 localStorage，静默降级 */ }
  }
  function consumeQuota() {
    var q = getQuota();
    if (q <= 0) return 0;
    setQuota(q - 1);
    return q - 1;  // 扣完后的剩余次数
  }

  /* ---------- 呕吐毛球随机事件 ---------- */
  // 真实猫梗——平均每天 1-2 次。每次 scheduleNext 时检查一次，
  // 触发概率约 6%（结合状态切换频率，大概每天 1-2 次）。
  function maybeHairball() {
    if (currentStateName === "HAIRBALL") return false;
    if (currentStateName === "BOXED" || currentStateName === "PETTED") return false;
    if (Math.random() > 0.06) return false;
    interrupt(SPECIAL.HAIRBALL);
    return true;
  }

  // 中央区域停留检测（行为准则 12）
  // 猫如果走到屏幕中央 30%×30% 区域内且静止超过 3 秒，自动撤离。
  var centerEnterTime = 0;
  function maybeFleeCenter() {
    var w = window.innerWidth, h = window.innerHeight;
    var cx = w / 2, cy = h / 2;
    var inCenter = Math.abs(x - cx) < w * 0.15 && Math.abs(y - cy) < h * 0.15;
    var arrived = Math.abs(targetX - x) < 5 && Math.abs(targetY - y) < 5;
    if (inCenter && arrived) {
      if (centerEnterTime === 0) centerEnterTime = Date.now();
      else if (Date.now() - centerEnterTime > 3000 &&
               currentStateName !== "ZOOMIES" && currentStateName !== "HUNT") {
        centerEnterTime = 0;
        roamRandomly();  // 撤离中央
        return true;
      }
    } else {
      centerEnterTime = 0;
    }
    return false;
  }

  var cycleIdx = -1;
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
    ctrlsEl = ctrls;  // 缓存到模块作用域，tick 里直接拿，不再每帧 querySelector

    var wrap = document.createElement("div");
    wrap.className = "lc2-wrap";
    wrap.appendChild(bubble);
    wrap.appendChild(cat);
    wrap.appendChild(label);
    wrap.appendChild(ctrls);
    document.body.appendChild(wrap);

    // 事件
    cat.addEventListener("click", onPet);
    // §4.2 SLOW_BLINK 缓慢眨眼彩蛋：双击猫触发协议握手
    // spec 里写的「最高级别正面信号」。用户双击 = 我也想跟你握手。
    cat.addEventListener("dblclick", function (e) {
      e.preventDefault();
      e.stopPropagation();
      triggerSlowBlink(true);
    });
    // 鼠标悬停在 STARE 态时也有概率自动眨眼回应
    cat.addEventListener("mouseenter", function () {
      if (currentStateName === "STARE" && Math.random() < 0.3) {
        triggerSlowBlink(false);
      }
    });
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
      // 呼噜波纹层（§4.1）：默认不可见，state-sleep / state-pet 时由
      // .lc2-purring class 触发 CSS 动画——三个同心圆从身体中心扩散
      // 放在身体下层，z 序最低
      '<g class="lc2-purr">' +
        '<circle class="lc2-purr-r1" cx="50" cy="42" r="20" fill="none" stroke="#4b5563" stroke-width="0.8" opacity="0"/>' +
        '<circle class="lc2-purr-r2" cx="50" cy="42" r="20" fill="none" stroke="#4b5563" stroke-width="0.8" opacity="0"/>' +
        '<circle class="lc2-purr-r3" cx="50" cy="42" r="20" fill="none" stroke="#4b5563" stroke-width="0.8" opacity="0"/>' +
      '</g>' +
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

  function pickBuntSpot() {
    // §4.3 HEADBUNT：走到屏幕底部中央偏鼠标位置附近
    // 用户长时间不动 → 猫过来「重新写入你的标签」
    var w = window.innerWidth, h = window.innerHeight;
    var anchor = (mouseX > 0 && mouseY > 0) ? mouseX : w / 2;  // 用户鼠标位置（或屏幕中央）
    targetX = Math.max(60, Math.min(w - 100, anchor - 50));
    targetY = h - 110;  // 底部
  }

  // §4.3 HEADBUNT 触发条件：
  // - 用户鼠标静止超 30 秒
  // - 猫不在睡觉 / 钻纸箱 / 疯跑 / 追猎 / 已经在蹭
  // - 触发概率 18%（每次 scheduleNext 时检查一次，平均每小时 2-3 次）
  function maybeBunt() {
    if (currentStateName === "HEADBUNT" || currentStateName === "BOXED" ||
        currentStateName === "SLEEP" || currentStateName === "ZOOMIES" ||
        currentStateName === "HUNT" || currentStateName === "清理缓存" ||
        currentStateName === "PETTED") return false;
    if (lastMouseTime === 0) return false;  // 还没有鼠标移动数据
    var idle = Date.now() - lastMouseTime;
    if (idle < 30000) return false;
    if (Math.random() > 0.18) return false;
    transitionTo("HEADBUNT");
    return true;
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

    // 应用变换。物理位置每帧都要写（猫在移动）。
    cat.style.transform = 'translate(' + x + 'px,' + y + 'px) scaleX(' + facing + ')';

    // 状态相关样式只在切换时才需要写一次：
    // 此前 tick 每帧都重写 className / data-state，空转也在烧 CPU。
    // 现在用 lastApplied 两个标志位做脏检查，状态没变就跳过。
    if (currentStateName !== lastAppliedState || current.pose !== lastAppliedPose) {
      cat.setAttribute("data-state", currentStateName);
      cat.className = "lc2-cat state-" + current.pose;
      lastAppliedState = currentStateName;
      lastAppliedPose = current.pose;

      // §4.1 呼噜可视化：SLEEP 和 PETTED 时身体周围环形波纹
      // 正向呼噜 25Hz，节奏 ≈ 2.4 秒一圈。state-sleep / state-pet 触发。
      var shouldPurr = (currentStateName === "SLEEP" ||
                        currentStateName === "PETTED" ||
                        current.pose === "sleep" ||
                        current.pose === "pet");
      if (shouldPurr) {
        cat.classList.add("lc2-purring");
      } else {
        cat.classList.remove("lc2-purring");
      }
    }

    // 同步气泡 / 标签 / 按钮组的位置跟着猫走（每帧，因为猫在动）
    if (bubble) bubble.style.left = (x + 50) + 'px', bubble.style.top = (y - 12) + 'px';
    if (label)  label.style.left  = (x + 50) + 'px', label.style.top  = (y + 72) + 'px';
    if (ctrlsEl) ctrlsEl.style.left = (x + 70) + 'px', ctrlsEl.style.top = (y - 12) + 'px';

    // 鼠标速度衰减
    mouseSpeed *= 0.92;
    if (mouseSpeed > 8 && currentStateName !== "ZOOMIES" && currentStateName !== "HUNT" &&
        currentStateName !== "BOXED" && currentStateName !== "PETTED") {
      // 触发追猎
      transitionTo("HUNT");
    }

    // 行为准则 12：中央区域停留超 3 秒自动撤离
    maybeFleeCenter();

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
      // 呕吐毛球检查（每天 1-2 次）
      if (maybeHairball()) return;

      // §4.3 蹭人腿：用户长时间不动时触发
      if (maybeBunt()) return;

      // 凌晨三点 / 凌晨四点前段：强制 ZOOMIES（行为准则 5 + crepuscular）
      var hour = new Date().getHours();
      if ((hour === 3 || hour === 5) &&
          Math.random() < 0.3 &&
          currentStateName !== "ZOOMIES") {
        transitionTo("ZOOMIES");
        return;
      }

      // 加权随机选下一个状态（真实猫作息分布 + crepuscular）
      var next = pickWeightedState(currentStateName);
      transitionTo(next);
    }, current.duration * jitter);
  }

  function interrupt(special) {
    clearTimeout(stateTimer);
    current = Object.assign({}, special);
    currentStateName = special.label;
    // 直接清掉脏检查标志位，下一帧会强制重写样式
    lastAppliedState = null;
    lastAppliedPose = null;
    label.textContent = special.label;
    speak(current.lines);
    // 特殊态持续 2.4 秒（HAIRBALL 加倍，让它有完整表演时长）
    var dwell = special === SPECIAL.HAIRBALL ? 3500 : 2400;
    stateTimer = setTimeout(function () {
      // 回到主循环：按权重选下一个，避免每次都回到同一个状态
      transitionTo(pickWeightedState(special.label));
    }, dwell);
  }

  function speak(lines) {
    if (!bubble || !lines) return;
    bubble.textContent = lines[Math.floor(Math.random() * lines.length)];
    bubble.classList.add("show");
    setTimeout(function () { bubble.classList.remove("show"); }, 2800);
  }

  /* ---------- §4.2 缓慢眨眼（协议握手彩蛋）---------- */
  // spec §4.2 写的「最高级别正面信号」。用户主动眨眼 → 猫回应 → 协议握手成功。
  // 被动触发（hover on STARE）也走同一条路。
  function triggerSlowBlink(userInitiated) {
    if (!cat) return;
    if (cat.classList.contains("lc2-blinking")) return;  // 已经在眨了
    cat.classList.add("lc2-blinking");
    setTimeout(function () { cat.classList.remove("lc2-blinking"); }, 1500);
    // 回应台词
    if (userInitiated) {
      speak(["😊 协议握手成功。", "眨眼已收到。", "我也信任你。", "SLOW_BLINK → ACK。"]);
    } else {
      speak(["…😊", "我也眨了。"]);
    }
  }

  /* ---------- 事件 ---------- */
  function onPet() {
    // 规则 4：钻纸箱后输入被冻结（spec §10 BOXED 态不接受输入）
    if (currentStateName === "BOXED") {
      speak(["系统在纸箱中，输入被拒绝。", "403 Forbidden（系统在纸箱内）。", "请稍后再戳。"]);
      // 视觉反馈：抖一下纸箱
      if (cat) {
        cat.classList.add("lc2-shake-once");
        setTimeout(function () { cat.classList.remove("lc2-shake-once"); }, 400);
      }
      return;
    }
    // 呕吐毛球期间戳会被打断
    if (currentStateName === "清理缓存") return;

    // 行为准则 6+7：每日抚摸配额，戳一次扣一次，配额耗尽返回 429
    var remaining = consumeQuota();
    if (remaining <= 0) {
      speak(["429 Too Many Requests。今日配额已用完。", "配额超限。明日 0:00 重置。", "403 抚摸限流。"]);
      // 视觉反馈：猫明显不悦
      if (cat) {
        cat.classList.add("lc2-annoyed");
        setTimeout(function () { cat.classList.remove("lc2-annoyed"); }, 1200);
      }
      return;
    }

    interrupt(SPECIAL.PETTED);
    // 根据剩余配额显示不同台词
    if (remaining === 1) {
      setTimeout(function () { speak(["今天配额剩 1 次。再摸就 429。"]); }, 1000);
    } else if (remaining === 2) {
      setTimeout(function () { speak(["配额还剩 " + remaining + " 次。"]); }, 1000);
    }
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
      // 行为准则 3：没人看时才疯跑。用户切回这个 tab = 「有人看了」，
      // 但如果离开时间长（>5 秒），回归时猫大概率正好在 ZOOMIES——
      // 我们在隐藏期间就让 scheduleNext 跑，状态机会按权重切到 ZOOMIES。
      // 这里再加一道保险：回归时如果正好是 ZOOMIES，把表演继续做出来。
      if (currentStateName === "ZOOMIES") {
        zoomAround();  // 重新挑一个目标点
      }
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
    getRules: function () { return BEHAVIOR_RULES; },
    transitionTo: transitionTo,        // 暴露给外部触发状态（测试 / 彩蛋）
    triggerBlink: function () { triggerSlowBlink(true); },
    getQuota: getQuota,
    setQuota: setQuota
  };

  start();
})(typeof self !== "undefined" ? self : this);

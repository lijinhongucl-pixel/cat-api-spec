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
    },
    LASER: {
      label: "追激光", duration: 600000, pose: "run", face: "PLAYFUL",
      // duration 设大——激光态由 removeLaser() 主动退出，不靠 duration
      lines: ["那是我的。", "在那边！", "抓住了？没有。", "再跑啊。"],
      behavior: function () { chaseLaser(); }
    },
    CONFUSED: {
      label: "困惑", duration: 2500, pose: "sit", face: "CURIOUS",
      lines: ["…？", "刚才那个红点呢？", "404 Laser Not Found。", "一定是你们系统的事。"],
      behavior: function () { stayStill(); }
    },
    KNEADING_FULL: {
      // §4.4 踩奶独立态：连续摸 3 次触发，前爪节奏性推动 + 呼噜加强
      label: "踩奶", duration: 8000, pose: "knead", face: "SLOW_BLINK",
      lines: ["我把你当作母体。", "踩奶模式 ON。", "呼噜加强。", "这个节奏对。"],
      behavior: function () { stayStill(); }
    },
    NIP_REACT: {
      // §8.3 猫薄荷反应：翻滚 + 流口水 + 踩奶
      label: "猫薄荷反应", duration: 10000, pose: "nip", face: "ZOOMIES",
      lines: ["503 Service Unavailable。", "系统正在重启。", "反应期 5-15 分钟。", "这一切都不是真的。"],
      behavior: function () { roamRandomly(); }
    },
    NIP_NO_REACT: {
      // §8.3 30-50% 实例无反应
      label: "无反应", duration: 3000, pose: "sit", face: "LOAF",
      lines: ["NIP_REACTIVE = false。", "这个味道对我无效。", "304 Not Modified。"],
      behavior: function () { stayStill(); }
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
    },
    KNEADING: {
      label: "踩奶", pose: "knead", face: "CONTENT",
      lines: ["我把你当作母体。", "化学反馈循环中…", "PURR freq → 25Hz ok。", "踩奶协议启动。"]
    },
    NIP_REACT: {
      label: "猫薄荷反应", pose: "nip", face: "HIGH",
      lines: ["503 Service Unavailable。", "系统正在重启…", "NIP_REACTIVE = true。", "翻滚子进程已启动。"]
    },
    NIP_NONE: {
      label: "无反应", pose: "sit", face: "ALERT",
      lines: ["NIP_REACTIVE = false。", "基因检测未通过。", "无响应。"]
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
    // interrupt() 把 currentStateName 设为 special.label（即 "清理缓存"），
    // 不是 SPECIAL 的 key 名。这里检查 label 才有效——之前写成 "HAIRBALL"
    // 永远不会命中，毛球期间可能重复触发毛球。
    if (currentStateName === "清理缓存") return false;
    if (currentStateName === "钻纸箱" || currentStateName === "被摸") return false;
    if (currentStateName === "蹭你") return false;  // 蹭腿期间也别打断
    if (currentStateName === "追激光" || currentStateName === "困惑") return false;  // 追激光 / 困惑期间不打断
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
               currentStateName !== "疯跑" && currentStateName !== "追鼠标") {
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
  var consecutivePets = 0;       // 连续戳猫次数（用于触发踩奶）
  var petResetTimer = null;      // 连续戳计时器（2 秒无操作清零）

  /* ---------- 激光点（规则 11，模块作用域）---------- */
  var laserDot = null;
  var laserX = 0, laserY = 0;
  var laserActive = false;

  function createLaser() {
    if (laserDot) return;
    laserDot = document.createElement("div");
    laserDot.className = "lc2-laser-dot";
    document.body.appendChild(laserDot);
  }
  function updateLaser(px, py) {
    laserX = px; laserY = py;
    if (!laserDot) createLaser();
    laserDot.style.left = (px - 6) + 'px';
    laserDot.style.top  = (py - 6) + 'px';
    if (!laserActive) {
      laserActive = true;
      laserDot.classList.add("show");
      if (typeof transitionTo === "function") transitionTo("LASER");
    }
  }
  function removeLaser() {
    laserActive = false;
    if (laserDot) {
      laserDot.remove();
      laserDot = null;
    }
    // 激光消失 → 猫进入困惑态（spec §6.2 序列被中断）
    if (currentStateName === "追激光" && typeof transitionTo === "function") {
      transitionTo("CONFUSED");
    }
  }
  function onLaserDown(e) {
    if (e.shiftKey || e.button === 2 || e.button === 1) {
      e.preventDefault();
      updateLaser(e.clientX, e.clientY);
    }
  }
  function onLaserMove(e) {
    // 激光激活时，任何鼠标移动都更新激光点位置
    if (laserActive) {
      updateLaser(e.clientX, e.clientY);
    }
  }
  function onLaserUp(e) {
    // 右键/中键松开 或 激光期间的普通左键单击都消除
    if (laserActive && (e.button === 2 || e.button === 1 || e.button === 0)) {
      // 普通左键（button 0）只在 LASER 态下消除；Shift+左键是放激光
      if (e.button === 0 && e.shiftKey) return;
      removeLaser();
    }
  }
  function onLaserKey(e) {
    if (e.key === "Escape" && laserActive) {
      removeLaser();
    }
  }

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
      '<button class="lc2-btn" data-act="nip" title="给猫薄荷">🌿</button>' +
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
    ctrls.querySelector('[data-act="nip"]').addEventListener("click", function (e) { e.stopPropagation(); triggerNip(); });
    ctrls.querySelector('[data-act="hide"]').addEventListener("click", function (e) { e.stopPropagation(); hideCat(); });
    ctrls.querySelector('[data-act="rules"]').addEventListener("click", function (e) { e.stopPropagation(); showRules(); });

    // 激光点事件绑定（规则 11）：右键 / Shift+左键 / 中键放激光
    // 激光变量和函数已在模块作用域定义（tick 需要访问 laserX/Y）
    document.addEventListener("mousedown", onLaserDown);
    document.addEventListener("mousemove", onLaserMove, { passive: true });
    document.addEventListener("mouseup", onLaserUp);
    document.addEventListener("contextmenu", function (e) {
      if (laserActive) e.preventDefault();
    });
    document.addEventListener("keydown", onLaserKey);
    document.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
  }

  /* ---------- SVG 猫身体 v3（AtomCode 打磨版）---------- */
  // 贝塞尔曲线身体轮廓 + 圆角矩形腿 + 爪垫 + 虎斑纹 + 腹部渐变
  // 头身比 1:1.5，6 根胡须，金色竖瞳，粉色鼻头
  function svgCat() {
    return '' +
    '<svg class="lc2-body" width="100" height="70" viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
      '<defs>' +
        '<linearGradient id="lc2-belly-grad" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#3a3a38"/>' +
          '<stop offset="1" stop-color="#5a5a55"/>' +
        '</linearGradient>' +
        '<clipPath id="lc2-body-clip">' +
          '<path d="M32 59 C27 50 28 36 37 28 C45 21 61 21 69 28 C77 35 78 50 73 59 C60 63 45 63 32 59 Z"/>' +
        '</clipPath>' +
      '</defs>' +
      // 呼噜波纹层（§4.1）
      '<g class="lc2-purr">' +
        '<circle class="lc2-purr-r1" cx="52" cy="42" r="22" fill="none" stroke="#4b5563" stroke-width="0.8" opacity="0"/>' +
        '<circle class="lc2-purr-r2" cx="52" cy="42" r="22" fill="none" stroke="#4b5563" stroke-width="0.8" opacity="0"/>' +
        '<circle class="lc2-purr-r3" cx="52" cy="42" r="22" fill="none" stroke="#4b5563" stroke-width="0.8" opacity="0"/>' +
      '</g>' +
      // 尾巴：三次贝塞尔曲线
      '<path class="lc2-tail" d="M72 46 C84 50 93 42 90 30 C88 22 80 22 81 30" fill="none" stroke="#2d2d2b" stroke-width="6" stroke-linecap="round"/>' +
      // 后腿：圆角矩形
      '<rect class="lc2-back-leg" x="61" y="50" width="8.5" height="16" rx="4.25" fill="#2d2d2b"/>' +
      '<rect class="lc2-back-leg2" x="71.5" y="50" width="8.5" height="16" rx="4.25" fill="#2d2d2b"/>' +
      // 身体：贝塞尔曲线轮廓
      '<path d="M32 59 C27 50 28 36 37 28 C45 21 61 21 69 28 C77 35 78 50 73 59 C60 63 45 63 32 59 Z" fill="#2d2d2b"/>' +
      // 腹部渐变
      '<path fill="url(#lc2-belly-grad)" clip-path="url(#lc2-body-clip)" d="M36 58 C40 50 64 50 68 56 C70 61 66 65 52 65 C40 65 34 62 36 58 Z"/>' +
      // 虎斑条纹 ×3
      '<g clip-path="url(#lc2-body-clip)" fill="none" stroke="#4d4d4d" stroke-width="4.5" stroke-linecap="round">' +
        '<path d="M40 16 C34 26 33 44 37 61"/>' +
        '<path d="M53 13 C55 26 52 44 52 63"/>' +
        '<path d="M66 16 C72 26 73 44 69 61"/>' +
      '</g>' +
      // 前腿：圆角矩形
      '<rect class="lc2-front-leg" x="36" y="52" width="7.5" height="14" rx="3.75" fill="#2d2d2b"/>' +
      '<rect class="lc2-front-leg2" x="45.5" y="52" width="7.5" height="14" rx="3.75" fill="#2d2d2b"/>' +
      // 爪垫
      '<g fill="#f7a6b4">' +
        '<circle cx="39.75" cy="64" r="1.9"/>' +
        '<circle cx="49.25" cy="64" r="1.9"/>' +
        '<circle cx="65.25" cy="64" r="1.9"/>' +
        '<circle cx="75.75" cy="64" r="1.9"/>' +
      '</g>' +
      // 头部
      '<g class="lc2-head">' +
        // 耳朵
        '<path class="lc2-ear lc2-ear-l" d="M 6 12 L 11 0 L 17 10 Z" fill="#2d2d2b"/>' +
        '<path class="lc2-ear lc2-ear-l-inner" d="M 8 10 L 11.5 3 L 15 10 Z" fill="#ffb3b3"/>' +
        '<path class="lc2-ear lc2-ear-r" d="M 17 10 L 23 0 L 28 12 Z" fill="#2d2d2b"/>' +
        '<path class="lc2-ear lc2-ear-r-inner" d="M 19 10 L 23 3 L 26 10 Z" fill="#ffb3b3"/>' +
        // 头：贝塞尔曲线轮廓（微心形）
        '<path d="M 3 19 C 3 8 10 4 17 4 C 24 4 31 8 31 19 C 31 27 26 34 17 34 C 7 34 3 27 3 19 Z" fill="#2d2d2b"/>' +
        '<path d="M 5 18 C 5 10 11 6 17 6 C 23 6 29 10 29 18 C 29 25 25 31 17 31 C 9 31 5 25 5 18 Z" fill="#3a3a38"/>' +
        // 眼睛：大椭圆金色
        '<g class="lc2-eyes">' +
          '<ellipse class="lc2-eye lc2-eye-l" cx="12" cy="17" rx="3.5" ry="4.5" fill="#ffd75e"/>' +
          '<ellipse class="lc2-eye lc2-eye-r" cx="22" cy="17" rx="3.5" ry="4.5" fill="#ffd75e"/>' +
          '<rect class="lc2-pupil lc2-pupil-l" x="11.2" y="13" width="1.6" height="8" fill="#0a0a08"/>' +
          '<rect class="lc2-pupil lc2-pupil-r" x="21.2" y="13" width="1.6" height="8" fill="#0a0a08"/>' +
        '</g>' +
        // 鼻头
        '<path d="M 16 23 L 18 23 L 17 25 Z" fill="#ff8080"/>' +
        // 嘴
        '<path class="lc2-mouth" d="M 17 25 Q 14 27 12 26 M 17 25 Q 20 27 22 26" stroke="#1a1a18" stroke-width="1" fill="none" stroke-linecap="round"/>' +
        // 胡须：6 根
        '<g class="lc2-whiskers" stroke="#aaa" stroke-width="0.5" fill="none">' +
          '<line x1="8" y1="21" x2="0" y2="18"/>' +
          '<line x1="8" y1="23" x2="0" y2="23"/>' +
          '<line x1="8" y1="25" x2="0" y2="28"/>' +
          '<line x1="26" y1="21" x2="34" y2="18"/>' +
          '<line x1="26" y1="23" x2="34" y2="23"/>' +
          '<line x1="26" y1="25" x2="34" y2="28"/>' +
        '</g>' +
        // 虎斑 M 纹
        '<path d="M 13 10 L 15 13 L 17 10 L 19 13 L 21 10" stroke="#1a1a18" stroke-width="1" fill="none"/>' +
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
    if (currentStateName === "蹭你" || currentStateName === "钻纸箱" ||
        currentStateName === "睡觉" || currentStateName === "疯跑" ||
        currentStateName === "追鼠标" || currentStateName === "清理缓存" ||
        currentStateName === "被摸" || currentStateName === "追激光" ||
        currentStateName === "困惑") return false;
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

  function chaseLaser() {
    // 规则 11：激光点无视一切去追（spec §8.4）
    // LASER 态由激光点存在期间持续驱动：tick 里每帧把 targetX/Y 更新成 laserX/Y
    targetX = Math.max(20, Math.min(window.innerWidth - 80, laserX - 20));
    targetY = Math.max(60, Math.min(window.innerHeight - 80, laserY - 20));
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

    // 激光态：每帧更新目标到激光点位置（规则 11，spec §8.4）
    if (currentStateName === "追激光" && laserActive) {
      targetX = Math.max(20, Math.min(window.innerWidth - 80, laserX - 20));
      targetY = Math.max(60, Math.min(window.innerHeight - 80, laserY - 20));
    }

    var dx = targetX - x;
    var dy = targetY - y;
    var dist = Math.hypot(dx, dy);

    // 朝向
    if (Math.abs(dx) > 5) facing = dx > 0 ? 1 : -1;

    // 移动速度取决于状态
    var speed = currentStateName === "疯跑" ? 4 :
                currentStateName === "追激光" ? 4.5 :   // 追激光最快（spec §6.2 POUNCE）
                currentStateName === "追鼠标" ? 3 :
                currentStateName === "巡视领地" ? 1.8 :
                currentStateName === "玩耍" ? 2.5 : 1.2;

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
      var shouldPurr = (currentStateName === "睡觉" ||
                        currentStateName === "被摸" ||
                        currentStateName === "踩奶" ||
                        current.pose === "sleep" ||
                        current.pose === "pet" ||
                        current.pose === "knead");
      if (shouldPurr) {
        cat.classList.add("lc2-purring");
      } else {
        cat.classList.remove("lc2-purring");
        cat.classList.remove("lc2-purring-strong");
      }
    }

    // 同步气泡 / 标签 / 按钮组的位置跟着猫走（每帧，因为猫在动）
    if (bubble) bubble.style.left = (x + 50) + 'px', bubble.style.top = (y - 12) + 'px';
    if (label)  label.style.left  = (x + 50) + 'px', label.style.top  = (y + 72) + 'px';
    if (ctrlsEl) ctrlsEl.style.left = (x + 70) + 'px', ctrlsEl.style.top = (y - 12) + 'px';

    // 鼠标速度衰减
    mouseSpeed *= 0.92;
    if (mouseSpeed > 8 && currentStateName !== "疯跑" && currentStateName !== "追鼠标" &&
        currentStateName !== "钻纸箱" && currentStateName !== "被摸" &&
        currentStateName !== "追激光" && currentStateName !== "困惑" &&
        currentStateName !== "踩奶" && currentStateName !== "猫薄荷反应" &&
        currentStateName !== "清理缓存" && currentStateName !== "蹭你") {
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
    // interrupt() 用 label 作为 currentStateName，transitionTo 也应该这样
    // （否则守卫检查时要同时匹配 key 和 label，容易出错）
    currentStateName = next.label || name;
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
      // 激光追逐期间不打断（激光优先级最高）
      var hour = new Date().getHours();
      if ((hour === 3 || hour === 5) &&
          Math.random() < 0.3 &&
          currentStateName !== "疯跑" &&
          currentStateName !== "追激光" &&
          currentStateName !== "困惑") {
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
    // 激光激活时，点猫 = 关闭激光（避免和配额系统打架）
    if (laserActive) {
      removeLaser();
      return;
    }
    // 规则 4：钻纸箱后输入被冻结（spec §10 BOXED 态不接受输入）
    if (currentStateName === "钻纸箱") {
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

    // §4.4 连续戳 3 次触发踩奶独立态
    consecutivePets++;
    clearTimeout(petResetTimer);
    petResetTimer = setTimeout(function () { consecutivePets = 0; }, 2500);
    if (consecutivePets >= 3 && currentStateName !== "踩奶") {
      consecutivePets = 0;
      setTimeout(function () {
        triggerKneading();
      }, 2500);  // 等 PETTED 结束后再切
    }
  }

  // §4.4 踩奶独立态：前爪节奏性推动 + 呼噜加强
  function triggerKneading() {
    if (currentStateName === "清理缓存" || currentStateName === "追激光" ||
        currentStateName === "困惑" || currentStateName === "钻纸箱" ||
        currentStateName === "踩奶") return;
    interrupt(SPECIAL.KNEADING);
    // 踩奶动画由 .state-knead pose 驱动（tick 脏检查会重写 className，
    // 所以不能用额外的 lc2-kneading class——它会被清掉）。
    // 呼噜加强用 attribute 标记，tick 里持久化。
    if (cat) {
      cat.setAttribute("data-purr-strong", "1");
    }
    // 9 秒后回到主循环
    clearTimeout(stateTimer);
    stateTimer = setTimeout(function () {
      if (cat) cat.removeAttribute("data-purr-strong");
      transitionTo(pickWeightedState(currentStateName));
    }, 9000);
  }

  // §8.3 猫薄荷交互：50-70% 概率有反应
  function triggerNip() {
    if (currentStateName === "清理缓存" || currentStateName === "追激光" ||
        currentStateName === "困惑" || currentStateName === "钻纸箱" ||
        currentStateName === "猫薄荷反应" || currentStateName === "踩奶") return;
    // 65% 概率有反应（spec §8.3 写的是 50-70%）
    if (Math.random() < 0.65) {
      interrupt(SPECIAL.NIP_REACT);
      // 翻滚动画由 .state-nip pose 驱动；用 attribute 标记持续
      clearTimeout(stateTimer);
      stateTimer = setTimeout(function () {
        transitionTo(pickWeightedState(currentStateName));
      }, 12000);
    } else {
      // 没反应
      interrupt(SPECIAL.NIP_NONE);
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
      if (currentStateName === "疯跑") {
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

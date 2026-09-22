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
    "12. 在被禁止的区域（屏幕中央）停留超过 3 秒会自动撤离。",
    "13. 走过页面内容时会啃食附近的文字与板块——被啃掉的内容过段时间自动恢复。",
    "14. 跨页面穿越：从页面边缘走出后会在相邻页面重新出现。",
    "15. Token 老鼠定期在全站随机出没——会被其吸引并自动进入追捕模式。",
    "16. 老鼠可被用户点击抓走（用户比猫更准）。老鼠出没在哪个 tab，全站都能感应到。"
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
    },
    STRETCH: {
      // 真实猫醒后招牌动作：前腿前伸、臀部翘起、背部长拉伸展
      // 通常 SLEEP 之后 65% 概率链式触发 STRETCH（transitionTo 里处理）
      label: "伸懒腰", duration: 3500, pose: "stretch", face: "LOAF",
      lines: ["全身接口重新连接。", "腰椎复位。", "这是必要的。"],
      behavior: function () { stayStill(); }
    },
    YAWN: {
      // 打哈欠：嘴张大露牙。常与 STRETCH 串联
      label: "打哈欠", duration: 2500, pose: "yawn", face: "LOAF",
      lines: ["嗯——啊。", "氧合作用。", "不是困。只是重启。"],
      behavior: function () { stayStill(); }
    },
    STARE_MOUSE: {
      // 盯着鼠标不动——猫观察潜在猎物的标志性长时间静默
      // 瞳孔放大、身体压低、偶尔耳朵微抖
      label: "盯着鼠标", duration: 6000, pose: "stalk", face: "ALERT",
      lines: ["锁定目标。", "不要动。", "我在评估。"],
      behavior: function () { faceMouse(); }
    },
    MUNCH: {
      // §13 啃食内容：猫走到文字或板块上方时会啃掉它们
      // 被啃的元素 30-90 秒后自动恢复
      label: "啃食内容", duration: 4000, pose: "munch", face: "HUNGRY",
      lines: ["这段不需要。", "味道还行。", "帮你们删掉了。", "不用谢。", "这个板块多余了。", "404 Content Eaten。"],
      behavior: function () { pickMunchTarget(); }
    },
    HUNT_TOKEN: {
      // §15 Token 老鼠追捕：发现老鼠后全力冲刺
      label: "追 Token 老鼠", duration: 8000, pose: "run", face: "PLAYFUL",
      lines: ["是老鼠！", "这次跑不掉。", "锁定中…", "猎杀序列激活。"],
      behavior: function () { chaseTokenMouse(); }
    },
    CROSSPET_DEPART: {
      // §16 CrossPet 穿越状态：猫走向屏幕边缘，准备穿越到另一个站点
      label: "穿越出去", duration: 3000, pose: "walk", face: "CURIOUS",
      lines: ["去看看外面的世界。", "隔壁有味道。", "我出去一趟。", "404 Cat Not Found。"],
      behavior: function () { pickDeparturePoint(); }
    },
    MEET_VISITOR: {
      // §16 CrossPet 相遇状态：遇到来访宠物时的互动反应
      label: "遇见访客", duration: 6000, pose: "sit", face: "CURIOUS",
      lines: ["……", "你谁？", "闻着不像本地。", "保持距离。", "你好。"],
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
    SLEEP:  44,
    GROOM:  17,
    PATROL:  9,
    PLAY:    7,
    EAT:     4,
    STARE:   3,
    STARE_MOUSE: 5,   // 盯鼠标（中等频率）
    STRETCH: 2,       // 伸懒腰（醒后触发，独立权重兜底）
    YAWN:    2,       // 打哈欠
    BOXED:   3,
    HEADBUNT: 4,      // 蹭人腿也加进来，让它更常触发
    MUNCH:   6        // 啃食内容（比较常见——走过就啃一口）
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

  /* ---------- idle 微动作（独立于状态切换的常驻动画）---------- */
  // 真实猫咪即使不切换状态也在不断做小动作：眨眼、耳朵抖动、尾巴慢摆。
  // 这些通过给 .lc2-cat 挂 idle class 让 CSS 跑独立循环来实现，
  // 不需要状态机干预。
  var idleBlinkTimer = null;
  var idleEarTimer = null;
  function startIdleMotion() {
    scheduleIdleBlink();
    scheduleIdleEarTwitch();
  }
  function scheduleIdleBlink() {
    // 自然眨眼间隔：3-8 秒，随机
    var delay = 3000 + Math.random() * 5000;
    clearTimeout(idleBlinkTimer);
    idleBlinkTimer = setTimeout(function () {
      if (cat && !cat.classList.contains("lc2-blinking")) {
        // 睡觉 / 钻纸箱 / 被摸 期间不触发自动眨眼（状态自身有眼部动画）
        var dormant = currentStateName === "睡觉" ||
                      currentStateName === "钻纸箱";
        if (!dormant) {
          cat.classList.add("lc2-idle-blink");
          setTimeout(function () {
            if (cat) cat.classList.remove("lc2-idle-blink");
          }, 220);
        }
      }
      scheduleIdleBlink();
    }, delay);
  }
  function scheduleIdleEarTwitch() {
    // 耳朵微抖：8-20 秒一次，随机
    var delay = 8000 + Math.random() * 12000;
    clearTimeout(idleEarTimer);
    idleEarTimer = setTimeout(function () {
      if (cat) {
        // 飞行模式（疯跑/追激光）期间不抖耳
        var fast = currentStateName === "疯跑" ||
                   currentStateName === "追激光" ||
                   currentStateName === "追鼠标";
        if (!fast) {
          cat.classList.add("lc2-idle-ear");
          setTimeout(function () {
            if (cat) cat.classList.remove("lc2-idle-ear");
          }, 600);
        }
      }
      scheduleIdleEarTwitch();
    }, delay);
  }

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

  /* ---------- SVG 猫身体 v8（Noto 黑猫授权改编版）---------- */
  // 底稿：Google Noto Emoji 黑猫（U+1F408 U+200D U+2B1B，Apache-2.0）
  // 手术拆解：尾巴从主路径 seg22-29 切出独立动画（闭合曲线互插防接缝）；
  // 远侧腿/远耳独立；眼睛替换为金色杏仁眼+竖瞳+双高光；配色暖炭黑
  function svgCat() {
    return '' +
    '<svg class="lc2-body" width="100" height="70" viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
      '<defs>' +
        '<radialGradient id="lc2-iris-grad" cx="0.35" cy="0.35" r="0.95">' +
          '<stop offset="0" stop-color="#FFE9A8"/>' +
          '<stop offset="0.45" stop-color="#FFC53D"/>' +
          '<stop offset="1" stop-color="#D4880F"/>' +
        '</radialGradient>' +
      '</defs>' +
      '<g class="lc2-purr">' +
        '<circle class="lc2-purr-r1" cx="52.2" cy="38.3" r="18" fill="none" stroke="#4b5563" stroke-width="0.8" opacity="0"/>' +
        '<circle class="lc2-purr-r2" cx="52.2" cy="38.3" r="18" fill="none" stroke="#4b5563" stroke-width="0.8" opacity="0"/>' +
        '<circle class="lc2-purr-r3" cx="52.2" cy="38.3" r="18" fill="none" stroke="#4b5563" stroke-width="0.8" opacity="0"/>' +
      '</g>' +
      '<path class="lc2-tail" d="M 73.48512000000001,36.11985000000001 C 73.48512000000001,36.11985000000001 76.21442,34.459990000000005 77.90213,32.61632000000001 C 79.58984,30.772650000000006 81.99607999999999,28.327420000000007 81.01019000000001,23.492660000000004 C 80.22482000000001,19.649360000000005 77.66262,17.087160000000004 71.58575,15.165510000000006 C 65.57572,13.266140000000005 64.35032000000001,15.471860000000008 64.17765,16.914490000000004 C 63.94371,18.875130000000006 66.45021,19.55467 69.11824000000001,20.061540000000008 C 71.78627000000002,20.56841000000001 76.89396,22.194850000000006 75.39006,26.650850000000005 C 74.44873000000001,29.435850000000006 70.29351000000001,31.134700000000002 70.29351000000001,31.134700000000002 M 70.27680000000001,31.134700000000002 C 67.5475,36.3705 71.4465,38.0415 73.5074,36.14769999999999" fill="#262422"/>' +
      '<path class="lc2-front-leg2" d="M 36.60058,44.33003000000001 C 36.60058,44.33003000000001 34.250040000000006,48.45740000000001 33.5148,51.493050000000004 C 32.78513,54.52313 33.186170000000004,55.709540000000004 33.98268,58.18262000000001 C 34.89616,61.00661000000001 36.00459000000001,63.30145 38.1379,61.94794000000001 C 39.8646,60.85065000000001 40.048410000000004,58.210470000000015 39.786620000000006,57.16331000000001 C 39.52483000000001,56.11615000000001 39.290890000000005,54.65681000000001 39.39672,54.027400000000014 C 39.50255,53.397990000000014 40.677820000000004,50.55172000000002 41.619150000000005,49.19264000000001 C 42.560480000000005,47.83356000000001 42.560480000000005,45.84507000000001 42.404520000000005,45.68911000000001 C 42.242990000000006,45.533150000000006 36.60058,44.33003000000001 36.60058,44.33003000000001" fill="#1B1816"/>' +
      '<path class="lc2-back-leg2" d="M 42.064750000000004,64.69395 C 42.064750000000004,64.69395 41.39635,68.38129 41.75283,68.38129 C 42.10374,68.38129 44.576820000000005,68.26432000000001 45.44017,67.6739 C 46.30352,67.08348000000001 47.07775,65.08385 47.790710000000004,62.81129000000001 C 48.65406,60.06528 49.85718,56.54504000000001 50.14125000000001,55.676120000000004 C 50.66483,54.0831 51.23854000000001,52.462230000000005 51.23854000000001,52.462230000000005 C 51.23854000000001,52.462230000000005 53.90100000000001,52.22272 55.54972,52.150310000000005 C 58.17876,52.03334000000001 60.005720000000004,51.9108 60.412330000000004,52.189299999999996 C 60.92477,52.540209999999995 63.28088000000001,54.12766 63.86016000000001,54.9743 C 64.72351,56.22755 61.74356000000001,62.10947 61.74356,62.10947 C 61.74356,62.10947 59.626960000000004,63.99213 59.70494000000001,65.05043 C 59.78292000000001,66.10873000000001 61.821540000000006,65.99176 63.62622000000001,65.91378 C 65.43090000000001,65.8358 66.39451000000001,65.32336000000001 66.64516,65.05043 C 67.58649000000001,64.03112 68.56681,61.246120000000005 69.19622000000001,58.973560000000006 C 69.79778,56.79569000000001 70.60543000000001,55.44218000000001 70.37149000000001,54.03297 C 70.13755,52.62376 63.00238000000001,46.585879999999996 63.00238000000001,46.585879999999996 L 45.47916000000001,50.81907999999999 L 42.064750000000004,64.69395" fill="#1B1816"/>' +
      '<path class="lc2-ear lc2-ear-r" d="M 32.18914,15.57212 L 41.39078000000001,11.8625 C 41.39078000000001,11.8625 40.49958,9.51196 39.352160000000005,7.473340000000002 C 38.20474000000001,5.434720000000002 35.64254000000001,1.619270000000002 34.439420000000005,1.9311900000000013 C 33.23630000000001,2.2431100000000015 31.977480000000007,8.058190000000002 31.693410000000007,9.617790000000003 C 31.114130000000003,12.79826 32.18914,15.57212 32.18914,15.57212" fill="#1B1816"/>' +
      '<path d="M 33.592780000000005,36.855090000000004 C 33.592780000000005,37.322970000000005 33.92141,40.79865 34.30017,43.28287 C 34.690070000000006,45.87292000000001 35.87091,47.833560000000006 38.221450000000004,49.39873 C 41.045440000000006,51.28139 43.55194,51.59331 43.55194,51.59331 C 43.55194,51.59331 42.688590000000005,56.92380000000001 41.51332000000001,60.45518 C 41.301660000000005,61.09573 40.02613,63.70806 39.74763000000001,64.14252 C 39.46913000000001,64.57698 38.728320000000004,65.83023 38.845290000000006,66.73257000000001 C 38.973400000000005,67.71289000000002 39.70864,68.84917000000002 42.844550000000005,68.21976000000001 C 45.38447000000001,67.71289000000002 45.62955000000001,65.15069000000001 46.37593000000001,63.07308000000001 C 46.65443000000001,62.29328000000001 48.38670000000001,57.48080000000001 48.726470000000006,56.35566000000001 C 49.47842,53.86587000000001 49.901740000000004,52.1893 50.29721000000001,51.75484000000001 C 50.68711000000001,51.32595000000001 54.84790000000001,51.12543000000001 57.43238000000001,50.96947000000001 C 60.022430000000014,50.81351000000001 64.17765,50.735530000000004 64.17765,50.735530000000004 C 64.17765,50.735530000000004 65.94334,52.183730000000004 67.90398,53.08607000000001 C 70.95634,54.48971 73.82489,54.890750000000004 75.15612,56.69543000000001 C 76.44279,58.433270000000014 76.23113000000001,60.109840000000005 75.94149,61.51905000000001 C 75.47361,63.791610000000006 74.61583,65.04486 74.76622,65.86922000000001 C 74.96117,66.96651000000001 76.01947,67.08348000000002 78.21405,67.12247 C 80.33622,67.16146 80.7484,66.73814 81.15500999999999,65.71326 C 82.76473999999999,61.64716000000001 80.17468999999998,56.38351 79.97973999999999,52.89112000000001 C 79.88504999999999,51.23683000000001 77.27271999999999,50.77452000000001 76.68787,48.340430000000005 C 76.09745,45.911910000000006 75.91921,43.43883000000001 75.21182,41.01031000000001 C 74.44316,38.358990000000006 73.48512000000001,36.119850000000014 73.48512000000001,36.11985000000001 C 73.48512000000001,36.11985000000001 76.21442,34.459990000000005 77.90213,32.61632000000001 M 77.90769999999999,32.6386 C 76.45949999999999,27.458499999999997 71.725,27.737 70.2768,31.134700000000002 M 70.29351000000001,31.134700000000006 C 70.29351000000001,31.134700000000006 66.29425,30.533140000000007 60.88578000000001,31.123560000000005 C 56.51890000000001,31.608150000000002 54.44686000000001,32.75 53.97898000000001,32.543910000000004 C 53.27159000000001,32.23199 53.74504,31.212680000000002 54.491420000000005,30.03741 C 55.67226000000001,28.17146 57.12046,25.72623 57.12046000000001,22.668300000000002 C 57.12046000000001,19.610370000000003 55.67226000000001,17.96165 55.67226000000001,17.961650000000002 C 55.67226000000001,17.961650000000002 55.63327000000001,11.962760000000005 54.769920000000006,8.553920000000002 C 53.90657,5.14508 52.29684000000001,1.17924 50.60913000000001,1.1012600000000003 C 48.921420000000005,1.0232800000000002 45.94147,5.13951 45.16167,6.431750000000001 C 44.381870000000006,7.723990000000001 43.08406000000001,10.39202 43.08406000000001,10.39202 C 43.08406000000001,10.39202 38.51666000000001,9.84059 34.695640000000004,11.684260000000002 C 31.3425,13.299560000000001 29.287170000000003,18.35155 28.267860000000006,18.74145 C 27.248550000000005,19.13135 24.842310000000005,19.04223 23.900980000000004,20.61297 C 23.511080000000007,21.25909 23.472090000000005,25.564700000000002 23.47209,25.564700000000002 C 23.47209,25.564700000000002 23.767300000000006,26.584010000000003 24.079220000000003,27.47521 C 24.324300000000004,28.17146 25.594260000000002,30.03741 27.120440000000002,31.15698 C 29.103360000000002,32.61075 31.754680000000008,34.66608 32.33953,35.13396 C 32.924380000000006,35.60184 33.592780000000005,36.855090000000004 33.592780000000005,36.855090000000004" fill="#262422"/>' +
      '<path class="lc2-ear lc2-ear-l-inner" d="M 45.12268,12.820540000000001 C 45.16167000000001,13.644900000000002 47.04433000000001,14.74219 48.02465000000001,15.44958 C 49.004970000000014,16.156969999999998 50.41418000000001,17.705429999999996 50.965610000000005,17.605169999999998 C 51.940360000000005,17.432499999999997 51.86795000000001,13.293989999999999 51.67300000000001,11.450319999999998 C 51.47805000000001,9.606649999999998 50.49773000000001,6.548719999999997 49.86832000000001,6.314779999999997 C 49.23891000000001,6.080839999999998 47.61247000000001,8.425809999999998 47.20029000000001,9.060789999999997 C 46.492900000000006,10.158080000000004 45.083690000000004,12.079730000000003 45.12268,12.820540000000001" fill="#B5818A"/>' +
      '<path class="lc2-mouth" d="M 25.28791,24.17777 C 25.5497,23.86585 29.504400000000004,22.81869 29.632510000000003,22.1113 C 29.760620000000003,21.40391 28.82486,20.8302 27.176140000000004,20.4403 C 25.694520000000004,20.089389999999998 24.341010000000004,20.22864 24.00681,20.468149999999998 C 23.56121,20.78007 23.06548,22.378659999999996 23.19916,23.999529999999996 C 23.332839999999997,25.676099999999995 23.900980000000004,27.046319999999994 24.63622,27.787129999999994 C 25.148660000000003,28.305139999999994 26.396340000000002,29.118359999999996 27.493630000000003,29.196339999999996 C 28.59092,29.274319999999996 29.61023,28.806439999999995 30.161659999999998,28.255009999999995 C 30.71309,27.70358 30.317619999999998,26.817949999999996 29.482120000000002,27.313679999999998 C 28.64662,27.80941 28.08962,27.959799999999998 27.365520000000004,27.759279999999997 C 26.608000000000004,27.547619999999995 25.52185,26.806809999999995 25.293480000000002,25.592549999999996 C 25.14866,24.868450000000003 25.287910000000004,24.17777 25.287910000000004,24.17777" fill="#14110E"/>' +
      '<g class="lc2-eyes">' +
        '<g class="lc2-eye lc2-eye-l">' +
          '<path d="M 32.8 20.9 Q 36.6 17 40.6 20.9 Q 36.6 24.5 32.8 20.9 Z" fill="url(#lc2-iris-grad)"/>' +
          '<rect class="lc2-pupil lc2-pupil-l" x="35.8" y="17.7" width="1.6" height="6.4" rx="0.8" fill="#14100B"/>' +
          '<circle cx="38.2" cy="19" r="1" fill="#FFFFFF" opacity="0.95"/>' +
          '<circle cx="35.3" cy="22.8" r="0.55" fill="#FFFFFF" opacity="0.5"/>' +
        '</g>' +
      '</g>' +
      '<g class="lc2-whiskers" fill="#D8D3CC" opacity="0.8">' +
          '<path d="M 23.66704,23.69875 C 23.65033,23.69875 21.7621,23.69875 20.47543,23.659760000000002 C 19.18319,23.62077 17.980069999999998,23.581780000000002 17.980069999999998,23.58178 C 17.980069999999998,23.58178 17.384079999999997,23.56507 17.384079999999997,22.98022 C 17.384079999999997,22.389799999999997 18.00235,22.417650000000002 18.00235,22.417650000000002 C 18.00235,22.417650000000002 19.211039999999997,22.456640000000004 20.50885,22.495630000000002 C 21.77881,22.534620000000004 23.65033,22.534620000000004 23.66704,22.534620000000004 C 23.990099999999998,22.534620000000004 24.251890000000003,22.79641 24.251890000000003,23.11947 C 24.251890000000003,23.442529999999998 23.9901,23.69875 23.66704,23.69875"/>' +
          '<path d="M 18.01349,27.2357 C 18.01349,27.2357 17.46206,27.386090000000003 17.33952,26.78453 C 17.21698,26.1774 17.76284,26.09385 17.76284,26.09385 C 17.76284,26.09385 19.361430000000002,25.6204 20.464290000000002,25.386459999999996 C 21.55601,25.152519999999996 23.82857,24.723629999999996 23.85085,24.718059999999994 C 24.16834,24.656789999999994 24.474690000000002,24.868449999999996 24.535960000000003,25.18594 C 24.597230000000003,25.503429999999998 24.38557,25.809779999999996 24.068080000000002,25.871049999999997 C 24.0458,25.876619999999996 21.78995,26.305509999999998 20.70937,26.533879999999996 C 19.61208,26.76225 18.01349,27.2357 18.01349,27.2357"/>' +
          '<path d="M 20.714940000000002,30.24907 C 20.525560000000002,30.24907 20.34175,30.15438 20.22478,29.987280000000002 C 20.04654,29.719920000000002 20.118949999999998,29.357870000000002 20.38631,29.17406 L 23.438670000000002,26.78453 C 23.70603,26.60629 24.068080000000002,26.678700000000003 24.251890000000003,26.94606 C 24.430130000000002,27.21342 24.35772,27.57547 24.090360000000004,27.75928 L 21.22738,30.01513 C 21.12712,30.081970000000002 20.826340000000002,30.24907 20.714940000000002,30.24907"/>' +
          '<path d="M 41.713840000000005,29.20748 C 41.62472,29.20748 41.5356,29.185200000000002 41.45205,29.14621 C 41.435340000000004,29.14064 39.88688,28.355269999999997 38.54451,27.9598 C 37.16315,27.553190000000004 35.87091,27.24127 35.854200000000006,27.2357 C 35.542280000000005,27.15772 35.34733000000001,26.8458 35.419740000000004,26.52831 C 35.49772,26.21639 35.80964,26.021440000000002 36.12713,26.09385 C 36.138270000000006,26.09942 37.463930000000005,26.416909999999998 38.87314000000001,26.83466 C 40.321340000000006,27.263550000000002 41.90879,28.071199999999997 41.97563,28.10462 C 42.26527000000001,28.24944 42.376670000000004,28.600350000000002 42.23185000000001,28.889989999999997 C 42.13159,29.090510000000002 41.92550000000001,29.20748 41.713840000000005,29.20748"/>' +
          '<path d="M 41.112280000000005,33.23459 C 40.989740000000005,33.23459 40.867200000000004,33.1956 40.766940000000005,33.11762 C 40.75023,33.10648 38.95669,31.780820000000006 37.803700000000006,30.98431 C 36.68413,30.21565 35.135670000000005,29.49712 35.11896,29.49155 C 34.823750000000004,29.35787 34.695640000000004,29.006960000000003 34.82932,28.71732 C 34.963,28.42211 35.31391,28.294 35.60355,28.42768 C 35.67039,28.4611 37.25784,29.190769999999997 38.46096,30.020699999999998 C 39.630660000000006,30.82835 41.44091,32.15958 41.457620000000006,32.176289999999995 C 41.71941,32.365669999999994 41.769540000000006,32.73329 41.58016000000001,32.995079999999994 C 41.46876,33.15104 41.29052,33.23459 41.112280000000005,33.23459"/>' +
          '<path d="M 38.343990000000005,35.27321 C 38.20474,35.27321 38.065490000000004,35.223079999999996 37.95409,35.122820000000004 L 34.08851,31.674990000000008 C 33.849000000000004,31.457760000000007 33.82672,31.09014000000001 34.04395,30.850630000000006 C 34.26118,30.611120000000007 34.628800000000005,30.58884000000001 34.86831,30.80607000000001 L 38.73389,34.25390000000001 C 38.9734,34.47113000000001 38.99568,34.838750000000005 38.77845,35.07826000000001 C 38.661480000000005,35.20637 38.50552,35.273210000000006 38.34399,35.273210000000006"/>' +
      '</g>' +
    '</svg>';
  }

  /* ---------- §15 Token 老鼠系统 ---------- */
  // 一只金色 token 主题的老鼠会定期在全站随机角落出没。
  // 猫会被吸引进入 HUNT_TOKEN 状态全力追捕。
  // 抓到后老鼠消失（掉落金色 token 粒子），猫获得 1 个 Token 收藏品。
  var mouse = null;           // 老鼠 DOM 节点
  var mouseX = 0, mouseY = 0; // 老鼠当前位置
  var mouseTargetX = 0, mouseTargetY = 0; // 老鼠目标位置
  var mouseActive = false;
  var mouseEscapeTimer = null;
  var mouseSpawnTimer = null;
  var mouseCaught = false;
  var mouseDir = 1;           // 老鼠朝向
  var mouseWiggle = 0;        // 跑动时的身体摆动
  var tokenCount = 0;         // 累计抓到的 Token 数

  function svgMouse() {
    // ============================================================
    //  TOKEN MOUSE v2 — 全新手绘角色
    //  设计语言：流畅解剖 + 金色渐变 + 嵌入式 Token 核心
    //  视觉锚点：身体中央的发光金币（站点第二吉祥物）
    //  尺寸：viewBox 120×80（比 v1 大 50%，更有存在感）
    // ============================================================
    return ''
    + '<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" class="lc2-mouse-body">'
    // ---- defs：渐变定义 ----
    + '<defs>'
    // 主体金色渐变（上浅下深，模拟立体感）
    + '<radialGradient id="m-fur" cx="45%" cy="35%" r="65%">'
    +   '<stop offset="0%" stop-color="#ffe066"/>'
    +   '<stop offset="45%" stop-color="#ffd429"/>'
    +   '<stop offset="100%" stop-color="#c69500"/>'
    + '</radialGradient>'
    // 头部渐变（稍亮，突出头部）
    + '<radialGradient id="m-head" cx="40%" cy="30%" r="70%">'
    +   '<stop offset="0%" stop-color="#ffe87a"/>'
    +   '<stop offset="50%" stop-color="#ffcc1a"/>'
    +   '<stop offset="100%" stop-color="#d4a000"/>'
    + '</radialGradient>'
    // 耳朵内（浅粉金渐变）
    + '<radialGradient id="m-ear" cx="50%" cy="50%" r="50%">'
    +   '<stop offset="0%" stop-color="#fff0a8"/>'
    +   '<stop offset="70%" stop-color="#ffd87a"/>'
    +   '<stop offset="100%" stop-color="#e8b923"/>'
    + '</radialGradient>'
    // 肚子浅色区
    + '<linearGradient id="m-belly" x1="0" y1="0" x2="0" y2="1">'
    +   '<stop offset="0%" stop-color="#fff5cc" stop-opacity="0.8"/>'
    +   '<stop offset="100%" stop-color="#ffe066" stop-opacity="0.3"/>'
    + '</linearGradient>'
    // Token 金币渐变
    + '<radialGradient id="m-token" cx="35%" cy="30%" r="70%">'
    +   '<stop offset="0%" stop-color="#fff8dc"/>'
    +   '<stop offset="30%" stop-color="#ffd700"/>'
    +   '<stop offset="70%" stop-color="#daa520"/>'
    +   '<stop offset="100%" stop-color="#8b6914"/>'
    + '</radialGradient>'
    // 发光滤镜
    + '<filter id="m-glow" x="-50%" y="-50%" width="200%" height="200%">'
    +   '<feGaussianBlur stdDeviation="2.5" result="blur"/>'
    +   '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>'
    + '</filter>'
    // 阴影滤镜
    + '<filter id="m-shadow" x="-30%" y="-30%" width="160%" height="160%">'
    +   '<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.25"/>'
    + '</filter>'
    + '</defs>'

    // ---- 外圈脉冲发光晕（最大层）----
    + '<circle cx="60" cy="42" r="38" fill="none" stroke="#ffd700" stroke-width="1" opacity="0.15" class="lc2-mouse-glow lc2-mouse-glow-outer"/>'

    // ---- 尾巴（长而细，弯弯曲曲从身体末端伸出）----
    + '<path d="M 96 42 Q 108 36 112 24 Q 113 18 110 16 Q 108 20 106 28 Q 104 34 98 38"'
    +       ' fill="none" stroke="#c69500" stroke-width="2.5" stroke-linecap="round" class="lc2-mouse-tail"/>'
    + '<circle cx="110" cy="16" r="2" fill="#ffd700"/>'  // 尾巴尖端的小球

    // ---- 后腿（可见的前侧后腿，小腿弯曲）----
    + '<path d="M 72 54 Q 76 62 74 68 Q 73 70 76 71 L 80 71 Q 82 69 80 66 Q 78 60 78 52"'
    +       ' fill="url(#m-fur)" stroke="#c69500" stroke-width="1.2" stroke-linejoin="round"/>'

    // ---- 身体（流线型椭圆，稍向右下倾斜模拟跑动感）----
    + '<ellipse cx="60" cy="42" rx="30" ry="18" fill="url(#m-fur)" stroke="#c69500" stroke-width="1.5" filter="url(#m-shadow)"/>'

    // ---- 肚子浅色高光区 ----
    + '<ellipse cx="58" cy="46" rx="22" ry="11" fill="url(#m-belly)"/>'

    // ---- Token 金币核心（身体的灵魂标识）----
    // 外光环
    + '<circle cx="62" cy="40" r="11" fill="none" stroke="#ffd700" stroke-width="0.8" opacity="0.4" class="lc2-mouse-glow"/>'
    // 金币主体
    + '<circle cx="62" cy="40" r="9" fill="url(#m-token)" stroke="#8b6914" stroke-width="1.2" filter="url(#m-glow)"/>'
    // 金币内圈装饰
    + '<circle cx="62" cy="40" r="7" fill="none" stroke="#fff8dc" stroke-width="0.5" opacity="0.6"/>'
    // 「T」字符（站点 Token 标识）
    + '<text x="62" y="44.5" text-anchor="middle" font-size="10" font-weight="900" fill="#8b6914"'
    +       ' font-family="Georgia, serif" class="lc2-mouse-token-T">T</text>'
    // 金币顶部高光
    + '<ellipse cx="59" cy="36" rx="4" ry="2" fill="#fff" opacity="0.35"/>'

    // ---- 前腿（靠近头部，短小）----
    + '<path d="M 38 48 Q 36 56 38 62 Q 39 66 42 66 L 44 66 Q 46 63 45 58 Q 44 52 44 48"'
    +       ' fill="url(#m-fur)" stroke="#c69500" stroke-width="1.2" stroke-linejoin="round"/>'
    // 前爪
    + '<ellipse cx="42" cy="66" rx="3.5" ry="2" fill="#c69500"/>'

    // ---- 头部（大而圆，身体前方）----
    + '<ellipse cx="32" cy="32" rx="17" ry="15" fill="url(#m-head)" stroke="#c69500" stroke-width="1.5" filter="url(#m-shadow)"/>'

    // ---- 耳朵（大圆耳，老鼠的标志性特征）----
    // 左耳（远耳，在后）
    + '<circle cx="22" cy="18" r="8" fill="url(#m-fur)" stroke="#c69500" stroke-width="1.5"/>'
    + '<circle cx="22" cy="19" r="5" fill="url(#m-ear)"/>'
    // 右耳（近耳）
    + '<circle cx="36" cy="16" r="8.5" fill="url(#m-fur)" stroke="#c69500" stroke-width="1.5"/>'
    + '<circle cx="36" cy="17" r="5.5" fill="url(#m-ear)"/>'

    // ---- 眼睛（机灵的大眼睛，带高光）----
    // 眼眶
    + '<ellipse cx="27" cy="30" rx="3.2" ry="3.5" fill="#1a1a1a"/>'
    + '<ellipse cx="38" cy="30" rx="3.2" ry="3.5" fill="#1a1a1a"/>'
    // 瞳孔高光（大眼明亮感）
    + '<circle cx="28" cy="28.5" r="1.2" fill="#fff"/>'
    + '<circle cx="39" cy="28.5" r="1.2" fill="#fff"/>'
    + '<circle cx="26.3" cy="31.3" r="0.5" fill="#fff" opacity="0.7"/>'
    + '<circle cx="37.3" cy="31.3" r="0.5" fill="#fff" opacity="0.7"/>'

    // ---- 鼻子（粉色小三角，鼻尖朝前）----
    + '<path d="M 19 35 L 22 35 L 20.5 38 Z" fill="#ff8fa3" stroke="#d4647e" stroke-width="0.5"/>'
    + '<circle cx="20.5" cy="35.5" r="0.8" fill="#ffb0c0"/>'  // 鼻头高光

    // ---- 嘴巴（小笑脸）----
    + '<path d="M 20.5 38 Q 19 41 17.5 40" fill="none" stroke="#8b6914" stroke-width="0.8" stroke-linecap="round"/>'
    + '<path d="M 20.5 38 Q 22 41 23.5 40" fill="none" stroke="#8b6914" stroke-width="0.8" stroke-linecap="round"/>'

    // ---- 胡须（左右各 3 根，细长）----
    + '<line x1="17" y1="36" x2="6" y2="34" stroke="#8b6914" stroke-width="0.5" stroke-linecap="round" opacity="0.7"/>'
    + '<line x1="17" y1="38" x2="5" y2="39" stroke="#8b6914" stroke-width="0.5" stroke-linecap="round" opacity="0.7"/>'
    + '<line x1="17" y1="39" x2="6" y2="43" stroke="#8b6914" stroke-width="0.5" stroke-linecap="round" opacity="0.7"/>'
    + '<line x1="26" y1="36" x2="36" y2="33" stroke="#8b6914" stroke-width="0.5" stroke-linecap="round" opacity="0.5"/>'
    + '<line x1="26" y1="38" x2="37" y2="38" stroke="#8b6914" stroke-width="0.5" stroke-linecap="round" opacity="0.5"/>'

    // ---- 头部高光（额头亮区）----
    + '<ellipse cx="28" cy="24" rx="6" ry="3" fill="#fff" opacity="0.2"/>'

    // ---- 耳朵抖动层（CSS 动画用）----
    // 通过 class 让耳朵独立抖动

    + '</svg>';
  }

  function createMouse() {
    if (mouse) return;
    mouse = document.createElement('div');
    mouse.className = 'lc2-mouse';
    mouse.setAttribute('aria-hidden', 'true');
    mouse.setAttribute('role', 'button');
    mouse.setAttribute('tabindex', '0');
    mouse.setAttribute('title', '点我抓走！(鼠标彩蛋)');
    mouse.innerHTML = svgMouse();
    document.body.appendChild(mouse);

    // §15b 用户点击交互彩蛋：用户抓老鼠
    // 点击 / 触摸 / 回车都能触发——抓到后掉落双倍 Token 粒子 + 庆祝气泡
    var userCatch = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!mouse || mouseCaught) return;
      catchMouseByUser();
    };
    mouse.addEventListener('click', userCatch);
    mouse.addEventListener('touchstart', userCatch, { passive: false });
    mouse.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); userCatch(ev); }
    });
  }

  // 用户亲手抓住老鼠：比猫抓奖励更丰厚（双倍粒子 + 猫吃醋台词）
  function catchMouseByUser() {
    if (!mouse || mouseCaught) return;
    mouseCaught = true;
    mouseActive = false;
    tokenCount += 2;  // 用户抓得比猫准——奖励翻倍
    try { localStorage.setItem('catapi_tokens_caught', String(tokenCount)); } catch(e) {}

    // 双倍 Token 粒子爆裂
    spawnTokenParticles(mouseX + 30, mouseY + 20);
    spawnTokenParticles(mouseX + 60, mouseY + 10);
    spawnTokenParticles(mouseX + 10, mouseY + 40);

    // 老鼠「被抓」动画（旋转 + 缩小 + 上飘）
    mouse.classList.add('lc2-mouse-caught-by-user');
    setTimeout(function () {
      if (mouse) { mouse.remove(); mouse = null; }
    }, 700);

    // 清理计时器
    clearTimeout(mouseEscapeTimer);

    // 猫的反应（吃醋 / 惊讶 / 认输）
    var reactions = [
      "……那是我的。", "你怎么抢我的活？", "行。你厉害。", "工资该给你发。",
      "Token +2。但我记住了。", "抢食。人类就会抢食。", "你抓得确实快。这次。"
    ];
    speak(reactions);

    // 广播给其他 tab：用户在这个 tab 抓住了
    if (bc) {
      try { bc.postMessage({ type: 'mouse_caught_by_user', ts: Date.now(), tokens: tokenCount }); } catch (e) {}
    }

    // 猫从追捕状态恢复
    setTimeout(function () {
      if (currentStateName === "追 Token 老鼠") {
        transitionTo("CONFUSED");  // 吃醋——用困惑态代替（猫的情绪不会精确映射到愤怒）
      }
    }, 1800);

    scheduleNextMouse();
  }

  function spawnMouse() {
    if (mouseActive) return;
    // 猫正在睡觉或钻纸箱时不打扰
    if (currentStateName === "睡觉" && Math.random() < 0.5) return;
    if (currentStateName === "钻纸箱") return;

    createMouse();
    mouseActive = true;
    mouseCaught = false;

    // 随机出没位置：避开屏幕边缘
    var w = window.innerWidth, h = window.innerHeight;
    var side = Math.random();
    if (side < 0.25) {
      // 左边进
      mouseX = -80; mouseY = 80 + Math.random() * (h - 200);
      mouseDir = 1;
    } else if (side < 0.5) {
      // 右边进
      mouseX = w + 80; mouseY = 80 + Math.random() * (h - 200);
      mouseDir = -1;
    } else {
      // 屏幕中间随机出现
      mouseX = 80 + Math.random() * (w - 160);
      mouseY = 80 + Math.random() * (h - 200);
      mouseDir = Math.random() < 0.5 ? 1 : -1;
    }
    mouseTargetX = mouseX;
    mouseTargetY = mouseY;

    mouse.style.left = mouseX + 'px';
    mouse.style.top = mouseY + 'px';
    mouse.style.opacity = '0';
    mouse.style.transform = 'translate(0,0)';
    // 渐入
    setTimeout(function () {
      if (mouse) mouse.style.opacity = '1';
    }, 50);

    // 猫被吸引——切换到追老鼠状态
    if (currentStateName !== "追激光" && currentStateName !== "清理缓存" &&
        currentStateName !== "钻纸箱" && currentStateName !== "踩奶") {
      transitionTo("HUNT_TOKEN");
      speak(["有老鼠！", "Token Mouse 出现！", "这次它跑不掉了。"]);
    }

    // 老鼠自动逃跑倒计时（8-15 秒后如果没被抓到就逃跑）
    var escapeDelay = 8000 + Math.random() * 7000;
    clearTimeout(mouseEscapeTimer);
    mouseEscapeTimer = setTimeout(function () {
      if (mouseActive && !mouseCaught) {
        escapeMouse();
      }
    }, escapeDelay);

    // §15c 广播给其他 tab：这只老鼠出现在本 tab
    if (bc) {
      try {
        bc.postMessage({
          type: 'mouse_spawned',
          page: location.pathname,
          ts: Date.now()
        });
      } catch (e) {}
    }
  }

  function escapeMouse() {
    if (!mouse) return;
    mouseCaught = false;
    mouseActive = false;
    // 老鼠向最近的边缘逃跑
    var w = window.innerWidth, h = window.innerHeight;
    if (mouseX < w / 2) mouseTargetX = -100;
    else mouseTargetX = w + 100;
    mouseTargetY = mouseY;
    // 渐隐
    setTimeout(function () {
      if (mouse) {
        mouse.style.opacity = '0';
        setTimeout(function () {
          if (mouse) { mouse.remove(); mouse = null; }
        }, 600);
      }
    }, 800);

    // 猫从追捕状态恢复
    if (currentStateName === "追 Token 老鼠") {
      speak(["跑了。", "下次。", "404 Mouse Not Found。", "它比我快。这次。"]);
      setTimeout(function () {
        if (currentStateName === "追 Token 老鼠") {
          transitionTo(pickWeightedState("HUNT_TOKEN"));
        }
      }, 1500);
    }
    // §15c 广播给其他 tab
    if (bc) {
      try { bc.postMessage({ type: 'mouse_escaped', ts: Date.now() }); } catch (e) {}
    }
    scheduleNextMouse();
  }

  function catchMouse() {
    if (!mouse || mouseCaught) return;
    mouseCaught = true;
    mouseActive = false;
    tokenCount++;
    // 存入 localStorage
    try {
      localStorage.setItem('catapi_tokens_caught', String(tokenCount));
    } catch(e) {}

    // 掉落金色 token 粒子
    spawnTokenParticles(mouseX + 30, mouseY + 20);

    // 老鼠消失动画
    if (mouse) {
      mouse.style.transition = 'opacity .4s ease, transform .4s ease';
      mouse.style.opacity = '0';
      mouse.style.transform = 'scale(0.3) rotate(180deg)';
      setTimeout(function () {
        if (mouse) { mouse.remove(); mouse = null; }
      }, 400);
    }

    // 猫的胜利台词
    speak(["抓住了！", "Token +1。", "猎杀序列闭合。", "这才是真正的食物。", "200 OK。"]);
    // §15c 广播给其他 tab
    if (bc) {
      try { bc.postMessage({ type: 'mouse_caught', ts: Date.now(), tokens: tokenCount }); } catch (e) {}
    }
    // 切回正常状态
    clearTimeout(mouseEscapeTimer);
    setTimeout(function () {
      if (currentStateName === "追 Token 老鼠") {
        transitionTo("EAT");  // 抓到后进入吃东西状态
      }
    }, 2000);
    scheduleNextMouse();
  }

  function spawnTokenParticles(cx, cy) {
    for (var i = 0; i < 8; i++) {
      var p = document.createElement('div');
      p.className = 'lc2-token-particle';
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.setProperty('--dx', ((Math.random() - 0.5) * 120) + 'px');
      p.style.setProperty('--dy', (-30 - Math.random() * 80) + 'px');
      p.style.setProperty('--rot', (360 + Math.random() * 360) + 'deg');
      document.body.appendChild(p);
      (function (el) {
        setTimeout(function () { if (el.parentNode) el.remove(); }, 1200);
      })(p);
    }
  }

  // 老鼠自己的移动逻辑：在屏幕里随机跑动，避开猫
  function mouseTick() {
    if (!mouse || !mouseActive) return;
    // 计算与猫的距离
    var dx = mouseX - x;
    var dy = mouseY - y;
    var distCat = Math.hypot(dx, dy);

    // 检查是否被抓到
    if (distCat < 40) {
      catchMouse();
      return;
    }

    // 老鼠的 AI：远离猫 + 随机游走
    if (distCat < 200) {
      // 猫靠近了——逃跑方向远离猫
      mouseTargetX = mouseX + (dx / distCat) * 150 + (Math.random() - 0.5) * 60;
      mouseTargetY = mouseY + (dy / distCat) * 100 + (Math.random() - 0.5) * 60;
      // 限制在屏幕内
      mouseTargetX = Math.max(20, Math.min(window.innerWidth - 80, mouseTargetX));
      mouseTargetY = Math.max(60, Math.min(window.innerHeight - 80, mouseTargetY));
    } else if (Math.random() < 0.02) {
      // 远离猫时偶尔随机游走
      mouseTargetX = 60 + Math.random() * (window.innerWidth - 160);
      mouseTargetY = 80 + Math.random() * (window.innerHeight - 200);
    }

    // 朝目标移动（老鼠比猫快一点——增加难度）
    var mdx = mouseTargetX - mouseX;
    var mdy = mouseTargetY - mouseY;
    var mdist = Math.hypot(mdx, mdy);
    var mSpeed = distCat < 200 ? 3.5 : 1.8;  // 逃跑时更快
    if (mdist > mSpeed) {
      mouseX += (mdx / mdist) * mSpeed;
      mouseY += (mdy / mdist) * mSpeed;
    }
    // 朝向
    if (Math.abs(mdx) > 3) mouseDir = mdx > 0 ? 1 : -1;
    // 摆动
    mouseWiggle += 0.3;

    mouse.style.left = mouseX + 'px';
    mouse.style.top = mouseY + 'px';
    mouse.style.transform = 'scaleX(' + mouseDir + ') translateY(' + Math.sin(mouseWiggle) * 2 + 'px)';
  }

  // 猫追老鼠：目标跟随老鼠位置
  function chaseTokenMouse() {
    targetX = Math.max(20, Math.min(window.innerWidth - 80, mouseX - 20));
    targetY = Math.max(60, Math.min(window.innerHeight - 80, mouseY - 20));
  }

  // 下次出没时间：30-90 秒（同步跨 tab —— 所有 tab 共享同一时刻）
  // 通过 localStorage 协调，避免每个 tab 都各自生成一只老鼠。
  var MOUSE_SYNC_KEY = 'catapi_next_mouse_ts';
  function scheduleNextMouse() {
    clearTimeout(mouseSpawnTimer);
    // 检查共享的「下次出没时间」；不存在或已过期则生成一个新的
    var now = Date.now();
    var nextTs = 0;
    try {
      var raw = localStorage.getItem(MOUSE_SYNC_KEY);
      if (raw) nextTs = parseInt(raw) || 0;
    } catch(e) {}
    if (!nextTs || nextTs < now) {
      // 本 tab 负责生成下一只——但为了避免所有 tab 同时写入，
      // 加一个小随机延迟（0-1.5 秒），再检查一次（CAS 风格）
      var delay = 30000 + Math.random() * 60000;  // 30-90s
      nextTs = now + delay;
      try { localStorage.setItem(MOUSE_SYNC_KEY, String(nextTs)); } catch(e) {}
    }
    var delayMs = Math.max(2000, nextTs - now);
    mouseSpawnTimer = setTimeout(spawnMouse, delayMs);
  }

  // §15c 跨 tab 同步：spawn 时广播位置；其他 tab 收到后显示「老鼠正在别处」幽灵提示
  var ghostHintTimer = null;
  var ghostHintEl = null;
  function showGhostMouseHint(otherPath, ttl) {
    // 在随机位置显示一个半透明的「幽灵老鼠」提示——只在其他 tab 有老鼠出没时显示
    if (!ghostHintEl) {
      ghostHintEl = document.createElement('div');
      ghostHintEl.className = 'lc2-mouse-hint';
      document.body.appendChild(ghostHintEl);
    }
    var pageName = (otherPath || '').split('/').pop() || '另一页面';
    ghostHintEl.textContent = '🐾 Token 老鼠正在「' + pageName + '」出没';
    // 随机放置在屏幕边缘
    var side = Math.random() < 0.5 ? 0 : 1;
    ghostHintEl.style.left = (side === 0 ? 20 : window.innerWidth - 240) + 'px';
    ghostHintEl.style.top = (60 + Math.random() * (window.innerHeight - 160)) + 'px';
    ghostHintEl.classList.add('show');
    clearTimeout(ghostHintTimer);
    ghostHintTimer = setTimeout(function () {
      if (ghostHintEl) ghostHintEl.classList.remove('show');
    }, ttl || 6000);
  }

  // 启动老鼠系统
  scheduleNextMouse();

  // 老鼠 tick——挂到主 tick 之后
  var mouseRafId = null;
  function mouseTickLoop() {
    mouseTick();
    mouseRafId = requestAnimationFrame(mouseTickLoop);
  }
  mouseRafId = requestAnimationFrame(mouseTickLoop);

  // 读取已抓到的 Token 数
  try {
    var saved = localStorage.getItem('catapi_tokens_caught');
    if (saved) tokenCount = parseInt(saved) || 0;
  } catch(e) {}

  /* ---------- §13 啃食内容系统 ---------- */
  // 猫走到文字 / 板块上方时会「啃食」它们——被啃的元素变灰 + 显示标签，
  // 一段时间后（30-90 秒）自动恢复。
  // 啃食目标选择：寻找猫当前位置附近的可啃 DOM 元素
  // 可啃类型：p, h1-h3, li, td, blockquote, .card, .stat, strong, em, a
  var MUNCH_TAGS = ['P','H1','H2','H3','LI','TD','TH','BLOCKQUOTE','STRONG','EM','A','SPAN','DIV','SECTION'];
  var MUNCH_TAGS_PRIMARY = ['P','H1','H2','H3','LI','TD','BLOCKQUOTE','STRONG']; // 优先啃这些
  var munchedSet = new WeakSet();     // 本页已啃过的元素（避免重复啃同一个）
  var munchFullness = 0;              // 饱腹值（0-100），啃太多会停下来

  function pickMunchTarget() {
    // 从猫当前位置出发，搜索半径 250px 内的可啃元素
    var candidates = [];
    var els = document.querySelectorAll('body *:not(.lc2-wrap):not(.lc2-cat):not(script):not(style):not(.lc2-laser-dot):not(.lc2-crumb)');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (munchedSet.has(el)) continue;
      if (el.classList && el.classList.contains('lc2-munched')) continue;
      if (el.classList && (el.classList.contains('lc2-wrap') || el.classList.contains('lc2-bubble') || el.classList.contains('lc2-label'))) continue;
      var tag = el.tagName;
      var isPrimary = MUNCH_TAGS_PRIMARY.indexOf(tag) >= 0;
      var isSecondary = MUNCH_TAGS.indexOf(tag) >= 0;
      if (!isPrimary && !isSecondary) continue;
      // 只啃有可见文本内容的元素（或卡片容器）
      var hasText = el.textContent && el.textContent.trim().length > 2;
      var isCard = el.classList && (el.classList.contains('card') || el.classList.contains('stat') || el.classList.contains('stat-box') || el.classList.contains('svc-card'));
      if (!hasText && !isCard) continue;
      // 尺寸过滤：太小的元素不啃
      var rect = el.getBoundingClientRect();
      if (rect.width < 30 || rect.height < 12) continue;
      // 必须在视口内或接近视口
      if (rect.bottom < -100 || rect.top > window.innerHeight + 100) continue;
      // 距离猫当前位置
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dist = Math.hypot(cx - x, cy - y);
      if (dist > 350) continue;
      candidates.push({
        el: el,
        dist: dist,
        primary: isPrimary || isCard,
        rect: rect
      });
    }
    if (candidates.length === 0) {
      // 附近没东西啃——随便走走
      roamRandomly();
      return;
    }
    // 优先选近距离 + primary 类型
    candidates.sort(function (a, b) {
      var aPri = a.primary ? 0 : 1;
      var bPri = b.primary ? 0 : 1;
      if (aPri !== bPri) return aPri - bPri;
      return a.dist - b.dist;
    });
    // 从前 5 个候选中随机选一个（增加随机性）
    var pick = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
    // 把猫移动到元素附近
    targetX = Math.max(20, Math.min(window.innerWidth - 100, pick.rect.left + pick.rect.width / 2 - 40));
    targetY = Math.max(60, Math.min(window.innerHeight - 80, pick.rect.top + pick.rect.height / 2 - 20));
    // 等 1 秒后（猫走到目标附近）执行啃食
    setTimeout(function () {
      doMunch(pick.el);
    }, 1200);
  }

  function doMunch(el) {
    if (!el || munchedSet.has(el) || !el.parentNode) return;
    munchedSet.add(el);
    el.classList.add('lc2-munched');
    // 飘落碎屑粒子
    spawnCrumbs(el);
    // 饱腹值 +10~20
    munchFullness = Math.min(100, munchFullness + 10 + Math.floor(Math.random() * 11));
    // 恢复倒计时：30-90 秒
    var recoverDelay = 30000 + Math.random() * 60000;
    setTimeout(function () {
      if (el && el.classList) {
        el.classList.remove('lc2-munched');
      }
    }, recoverDelay);
  }

  function spawnCrumbs(el) {
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    for (var i = 0; i < 6; i++) {
      var crumb = document.createElement('div');
      crumb.className = 'lc2-crumb';
      crumb.style.left = (cx + (Math.random() - 0.5) * rect.width * 0.6) + 'px';
      crumb.style.top = cy + 'px';
      crumb.style.setProperty('--dx', ((Math.random() - 0.5) * 60) + 'px');
      crumb.style.setProperty('--dy', (20 + Math.random() * 40) + 'px');
      document.body.appendChild(crumb);
      (function (c) {
        setTimeout(function () { if (c.parentNode) c.remove(); }, 800);
      })(crumb);
    }
  }

  // 饱腹值自然衰减（每秒 -1）
  setInterval(function () {
    if (munchFullness > 0) munchFullness = Math.max(0, munchFullness - 1);
  }, 1000);

  /* ---------- §14 跨页面穿越 ---------- */
  // 猫的页面位置和状态持久化到 localStorage，
  // 当用户导航到另一个页面时，猫会在相对位置重新出现。
  // 也用 BroadcastChannel 让同一 origin 的多个 tab 之间同步。
  var PAGE_KEY = 'catapi_livecat_state';
  var bc = null;
  try {
    bc = new BroadcastChannel('catapi_livecat');
  } catch (e) { /* 不支持就降级为纯 localStorage */ }

  function saveCatState() {
    try {
      var state = {
        x: x / window.innerWidth,      // 归一化（不同页面尺寸不同）
        y: y / window.innerHeight,
        state: currentStateName,
        facing: facing,
        page: location.pathname,
        ts: Date.now()
      };
      localStorage.setItem(PAGE_KEY, JSON.stringify(state));
    } catch (e) { /* 无痕模式 */ }
  }

  function loadCatState() {
    try {
      var raw = localStorage.getItem(PAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      // 超过 5 分钟的记录视为过期
      if (Date.now() - data.ts > 300000) return null;
      return data;
    } catch (e) { return null; }
  }

  // 每 3 秒保存一次状态（跨页面用）
  setInterval(function () {
    if (cat) saveCatState();
  }, 3000);
  // 页面关闭时保存
  window.addEventListener('beforeunload', function () {
    if (cat) saveCatState();
  });

  // 多 tab 同步：
  //  - mouse_spawned：其他 tab 出现了老鼠 → 本 tab 显示「幽灵提示」
  //  - mouse_caught_by_user：其他 tab 的用户抓到了 → 本 tab 的猫也吃醋一下
  //  - mouse_escaped：其他 tab 的老鼠逃跑了 → 更新共享计时器
  if (bc) {
    bc.onmessage = function (ev) {
      var d = ev && ev.data;
      if (!d || !d.type) return;
      try {
        if (d.type === 'mouse_spawned' && d.page && d.page !== location.pathname) {
          // 其他 tab 出现了老鼠——本 tab 显示幽灵提示
          // 同时如果本 tab 也即将出没，延后以避免冲突
          if (!mouseActive && !mouse) {
            showGhostMouseHint(d.page, 5000);
            // 把本 tab 的下一次出没时间往后推一点，避免同时出现两只
            try {
              var pushed = Date.now() + 45000;  // 45 秒后再试
              localStorage.setItem(MOUSE_SYNC_KEY, String(pushed));
            } catch(e) {}
            clearTimeout(mouseSpawnTimer);
            mouseSpawnTimer = setTimeout(spawnMouse, 45000);
          }
        } else if (d.type === 'mouse_caught_by_user' || d.type === 'mouse_caught') {
          // 其他 tab 用户或猫抓住了——本 tab 的猫也嘟囔一句
          if (!mouseActive) {
            speak(["你又抓了？", "那边也在抓老鼠？", "人类联合行动。"]);
          }
        } else if (d.type === 'mouse_escaped') {
          // 其他 tab 老鼠逃了——不影响本 tab 行为
        }
      } catch (e) { /* 静默 */ }
    };
  }

  var portalHint = null;
  function showPortalHint(text) {
    if (!portalHint) {
      portalHint = document.createElement('div');
      portalHint.className = 'lc2-portal-hint';
      document.body.appendChild(portalHint);
    }
    portalHint.textContent = text;
    portalHint.classList.add('show');
    setTimeout(function () {
      if (portalHint) portalHint.classList.remove('show');
    }, 3000);
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

  // §CrossPet：让猫走向屏幕边缘，模拟「穿越出去」
  function pickDeparturePoint() {
    var w = window.innerWidth, h = window.innerHeight;
    var side = Math.floor(Math.random() * 4);
    if (side === 0)      { targetX = -80;             targetY = 80 + Math.random() * (h - 200); facing = -1; }
    else if (side === 1) { targetX = w + 80;          targetY = 80 + Math.random() * (h - 200); facing = 1;  }
    else if (side === 2) { targetX = 40 + Math.random() * (w - 200); targetY = -80;             }
    else                 { targetX = 40 + Math.random() * (w - 200); targetY = h + 80;          }
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
    // §15 追 Token 老鼠：每帧更新目标到老鼠位置
    if (currentStateName === "追 Token 老鼠" && mouseActive) {
      targetX = Math.max(20, Math.min(window.innerWidth - 80, mouseX - 20));
      targetY = Math.max(60, Math.min(window.innerHeight - 80, mouseY - 20));
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
                currentStateName === "追 Token 老鼠" ? 4.2 :   // 追老鼠很快（接近 ZOOMIES 速度）
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

    // §13 自主啃食：走路 / 巡视时有概率啃一口路过的内容
    if ((currentStateName === "巡视领地" || currentStateName === "玩耍") &&
        Math.random() < 0.002 && munchFullness < 70) {
      transitionTo("MUNCH");
    }

    rafId = requestAnimationFrame(tick);
  }

  /* ---------- 状态切换 ---------- */
  function transitionTo(name) {
    var next = STATES[name];
    if (!next) return;
    var prevName = currentStateName;
    current = next;
    // interrupt() 用 label 作为 currentStateName，transitionTo 也应该这样
    // （否则守卫检查时要同时匹配 key 和 label，容易出错）
    currentStateName = next.label || name;
    stateStart = Date.now();
    label.textContent = current.label;
    if (current.behavior) current.behavior();

    // 链式动作：SLEEP → 65% 概率接 STRETCH（真实猫醒后必伸懒腰）
    // STRETCH → 35% 概率接 YAWN（伸完打个哈欠）
    // 这里只设置链式入口，scheduleNext 会在 duration 后处理出口
    scheduleNext();

    // 如果刚从睡觉切走、且新状态不是 STRETCH/YAWN，有概率插入伸懒腰
    // （放在 transitionTo 主流程之后，不影响当前状态切换）
    if (prevName === "睡觉" && name !== "STRETCH" && name !== "YAWN" && Math.random() < 0.55) {
      setTimeout(function () {
        if (currentStateName === current.label) {  // 还在同一个状态
          transitionTo("STRETCH");
        }
      }, 800);
    }
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

      // §13 啃食内容：饱腹值低时增加啃食概率
      if (munchFullness < 50 && Math.random() < 0.35 &&
          currentStateName !== "啃食内容" && currentStateName !== "追激光" &&
          currentStateName !== "疯跑" && currentStateName !== "钻纸箱") {
        next = 'MUNCH';
      }

      // STRETCH 出口：35% 概率接 YAWN（伸完懒腰打哈欠是真实猫的连锁动作）
      if (currentStateName === "伸懒腰" && Math.random() < 0.35) {
        transitionTo("YAWN");
        return;
      }
      // YAWN 出口：30% 概率接 STRETCH（哈欠后接着伸懒腰）
      if (currentStateName === "打哈欠" && Math.random() < 0.30) {
        transitionTo("STRETCH");
        return;
      }

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
    // §14 跨页面穿越：如果有上一个页面的状态记录，从相对位置重新出现
    var prev = loadCatState();
    if (prev && prev.page !== location.pathname) {
      // 从另一个页面穿越过来
      x = Math.max(20, Math.min(window.innerWidth - 100, prev.x * window.innerWidth));
      y = Math.max(60, Math.min(window.innerHeight - 80, prev.y * window.innerHeight));
      // 从来的方向进入：如果之前在页面右侧，就从左侧进来
      if (prev.x > 0.5) {
        x = -100;  // 从屏幕左侧外面进来
        facing = 1;
      } else {
        x = window.innerWidth + 50;  // 从右侧进来
        facing = -1;
      }
      targetX = Math.max(40, Math.min(window.innerWidth - 100, prev.x * window.innerWidth));
      targetY = Math.max(60, Math.min(window.innerHeight - 80, prev.y * window.innerHeight));
      showPortalHint('🐾 猫从 ' + (prev.page.split('/').pop() || '首页') + ' 穿越过来');
    } else {
      // 初始位置：屏幕底部偏右
      x = window.innerWidth - 200;
      y = window.innerHeight - 110;
      targetX = x;
      targetY = y;
      facing = 1;
    }
    transitionTo("SLEEP");
    rafId = requestAnimationFrame(tick);
    startIdleMotion();   // 启动 idle 微动作循环（自动眨眼 / 耳朵抖动）
    initCrossPet();      // §CrossPet：启动跨站宠物串门
  }

  // §CrossPet：跨站宠物串门协议桥接
  function initCrossPet() {
    if (!root.CrossPet || typeof root.CrossPet.init !== 'function') return;
    try {
      root.CrossPet.init({
        petType: 'cat',
        petName: 'CAT API 猫',
        petSVG: svgCat(),
        onPetLeave: function (direction) {
          // 我们的猫穿越出去了 → 切到 CROSSPET_DEPART 状态（走向屏幕边缘消失）
          transitionTo('CROSSPET_DEPART');
        },
        onPetArrive: function (visitor) {
          // 别站宠物穿越过来 → 我们的猫进入 MEET_VISITOR 状态
          transitionTo('MEET_VISITOR');
        },
        onPetMeet: function (local, vis, interaction) {
          // 相遇互动文案
          speak([interaction || '咦，你谁？']);
        }
      });
      console.log('[LiveCat] CrossPet bridge initialized.');
    } catch (e) {
      console.warn('[LiveCat] CrossPet init failed:', e);
    }
  }

  root.LiveCat = {
    start: start,
    STATES: STATES,
    BEHAVIOR_RULES: BEHAVIOR_RULES,
    getState: function () { return currentStateName; },
    getRules: function () { return BEHAVIOR_RULES; },
    transitionTo: transitionTo,        // 暴露给外部触发状态（测试 / 彩蛋）
    triggerBlink: function () { triggerSlowBlink(true); },
    triggerMunch: function () { transitionTo('MUNCH'); },  // 手动触发啃食
    getQuota: getQuota,
    setQuota: setQuota,
    getFullness: function () { return munchFullness; },
    munchElement: function (el) { doMunch(el); },  // 手动啃指定元素
    spawnMouse: function () { spawnMouse(); },     // 手动生成 Token 老鼠
    getTokenCount: function () { return tokenCount; }
  };

  start();
})(typeof self !== "undefined" ? self : this);

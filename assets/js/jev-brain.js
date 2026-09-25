/*!
 * Jev Brain v1.0 — 活猫 AI 决策引擎
 * ---------------------------------------------------------------------------
 * 把 livecat 的状态机从「加权随机」升级为「Jev 上下文感知决策」。
 *
 * 工作原理：
 *  1. 感知层：收集当前时间、鼠标活跃度、上一状态、饱腹值等上下文
 *  2. 决策层：打包成 Jev choice 问题，让 Jev 从候选状态中挑一个
 *  3. 冷却层：API 失败/超时降级到加权随机；同一上下文 30s 内复用决策
 *  4. 可观测：每次 Jev 决策时显示「猫在想什么」气泡
 *
 * 接入方式（livecat.js 已内置钩子）：
 *  页面加载 jev.js + jev-brain.js 后，调用：
 *    JevBrain.enable('sk-...');   // 开启 AI 决策
 *    JevBrain.disable();          // 关闭，回到加权随机
 *  或在 URL 加 ?jev=1&key=sk-... 自动开启
 * --------------------------------------------------------------------------- */
(function (root) {
  "use strict";
  if (root.JevBrain) return;

  /* ===== 配置 ===== */
  var DECISION_TIMEOUT_MS = 4000;   // Jev 4 秒不返回就降级
  var CONTEXT_CACHE_MS = 30000;     // 同一上下文 30s 内复用决策
  var BUBBLE_TTL_MS = 3500;         // 「猫在想什么」气泡显示时长

  var enabled = false;
  var lastContextKey = null;
  var lastDecision = null;
  var lastDecisionTs = 0;

  /* ===== 上下文感知 ===== */
  /**
   * 收集当前上下文，打包成 Jev state 字符串
   * @param {Object} ctx - { hour, mouseIdleSec, prevState, fullness, pageTitle }
   * @returns {string} 自然语言上下文描述
   */
  function buildStateDescription(ctx) {
    var parts = [];

    // 时间段
    var h = ctx.hour;
    var timeDesc;
    if (h >= 0 && h < 5) timeDesc = "凌晨" + h + "点（猫的跑酷高发时段）";
    else if (h >= 5 && h < 8) timeDesc = "清晨" + h + "点（猫开始活跃）";
    else if (h >= 8 && h < 12) timeDesc = "上午" + h + "点";
    else if (h >= 12 && h < 14) timeDesc = "中午" + h + "点（猫午睡高峰）";
    else if (h >= 14 && h < 18) timeDesc = "下午" + h + "点（猫的主要睡眠时段）";
    else if (h >= 18 && h < 22) timeDesc = "晚上" + h + "点（猫的黄昏活跃期）";
    else timeDesc = "深夜" + h + "点";
    parts.push("现在是" + timeDesc);

    // 鼠标行为
    if (ctx.mouseIdleSec > 60) parts.push("用户已经 " + Math.round(ctx.mouseIdleSec / 60) + " 分钟没动鼠标了");
    else if (ctx.mouseIdleSec < 3) parts.push("用户的鼠标正在快速移动");
    else parts.push("用户的鼠标偶尔在动");

    // 上一状态
    if (ctx.prevState) {
      var prevMap = {
        "睡觉": "猫刚睡醒", "伸懒腰": "猫刚伸完懒腰", "打哈欠": "猫刚打完哈欠",
        "巡逻": "猫刚巡逻完一圈", "理毛": "猫刚理完毛", "进食": "猫刚吃完东西",
        "玩耍": "猫刚玩了一会儿", "疯跑": "猫刚疯跑完", "盯梢": "猫刚盯完什么东西",
        "啃食内容": "猫刚啃了点页面内容", "蹭人腿": "猫刚蹭了用户的腿"
      };
      parts.push(prevMap[ctx.prevState] || ("猫刚才在「" + ctx.prevState + "」"));
    }

    // 饱腹值
    if (ctx.fullness !== undefined) {
      if (ctx.fullness < 30) parts.push("猫现在很饿");
      else if (ctx.fullness < 60) parts.push("猫有点饿了");
      else parts.push("猫不饿");
    }

    // 页面内容线索
    if (ctx.pageTitle) {
      parts.push("当前页面标题是「" + ctx.pageTitle + "」");
    }

    return parts.join("。") + "。";
  }

  /* ===== Jev 决策 ===== */
  /**
   * 问 Jev：猫接下来想干什么？
   * @param {Object} ctx - 上下文对象
   * @param {Array<string>} candidates - 候选状态 key 列表
   * @returns {Promise<{state: string, reason: string, probs: Object}>}
   */
  function think(ctx, candidates) {
    if (!root.JevCat) return Promise.reject(new Error("JevCat not loaded"));
    if (!candidates || candidates.length === 0) return Promise.reject(new Error("no candidates"));

    // 上下文缓存：30s 内同一上下文直接复用
    var ctxKey = JSON.stringify([ctx.hour, ctx.prevState, ctx.fullness && Math.floor(ctx.fullness / 20)]);
    var now = Date.now();
    if (lastContextKey === ctxKey && lastDecision && (now - lastDecisionTs) < CONTEXT_CACHE_MS) {
      return Promise.resolve(lastDecision);
    }

    var stateDesc = buildStateDescription(ctx);

    // 候选状态的「猫语」描述
    var CANDIDATE_DESC = {
      SLEEP: "找个地方睡觉",
      GROOM: "舔毛打理自己",
      PATROL: "巡逻一下领地",
      PLAY: "找点东西玩",
      EAT: "去吃点东西",
      STARE: "盯着空气发呆",
      STARE_MOUSE: "盯着用户的鼠标看",
      STRETCH: "伸个懒腰",
      YAWN: "打个哈欠",
      BOXED: "钻进纸箱里",
      ZOOMIES: "突然疯跑一圈",
      MUNCH: "啃点页面上的内容",
      HEADBUNT: "去蹭蹭用户"
    };

    var criteria = {};
    candidates.forEach(function (key) {
      criteria[key] = CANDIDATE_DESC[key] || key;
    });

    return root.JevCat.ask({
      state: stateDesc + " 作为这只猫，你现在最想做什么？",
      questions: {
        next_action: {
          type: "choice",
          instructions: "猫接下来最可能做什么？根据猫的生物节律、当前状态和上下文判断。",
          criteria: criteria
        }
      }
    }).then(function (data) {
      var choice = data.answers && data.answers.next_action;
      if (!choice || !choice.choice) throw new Error("no choice returned");

      var picked = choice.choice;
      var reason = criteria[picked] || picked;

      var result = {
        state: picked,
        reason: reason,
        probs: choice.probabilities || {},
        confidence: choice.confidence || 0,
        contextDesc: stateDesc
      };

      // 缓存
      lastContextKey = ctxKey;
      lastDecision = result;
      lastDecisionTs = Date.now();

      // 显示「猫在想什么」气泡
      showThoughtBubble(picked, reason, choice.confidence);

      return result;
    });
  }

  /* ===== 「猫在想什么」气泡 ===== */
  var bubbleEl = null;
  var bubbleTimer = null;

  function showThoughtBubble(state, reason, confidence) {
    if (!bubbleEl) {
      bubbleEl = document.createElement("div");
      bubbleEl.className = "jev-thought-bubble";
      document.body.appendChild(bubbleEl);
    }

    var pct = confidence ? Math.round(confidence * 100) : "--";
    bubbleEl.innerHTML =
      '<span class="jev-brain-icon">🧠</span>' +
      '<span class="jev-thought-text">猫想：' + escapeHtml(reason) + '</span>' +
      '<span class="jev-thought-conf">' + pct + '%</span>';

    bubbleEl.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () {
      bubbleEl.classList.remove("show");
    }, BUBBLE_TTL_MS);

    // 定位到猫附近
    positionBubbleNearCat();
  }

  function positionBubbleNearCat() {
    if (!bubbleEl) return;
    var cat = document.getElementById("livecat-cat") || document.querySelector(".lc2-cat");
    if (!cat) {
      bubbleEl.style.bottom = "80px";
      bubbleEl.style.right = "20px";
      return;
    }
    var rect = cat.getBoundingClientRect();
    bubbleEl.style.left = Math.max(10, rect.left - 60) + "px";
    bubbleEl.style.top = Math.max(10, rect.top - 60) + "px";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  /* ===== 注入样式 ===== */
  function injectStyles() {
    if (document.getElementById("jev-brain-styles")) return;
    var style = document.createElement("style");
    style.id = "jev-brain-styles";
    style.textContent = [
      ".jev-thought-bubble {",
      "  position: fixed; z-index: 2147483640; pointer-events: none;",
      "  display: flex; align-items: center; gap: 6px;",
      "  padding: 8px 14px; border-radius: 16px;",
      "  background: rgba(250,248,245,0.95); border: 1.5px solid rgba(200,163,94,0.5);",
      "  font: 12px/1.4 -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;",
      "  color: #1B3A2E; box-shadow: 0 4px 14px rgba(0,0,0,0.12);",
      "  backdrop-filter: blur(6px); opacity: 0;",
      "  transform: translateY(6px) scale(0.95);",
      "  transition: opacity .3s ease, transform .3s cubic-bezier(.34,1.56,.64,1);",
      "}",
      ".jev-thought-bubble.show { opacity: 1; transform: translateY(0) scale(1); }",
      ".jev-brain-icon { font-size: 14px; }",
      ".jev-thought-text { font-weight: 600; }",
      ".jev-thought-conf { font-size: 10px; color: rgba(27,58,46,0.5); font-variant-numeric: tabular-nums; }",
      "@media (prefers-color-scheme: dark) {",
      "  .jev-thought-bubble { background: rgba(28,28,28,0.94); border-color: rgba(200,163,94,0.4); color: #FAF8F5; }",
      "  .jev-thought-conf { color: rgba(250,248,245,0.5); }",
      "}",
      "@media (prefers-reduced-motion: reduce) {",
      "  .jev-thought-bubble { transition: opacity .2s ease; }",
      "}"
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ===== 开关 ===== */
  function enable(apiKey) {
    if (apiKey && root.JevCat) {
      root.JevCat.configure({ apiKey: apiKey });
    }
    enabled = true;
    injectStyles();
    console.log("[JevBrain] AI 决策模式已开启 🧠");
  }

  function disable() {
    enabled = false;
    lastContextKey = null;
    lastDecision = null;
    if (bubbleEl) bubbleEl.classList.remove("show");
    console.log("[JevBrain] AI 决策模式已关闭，回到加权随机");
  }

  function isEnabled() { return enabled; }

  /* ===== URL 自动开启 ===== */
  function autoEnable() {
    try {
      var params = new URLSearchParams(location.search);
      if (params.get("jev") === "1") {
        var key = params.get("key") || "";
        if (key) enable(key);
      }
    } catch (e) {}
  }

  /* ===== 对外暴露 ===== */
  root.JevBrain = {
    enable: enable,
    disable: disable,
    isEnabled: isEnabled,
    think: think,
    buildStateDescription: buildStateDescription,
    version: "1.0"
  };

  // DOM ready 后自动检查 URL 参数
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoEnable);
  } else {
    autoEnable();
  }
})(typeof self !== "undefined" ? self : this);

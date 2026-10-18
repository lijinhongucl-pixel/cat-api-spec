/*!
 * CAT API · motion.js
 * ---------------------------------------------------------------------------
 * 全站动效层。老钱风基调：克制、慢、有节奏——不做抢戏的动效。
 *
 * 三条底线：
 *   1. 无 GSAP 也不难看 —— 元素默认完整可见；GSAP 只做增强
 *   2. prefers-reduced-motion 直接不跑 —— 尊重系统偏好
 *   3. 滚动进入只播一次（once:true）—— 播过就滚了，不循环打断用户
 *
 * 动画策略（老钱风 · 稳定优先）：
 *   - Hero 入场：CSS keyframes（不受 RAF 节流影响，稳）
 *   - 数字滚动：setTimeout 递归 + easeOutCubic（不依赖 RAF，稳）
 *   - 滚动进入：GSAP ScrollTrigger 的 toggleClass + CSS transition
 *               → 类切换同步发生，CSS transition 处理动画，稳定
 *   - 兜底：2.5s 后强制显示 hero 元素最终值，防极低频 RAF 卡中间态
 *
 * 色板：--accent（深森林绿）/ --gold（古铜金）/ --ink / --muted
 * 缓动：cubic-bezier(.22,1,.36,1) —— 与 GSAP power2.out 手感一致
 * 时长：Hero 入场 0.7–1.0s；滚动进入 0.75s；数字滚动 1.2s
 *
 * 依赖：CDN 加载 gsap + ScrollTrigger
 * 部署：任何含 <section> 或 .hero 的页面自动生效；缺选择器就跳过对应动画
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // ① 尊重 prefers-reduced-motion：什么都不做
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  // ② 注入 CSS 动画规则（一次性）
  injectCss();

  // ③ GSAP 缺失就跳过（数字滚动与滚动进入都用不着 GSAP 也可工作）
  if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
  }

  // ④ 兜底：如果 GSAP/浏览器卡顿让入场动画没跑完，2.5s 后强制显示
  var FALLBACK_MS = 2500;

  // =========================================================================
  // CSS 注入：Hero keyframes + scroll-reveal 过渡
  // ======================================================================= */
  function injectCss() {
    var style = document.createElement("style");
    style.setAttribute("data-motion", "cat-api-motion");
    style.textContent = [
      "/* ==== Hero 入场（CSS keyframes）==== */",
      "@keyframes cat-fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}",
      "@keyframes cat-fade-up-soft{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}",
      "@keyframes cat-slide-right{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}",
      "",
      ".hero-tag{animation:cat-fade-up-soft .55s cubic-bezier(.22,1,.36,1) .10s both}",
      ".hero h1{animation:cat-fade-up .90s cubic-bezier(.22,1,.36,1) .20s both}",
      ".hero-copy > p, .hero-copy > .lead{animation:cat-fade-up-soft .65s cubic-bezier(.22,1,.36,1) .40s both}",
      ".hero-cta, .hero-copy .closing-line{animation:cat-fade-up-soft .55s cubic-bezier(.22,1,.36,1) .55s both}",
      ".hero-stats > *{opacity:0;animation:cat-fade-up-soft .55s cubic-bezier(.22,1,.36,1) both}",
      ".hero-stats > *:nth-child(1){animation-delay:.60s}",
      ".hero-stats > *:nth-child(2){animation-delay:.68s}",
      ".hero-stats > *:nth-child(3){animation-delay:.76s}",
      ".hero-stats > *:nth-child(4){animation-delay:.84s}",
      ".hero-aside{animation:cat-slide-right .85s cubic-bezier(.22,1,.36,1) .35s both}",
      ".hero-machine{animation:cat-fade-up 1.00s cubic-bezier(.22,1,.36,1) .50s both}",
      "",
      "/* ==== 滚动进入（class 切换 + CSS transition）==== */",
      ".cat-scroll{opacity:0;transform:translateY(30px);",
      "  transition:opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1)}",
      ".cat-scroll.in-view{opacity:1;transform:none}",
      "",
      "/* ==== 减少动画偏好：关掉所有动画 ==== */",
      "@media (prefers-reduced-motion:reduce){",
      "  .hero-tag,.hero h1,.hero-copy>p,.hero-copy>.lead,.hero-cta,.hero-copy .closing-line,.hero-stats>*,.hero-aside,.hero-machine{animation:none!important;opacity:1!important;transform:none!important}",
      "  .cat-scroll{opacity:1!important;transform:none!important;transition:none!important}",
      "}"
    ].join("\n");
    document.head.appendChild(style);
  }

  // =========================================================================
  // 启动：等 DOM 就绪后一次性跑
  // ======================================================================= */
  function start() {
    // Hero 入场是 CSS keyframes，浏览器自动播放，无需 JS 干预。

    // 数字滚动 —— 16 / 27 / 31（0 不动）
    countUp(".hero-stats", 0.9);

    // 滚动进入 —— section + 大块容器
    sectionReveal();

    // 滚动叙事：章节视差 + 金色刻线扫过
    scrollNarrative();

    // 兜底：2.5s 后强制显示所有 hero 元素的最终值
    // （防止极低频 RAF 环境下动画长时间停在中间态）
    setTimeout(function () {
      var forceSelect = ".hero-tag, .hero h1, .hero-copy > p, .hero-copy > .lead, .hero-cta, .hero-copy .closing-line, .hero-stats > *, .hero-aside, .hero-machine";
      document.querySelectorAll(forceSelect).forEach(function (el) {
        el.style.opacity = "1";
        el.style.transform = "none";
        el.style.animation = "none";
      });
    }, FALLBACK_MS);
  }

  // =========================================================================
  // 数字滚动：setInterval 驱动，不受 RAF 节流影响
  //   用法：<div class="n">16</div> 读到文本作为目标值
  // ======================================================================= */
  function countUp(selector, delay) {
    var nodes = document.querySelectorAll(selector + " .n");
    nodes.forEach(function (el) {
      var target = parseInt(el.textContent.trim(), 10);
      if (!isFinite(target) || target === 0) return;
      el.textContent = "0";

      var duration = 1200;
      var start = null;
      var startMs = (delay || 0) * 1000;

      function step(ts) {
        if (!start) start = ts;
        var elapsed = ts - start;
        if (elapsed < startMs) {
          setTimeout(step, 16);
          return;
        }
        var t = Math.min(1, (elapsed - startMs) / duration);
        // easeOutCubic —— 手感与 GSAP power2.out 相近
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * eased);
        if (t < 1) {
          setTimeout(step, 16);
        } else {
          el.textContent = String(target);
        }
      }
      setTimeout(step, 16);
    });
  }

  // =========================================================================
  // 滚动进入：给首屏之下的 section/大块容器加 .cat-scroll，
  //   ScrollTrigger 触发时加 .in-view → CSS transition 自动播
  // ======================================================================= */
  function sectionReveal() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

    var selectors = "section, .vid, .rt-tease, .watcha-invite, .watcha-days, .hero-machine";
    var nodes = document.querySelectorAll(selectors);
    nodes.forEach(function (node) {
      // 首屏内的（在 80vh 之前）跳过，让它自然显示
      var rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.80) return;

      node.classList.add("cat-scroll");
      ScrollTrigger.create({
        trigger: node,
        start: "top 82%",
        once: true,
        toggleClass: "in-view"
      });
    });
  }

  // =========================================================================
  // 滚动叙事：章节视差 + 金色刻线扫过
  //   - 章节标题向上视差移动（比滚动快 15%）
  //   - 每个 section 进入时金色刻线从左到右扫过
  // ========================================================================= */
  function scrollNarrative() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

    // 章节标题视差
    document.querySelectorAll("section h2, section h3").forEach(function (h) {
      gsap.to(h, {
        y: -40,
        ease: "none",
        scrollTrigger: {
          trigger: h,
          start: "top bottom",
          end: "bottom top",
          scrub: 1
        }
      });
    });

    // 金色刻线划过：每个 section 进入时，顶部一条金线从左到右扫过
    document.querySelectorAll("section").forEach(function (sec) {
      var line = document.createElement("div");
      line.className = "cat-gold-sweep";
      line.style.cssText =
        "position:absolute;top:0;left:0;height:1px;width:0;" +
        "background:linear-gradient(90deg, transparent, #C8A35E, transparent);" +
        "pointer-events:none;z-index:5;";
      if (getComputedStyle(sec).position === "static") sec.style.position = "relative";
      sec.appendChild(line);
      ScrollTrigger.create({
        trigger: sec,
        start: "top 80%",
        once: true,
        onEnter: function () {
          gsap.to(line, { width: "100%", duration: 1.2, ease: "power2.out" });
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

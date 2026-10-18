/*!
 * CAT API · fabric-bg.js (L1 · 呼吸层)
 * ---------------------------------------------------------------------------
 * 全屏 p5.js 织物背景：经纬细线随鼠标流动，像丝绸被呼吸托起。
 *
 * 设计原则：
 *   - 不能抢戏 —— 透明度极低（alpha 8-18），只是「页面在呼吸」的感觉
 *   - 老钱色板 —— 暖象牙底 + 深森林绿纬线 + 古铜金经线
 *   - 性能克制 —— fps 24, 低端机自动降级为纯静态
 *   - 鼠标交互 —— 经线被鼠标「拨开」，松手后缓慢回弹
 *
 * 降级链：
 *   p5 加载失败 / prefers-reduced-motion / 移动端窄屏 → 不渲染，纯 CSS 底
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // ① 降级：无 p5 / 减动效 / 小屏
  if (typeof p5 === "undefined") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.innerWidth < 720) return;

  // ② 老钱色板
  var INK = { r: 27, g: 58, b: 46 };        // #1B3A2E 深森林绿（纬线）
  var GOLD = { r: 200, g: 163, b: 94 };     // #C8A35E 古铜金（经线）
  var IVORY = { r: 250, g: 248, b: 245 };   // #FAF8F5 暖象牙（底）

  // ③ 织物参数
  var WEFT_SPACING = 48;   // 纬线间距（横向）
  var WARP_SPACING = 96;   // 经线间距（纵向）
  var MOUSE_RADIUS = 180;  // 鼠标影响半径
  var MOUSE_FORCE = 14;    // 鼠标拨动强度
  var EASE = 0.06;         // 回弹缓动
  var FPS = 24;

  var weftLines = []; // 纬线：横向细线
  var warpLines = []; // 经线：纵向细线（只有这些响应鼠标）

  var sketch = function (p) {
    p.setup = function () {
      var c = p.createCanvas(window.innerWidth, window.innerHeight);
      c.parent("fabric-bg");
      p.frameRate(FPS);
      p.noFill();
      buildWeave();
    };

    p.windowResized = function () {
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      buildWeave();
    };

    p.draw = function () {
      p.clear();

      // 经线（响应鼠标）
      warpLines.forEach(function (line) {
        line.update(p.mouseX, p.mouseY);
        line.draw();
      });

      // 纬线（静态呼吸）
      weftLines.forEach(function (line) {
        line.update();
        line.draw();
      });
    };

    function buildWeave() {
      weftLines = [];
      warpLines = [];

      var w = p.width;
      var h = p.height;
      var cols = Math.ceil(w / WARP_SPACING) + 1;
      var rows = Math.ceil(h / WEFT_SPACING) + 1;
      var t = p.millis();

      for (var i = 0; i < cols; i++) {
        var x = i * WARP_SPACING;
        var isGold = (i % 4 === 0); // 每 4 条经线一条金色
        warpLines.push(new WarpLine(x, h, isGold, t));
      }
      for (var j = 0; j < rows; j++) {
        var y = j * WEFT_SPACING;
        weftLines.push(new WeftLine(y, w, t));
      }
    }

    // 经线：垂直，会被鼠标拨开
    function WarpLine(x0, height, isGold, t0) {
      this.x0 = x0;
      this.height = height;
      this.isGold = isGold;
      this.t0 = t0;
      this.offset = 0;      // 当前偏移
      this.target = 0;      // 目标偏移
      this.segments = 24;

      this.update = function (mx, my) {
        // 计算鼠标对这条线的影响
        var dx = mx - this.x0;
        var dist = Math.abs(dx);
        if (dist < MOUSE_RADIUS) {
          var force = (1 - dist / MOUSE_RADIUS) * MOUSE_FORCE;
          this.target = (dx > 0 ? -1 : 1) * force;
        } else {
          this.target = 0;
        }
        // 缓动逼近
        this.offset += (this.target - this.offset) * EASE;
      };

      this.draw = function () {
        var c = this.isGold ? GOLD : INK;
        var alpha = this.isGold ? 18 : 10;
        p.stroke(c.r, c.g, c.b, alpha);
        p.strokeWeight(this.isGold ? 0.8 : 0.5);
        p.beginShape();
        for (var s = 0; s <= this.segments; s++) {
          var y = (s / this.segments) * this.height;
          // 鼠标偏移随 Y 衰减（中段最明显）
          var falloff = Math.sin((s / this.segments) * Math.PI);
          var x = this.x0 + this.offset * falloff;
          // 加一点呼吸波动
          var wave = Math.sin(p.millis() * 0.0004 + this.t0 * 0.001 + s * 0.3) * 1.5;
          p.vertex(x + wave, y);
        }
        p.endShape();
      };
    }

    // 纬线：水平，只呼吸
    function WeftLine(y0, width, t0) {
      this.y0 = y0;
      this.width = width;
      this.t0 = t0;
      this.segments = 32;

      this.update = function () { /* 只呼吸，无交互 */ };

      this.draw = function () {
        p.stroke(INK.r, INK.g, INK.b, 8);
        p.strokeWeight(0.5);
        p.beginShape();
        for (var s = 0; s <= this.segments; s++) {
          var x = (s / this.segments) * this.width;
          var wave = Math.sin(p.millis() * 0.0003 + this.t0 * 0.001 + s * 0.2) * 2;
          p.vertex(x, this.y0 + wave);
        }
        p.endShape();
      };
    }
  };

  // ④ 启动：等 DOM 就绪 + 注入容器
  function start() {
    if (document.getElementById("fabric-bg")) return;
    var holder = document.createElement("div");
    holder.id = "fabric-bg";
    holder.setAttribute("aria-hidden", "true");
    document.body.insertBefore(holder, document.body.firstChild);

    // 注入 CSS：固定在视口最底层
    var style = document.createElement("style");
    style.textContent =
      "#fabric-bg{position:fixed;top:0;left:0;width:100vw;height:100vh;" +
      "z-index:0;pointer-events:none;}" +
      "#fabric-bg canvas{display:block;}" +
      "body>*:not(#fabric-bg){position:relative;z-index:1;}";
    document.head.appendChild(style);

    new p5(sketch);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

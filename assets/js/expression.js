/* ============================================================
   CAT API — 表情引擎 EXPR v1
   14 个状态 · 13 维参数向量 · 24×24 像素栅格化
   对标 DOG API DogExpression 的渲染管线
   ============================================================ */

(function (global) {
  "use strict";

  var GRID = 24; // 像素画布尺寸

  /* ---------- 参数定义 ---------- */
  var PARAM_DEFS = [
    { key: "earL",       label: "左耳角度",     range: "-90~+90",  unit: "deg", grade: "B", note: "独立旋转，正值朝前，负值后压（飞机耳）" },
    { key: "earR",       label: "右耳角度",     range: "-90~+90",  unit: "deg", grade: "B", note: "通常与左耳非对称" },
    { key: "pupil",      label: "瞳孔面积",     range: "0~1",      unit: "",    grade: "A", note: "0=一线（竖线），1=全圆。猫是竖瞳" },
    { key: "eyeOpen",    label: "眼睑开度",     range: "0.2~1",    unit: "",    grade: "C", note: "缓慢眨眼时短暂降到 0.3" },
    { key: "browTilt",   label: "眉区倾斜",     range: "-1~1",     unit: "",    grade: "C", note: "正值为上挑（警觉），负值为下压（愤怒）" },
    { key: "mouthOpen",  label: "张口度",       range: "0~1",      unit: "",    grade: "B", note: "嘶嘶时约 0.7，打哈欠时 1.0" },
    { key: "whiskerFwd", label: "胡须前展",     range: "-1~1",     unit: "",    grade: "B", note: "正值前展（好奇），负值后贴（恐惧）" },
    { key: "tailPos",    label: "尾巴高度",     range: "0~1",      unit: "",    grade: "A", note: "0=夹尾，1=直立。直立=友好最高正分" },
    { key: "tailSwing",  label: "尾巴摆频",     range: "0~8",      unit: "Hz",  grade: "B", note: "高频=烦躁（注意与狗语义相反）" },
    { key: "bodyArch",   label: "弓背度",       range: "0~1",      unit: "",    grade: "B", note: "恐惧或攻击前的体型膨胀准备" },
    { key: "furFluff",   label: "炸毛指数",     range: "0~1",      unit: "",    grade: "A", note: "竖毛肌激活。0=顺滑，1=全炸" },
    { key: "headTilt",   label: "头部倾斜",     range: "-1~1",     unit: "",    grade: "C", note: "正值右倾，负值左倾。好奇时触发" },
    { key: "vibrate",    label: "呼噜振动",     range: "0~1",      unit: "",    grade: "A", note: "25Hz 舒适呼噜至 150Hz 修复态" }
  ];

  var PARAM_KEYS = PARAM_DEFS.map(function (d) { return d.key; });

  var BOUNDS = {
    earL: [-90, 90], earR: [-90, 90], pupil: [0, 1], eyeOpen: [0.2, 1],
    browTilt: [-1, 1], mouthOpen: [0, 1], whiskerFwd: [-1, 1],
    tailPos: [0, 1], tailSwing: [0, 8], bodyArch: [0, 1],
    furFluff: [0, 1], headTilt: [-1, 1], vibrate: [0, 1]
  };

  var BASE = {
    earL: 45, earR: 45, pupil: 0.4, eyeOpen: 0.9,
    browTilt: 0, mouthOpen: 0.05, whiskerFwd: 0.3,
    tailPos: 0.6, tailSwing: 0.5, bodyArch: 0,
    furFluff: 0, headTilt: 0, vibrate: 0
  };

  /* ---------- 14 个状态 ---------- */
  var STATES = [
    { id: "RELAXED",  title: "放松",     class: "正向",       confidence: 0.95, touch: "yes",
      tail: "slow-swing",  body: "loaf",         vocal: "silence",
      note: "系统默认态。耳自然朝前，瞳孔中等。",
      params: { earL: 45, earR: 45, pupil: 0.35, eyeOpen: 0.85, browTilt: 0, mouthOpen: 0.05, whiskerFwd: 0.2, tailPos: 0.55, tailSwing: 0.8, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.3 } },

    { id: "ALERT",    title: "警觉",     class: "中性",       confidence: 0.85, touch: "warn",
      tail: "twitch",      body: "upright",      vocal: "silence",
      note: "环境突变。耳朝前锁定声源，瞳孔轻微放大。",
      params: { earL: 75, earR: 75, pupil: 0.55, eyeOpen: 1, browTilt: 0.3, mouthOpen: 0.05, whiskerFwd: 0.6, tailPos: 0.65, tailSwing: 2, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0 } },

    { id: "SLOW_BLINK", title: "缓慢眨眼", class: "正向·最高", confidence: 0.90, touch: "yes",
      tail: "still",       body: "upright",      vocal: "silence",
      note: "系统给出的最高正面信号。正确的回应是回眨。",
      params: { earL: 35, earR: 35, pupil: 0.4, eyeOpen: 0.35, browTilt: 0, mouthOpen: 0.05, whiskerFwd: 0.3, tailPos: 0.6, tailSwing: 0.5, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.4 } },

    { id: "KNEADING",  title: "踩奶",     class: "正向·幼态", confidence: 0.95, touch: "yes",
      tail: "soft-curl",   body: "upright",      vocal: "purr",
      note: "幼猫哺乳行为保留态。推开=Staff 可靠性下降。",
      params: { earL: 30, earR: 30, pupil: 0.35, eyeOpen: 0.6, browTilt: 0, mouthOpen: 0.05, whiskerFwd: 0.1, tailPos: 0.5, tailSwing: 0.3, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.85 } },

    { id: "PLAYFUL",   title: "玩耍",     class: "正向",       confidence: 0.80, touch: "yes",
      tail: "high-swish",  body: "low-stalk",    vocal: "chirp",
      note: "狩猎序列 STALK 被玩具触发。瞳孔全圆，臀部微摇。",
      params: { earL: 55, earR: 55, pupil: 0.75, eyeOpen: 1, browTilt: 0.2, mouthOpen: 0.15, whiskerFwd: 0.8, tailPos: 0.8, tailSwing: 3, bodyArch: 0.3, furFluff: 0, headTilt: 0, vibrate: 0 } },

    { id: "CURIOUS",   title: "好奇",     class: "中性",       confidence: 0.75, touch: "yes",
      tail: "gentle-curl", body: "upright",      vocal: "silence",
      note: "新物体入领地。头部倾斜锁定声源，胡须前展采样。",
      params: { earL: 65, earR: 50, pupil: 0.5, eyeOpen: 0.95, browTilt: 0.1, mouthOpen: 0.05, whiskerFwd: 0.7, tailPos: 0.6, tailSwing: 1.2, bodyArch: 0, furFluff: 0, headTilt: 0.6, vibrate: 0 } },

    { id: "HUNGRY",    title: "饥饿",     class: "中性·请求", confidence: 0.85, touch: "warn",
      tail: "demanding",   body: "upright",      vocal: "meow",
      note: "触发 VOICE 喵叫信道。频率刚好落在人类听觉最敏感区间。",
      params: { earL: 40, earR: 40, pupil: 0.55, eyeOpen: 0.9, browTilt: 0, mouthOpen: 0.3, whiskerFwd: 0.4, tailPos: 0.9, tailSwing: 4, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0 } },

    { id: "PAIN",      title: "疼痛",     class: "负面·隐藏", confidence: 0.45, touch: "no",
      tail: "tuck",        body: "tucked",       vocal: "silence",
      note: "置信度 0.45。架构层面隐藏疼痛。不要等它看起来很疼——它不会让你看到。",
      params: { earL: 45, earR: 45, pupil: 0.4, eyeOpen: 0.85, browTilt: 0, mouthOpen: 0.05, whiskerFwd: 0.3, tailPos: 0.6, tailSwing: 0.5, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.5 } },

    { id: "FEARFUL",   title: "恐惧",     class: "负面",       confidence: 0.80, touch: "no",
      tail: "tuck",        body: "arch-low",     vocal: "hiss-soft",
      note: "飞机耳（耳侧平展），瞳孔放大，身体压低。",
      params: { earL: -45, earR: -45, pupil: 0.8, eyeOpen: 1, browTilt: -0.3, mouthOpen: 0.15, whiskerFwd: -0.5, tailPos: 0.15, tailSwing: 1, bodyArch: 0.4, furFluff: 0.3, headTilt: 0, vibrate: 0 } },

    { id: "ANGRY",     title: "愤怒",     class: "负面·攻击前", confidence: 0.85, touch: "no",
      tail: "thrash",      body: "arch-high",    vocal: "growl",
      note: "耳后压贴头，弓背+炸毛。距离出爪约 1.5 秒。",
      params: { earL: -70, earR: -70, pupil: 0.7, eyeOpen: 0.9, browTilt: -0.5, mouthOpen: 0.25, whiskerFwd: -0.3, tailPos: 0.3, tailSwing: 6, bodyArch: 0.7, furFluff: 0.7, headTilt: 0, vibrate: 0 } },

    { id: "HISSING",   title: "嘶嘶警告", class: "负面·最终",   confidence: 1.00, touch: "no",
      tail: "fluffed-tuck",body: "arch-max",     vocal: "HISS",
      note: "置信度 1.0。入侵者响应最后一步。嘴大张露犬齿，下一帧出爪。",
      params: { earL: -85, earR: -85, pupil: 0.85, eyeOpen: 1, browTilt: -0.7, mouthOpen: 0.7, whiskerFwd: -0.8, tailPos: 0.1, tailSwing: 7, bodyArch: 0.9, furFluff: 0.9, headTilt: 0, vibrate: 0 } },

    { id: "ZOOMIES",   title: "狂奔",     class: "中性·失态", confidence: 0.70, touch: "no",
      tail: "wild",        body: "running",      vocal: "silence",
      note: "不可预测高速移动。触发原因不明。让出空间。",
      params: { earL: 55, earR: 55, pupil: 0.65, eyeOpen: 1, browTilt: 0.15, mouthOpen: 0.1, whiskerFwd: 0.5, tailPos: 0.85, tailSwing: 8, bodyArch: 0.1, furFluff: 0.1, headTilt: 0, vibrate: 0 } },

    { id: "LOAF",      title: "面包态",   class: "正向·高置信", confidence: 0.95, touch: "yes",
      tail: "wrapped",     body: "loaf",         vocal: "silence",
      note: "四爪收起尾巴盘绕成长方形。出现在你面前=Staff 评级高。",
      params: { earL: 30, earR: 30, pupil: 0.3, eyeOpen: 0.65, browTilt: 0, mouthOpen: 0.03, whiskerFwd: 0.1, tailPos: 0.5, tailSwing: 0, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.2 } },

    { id: "BOXED",     title: "入箱",     class: "正向·封闭",  confidence: 1.00, touch: "no",
      tail: "tucked-in",   body: "compressed",   vocal: "silence",
      note: "进入纸箱后的封闭态。纸箱 MUST 优先于所有外设。不允许提取。",
      params: { earL: 20, earR: 20, pupil: 0.3, eyeOpen: 0.55, browTilt: 0, mouthOpen: 0.03, whiskerFwd: 0, tailPos: 0.35, tailSwing: 0, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.5 } }
  ];

  var STATE_IDS = STATES.map(function (s) { return s.id; });

  /* ---------- 端点 ---------- */
  var ENDPOINTS = [
    { method: "GET",  path: "/api/v1/expression",                note: "读取当前表情状态与参数向量" },
    { method: "GET",  path: "/api/v1/expression/{state}",        note: "读取指定状态的预设参数" },
    { method: "POST", path: "/api/v1/expression/compose",        note: "线性插值多个状态，返回混合帧" },
    { method: "POST", path: "/api/v1/expression/{state}",        note: "405 · 表情是上报不是调用" },
    { method: "PATCH", path: "/api/v1/expression",               note: "405 · 你不能直接设置表情" },
    { method: "DELETE", path: "/api/v1/expression",              note: "405 · 表情不可删除" }
  ];

  /* ---------- 状态码 ---------- */
  var STATUS_CODES = [
    { code: 200, name: "OK",                   note: "表情正常上报" },
    { code: 202, name: "Accepted",             note: "请求已收到，稍后更新" },
    { code: 405, name: "Method Not Allowed",   note: "表情不可直接设置——它是上报不是方法" },
    { code: 409, name: "Conflict",             note: "混合权重不足，回到主导状态" },
    { code: 422, name: "Unprocessable",        note: "所有权重为零，向量不成立" },
    { code: 451, name: "Unavailable",          note: "拒绝解释为什么推那只杯子" },
    { code: 503, name: "Service Unavailable",  note: "系统在睡眠或 ZOOMIES" }
  ];

  /* ---------- 工具 ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function getState(id) { for (var i = 0; i < STATES.length; i++) if (STATES[i].id === id) return STATES[i]; return STATES[0]; }
  function stateParams(id) { return Object.assign({}, BASE, getState(id).params); }

  /* ============================================================
     像素栅格化引擎
     24×24 网格，每个格子是一个 <rect>
     ============================================================ */

  // 颜色板
  var INK   = "#1a1a1a";
  var BG    = "#f4f2ee";
  var WHITE = "#fefcf8";
  var PINK  = "#e8a0a0";
  var ACCENT= "#4b5563";
  var SOFT  = "#d1d5db";

  function blankGrid() {
    var g = [];
    for (var i = 0; i < GRID * GRID; i++) g.push(null);
    return g;
  }

  function setPx(grid, x, y, color) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return;
    grid[y * GRID + x] = color;
  }

  function getPx(grid, x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return null;
    return grid[y * GRID + x];
  }

  // 在网格上画填充圆
  function fillCircle(grid, cx, cy, r, color) {
    for (var y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (var x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) setPx(grid, x, y, color);
      }
    }
  }

  // 画空心圆（边框）
  function strokeCircle(grid, cx, cy, r, color, thickness) {
    thickness = thickness || 1;
    for (var y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (var x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r - thickness && d <= r + thickness * 0.5) setPx(grid, x, y, color);
      }
    }
  }

  // 画填充椭圆
  function fillEllipse(grid, cx, cy, rx, ry, color) {
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) setPx(grid, x, y, color);
      }
    }
  }

  // 画线段
  function drawLine(grid, x0, y0, x1, y1, color) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    while (true) {
      setPx(grid, x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx)  { err += dx; y0 += sy; }
    }
  }

  // 画三角形
  function fillTriangle(grid, x0, y0, x1, y1, x2, y2, color) {
    var minX = Math.floor(Math.min(x0, x1, x2));
    var maxX = Math.ceil(Math.max(x0, x1, x2));
    var minY = Math.floor(Math.min(y0, y1, y2));
    var maxY = Math.ceil(Math.max(y0, y1, y2));
    function sign(px, py, ax, ay, bx, by) {
      return (px - bx) * (ay - by) - (ax - bx) * (py - by);
    }
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var px = x + 0.5, py = y + 0.5;
        var d1 = sign(px, py, x0, y0, x1, y1);
        var d2 = sign(px, py, x1, y1, x2, y2);
        var d3 = sign(px, py, x2, y2, x0, y0);
        var hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        var hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        if (!(hasNeg && hasPos)) setPx(grid, x, y, color);
      }
    }
  }

  /* ---------- 主渲染函数 ---------- */
  function rasterize(p) {
    var grid = blankGrid();
    p = Object.assign({}, BASE, p);

    var earL    = p.earL;
    var earR    = p.earR;
    var pupil   = clamp(p.pupil, 0, 1);
    var eyeO    = clamp(p.eyeOpen, 0.2, 1);
    var mouth   = clamp(p.mouthOpen, 0, 1);
    var whis    = p.whiskerFwd;
    var fluff   = clamp(p.furFluff, 0, 1);
    var arch    = clamp(p.bodyArch, 0, 1);

    var cx = 12, cy = 13;

    // 头部半径
    var headR = 7 + fluff * 1;

    // ---------- 耳朵 ----------
    function drawEar(side) {
      var angle = side === "L" ? earL : earR;
      var baseX = side === "L" ? cx - 3.5 : cx + 3.5;
      var baseY = cy - 5;
      var earLen = 5.5 + fluff * 0.5;
      var baseHalfW = 2;

      var tipX, tipY;
      if (angle >= 0) {
        // 朝上
        tipX = baseX + (angle - 45) / 90 * 1.5;
        tipY = baseY - earLen * (0.3 + angle / 90 * 0.7);
      } else {
        // 后压（飞机耳）
        tipX = baseX + (side === "L" ? -1 : 1) * (1 + Math.abs(angle) / 90 * 2.5);
        tipY = baseY - earLen * 0.2 - Math.abs(angle) / 90 * 0.5;
      }

      // 外耳（黑色三角）
      fillTriangle(grid,
        baseX - baseHalfW, baseY,
        baseX + baseHalfW, baseY,
        tipX, tipY,
        INK);
      // 内耳粉色
      var innerScale = 0.45;
      fillTriangle(grid,
        baseX - baseHalfW * innerScale, baseY - 0.3,
        baseX + baseHalfW * innerScale, baseY - 0.3,
        baseX + (tipX - baseX) * 0.6, baseY + (tipY - baseY) * 0.6,
        PINK);
    }
    drawEar("L");
    drawEar("R");

    // ---------- 头部 ----------
    // 炸毛时边缘锯齿
    if (fluff > 0.3) {
      for (var a = 20; a < 340; a += 20) {
        var rad = a * Math.PI / 180;
        var r = headR + 0.5 + Math.sin(a * 2) * fluff * 0.5;
        var px = cx + Math.cos(rad) * r;
        var py = cy + Math.sin(rad) * r;
        fillCircle(grid, px, py, 0.8, INK);
      }
    }
    fillCircle(grid, cx, cy, headR, INK);

    // 面部亮区（眼睛所在的中央区域稍亮）
    fillEllipse(grid, cx, cy - 0.5, 4.5, 3.5, "#2a2a28");

    // ---------- 眼睛 ----------
    var eyeY = cy - 0.5;
    var eyeOffX = 2.8;
    var eyeRx = 1.7;
    var eyeRy = 2.8 * eyeO;

    function drawEye(ex) {
      // 眼白（杏仁形）
      fillEllipse(grid, ex, eyeY, eyeRx, eyeRy, WHITE);
      // 边框
      // 上眼线加重
      for (var ex2 = -eyeRx; ex2 <= eyeRx; ex2 += 0.5) {
        setPx(grid, ex + ex2, eyeY - eyeRy + 0.5, INK);
      }

      // 瞳孔：竖线→全圆
      var pupRx = lerp(0.35, 1.2, pupil);
      var pupRy = eyeRy * 0.85;
      fillEllipse(grid, ex, eyeY, pupRx, pupRy, INK);

      // 高光
      if (pupil > 0.15 && eyeO > 0.5) {
        setPx(grid, ex + 0.5, eyeY - 1, WHITE);
      }
    }
    drawEye(cx - eyeOffX);
    drawEye(cx + eyeOffX);

    // ---------- 眉区 ----------
    if (p.browTilt < -0.3) {
      // 愤怒眉：V 形阴影
      var browY = eyeY - eyeRy - 0.8;
      for (var bx = 0; bx < 2.5; bx += 0.5) {
        setPx(grid, cx - eyeOffX + bx, browY + bx * 0.5, ACCENT);
        setPx(grid, cx + eyeOffX - bx, browY + bx * 0.5, ACCENT);
      }
    } else if (p.browTilt > 0.3) {
      // 警觉眉：上挑
      var browY2 = eyeY - eyeRy - 0.8;
      for (var bx2 = 0; bx2 < 2; bx2 += 0.5) {
        setPx(grid, cx - eyeOffX - 1 + bx2, browY2 - bx2 * 0.3, ACCENT);
        setPx(grid, cx + eyeOffX + 1 - bx2, browY2 - bx2 * 0.3, ACCENT);
      }
    }

    // ---------- 鼻子 ----------
    var noseY = cy + 2.2;
    fillTriangle(grid,
      cx - 0.9, noseY,
      cx + 0.9, noseY,
      cx, noseY + 1.2,
      PINK);

    // ---------- 嘴 ----------
    var mouthY = noseY + 1.8;
    if (mouth > 0.2) {
      var mw = 1 + mouth * 1;
      var mh = mouth * 2.2;
      fillEllipse(grid, cx, mouthY, mw, mh, "#0a0a0a");
      // 嘶嘶时露犬齿
      if (mouth > 0.5) {
        fillTriangle(grid,
          cx - 0.6, mouthY - mh + 0.3,
          cx - 0.2, mouthY - mh + 0.3,
          cx - 0.4, mouthY - mh + 1.5,
          WHITE);
        fillTriangle(grid,
          cx + 0.2, mouthY - mh + 0.3,
          cx + 0.6, mouthY - mh + 0.3,
          cx + 0.4, mouthY - mh + 1.5,
          WHITE);
      }
    } else {
      // 闭嘴 W 形
      drawLine(grid, cx - 1.8, mouthY - 0.2, cx, mouthY + 0.6, ACCENT);
      drawLine(grid, cx, mouthY + 0.6, cx + 1.8, mouthY - 0.2, ACCENT);
    }

    // ---------- 胡须 ----------
    var whisBaseY = noseY + 0.3;
    var whisColor = "#888";
    for (var wl = 0; wl < 3; wl++) {
      var wStartY = whisBaseY + (wl - 1) * 0.9;
      var wEndX = 1.5 + whis * 1.5;
      var wEndY = wStartY - whis * 1.5 + 0.5;
      drawLine(grid, cx - 3.5, wStartY, wEndX, wEndY, whisColor);
    }
    for (var wr = 0; wr < 3; wr++) {
      var wStartY2 = whisBaseY + (wr - 1) * 0.9;
      var wEndX2 = GRID - 1.5 - whis * 1.5;
      var wEndY2 = wStartY2 - whis * 1.5 + 0.5;
      drawLine(grid, cx + 3.5, wStartY2, wEndX2, wEndY2, whisColor);
    }

    // ---------- 弓背 ----------
    if (arch > 0.2) {
      var archH = arch * 3;
      for (var ax2 = cx - 4; ax2 <= cx + 4; ax2 += 0.5) {
        var ay = cy + headR + 1 - Math.sin((ax2 - (cx-4)) / 8 * Math.PI) * archH;
        setPx(grid, ax2, ay, ACCENT);
        setPx(grid, ax2, ay + 0.5, ACCENT);
      }
    }

    // ---------- 炸毛毛刺 ----------
    if (fluff > 0.5) {
      var spikes = [[-1,-1],[1,-1],[-1.5,0],[1.5,0],[-1,1],[1,1],[0,-1.3],[0,1.3]];
      for (var si = 0; si < spikes.length; si++) {
        var sx = cx + spikes[si][0] * (headR + 0.3);
        var sy = cy + spikes[si][1] * (headR + 0.3);
        var tx = cx + spikes[si][0] * (headR + 1.5 * fluff);
        var ty = cy + spikes[si][1] * (headR + 1.5 * fluff);
        drawLine(grid, sx, sy, tx, ty, INK);
      }
    }

    // ---------- 呼噜标记 ----------
    if (p.vibrate > 0.1) {
      // 左上角小波纹
      var v = p.vibrate;
      for (var vi = 0; vi < 3; vi++) {
        setPx(grid, 1 + vi, 1 + vi * 0.5, PINK);
        setPx(grid, 1 + vi, 2 + vi * 0.5, PINK);
      }
    }

    return grid;
  }

  /* ---------- 网格 → SVG ---------- */
  function gridToSVG(grid, scale, label) {
    var s = scale || 5;
    var W = GRID * s, H = GRID * s;

    // 收集像素并按颜色分组（减少 SVG 节点数）
    var colorMap = {};
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < GRID; x++) {
        var c = grid[y * GRID + x];
        if (!c) continue;
        if (!colorMap[c]) colorMap[c] = [];
        colorMap[c].push([x, y]);
      }
    }

    var paths = [];
    // 背景
    paths.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="' + (s*0.5) + '" fill="' + BG + '"/>');

    for (var color in colorMap) {
      var pixels = colorMap[color];
      // 用 <path> 合并相同颜色的像素
      var d = "";
      for (var i = 0; i < pixels.length; i++) {
        var px = pixels[i][0] * s, py = pixels[i][1] * s;
        d += "M" + px + "," + py + "h" + s + "v" + s + "h-" + s + "z";
      }
      paths.push('<path d="' + d + '" fill="' + color + '"/>');
    }

    if (label) {
      paths.push('<text x="' + (W/2) + '" y="' + (H - s*0.8) + '" text-anchor="middle" font-size="' + (s*1.6) + '" fill="' + ACCENT + '" font-family="sans-serif">' + escapeHtml(label) + '</text>');
    }

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" shape-rendering="crispEdges">' + paths.join("") + '</svg>';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  /* ---------- 公共 API ---------- */
  function toSVG(p, opts) {
    opts = opts || {};
    var grid = rasterize(p);
    return gridToSVG(grid, opts.scale || 5, opts.label);
  }

  function toASCII(p) {
    var grid = rasterize(p);
    var lines = [];
    for (var y = 0; y < GRID; y++) {
      var line = "";
      for (var x = 0; x < GRID; x++) {
        var c = grid[y * GRID + x];
        if (!c || c === BG) line += ".";
        else if (c === INK) line += "#";
        else if (c === WHITE) line += "o";
        else if (c === PINK) line += "*";
        else line += "~";
      }
      lines.push(line);
    }
    return lines.join("\n");
  }

  function toDataURI(p, opts) {
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(toSVG(p, opts))));
  }

  /* ---------- 混合 ---------- */
  function blend(mixes) {
    var totalW = 0;
    mixes.forEach(function (m) { totalW += m.weight; });
    if (totalW === 0) return { ok: false, reason: "所有权重为零" };

    var result = Object.assign({}, BASE);
    PARAM_KEYS.forEach(function (k) {
      var sum = 0;
      mixes.forEach(function (m) {
        var sp = stateParams(m.state);
        sum += sp[k] * m.weight;
      });
      result[k] = sum / totalW;
    });

    var dominant = mixes[0].state, dominantW = 0;
    mixes.forEach(function (m) { if (m.weight > dominantW) { dominantW = m.weight; dominant = m.state; } });
    var stability = dominantW / totalW;
    return { ok: true, params: result, dominant: dominant, stability: stability };
  }

  function compose(mixes, opts) {
    var r = blend(mixes);
    if (!r.ok) return { ok: false, reason: r.reason };
    if (r.stability < 0.60)
      return { ok: false, reason: "主导状态权重不足 60%", dominant: r.dominant, stability: r.stability };
    return { ok: true, params: r.params, dominant: r.dominant, stability: r.stability };
  }

  /* ---------- 导出 ---------- */
  global.CatExpression = {
    PARAM_DEFS: PARAM_DEFS,
    PARAM_KEYS: PARAM_KEYS,
    BOUNDS: BOUNDS,
    BASE: BASE,
    STATES: STATES,
    STATE_IDS: STATE_IDS,
    ENDPOINTS: ENDPOINTS,
    STATUS_CODES: STATUS_CODES,
    getState: getState,
    stateParams: stateParams,
    toSVG: toSVG,
    toASCII: toASCII,
    toDataURI: toDataURI,
    blend: blend,
    compose: compose
  };

})(typeof window !== "undefined" ? window : this);

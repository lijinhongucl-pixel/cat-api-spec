/* ============================================================
   CAT API — 表情引擎 EXPR v1
   14 个状态由同一个 13 维参数向量驱动
   所有画面由参数实时计算，不含任何预存表情库
   ============================================================ */

(function (global) {
  "use strict";

  /* ---------- 参数定义 ---------- */
  var PARAM_DEFS = [
    { key: "earL",       label: "左耳角度",     range: "−90~+90", unit: "deg", grade: "B", note: "独立旋转，正值朝前，负值后压（飞机耳）" },
    { key: "earR",       label: "右耳角度",     range: "−90~+90", unit: "deg", grade: "B", note: "独立旋转，通常与左耳非对称" },
    { key: "pupil",      label: "瞳孔面积",     range: "0~1",     unit: "",    grade: "A", note: "0=一线，1=全黑。情绪和光照双因子驱动" },
    { key: "eyeOpen",    label: "眼睑开度",     range: "0.2~1",   unit: "",    grade: "C", note: "缓慢眨眼时短暂降到 0.3" },
    { key: "browTilt",   label: "眉区倾斜",     range: "−1~1",    unit: "",    grade: "C", note: "正值为上挑（警觉），负值为下压（愤怒）" },
    { key: "mouthOpen",  label: "张口度",       range: "0~1",     unit: "",    grade: "B", note: "嘶嘶时约 0.7，打哈欠时 1.0" },
    { key: "whiskerFwd", label: "胡须前展",     range: "−1~1",    unit: "",    grade: "B", note: "正值前展（好奇），负值后贴（恐惧）" },
    { key: "tailPos",    label: "尾巴高度",     range: "0~1",     unit: "",    grade: "A", note: "0=夹尾，1=直立。直立=友好最高正分" },
    { key: "tailSwing",  label: "尾巴摆频",     range: "0~8",     unit: "Hz",  grade: "B", note: "高频=烦躁（注意与狗语义相反）" },
    { key: "bodyArch",   label: "弓背度",       range: "0~1",     unit: "",    grade: "B", note: "恐惧或攻击前的体型膨胀准备" },
    { key: "furFluff",   label: "炸毛指数",     range: "0~1",     unit: "",    grade: "A", note: "竖毛肌激活程度。0=顺滑，1=全炸" },
    { key: "headTilt",   label: "头部倾斜",     range: "−1~1",    unit: "",    grade: "C", note: "正值右倾，负值左倾。好奇时触发" },
    { key: "vibrate",    label: "呼噜振动",     range: "0~1",     unit: "",    grade: "A", note: "25Hz 舒适呼噜至 150Hz 修复态" }
  ];

  var PARAM_KEYS = PARAM_DEFS.map(function (d) { return d.key; });

  var BOUNDS = {
    earL: [-90, 90], earR: [-90, 90], pupil: [0, 1], eyeOpen: [0.2, 1],
    browTilt: [-1, 1], mouthOpen: [0, 1], whiskerFwd: [-1, 1],
    tailPos: [0, 1], tailSwing: [0, 8], bodyArch: [0, 1],
    furFluff: [0, 1], headTilt: [-1, 1], vibrate: [0, 1]
  };

  var BASE = {
    earL: 30, earR: 30, pupil: 0.45, eyeOpen: 0.9,
    browTilt: 0, mouthOpen: 0.08, whiskerFwd: 0.3,
    tailPos: 0.55, tailSwing: 0.5, bodyArch: 0,
    furFluff: 0, headTilt: 0, vibrate: 0
  };

  /* ---------- 14 个状态定义 ---------- */
  var STATES = [
    { id: "RELAXED",  title: "放松",     class: "正向", confidence: 0.95, touch: "yes",
      tail: "slow-swing", body: "loaf-or-side", vocal: "silence",
      note: "本系统的默认态。耳自然朝前，瞳孔中等，呼吸平稳。接近 LOAF 但未完全进入。",
      params: { earL: 30, earR: 30, pupil: 0.35, eyeOpen: 0.85, browTilt: 0, mouthOpen: 0.05,
                whiskerFwd: 0.2, tailPos: 0.55, tailSwing: 0.8, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.3 } },

    { id: "ALERT",  title: "警觉",     class: "中性", confidence: 0.85, touch: "warn",
      tail: "twitch", body: "upright", vocal: "silence",
      note: "环境突变时触发。耳朝前独立旋转锁定生源，瞳孔轻微放大。不是恐惧，是信息采集。",
      params: { earL: 70, earR: 70, pupil: 0.55, eyeOpen: 1, browTilt: 0.3, mouthOpen: 0.05,
                whiskerFwd: 0.6, tailPos: 0.65, tailSwing: 2, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0 } },

    { id: "SLOW_BLINK", title: "缓慢眨眼", class: "正向·最高", confidence: 0.90, touch: "yes",
      tail: "still", body: "upright", vocal: "silence",
      note: "本系统给出的最高正面信号。眼睑缓慢闭合再缓慢张开，表示「我对你放下戒备」。正确的回应是回眨。",
      params: { earL: 25, earR: 25, pupil: 0.4, eyeOpen: 0.35, browTilt: 0, mouthOpen: 0.05,
                whiskerFwd: 0.3, tailPos: 0.6, tailSwing: 0.5, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.4 } },

    { id: "KNEADING", title: "踩奶",     class: "正向·幼态", confidence: 0.95, touch: "yes",
      tail: "soft-curl", body: "upright", vocal: "purr",
      note: "幼猫哺乳行为的保留态。前爪交替按压，触发正向反馈回路。推开会被记录为 Staff 可靠性下降。",
      params: { earL: 20, earR: 20, pupil: 0.35, eyeOpen: 0.6, browTilt: 0, mouthOpen: 0.05,
                whiskerFwd: 0.1, tailPos: 0.5, tailSwing: 0.3, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.85 } },

    { id: "PLAYFUL", title: "玩耍",     class: "正向", confidence: 0.80, touch: "yes",
      tail: "high-swish", body: "low-stalk", vocal: "chirp",
      note: "狩猎序列的 STALK 阶段被玩具触发。瞳孔全圆放大，臀部微摇准备起跳。",
      params: { earL: 50, earR: 50, pupil: 0.75, eyeOpen: 1, browTilt: 0.2, mouthOpen: 0.15,
                whiskerFwd: 0.8, tailPos: 0.8, tailSwing: 3, bodyArch: 0.3, furFluff: 0, headTilt: 0, vibrate: 0 } },

    { id: "CURIOUS", title: "好奇",     class: "中性", confidence: 0.75, touch: "yes",
      tail: "gentle-curl", body: "upright", vocal: "silence",
      note: "新物体进入领地。头部倾斜锁定声源，胡须前展采样。如果判定为安全则降级为 RELAXED。",
      params: { earL: 60, earR: 45, pupil: 0.5, eyeOpen: 0.95, browTilt: 0.1, mouthOpen: 0.05,
                whiskerFwd: 0.7, tailPos: 0.6, tailSwing: 1.2, bodyArch: 0, furFluff: 0, headTilt: 0.6, vibrate: 0 } },

    { id: "HUNGRY", title: "饥饿",     class: "中性·请求", confidence: 0.85, touch: "warn",
      tail: "upright-demanding", body: "upright", vocal: "meow-demand",
      note: "触发 VOICE 接口的喵叫信道。叫声频率刚好落在人类听觉最敏感区间——这是猫为你开发的 API。",
      params: { earL: 40, earR: 40, pupil: 0.55, eyeOpen: 0.9, browTilt: 0, mouthOpen: 0.3,
                whiskerFwd: 0.4, tailPos: 0.9, tailSwing: 4, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0 } },

    { id: "PAIN", title: "疼痛",     class: "负面·隐藏", confidence: 0.45, touch: "no",
      tail: "tuck", body: "tucked", vocal: "silence",
      note: "置信度只有 0.45。本系统在架构层面隐藏疼痛——显露疼痛等于招惹捕食者。不要等它看起来很疼，它不会让你看到。",
      params: { earL: 30, earR: 30, pupil: 0.45, eyeOpen: 0.85, browTilt: 0, mouthOpen: 0.08,
                whiskerFwd: 0.3, tailPos: 0.55, tailSwing: 0.5, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.6 } },

    { id: "FEARFUL", title: "恐惧",     class: "负面", confidence: 0.80, touch: "no",
      tail: "tuck", body: "arch-low", vocal: "hiss-soft",
      note: "耳侧平展开（飞机耳），瞳孔放大，身体压低。如果升级会触发炸毛和弓背。",
      params: { earL: -50, earR: -50, pupil: 0.8, eyeOpen: 1, browTilt: -0.3, mouthOpen: 0.15,
                whiskerFwd: -0.5, tailPos: 0.15, tailSwing: 1, bodyArch: 0.4, furFluff: 0.3, headTilt: 0, vibrate: 0 } },

    { id: "ANGRY", title: "愤怒",     class: "负面·攻击前", confidence: 0.85, touch: "no",
      tail: "thrash", body: "arch-high", vocal: "growl",
      note: "耳后压贴头，瞳孔部分放大不对称，弓背+炸毛。距离出爪还有约 1.5 秒。",
      params: { earL: -70, earR: -70, pupil: 0.7, eyeOpen: 0.9, browTilt: -0.5, mouthOpen: 0.25,
                whiskerFwd: -0.3, tailPos: 0.3, tailSwing: 6, bodyArch: 0.7, furFluff: 0.7, headTilt: 0, vibrate: 0 } },

    { id: "HISSING", title: "嘶嘶警告", class: "负面·最终警告", confidence: 1.00, touch: "no",
      tail: "fluffed-tuck", body: "arch-max", vocal: "HISS",
      note: "置信度 1.0。这是入侵者响应的最后一步。嘴大张露出犬齿，气流通过口腔发出嘶声。下一帧是出爪。",
      params: { earL: -85, earR: -85, pupil: 0.85, eyeOpen: 1, browTilt: -0.7, mouthOpen: 0.7,
                whiskerFwd: -0.8, tailPos: 0.1, tailSwing: 7, bodyArch: 0.9, furFluff: 0.9, headTilt: 0, vibrate: 0 } },

    { id: "ZOOMIES", title: "狂奔",     class: "中性·失态", confidence: 0.70, touch: "no",
      tail: "wild", body: "running", vocal: "silence",
      note: "18:00–23:00 间的不可预测高速移动。触发原因不明。可能是积压能量、月相或不可知因素。让出空间。",
      params: { earL: 55, earR: 55, pupil: 0.65, eyeOpen: 1, browTilt: 0.15, mouthOpen: 0.1,
                whiskerFwd: 0.5, tailPos: 0.85, tailSwing: 8, bodyArch: 0.1, furFluff: 0.1, headTilt: 0, vibrate: 0 } },

    { id: "LOAF", title: "面包态",   class: "正向·高置信", confidence: 0.95, touch: "yes",
      tail: "wrapped", body: "loaf", vocal: "silence",
      note: "四爪全部收进身体下面，尾巴盘绕，整体成长方形。运行时快照，不是接口调用。出现在你面前=Staff 评级高。",
      params: { earL: 25, earR: 25, pupil: 0.3, eyeOpen: 0.65, browTilt: 0, mouthOpen: 0.03,
                whiskerFwd: 0.1, tailPos: 0.5, tailSwing: 0, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.2 } },

    { id: "BOXED", title: "入箱",     class: "正向·封闭态", confidence: 1.00, touch: "no",
      tail: "tucked-in", body: "compressed", vocal: "silence",
      note: "进入纸箱后的封闭态。任何尺寸的纸箱优先级高于所有官方外设——这是项目级 MUST。不允许从纸箱中提取。",
      params: { earL: 15, earR: 15, pupil: 0.3, eyeOpen: 0.55, browTilt: 0, mouthOpen: 0.03,
                whiskerFwd: 0, tailPos: 0.35, tailSwing: 0, bodyArch: 0, furFluff: 0, headTilt: 0, vibrate: 0.5 } }
  ];

  var STATE_IDS = STATES.map(function (s) { return s.id; });

  /* ---------- 端点 ---------- */
  var ENDPOINTS = [
    { method: "GET",  path: "/api/v1/expression", note: "读取当前表情状态与参数向量" },
    { method: "GET",  path: "/api/v1/expression/{state}", note: "读取指定状态的预设参数" },
    { method: "POST", path: "/api/v1/expression/compose", note: "线性插值多个状态，返回混合帧" },
    { method: "POST", path: "/api/v1/expression/{state}", note: "405 METHOD NOT ALLOWED · 表情是上报不是调用" },
    { method: "PATCH", path: "/api/v1/expression", note: "405 · 你不能直接设置表情" },
    { method: "DELETE", path: "/api/v1/expression", note: "405 · 表情不可删除" }
  ];

  /* ---------- 状态码 ---------- */
  var STATUS_CODES = [
    { code: 200, name: "OK", note: "表情正常上报" },
    { code: 202, name: "Accepted", note: "请求已收到，表情将在稍后更新" },
    { code: 405, name: "Method Not Allowed", note: "表情不可直接设置——它是状态的上报，不是可调用的方法" },
    { code: 409, name: "Conflict", note: "混合权重不足以保持新帧，系统回到主导状态" },
    { code: 422, name: "Unprocessable", note: "所有权重为零，参数向量不成立" },
    { code: 451, name: "Unavailable For Legal Reasons", note: "系统拒绝解释为什么它要把那只杯子推下去" },
    { code: 503, name: "Service Unavailable", note: "系统在睡眠或 ZOOMIES，表情模块暂停" }
  ];

  /* ---------- 工具 ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function getState(id) { for (var i = 0; i < STATES.length; i++) if (STATES[i].id === id) return STATES[i]; return STATES[0]; }
  function stateParams(id) { return Object.assign({}, BASE, getState(id).params); }

  /* ---------- 渲染 ---------- */
  function toSVG(p, opts) {
    opts = opts || {};
    var scale = opts.scale || 5;
    var s = scale; // pixel scale
    var W = 24 * s, H = 24 * s;

    // 归一化参数
    p = Object.assign({}, BASE, p);
    var earL   = p.earL;       // -90~90
    var earR   = p.earR;
    var pupil  = clamp(p.pupil, 0, 1);
    var eyeO   = clamp(p.eyeOpen, 0.15, 1);
    var brow   = p.browTilt;
    var mouth  = clamp(p.mouthOpen, 0, 1);
    var whis   = p.whiskerFwd;
    var arch   = clamp(p.bodyArch, 0, 1);
    var fluff  = clamp(p.furFluff, 0, 1);
    var tilt   = p.headTilt;
    var vib    = p.vibrate;
    var purr   = vib > 0.5;

    var ink = "#1a1a1a";
    var bg  = "#f4f2ee";
    var accent = "#4b5563";
    var pink = "#e8a0a0";

    var cx = 12 * s;
    var cy = 12 * s;
    var r  = 7.5 * s * (1 + fluff * 0.18); // 炸毛时脸变大

    var paths = [];

    // 背景圆角方块
    paths.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="' + (2*s) + '" fill="' + bg + '"/>');

    // 呼噜振动指示器（右上角小波纹）
    if (vib > 0.1) {
      var va = Math.round(clamp(vib, 0, 1) * 100);
      paths.push('<text x="' + (21*s) + '" y="' + (4*s) + '" font-size="' + (1.8*s) + '" fill="' + accent + '" opacity="' + (0.3 + vib*0.5) + '">～' + va + 'Hz</text>');
    }

    // 头部旋转（headTilt）
    var headRot = tilt * 8;

    // 耳朵绘制（三角形，角度由 earL/earR 控制）
    function drawEar(side) {
      var angle = side === "L" ? earL : earR; // -90~90
      var baseX = cx + (side === "L" ? -3.5*s : 3.5*s);
      var baseY = cy - 5*s;
      var earLen = 3.5*s;
      // angle=90 朝前上，angle=-90 后压
      var rad = (angle - 90) * Math.PI / 180; // 0=正上
      var tipX = baseX + Math.sin(rad) * earLen * 0.6;
      var tipY = baseY - Math.cos(rad) * earLen;
      var baseHalf = 1.8 * s;
      var sideOffset = (1 - Math.abs(angle)/90) * baseHalf;

      paths.push('<polygon points="' +
        (baseX - baseHalf) + ',' + baseY + ' ' +
        (baseX + baseHalf) + ',' + baseY + ' ' +
        tipX + ',' + tipY +
        '" fill="' + ink + '" opacity="' + (0.85 + fluff*0.1) + '"/>');
      // 内耳粉色
      paths.push('<polygon points="' +
        (baseX - baseHalf*0.5) + ',' + baseY + ' ' +
        (baseX + baseHalf*0.5) + ',' + baseY + ' ' +
        (tipX*0.8 + baseX*0.2) + ',' + (tipY*0.8 + baseY*0.2) +
        '" fill="' + pink + '" opacity="0.6"/>');
    }
    drawEar("L");
    drawEar("R");

    // 头部主体（圆，炸毛时外扩）
    var fluffR = r * (1 + fluff * 0.15);
    // 炸毛时边缘锯齿
    if (fluff > 0.3) {
      var spikes = 16;
      var pts = [];
      for (var i = 0; i < spikes; i++) {
        var a = (i / spikes) * Math.PI * 2;
        var rr = fluffR * (1 + (i % 2 === 0 ? 0.08 : -0.04) * fluff);
        pts.push((cx + Math.cos(a) * rr).toFixed(1) + "," + (cy + Math.sin(a) * rr).toFixed(1));
      }
      paths.push('<polygon points="' + pts.join(" ") + '" fill="' + ink + '"/>');
    } else {
      paths.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + ink + '"/>');
    }

    // 眼睛
    var eyeY = cy - 0.5 * s;
    var eyeOffX = 2.8 * s;
    var eyeW = 1.8 * s;
    var eyeH = 2.2 * s * eyeO;

    function drawEye(ex) {
      // 眼眶
      paths.push('<ellipse cx="' + ex + '" cy="' + eyeY + '" rx="' + eyeW + '" ry="' + eyeH + '" fill="#fefcf8" stroke="' + ink + '" stroke-width="' + (0.3*s) + '"/>');
      // 瞳孔：猫是竖瞳
      var pw = 0.3 * s * (1 - pupil * 0.6); // 瞳孔越放大越窄……不对，猫是竖线→全圆
      var ph = eyeH * 0.85 * (0.3 + pupil * 0.7);
      // pupil=0 一线，=1 全圆
      var pupilW = lerp(0.25*s, 1.4*s, pupil);
      var pupilH = lerp(2*s, 1.6*s, pupil);
      paths.push('<ellipse cx="' + ex + '" cy="' + eyeY + '" rx="' + pupilW + '" ry="' + pupilH + '" fill="' + ink + '"/>');
      // 高光
      if (pupil > 0.2) {
        paths.push('<circle cx="' + (ex + 0.3*s) + '" cy="' + (eyeY - 0.4*s) + '" r="' + (0.25*s) + '" fill="#fff" opacity="0.7"/>');
      }
    }
    drawEye(cx - eyeOffX);
    drawEye(cx + eyeOffX);

    // 眉区（browTilt 影响眼睛上方的阴影角度）
    if (Math.abs(brow) > 0.1) {
      var browOff = brow * 1.5 * s;
      paths.push('<path d="M ' + (cx - eyeOffX - eyeW) + ' ' + (eyeY - eyeH - 0.5*s) +
        ' L ' + (cx - eyeOffX + eyeW) + ' ' + (eyeY - eyeH - 0.5*s + browOff) +
        '" stroke="' + accent + '" stroke-width="' + (0.6*s) + '" fill="none" opacity="0.6"/>');
      paths.push('<path d="M ' + (cx + eyeOffX - eyeW) + ' ' + (eyeY - eyeH - 0.5*s + browOff) +
        ' L ' + (cx + eyeOffX + eyeW) + ' ' + (eyeY - eyeH - 0.5*s) +
        '" stroke="' + accent + '" stroke-width="' + (0.6*s) + '" fill="none" opacity="0.6"/>');
    }

    // 鼻子
    var noseY = cy + 1.5 * s;
    paths.push('<polygon points="' +
      (cx - 0.5*s) + ',' + noseY + ' ' +
      (cx + 0.5*s) + ',' + noseY + ' ' +
      cx + ',' + (noseY + 0.5*s) +
      '" fill="' + pink + '"/>');

    // 嘴巴（mouthOpen > 0.3 时画张口椭圆）
    var mouthY = noseY + 0.8 * s;
    if (mouth > 0.15) {
      var mw = 1.2 * s;
      var mh = mouth * 2.5 * s;
      paths.push('<ellipse cx="' + cx + '" cy="' + mouthY + '" rx="' + mw + '" ry="' + mh + '" fill="' + ink + '"/>');
      // 嘶嘶时露出犬齿
      if (mouth > 0.5) {
        paths.push('<polygon points="' +
          (cx - 0.4*s) + ',' + (mouthY - mh + 0.3*s) + ' ' +
          (cx - 0.2*s) + ',' + (mouthY - mh + 0.3*s) + ' ' +
          (cx - 0.3*s) + ',' + (mouthY - mh + 1*s) +
          '" fill="#fff"/>');
        paths.push('<polygon points="' +
          (cx + 0.2*s) + ',' + (mouthY - mh + 0.3*s) + ' ' +
          (cx + 0.4*s) + ',' + (mouthY - mh + 0.3*s) + ' ' +
          (cx + 0.3*s) + ',' + (mouthY - mh + 1*s) +
          '" fill="#fff"/>');
      }
    } else {
      // 闭嘴 W 形
      paths.push('<path d="M ' + (cx - 1.2*s) + ' ' + mouthY +
        ' Q ' + cx + ' ' + (mouthY + 0.5*s) + ' ' + (cx + 1.2*s) + ' ' + mouthY +
        '" stroke="' + accent + '" stroke-width="' + (0.3*s) + '" fill="none"/>');
    }

    // 胡须（whiskerFwd 控制方向和弧度）
    var whisY = noseY + 0.3 * s;
    var whisLen = 4 * s;
    var whisAngle = whis * 15; // -15~+15 度
    var whisOpacity = 0.5;
    for (var w = -1; w <= 1; w += 2) {
      for (var wl = 0; wl < 3; wl++) {
        var dy = (wl - 1) * 0.8 * s;
        var dx = w * (3 * s);
        var tipX = cx + w * (3*s + whisLen * whis * 0.3);
        var tipY = whisY + dy + (1-whis) * 2*s;
        paths.push('<path d="M ' + (cx + dx*0.5) + ' ' + (whisY + dy*0.3) +
          ' Q ' + (cx + dx) + ' ' + (whisY + dy) + ' ' + tipX + ' ' + tipY +
          '" stroke="' + accent + '" stroke-width="' + (0.25*s) + '" fill="none" opacity="' + whisOpacity + '"/>');
      }
    }

    // 弓背指示（在头部下方画弧线示意）
    if (arch > 0.1) {
      var archH = arch * 3 * s;
      paths.push('<path d="M ' + (cx - 4*s) + ' ' + (cy + r + 1*s) +
        ' Q ' + cx + ' ' + (cy + r + 1*s - archH) + ' ' + (cx + 4*s) + ' ' + (cy + r + 1*s) +
        '" stroke="' + ink + '" stroke-width="' + (1.2*s) + '" fill="none" opacity="0.5"/>');
    }

    // 尾巴指示器（右下角小图标）
    var tailX = cx + 7 * s;
    var tailBaseY = cy + 5 * s;
    var tailH = p.tailPos * 6 * s;
    var tailSwingFreq = p.tailSwing;
    var tailSwingAmp = Math.min(tailSwingFreq, 8) * 0.5 * s;
    paths.push('<path d="M ' + tailX + ' ' + tailBaseY +
      ' Q ' + (tailX + tailSwingAmp) + ' ' + (tailBaseY - tailH * 0.5) +
      ' ' + (tailX + (tailSwingAmp*0.5)) + ' ' + (tailBaseY - tailH) +
      '" stroke="' + ink + '" stroke-width="' + (1.5*s) + '" fill="none" opacity="0.6" stroke-linecap="round"/>');

    // 炸毛纹理
    if (fluff > 0.5) {
      for (var fi = 0; fi < 6; fi++) {
        var fa = (fi / 6) * Math.PI - Math.PI/2;
        var fx = cx + Math.cos(fa) * (r + 0.5*s);
        var fy = cy + Math.sin(fa) * (r + 0.5*s);
        paths.push('<line x1="' + fx + '" y1="' + fy + '" x2="' + (fx + Math.cos(fa)*2*s*fluff) + '" y2="' + (fy + Math.sin(fa)*2*s*fluff) + '" stroke="' + ink + '" stroke-width="' + (0.4*s) + '" opacity="0.7"/>');
      }
    }

    // 状态标签
    if (opts.label) {
      paths.push('<text x="' + (cx) + '" y="' + (H - 1.5*s) + '" text-anchor="middle" font-size="' + (2*s) + '" fill="' + accent + '" font-family="sans-serif">' + escapeHtml(opts.label) + '</text>');
    }

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
      paths.join("") + '</svg>';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  /* ---------- ASCII ---------- */
  function toASCII(p) {
    p = Object.assign({}, BASE, p);
    var earL = p.earL < 0 ? "v" : p.earL > 50 ? "^" : "/";
    var earR = p.earR < 0 ? "v" : p.earR > 50 ? "^" : "\\";
    var pupil = p.pupil > 0.6 ? "@" : p.pupil < 0.3 ? "|" : "o";
    var mouth = p.mouthOpen > 0.5 ? "w" : ".";
    var whisker = p.whiskerFwd > 0 ? "~" : "-";
    var tail = p.tailPos > 0.7 ? "¨" : p.tailPos < 0.2 ? "J" : "~";
    var fluff = p.furFluff > 0.5 ? "✿" : "●";

    return [
      "    " + earL + "   " + earR + "       ",
      "   /=====\\      ",
      "  / " + pupil + "   " + pupil + " \\     ",
      " |   " + whisker + whisker + "  |     " + tail,
      "  \\  " + mouth + "  /      ",
      "   \\___/       ",
      "    " + fluff + "         "
    ].join("\n");
  }

  /* ---------- Data URI ---------- */
  function toDataURI(p, opts) {
    var svg = toSVG(p, opts);
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
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

    // 找主导
    var dominant = mixes[0].state, dominantW = 0;
    mixes.forEach(function (m) { if (m.weight > dominantW) { dominantW = m.weight; dominant = m.state; } });
    var stability = dominantW / totalW;

    return { ok: true, params: result, dominant: dominant, stability: stability };
  }

  function compose(mixes, opts) {
    opts = opts || {};
    var r = blend(mixes);
    if (!r.ok) return { ok: false, reason: r.reason };
    if (r.stability < 0.60) {
      return { ok: false, reason: "主导状态权重不足 60%", dominant: r.dominant, stability: r.stability };
    }
    if (opts.persist) return { ok: true, params: r.params, dominant: r.dominant };
    return { ok: true, params: r.params, dominant: r.dominant };
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

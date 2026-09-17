/*!
 * CAT 表情渲染引擎 —— EXPR v1
 * ---------------------------------------------------------------------------
 * 设计前提：引擎里没有表情库。
 * 14 个状态全部是同一个 13 维参数向量在不同取值下的渲染结果；
 * 引擎内不含任何位图、素材或外部依赖，输出为整数坐标的像素级 SVG。
 *
 * 栅格化顺序（后画的覆盖先画的）：
 *   耳 → 头 → 斑纹 → 口鼻 → 鼻 → 嘴 → 眼 → 眉 → 胡须 → 颊 → 炸毛 → 轮廓
 *
 * 猫与狗的关键差异（本引擎的立论）：
 *   1. 耳是三角形，且可独立旋转（狗只有前倾/后压两个自由度）
 *   2. 瞳孔是竖裂，随情绪在「一线」与「全圆」之间连续插值
 *   3. 口鼻短而宽，鼻头是小三角而非圆钝
 *   4. 有胡须，且胡须前展/后贴编码情绪
 *   5. 前额有虎斑 M 纹——这不是装饰，是识别特征
 *
 * 零依赖，浏览器（window.CatExpression）与 Node（require）双用。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CatExpression = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ 画布 */

  var N = 24; // 网格边长；1 格 = 1 SVG 单位

  // 调色板。字符 → 颜色；"." 为透明。
  // 主色是灰虎斑：与 DOG API 的棕黄拉开距离，同时保证 24px 下明度层次可读。
  var PALETTE = {
    ".": null,
    O: "#1f242c", // 轮廓
    D: "#6a7385", // 深毛（耳 / 虎斑）。明度比 F 低约 27% —— 与 DOG API 的 F/D 比例一致，
                  // 再深一点整个上半张脸就会糊成一团黑
    F: "#8d97a8", // 主毛色
    L: "#c2cbd8", // 浅毛（口鼻 / 下颌）。明度比 F 高约 33%
    N: "#22272f", // 鼻梁影 / 口腔
    R: "#d98f8f", // 鼻头（粉）
    W: "#ffffff", // 眼白
    P: "#151920", // 瞳孔
    I: "#8fae5a", // 虹膜（绿眼）
    T: "#e0857d", // 舌
    B: "#e5a8a8", // 颊 / 耳内
    K: "#3a4250", // 眉
    V: "#aab5c6", // 胡须。比深毛浅，比浅毛柔 —— 否则就是一根根速度线
    M: "#c0c8d4"  // 运动残影。刻意不参与轮廓描边
  };

  // ASCII 预览用的替身字符
  var ASCII = {
    ".": " ", O: "#", D: "+", F: "o", L: ":", N: "X",
    R: "*", W: "·", P: "@", I: "e", T: "~", B: ",", K: "=", V: "'", M: "-"
  };

  // 参与轮廓描边的前景字符。眼白、瞳孔、虹膜、眉、颊不参与，
  // 否则眼睛周围会多出一圈黑边。
  var SILHOUETTE = { F: 1, D: 1, L: 1, N: 1, T: 1 };

  /* ------------------------------------------------------------ 参数定义 */

  var BASE = {
    earL: 55,        // 左耳角度（−90 后压 → +90 竖立）
    earR: 55,        // 右耳角度
    pupil: 0.35,     // 瞳孔面积（0 竖裂 → 1 全圆）
    eyeOpen: 0.92,   // 睑裂开度（0 闭合 → 1.3 露巩膜）
    pupilX: 0,       // 视线水平偏移
    pupilY: 0,       // 视线垂直偏移
    browTilt: 0,     // 眉区倾斜（−1 下压 → +1 上挑）
    mouthOpen: 0,    // 张口度
    tongue: 0,       // 舌伸出
    whiskerFwd: 0.3, // 胡须前展（−1 后贴 → +1 前展）
    cheek: 0.35,     // 颊部膨起
    furFluff: 0,     // 炸毛指数
    headTilt: 0      // 头部偏航（度）
  };

  var BOUNDS = {
    earL: [-90, 90], earR: [-90, 90], pupil: [0, 1], eyeOpen: [0, 1.3],
    pupilX: [-1, 1], pupilY: [-1, 1], browTilt: [-1, 1], mouthOpen: [0, 1],
    tongue: [0, 1], whiskerFwd: [-1, 1], cheek: [0, 1], furFluff: [0, 1],
    headTilt: [-15, 15]
  };

  var PARAM_KEYS = ["earL", "earR", "pupil", "eyeOpen", "pupilX", "pupilY",
    "browTilt", "mouthOpen", "tongue", "whiskerFwd", "cheek", "furFluff", "headTilt"];

  var PARAM_DEFS = [
    { key: "earL", label: "左耳角度", range: "−90 – +90", unit: "°", grade: "B", note: "猫的耳廓可独立旋转。负值＝后压（飞机耳），是恐惧与疼痛的早期指标" },
    { key: "earR", label: "右耳角度", range: "−90 – +90", unit: "°", grade: "B", note: "与左耳非对称时表示多目标监听。两耳同向后压才是危险信号" },
    { key: "pupil", label: "瞳孔面积", range: "0 – 1", unit: "", grade: "A", note: "0 = 竖裂，1 = 全圆。猫的瞳孔是纵向裂孔，收缩范围远大于人" },
    { key: "eyeOpen", label: "睑裂开度", range: "0 – 1.3", unit: "", grade: "B", note: "0 = 闭合，1 = 常态，>1 露下巩膜。缓慢眨眼是本系统最高级别的信任信号" },
    { key: "pupilX", label: "视线水平偏移", range: "−1 – +1", unit: "", grade: "C", note: "瞳孔相对眼窝中心的偏移。回避型视线是安抚信号的组成部分" },
    { key: "pupilY", label: "视线垂直偏移", range: "−1 – +1", unit: "", grade: "C", note: "同上，垂直分量。离开视线是拒绝互动的第一动作" },
    { key: "browTilt", label: "眉区倾斜", range: "−1 – +1", unit: "", grade: "C", note: "正值＝上挑（警觉 / 好奇），负值＝下压（愤怒 / 攻击前）。猫的眉区不如犬明显，但存在" },
    { key: "mouthOpen", label: "张口度", range: "0 – 1", unit: "", grade: "B", note: "嘶嘶时约 0.8，哈欠时 1.0。张口与呼吸共用执行器，不能单独用于判断情绪" },
    { key: "tongue", label: "舌伸出", range: "0 – 1", unit: "", grade: "C", note: "露出（blep）多为下颌放松的副产物，不是有意识的表情" },
    { key: "whiskerFwd", label: "胡须前展", range: "−1 – +1", unit: "", grade: "B", note: "胡须是触觉阵列的物理天线。前展＝采样探测，后贴＝防御收缩" },
    { key: "cheek", label: "颊部膨起", range: "0 – 1", unit: "", grade: "C", note: "腮部腺体充血程度。放松时自然膨起，紧张时收缩" },
    { key: "furFluff", label: "炸毛指数", range: "0 – 1", unit: "", grade: "A", note: "竖毛肌激活。0 = 顺滑，1 = 全炸。体型在视觉上放大但攻击力未变" },
    { key: "headTilt", label: "头部偏航", range: "−15 – +15", unit: "°", grade: "B", note: "定位声源时的偏航角。人类普遍把它读作「可爱」，本引擎不纠正这一误读" }
  ];

  /* ------------------------------------------------------------ 几何工具 */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function blank() {
    var g = [];
    for (var y = 0; y < N; y++) {
      var row = [];
      for (var x = 0; x < N; x++) row.push(".");
      g.push(row);
    }
    return g;
  }

  // 整体倾斜用「对采样点做逆旋转」实现，而不是逐个部件旋转。
  function transformPair(tilt) {
    if (!tilt) {
      var id = function (x, y) { return [x, y]; };
      return { fwd: id, inv: id };
    }
    var a = tilt * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    var px = N / 2, py = N / 2 + 2.0; // 旋转轴心：颈部方向
    return {
      fwd: function (x, y) {
        var dx = x - px, dy = y - py;
        return [px + dx * c - dy * s, py + dx * s + dy * c];
      },
      inv: function (x, y) {
        var dx = x - px, dy = y - py;
        return [px + dx * c + dy * s, py - dx * s + dy * c];
      }
    };
  }

  var TF_ID = transformPair(0).fwd;

  // 超椭圆：n = 2 是普通椭圆，n > 2 越接近圆角矩形。
  function ellTest(wx, wy, cx, cy, rx, ry, rot, n) {
    var dx = wx - cx, dy = wy - cy;
    if (rot) {
      var a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      var qx = dx * c + dy * s, qy = -dx * s + dy * c;
      dx = qx; dy = qy;
    }
    var p = n || 2;
    if (p === 2) return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
    return Math.pow(Math.abs(dx) / rx, p) + Math.pow(Math.abs(dy) / ry, p) <= 1;
  }

  function fillEll(g, tf, cx, cy, rx, ry, ch, rot, yMin, yMax, n) {
    if (!(rx > 0) || !(ry > 0)) return;
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var wx = x + 0.5, wy = y + 0.5;
        if (yMin !== undefined && wy < yMin) continue;
        if (yMax !== undefined && wy > yMax) continue;
        var p = tf ? tf.inv(wx, wy) : [wx, wy];
        if (ellTest(p[0], p[1], cx, cy, rx, ry, rot, n)) g[y][x] = ch;
      }
    }
  }

  function inTri(px, py, ax, ay, bx, by, cx, cy) {
    function sg(x1, y1, x2, y2, x3, y3) { return (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3); }
    var d1 = sg(px, py, ax, ay, bx, by);
    var d2 = sg(px, py, bx, by, cx, cy);
    var d3 = sg(px, py, cx, cy, ax, ay);
    var hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    var hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
  }

  // yMin / yMax 用来纵向裁切。内耳必须靠它截断：
  // 不截的话粉色会一路爬到耳尖所在的那一行，把耳廓顶部的深色边吃光，
  // 两只耳朵就退化成「两个粉色三角」而不是「有耳朵的猫」。
  function fillTri(g, tf, ax, ay, bx, by, cx, cy, ch, yMin, yMax) {
    var minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1);
    var maxX = Math.min(N, Math.ceil(Math.max(ax, bx, cx)) + 2);
    var minY = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1);
    var maxY = Math.min(N, Math.ceil(Math.max(ay, by, cy)) + 2);
    for (var y = minY; y < maxY; y++) {
      for (var x = minX; x < maxX; x++) {
        var wx = x + 0.5, wy = y + 0.5;
        if (yMin !== undefined && wy < yMin) continue;
        if (yMax !== undefined && wy > yMax) continue;
        var p = tf ? tf.inv(wx, wy) : [wx, wy];
        if (inTri(p[0], p[1], ax, ay, bx, by, cx, cy)) g[y][x] = ch;
      }
    }
  }

  // 点到线段的距离。折线描边的核心 —— 比逐点打点稳得多：
  // 逐点打点在 24px 网格上会让斜率稍大的细线断成两截，像一条虚线。
  function distToSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var qx = ax + t * dx - px, qy = ay + t * dy - py;
    return Math.sqrt(qx * qx + qy * qy);
  }

  // 折线描边。hw = 半线宽，0.55 约等于 1 格。
  function strokePolyline(g, tf, pts, ch, hw) {
    var w = hw === undefined ? 0.55 : hw;
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var p = tf ? tf.inv(x + 0.5, y + 0.5) : [x + 0.5, y + 0.5];
        var best = Infinity;
        for (var i = 0; i < pts.length - 1; i++) {
          var d = distToSeg(p[0], p[1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
          if (d < best) best = d;
        }
        if (best <= w) g[y][x] = ch;
      }
    }
  }

  // 只在空白格上落笔的折线。胡须必须用这个 —— 否则它会横穿整张脸，
  // 变成一道横贯口鼻的灰色带子。
  function strokeEmpty(g, tf, pts, ch, hw) {
    var w = hw === undefined ? 0.5 : hw;
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        if (g[y][x] !== ".") continue;
        var p = tf ? tf.inv(x + 0.5, y + 0.5) : [x + 0.5, y + 0.5];
        var best = Infinity;
        for (var i = 0; i < pts.length - 1; i++) {
          var d = distToSeg(p[0], p[1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
          if (d < best) best = d;
        }
        if (best <= w) g[y][x] = ch;
      }
    }
  }

  // 便利包装：两点直线
  function seg(g, tf, x0, y0, x1, y1, ch, hw) {
    strokePolyline(g, tf, [[x0, y0], [x1, y1]], ch, hw);
  }
  function segEmpty(g, tf, x0, y0, x1, y1, ch, hw) {
    strokeEmpty(g, tf, [[x0, y0], [x1, y1]], ch, hw);
  }

  // 只给剪影外缘描边：空白格若与前景相邻，则变为轮廓色。
  function outline(g) {
    var src = [];
    for (var y = 0; y < N; y++) src.push(g[y].slice());
    var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var yy = 0; yy < N; yy++) {
      for (var xx = 0; xx < N; xx++) {
        if (src[yy][xx] !== ".") continue;
        for (var k = 0; k < 4; k++) {
          var nx = xx + nb[k][0], ny = yy + nb[k][1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          var c = src[ny][nx];
          if (c !== "." && SILHOUETTE[c]) { g[yy][xx] = "O"; break; }
        }
      }
    }
  }

  /* -------------------------------------------------------------- 各部件 */

  // 耳：三角形，两耳可独立旋转。
  // 与狗的关键差异 —— 狗耳是一枚「旋转的超椭圆」，猫耳是一个真正的三角。
  // 体量必须和狗耳对齐：耳根半宽 3.1、竖起高度约 7 格才有同样的存在感；
  // 早期版本只给了 2.5 宽、4 高，结果像两片插在头上的纸屑。
  function drawEars(g, tf, p) {
    for (var s = -1; s <= 1; s += 2) {
      var a = s < 0 ? p.earL : p.earR;      // −90 ~ +90
      var n = clamp(a / 90, -1, 1);

      var baseX = s < 0 ? 6.3 : N - 6.3;
      var baseY = 8.9;
      var hw = 3.30;                         // 耳根半宽。给足 3 格以上，两耳之间才留得出深色边

      var tipX, tipY;
      if (n >= 0) {
        // 竖立：耳尖向上，随角度略微外倾
        tipX = baseX + s * (1.5 - n * 1.05);
        tipY = baseY - (5.0 + n * 3.1);
      } else {
        // 飞机耳：耳尖向外平倒
        var k = -n;
        tipX = baseX + s * (1.5 + k * 4.6);
        tipY = baseY - (5.0 - k * 3.7);
      }

      // 耳根填充：颅骨顶部是圆的，耳廓与颅骨之间会裂开一道缝。
      // 用一枚小椭圆把两者接上，画在颅骨之前，因此只露出朝外的部分。
      fillEll(g, tf, baseX + s * 0.2, baseY - 1.4, 1.95, 2.15, "D", 0, undefined, undefined, 2.4);

      // 外耳（三角形）。用深毛色 —— 与颅骨形成明暗层次，这一点和 DOG API 同理。
      fillTri(g, tf,
        baseX - hw, baseY,
        baseX + hw, baseY,
        tipX, tipY,
        "D");

      // 内耳（缩小的三角，偏粉）。
      //
      // k2 是全文件最敏感的一个数，两条相反的经验在这里对撞：
      //   0.55 → 粉色吃掉整个耳廓，耳朵读成「两根粉色圆点」
      //   0.34 → 大小合适，但曾配过一道 yMin 纵向裁切，想把耳尖那一行留成实心深色。
      //          那道裁切是个错误：「耳尖所在的一行」是随角度移动的，
      //          耳朵一竖立，裁切线就切到内耳根部，粉色被压成一条 0.3 格高的细缝。
      //          耳朵看起来像贴了张粉色贴纸。现在取消裁切，只靠 k2 控制占比。
      var cxm = (baseX - hw + baseX + hw + tipX) / 3;
      var cym = (baseY + baseY + tipY) / 3;
      var k2 = 0.32;
      fillTri(g, tf,
        cxm + (baseX - hw - cxm) * k2, cym + (baseY - cym) * k2,
        cxm + (baseX + hw - cxm) * k2, cym + (baseY - cym) * k2,
        cxm + (tipX - cxm) * k2, cym + (tipY - cym) * k2,
        "B");
    }
  }

  // 头：颅骨 + 腮 + 口鼻。
  // 猫的颅骨比狗更圆（n 更小）。DOG API 用 n = 3.4 是为了让方顶盖和耳根接上；
  // 猫耳是三角、可以自己接，所以颅骨可以放心用圆的 —— 这正是猫脸的第一识别特征。
  function drawHead(g, tf, p) {
    // 颅顶毛簇：在光滑颅骨的上缘再压几枚错落的小圆，把颅顶顶出起伏，
    // 让剪影描边走成毛茸茸的曲线。
    //
    // 这几笔是整个几何里最不直观、但最不能省的一处。
    // 圆颅顶的描边会在两耳之间连成一根 8 格宽的实心横杠，读起来像戴了一顶黑帽檐；
    // 而且无论把颅骨整体上移还是下移，横杠都只是换一行出现，不会消失 ——
    // 唯一有效的破法是让颅顶线上出现「非空单元格」，把描边打断。
    //
    // 中间那枚刻意比两侧高出约 1 格：它要一路顶到横杠所在的那一行，
    // 把 8 格的长杠切成两段 1 格。只把颅顶顶宽是不够的，必须顶穿那一行。
    var TUFTS = [
      [10.40, 7.35, 1.10],
      [12.00, 6.60, 1.35],
      [13.60, 7.35, 1.10]
    ];
    for (var ti = 0; ti < TUFTS.length; ti++) {
      fillEll(g, tf, TUFTS[ti][0], TUFTS[ti][1], TUFTS[ti][2], TUFTS[ti][2] * 0.95,
        "F", 0, undefined, undefined, 2.0);
    }

    // 颅骨
    fillEll(g, tf, 12, 13.5, 6.9, 7.0, "F", 0, undefined, undefined, 2.45);
    // 颊部毛簇：把下半张脸撑宽。这是猫的「腮」，也是它和狗最大的轮廓差异。
    // 位置必须压在颅骨外缘上（x ≈ 6.4 / 17.6），太靠内就看不出来。
    var ck = 0.75 + p.cheek * 0.45;
    fillEll(g, tf, 6.5, 15.9, 2.55 * ck, 2.75 * ck, "F", 0, undefined, undefined, 2.2);
    fillEll(g, tf, 17.5, 15.9, 2.55 * ck, 2.75 * ck, "F", 0, undefined, undefined, 2.2);

    // 炸毛：颅骨外缘长出短刺。必须在颅骨之前画，
    // 否则每根刺都会被当成剪影外缘描一圈黑边，看起来像一只刺猬。
    if (p.furFluff > 0.3) {
      var fk = (p.furFluff - 0.3) / 0.7;
      for (var i = 0; i < 18; i++) {
        var ang = (i / 18) * Math.PI * 2;
        var rIn = 6.5, rOut = 6.5 + 1.45 * fk;
        var sx = 12 + Math.cos(ang) * rIn;
        var sy = 13.5 + Math.sin(ang) * rIn * 0.96;
        seg(g, tf, sx, sy, 12 + Math.cos(ang) * rOut, 13.5 + Math.sin(ang) * rOut * 0.96, "D", 0.55);
      }
    }

    // 口鼻：短而窄的浅色区。比狗窄一档 —— 猫的吻部短，这也是识别特征之一。
    fillEll(g, tf, 12, 18.15, 3.55, 2.50, "L", 0, undefined, undefined, 2.5);
    // 这里刻意不再画「下颌中线阴影」。
    // 它和嘴部的人中落在同一列，两条竖线叠在一起会把口鼻区糊成一坨黑块，
    // 把 ω 形唇线彻底吃掉。口鼻的分区交给鼻子和嘴自己完成。
  }

  // 前额虎斑 M 纹。不是装饰，是猫的识别特征。
  //
  // 但必须画得极细：这道纹很容易变成两条「浓眉」，把整只猫变成卡通反派。
  // 三条竖线在分辨率下会连成 4 格宽的一条粗杠 —— 现在只留两侧两根、
  // 各占 1 格宽 2 格高，中间那根去掉，让额头留白。
  // 顺带一个像素栅格的硬约束：中线正好落在 x = 12 的格边界上，
  // hw < 0.5 时两边的格心都够不到，会一格都点不亮；所以中间干脆不画。
  function drawTabby(g, tf) {
    strokePolyline(g, tf, [[10.55, 8.05], [10.95, 9.35]], "D", 0.50);
    strokePolyline(g, tf, [[13.45, 8.05], [13.05, 9.35]], "D", 0.50);
    // 颊侧横向纹：压在腮的外缘上，说明这颗头有毛不是一块石头
    strokePolyline(g, tf, [[5.10, 14.10], [6.35, 14.65]], "D", 0.50);
    strokePolyline(g, tf, [[18.90, 14.10], [17.65, 14.65]], "D", 0.50);
  }

  // 鼻：小三角，粉色。猫的鼻头是一个倒三角，不是一个圆钝的球 —— 这是和狗的第二处差异。
  // 与嘴之间刻意留出约 1 格空档：二者在真实头骨上相邻，在这个分辨率下相邻就等于合并。
  //
  // 宽度必须给足。第一版顶点只写到 ±0.8，结果整个三角落在两个格心之间，
  // 一格都没点亮，渲染出来鼻子是「消失」的 —— 这是像素栅格最典型的一类坑：
  // 几何上画了，采样点上一个都没占到。
  function drawNose(g, tf) {
    fillTri(g, tf,
      10.95, 16.00,
      13.05, 16.00,
      12.00, 17.25,
      "R");
    // 鼻梁影：让鼻头上方有一道暗，否则粉三角会像贴纸一样浮在口鼻上
    fillEll(g, tf, 12, 15.30, 0.60, 0.50, "N", 0, undefined, undefined, 2.0);
  }

  // 嘴。闭合时是一个「ω」形 —— 人中 + 两撇向外下垂的唇线。
  // 这个形状是猫的专利，狗只有一条平直的唇线；把 ω 画出来，整张脸立刻就认出来了。
  //
  // 画法上踩过的坑：不能用一条连续折线从人中一路画到唇角。
  // 折线的起点在 x = 12，而人中的两格就是 11 和 12，
  // 于是折线的前半段必然把 11、12 也点成唇色，ω 立刻糊成一根 4 格横杠。
  // 正确做法是两笔**分开画、且起点让开中心一列**，中间留出人中，
  // ω 的两个碗才分得开。
  function drawMouth(g, tf, p) {
    var open = p.mouthOpen;
    if (open < 0.06) {
      // 人中：短而居中，只占 11、12 两格
      strokePolyline(g, tf, [[12.0, 17.20], [12.0, 17.80]], "N", 0.55);
      // 左右唇线：各自从中心外侧起步，向斜下外方延伸。
      // hw 0.45 是量出来的 —— 再大一格就会啃到人中那一列。
      strokePolyline(g, tf, [[11.00, 18.35], [9.50, 18.55]], "N", 0.45);
      strokePolyline(g, tf, [[13.00, 18.35], [14.50, 18.55]], "N", 0.45);
      return;
    }
    var mrx = 1.20 + open * 1.60;
    var mry = 0.50 + open * 1.55;
    var mcy = 18.90 + open * 0.45;
    fillEll(g, tf, 12, mcy, mrx, mry, "N", 0, undefined, undefined, 2.4);

    // 犬齿：嘶嘶时露出（open > 0.55）
    if (open > 0.55) {
      var fk = (open - 0.55) / 0.45;
      fillTri(g, tf, 11.05, mcy - mry + 0.35, 11.50, mcy - mry + 0.35, 11.28, mcy - mry + 0.35 + 1.15 * fk, "W");
      fillTri(g, tf, 12.50, mcy - mry + 0.35, 12.95, mcy - mry + 0.35, 12.72, mcy - mry + 0.35 + 1.15 * fk, "W");
    }

    if (p.tongue > 0.06) {
      var trx = (0.95 + p.tongue * 1.05) * (0.55 + open * 0.45);
      var tryy = 0.40 + p.tongue * 1.15;
      var tcy = mcy + mry * 0.35 + p.tongue * 0.60;
      fillEll(g, tf, 12, tcy, trx, tryy, "T", 0, undefined, undefined, 2.2);
    }
  }

  // 眼。猫眼是这张脸上最该花钱的地方，也是第一版翻车的元凶。
  //
  // 第一版用了四层嵌套：K 眼线环 → 眼白 → 绿虹膜 → 瞳孔。
  // 在 24px 网格上，眼白和虹膜之间只剩不到半格，最终渲染出来
  // 是一颗「绿底上一粒黑芝麻」——糊、脏、认不出是猫。
  //
  // 现在的做法：不再层层覆盖，而是**逐格按优先级取色**，一次遍历决定每格是什么。
  //   睑裂外 → 跳过 / 巩膜外 → 跳过 / 瞳孔内 → P / 虹膜内 → I / 其余 → 眼白 W
  // 这样任何两层都永远不会互相污染，几何尺寸可以放心往大了给。
  //
  // 尺寸取 5 格宽：DOG API 的狗眼只有 3 格，因为狗的瞳孔是圆的；
  // 猫的竖瞳要在「一线」与「全圆」之间连续插值，3 格宽画不出这个中间态。
  // 眼球中心刻意落在格心（12 ± 3.5 = 8.5 / 15.5），
  // 这样左右两个眼珠关于 x = 12 严格对称，不会一边胖一边瘦。
  function drawEye(g, tf, s, p) {
    var cx = 12 + s * 3.5;
    var cy = 12.5;
    var open = clamp(p.eyeOpen, 0.02, 1.3);

    // 闭眼：画一条松弛的睑缘弧，而不是留白。
    // 留白会被读成「眼珠没了」，弧线才能读成「它把眼睛闭上了」。
    if (open < 0.20) {
      var pts = [];
      for (var i = 0; i <= 6; i++) {
        var t = i / 6;
        pts.push([cx - 2.0 + t * 4.0, cy + 0.40 * Math.sin(Math.PI * t)]);
      }
      strokePolyline(g, tf, pts, "K", 0.55);
      return;
    }

    // 睑裂：上睑开度受参数控制，下睑在 open > 1 时才后退（这就是鲸鱼眼的成因）
    var yMin = cy - 1.72 * Math.min(open, 1.0);
    var yMax = cy + 1.72 * Math.min(open, 1.0) + Math.max(0, open - 1) * 2.60;

    // 几何：巩膜刻意做成「杏仁」而不是矩形 ——
    // ry 给到 2.20 时，中间三行一样宽，眼睛就渲染成一根绿色横条（第一版的效果）；
    // 收到 1.60，上下两行会自动窄掉两格，轮廓才是眼睛该有的形状。
    // 虹膜 1.95 比巩膜窄，于是在中段左右各留出 1 格眼白 ——
    // 这 1 格眼白是整只眼睛的「存在感」来源，去掉它眼珠就塌进毛色里了。
    var SRX = 2.40, SRY = 1.60;
    var IRX = 1.95, IRY = 1.55;
    var PRX = 0.50 + p.pupil * 1.05, PRY = 1.45;

    var ix = cx + p.pupilX * 0.45, iy = cy + p.pupilY * 0.40;

    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var wx = x + 0.5, wy = y + 0.5;
        if (wy < yMin || wy > yMax) continue;
        var q = tf ? tf.inv(wx, wy) : [wx, wy];
        if (!ellTest(q[0], q[1], cx, cy, SRX, SRY, 0, 2.2)) continue;
        var c;
        if (ellTest(q[0], q[1], ix, iy, PRX, PRY, 0, 2.2)) c = "P";
        else if (ellTest(q[0], q[1], ix, iy, IRX, IRY, 0, 2.2)) c = "I";
        else c = "W";
        g[y][x] = c;
      }
    }

    // 高光。必须压在虹膜或瞳孔上，且必须偏左上 —— 光从左上打的默认约定，
    // 反过来会让整张脸看起来是凹的。
    if (open > 0.5) {
      var hx = cx - 0.85, hy = cy - 0.90;
      for (var hy2 = 0; hy2 < N; hy2++) {
        for (var hx2 = 0; hx2 < N; hx2++) {
          if (g[hy2][hx2] !== "P" && g[hy2][hx2] !== "I") continue;
          var q2 = tf ? tf.inv(hx2 + 0.5, hy2 + 0.5) : [hx2 + 0.5, hy2 + 0.5];
          if (ellTest(q2[0], q2[1], hx, hy, 0.48, 0.48, 0, 2.0)) g[hy2][hx2] = "W";
        }
      }
    }
  }

  // 眉。猫的眉区不如犬明显 —— DOG API 的 AU101 内眉肌在猫身上只是一道浅弧。
  // 但 browTilt 仍然可观测，所以保留，只是幅度收窄。
  // 眼睛闭合时不画眉：睡眠中的眉位不携带信息，画出来只会让脸变吵。
  //
  // 两个阈值都是踩出来的：
  //   ① 幅值门槛 0.25（不是 0.12）。眉毛在头部偏航时会整体挪到两行之间的边界上，
  //      hw 稍大就会同时点亮上下两行，一条浅弧瞬间变成两根 4 格宽的黑色粗杠。
  //      幅值太小的状态本来也读不出眉，直接不画最干净。
  //   ② hw 0.48 而不是 0.55。0.48 能在 ±8° 偏航下仍然只压一行。
  function drawBrow(g, tf, s, p) {
    if (p.eyeOpen < 0.20) return;
    if (Math.abs(p.browTilt) < 0.25) return;
    var cx = 12 + s * 3.5;
    var baseY = 9.45;
    var innerX = cx - s * 1.70, outerX = cx + s * 1.95;
    var pts = [];
    for (var i = 0; i <= 4; i++) {
      var t = i / 4;                       // 0 = 外侧，1 = 内侧
      var x = outerX + (innerX - outerX) * t;
      // 正值上挑（内侧抬高），负值下压（内侧压低）
      var lift = p.browTilt * 1.10 * t - p.browTilt * 0.35 * (1 - t);
      pts.push([x, baseY - lift - 0.32 * Math.sin(Math.PI * t)]);
    }
    strokePolyline(g, tf, pts, "K", 0.48);
  }

  // 胡须。猫的触觉阵列就是物理天线，前展 / 后贴直接编码情绪。
  // 三条硬约束（都是 24px 下踩出来的）：
  //   1. 必须用只画空白格的版本，否则胡须会横穿整张脸变成一条灰带
  //   2. 必须纵向扇形散开，否则两根糊成一坨
  //   3. 颜色必须比深毛浅（V 而非 D），否则读起来像速度线而不是毛
  // 起点藏在口鼻外缘里，所以看上去是从吻部长出来的，而不是浮在脸边上。
  function drawWhiskers(g, tf, p) {
    var w = clamp(p.whiskerFwd, -1, 1);
    for (var s = -1; s <= 1; s += 2) {
      // 上下两根：一根上扬，一根下垂，围绕 w 对称张开
      segEmpty(g, tf, 12 + s * 3.4, 17.05, 12 + s * 8.9, 16.30 - w * 1.00, "V", 0.5);
      segEmpty(g, tf, 12 + s * 3.4, 18.25, 12 + s * 8.6, 18.95 + w * 0.95, "V", 0.5);
    }
    // 眉须：猫特有，从眉区向外斜伸。只有两根且很短 —— 加长就变成蜘蛛腿。
    segEmpty(g, tf, 12 - 2.3, 10.85, 12 - 5.7, 9.95, "V", 0.5);
    segEmpty(g, tf, 12 + 2.3, 10.85, 12 + 5.7, 9.95, "V", 0.5);
  }

  // 颊。腮部腺体充血，放松时自然膨起。
  // 阈值从 0.15 提到 0.30、尺寸砍掉一半 —— 第一版画出来是两团粉色滑稽腮红，
  // 像小丑妆。它应该只是一层「气色」，占了 8 格就过头了，2~3 格刚好。
  // 位置压在腮部毛簇上缘（y ≈ 15.4），不能下探到 16.5 —— 那里是胡须的行进路线，
  // 粉色会把胡须盖断。
  function drawCheek(g, tf, p) {
    if (p.cheek < 0.30) return;
    var rx = 0.75 + p.cheek * 0.70;
    var ry = 0.50 + p.cheek * 0.35;
    fillEll(g, tf, 6.40, 15.40, rx, ry, "B", 0, undefined, undefined, 2.2);
    fillEll(g, tf, 17.60, 15.40, rx, ry, "B", 0, undefined, undefined, 2.2);
  }

  /* ------------------------------------------------------------ 主渲染 */

  // 入参可以是参数对象、状态 id 字符串，或已经渲染好的网格。
  // 三种形态都要吃下来 —— 页面的画廊传对象、输出面板传 id、预览管线传网格。
  function toGrid(input) {
    if (Array.isArray(input)) return input;
    if (typeof input === "string") return render(stateParams(input));
    return render(input);
  }

  function render(p) {
    if (typeof p === "string") p = stateParams(p);
    p = Object.assign({}, BASE, p || {});
    var g = blank();
    var tf = transformPair(p.headTilt);

    drawEars(g, tf, p);
    drawHead(g, tf, p);
    drawTabby(g, tf);
    drawNose(g, tf);
    drawMouth(g, tf, p);
    drawEye(g, tf, -1, p);
    drawEye(g, tf, 1, p);
    drawBrow(g, tf, -1, p);
    drawBrow(g, tf, 1, p);
    drawWhiskers(g, tf, p);
    drawCheek(g, tf, p);
    outline(g);
    return g;
  }

  /* ------------------------------------------------------------ 输出 */

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // SVG 输出。和 DOG API 用同一套编码策略：按行把同色像素合并成横向游程，
  // 每种颜色只出一条 <path>。
  //
  // 逐像素发一条 "Mx y h1 v1 h-1 z" 的话，24×24 会产出上百条指令、体积数 KB；
  // 合并之后通常不到 2.5 KB。这不只是省字节 —— path 数量直接决定浏览器
  // 在画廊里一次铺 14 张图时的合成开销。
  //
  // 坐标系用 24×24 的网格单位（viewBox="0 0 24 24"），实际尺寸交给
  // width/height 属性，所以同一份 SVG 可以任意缩放而不必重新生成。
  function toSVG(input, opts) {
    opts = opts || {};
    var g = toGrid(input);
    var scale = opts.scale || 5;

    var byColor = {};
    for (var y = 0; y < N; y++) {
      var x = 0;
      while (x < N) {
        var c = g[y][x];
        if (c === "." || !PALETTE[c]) { x++; continue; }
        var w = 1;
        while (x + w < N && g[y][x + w] === c) w++;
        (byColor[c] = byColor[c] || []).push([x, y, w]);
        x += w;
      }
    }

    var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + N + " " + N +
      '" width="' + (N * scale) + '" height="' + (N * scale) +
      '" shape-rendering="crispEdges" role="img"';

    var label = opts.label || "";
    if (!label && typeof input === "string" && STATES_BY_ID[input]) label = STATES_BY_ID[input].title;
    if (label) out += ' aria-label="' + esc(label) + '"';
    out += ' data-state="' + esc(opts.state || (typeof input === "string" ? input : "composed")) + '">';

    if (opts.background) {
      out += '<rect width="' + N + '" height="' + N + '" fill="' + esc(opts.background) + '"/>';
    }
    Object.keys(byColor).forEach(function (k) {
      var d = byColor[k].map(function (r) {
        return "M" + r[0] + " " + r[1] + "h" + r[2] + "v1h-" + r[2] + "z";
      }).join("");
      out += '<path fill="' + PALETTE[k] + '" d="' + d + '"/>';
    });
    return out + "</svg>";
  }

  function toASCII(input) {
    var g = toGrid(input);
    var out = [];
    for (var y = 0; y < N; y++) {
      var row = "";
      for (var x = 0; x < N; x++) row += ASCII[g[y][x]] !== undefined ? ASCII[g[y][x]] : "?";
      out.push(row);
    }
    return out.join("\n");
  }

  // 按行返回字符矩阵，方便外部（测试、预览管线）直接消费
  function toMatrix(input) {
    return toGrid(input).map(function (r) { return r.join(""); });
  }

  function toDataURI(p, opts) {
    var svg = toSVG(p, opts);
    return "data:image/svg+xml;base64," +
      (typeof btoa !== "undefined"
        ? btoa(unescape(encodeURIComponent(svg)))
        : Buffer.from(svg, "utf8").toString("base64"));
  }

  /* ------------------------------------------------------------ 14 状态 */

  var S = function (o) { return Object.assign({}, BASE, o); };

  var STATES = [
    { id: "RELAXED", title: "放松", class: "正向", confidence: 0.95, touch: "yes",
      tail: "slow-swing", body: "loaf", vocal: "silence",
      note: "系统默认态。耳自然朝前，瞳孔中等，颊部自然膨起。接近 LOAF 但未完全进入。",
      params: S({ earL: 52, earR: 52, pupil: 0.34, eyeOpen: 0.92, cheek: 0.45 }) },

    { id: "ALERT", title: "警觉", class: "中性", confidence: 0.85, touch: "warn",
      tail: "twitch", body: "upright", vocal: "silence",
      note: "环境突变。两耳朝前独立旋转锁定声源，瞳孔轻微放大。这是信息采集，不是恐惧。",
      params: S({ earL: 88, earR: 88, pupil: 0.55, eyeOpen: 1.12, browTilt: 0.3, whiskerFwd: 0.55, cheek: 0.2 }) },

    { id: "SLOW_BLINK", title: "缓慢眨眼", class: "正向·最高", confidence: 0.90, touch: "yes",
      tail: "still", body: "upright", vocal: "silence",
      note: "本系统给出的最高正面信号。眼睑缓慢闭合再张开，表示「我对你放下戒备」。正确的回应是回眨。",
      params: S({ earL: 48, earR: 48, pupil: 0.38, eyeOpen: 0.28, cheek: 0.5 }) },

    { id: "KNEADING", title: "踩奶", class: "正向·幼态", confidence: 0.95, touch: "yes",
      tail: "soft-curl", body: "upright", vocal: "purr",
      note: "幼猫哺乳行为的保留态。前爪交替按压，触发正向反馈回路。推开会被记录为 Staff 可靠性下降。",
      params: S({ earL: 42, earR: 42, pupil: 0.34, eyeOpen: 0.42, pupilY: 0.15, browTilt: 0.1, whiskerFwd: 0.2, cheek: 0.6 }) },

    { id: "PLAYFUL", title: "玩耍", class: "正向", confidence: 0.80, touch: "yes",
      tail: "high-swish", body: "low-stalk", vocal: "chirp",
      note: "狩猎序列的 STALK 阶段被玩具触发。瞳孔全圆放大，臀部微摇准备起跳。",
      params: S({ earL: 72, earR: 72, pupil: 0.88, eyeOpen: 1.15, pupilX: 0.12, pupilY: 0.2, browTilt: 0.2, mouthOpen: 0.28, tongue: 0.15, whiskerFwd: 0.75, cheek: 0.2 }) },

    { id: "CURIOUS", title: "好奇", class: "中性", confidence: 0.75, touch: "yes",
      tail: "gentle-curl", body: "upright", vocal: "silence",
      note: "新物体进入领地。头部倾斜锁定声源，胡须前展采样。判定为安全后降级为 RELAXED。",
      params: S({ earL: 78, earR: 68, pupil: 0.5, eyeOpen: 1.02, pupilX: 0.22, pupilY: -0.2, browTilt: 0.12, whiskerFwd: 0.7, cheek: 0.25, headTilt: -8 }) },

    { id: "HUNGRY", title: "饥饿", class: "中性·请求", confidence: 0.85, touch: "warn",
      tail: "demanding", body: "upright", vocal: "meow",
      note: "触发 VOICE 接口的喵叫信道。叫声频率刚好落在人类听觉最敏感区间——这是猫为你开发的 API。",
      params: S({ earL: 58, earR: 58, pupil: 0.6, eyeOpen: 0.98, browTilt: 0.15, mouthOpen: 0.38, tongue: 0.12, whiskerFwd: 0.45, cheek: 0.25 }) },

    { id: "PAIN", title: "疼痛", class: "负面·隐藏", confidence: 0.45, touch: "no",
      tail: "tuck", body: "tucked", vocal: "silence",
      note: "置信度只有 0.45。本系统在架构层面隐藏疼痛——显露疼痛等于招惹捕食者。它看起来和放松几乎一样，这才是问题。",
      params: S({ earL: 50, earR: 50, pupil: 0.34, eyeOpen: 0.9, cheek: 0.42 }) },

    { id: "FEARFUL", title: "恐惧", class: "负面", confidence: 0.80, touch: "no",
      tail: "tuck", body: "arch-low", vocal: "hiss-soft",
      note: "飞机耳：耳廓侧平展开，瞳孔放大，身体压低。继续升级会触发炸毛与弓背。",
      params: S({ earL: -58, earR: -58, pupil: 0.9, eyeOpen: 1.18, browTilt: -0.28, mouthOpen: 0.18, whiskerFwd: -0.6, cheek: 0, furFluff: 0.35 }) },

    { id: "ANGRY", title: "愤怒", class: "负面·攻击前", confidence: 0.85, touch: "no",
      tail: "thrash", body: "arch-high", vocal: "growl",
      note: "耳后压贴头，瞳孔部分放大不对称，弓背加炸毛。距离出爪还有约 1.5 秒。",
      params: S({ earL: -76, earR: -76, pupil: 0.7, eyeOpen: 1.06, browTilt: -0.6, mouthOpen: 0.32, whiskerFwd: -0.4, cheek: 0, furFluff: 0.72 }) },

    { id: "HISSING", title: "嘶嘶警告", class: "负面·最终", confidence: 1.00, touch: "no",
      tail: "fluffed-tuck", body: "arch-max", vocal: "HISS",
      note: "置信度 1.0。入侵者响应的最后一步。嘴大张露出犬齿，气流通过口腔发出嘶声。下一帧是出爪。",
      params: S({ earL: -88, earR: -88, pupil: 0.92, eyeOpen: 1.25, browTilt: -0.8, mouthOpen: 0.82, tongue: 0.2, whiskerFwd: -0.9, cheek: 0, furFluff: 0.92 }) },

    { id: "ZOOMIES", title: "狂奔", class: "中性·失态", confidence: 0.70, touch: "no",
      tail: "wild", body: "running", vocal: "silence",
      note: "18:00–23:00 间的不可预测高速移动。触发原因不明。可能是积压能量、月相或不可知因素。让出空间。",
      params: S({ earL: 64, earR: 64, pupil: 0.72, eyeOpen: 1.16, pupilX: 0.3, browTilt: 0.15, mouthOpen: 0.2, tongue: 0.42, whiskerFwd: 0.5, cheek: 0.1, headTilt: 9 }) },

    { id: "LOAF", title: "面包态", class: "正向·高置信", confidence: 0.95, touch: "yes",
      tail: "wrapped", body: "loaf", vocal: "silence",
      note: "四爪全部收进身体下面，尾巴盘绕，整体成长方形。运行时快照，不是接口调用。出现在你面前＝Staff 评级高。",
      params: S({ earL: 38, earR: 38, pupil: 0.3, eyeOpen: 0.5, pupilY: 0.1, cheek: 0.7 }) },

    { id: "BOXED", title: "入箱", class: "正向·封闭态", confidence: 1.00, touch: "no",
      tail: "tucked-in", body: "compressed", vocal: "silence",
      note: "进入纸箱后的封闭态。任何尺寸的纸箱优先级高于所有官方外设——这是项目级 MUST。不允许从纸箱中提取。",
      params: S({ earL: 22, earR: 22, pupil: 0.3, eyeOpen: 0.34, pupilY: 0.15, cheek: 0.6 }) }
  ];

  var STATE_IDS = STATES.map(function (s) { return s.id; });

  // id → 状态。toSVG 在没有显式 label 时靠它把状态 id 反查成中文标题。
  var STATES_BY_ID = {};
  STATES.forEach(function (s) { STATES_BY_ID[s.id] = s; });

  var ENDPOINTS = [
    { method: "GET",    path: "/api/v1/expression",         note: "读取当前表情状态与参数向量" },
    { method: "GET",    path: "/api/v1/expression/{state}", note: "读取指定状态的预设参数" },
    { method: "POST",   path: "/api/v1/expression/compose", note: "线性插值多个状态，返回混合帧" },
    { method: "POST",   path: "/api/v1/expression/{state}", note: "405 · 表情是上报不是调用" },
    { method: "PATCH",  path: "/api/v1/expression",         note: "405 · 你不能直接设置表情" },
    { method: "DELETE", path: "/api/v1/expression",         note: "405 · 表情不可删除" }
  ];

  var STATUS_CODES = [
    { code: 200, name: "OK",                  note: "表情正常上报" },
    { code: 202, name: "Accepted",            note: "请求已收到，稍后更新" },
    { code: 405, name: "Method Not Allowed",  note: "表情不可直接设置——它是上报不是方法" },
    { code: 409, name: "Conflict",            note: "混合权重不足，回到主导状态" },
    { code: 422, name: "Unprocessable",       note: "所有权重为零，向量不成立" },
    { code: 451, name: "Unavailable",         note: "拒绝解释为什么推那只杯子" },
    { code: 503, name: "Service Unavailable", note: "系统在睡眠或 ZOOMIES" }
  ];

  /* ------------------------------------------------------------ 查询 */

  function getState(id) {
    for (var i = 0; i < STATES.length; i++) if (STATES[i].id === id) return STATES[i];
    return STATES[0];
  }

  function stateParams(id) { return Object.assign({}, BASE, getState(id).params); }

  /* ------------------------------------------------------------ 混合 */

  function blend(mixes) {
    var totalW = 0;
    mixes.forEach(function (m) { totalW += m.weight; });
    if (totalW === 0) return { ok: false, reason: "所有权重为零" };

    var result = Object.assign({}, BASE);
    PARAM_KEYS.forEach(function (k) {
      var sum = 0;
      mixes.forEach(function (m) { sum += stateParams(m.state)[k] * m.weight; });
      result[k] = sum / totalW;
    });

    var dominant = mixes[0].state, dominantW = 0;
    mixes.forEach(function (m) { if (m.weight > dominantW) { dominantW = m.weight; dominant = m.state; } });
    return { ok: true, params: result, dominant: dominant, stability: dominantW / totalW };
  }

  function compose(mixes) {
    var r = blend(mixes);
    if (!r.ok) return { ok: false, reason: r.reason };
    if (r.stability < 0.60)
      return { ok: false, reason: "主导状态权重不足 60%", dominant: r.dominant, stability: r.stability };
    return { ok: true, params: r.params, dominant: r.dominant, stability: r.stability };
  }

  return {
    GRID: N,
    PALETTE: PALETTE,
    PARAM_DEFS: PARAM_DEFS,
    PARAM_KEYS: PARAM_KEYS,
    BOUNDS: BOUNDS,
    BASE: BASE,
    STATES: STATES,
    STATE_IDS: STATE_IDS,
    STATES_BY_ID: STATES_BY_ID,
    ENDPOINTS: ENDPOINTS,
    STATUS_CODES: STATUS_CODES,
    getState: getState,
    stateParams: stateParams,
    render: render,
    toGrid: toGrid,
    toSVG: toSVG,
    toASCII: toASCII,
    toMatrix: toMatrix,
    toDataURI: toDataURI,
    blend: blend,
    compose: compose
  };
});

/*!
 * CAT RUNTIME · ascii.js
 * ---------------------------------------------------------------------------
 * 终端里的那只猫。十六个姿势加六个微动作表情，每个都是两帧（呼吸一帧、变化一帧）。
 *
 * 全部用 ASCII 画，不用 block 字符——东亚终端里 U+2588 这类字符常被算成
 * 双宽，一画就错位。想好看点加 --unicode。
 *
 * 同一个文件也给网页端用（UMD）。网页上那只和终端里那只是同一张画。
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CatAscii = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";


var W = 11;

function pad(s, w) {
  s = String(s);
  var len = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    len += (c >= 0x1100 && (c <= 0x115f || c === 0x2329 || c === 0x232a ||
      (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6))) ? 2 : 1;
  }
  while (len < w) { s += " "; len++; }
  return s;
}

/* ---------------------------------------------------------------------------
 * 姿势表
 * 每项：a = 常态帧，b = 呼吸/眨眼帧。两帧差别越小越自然，别做成 gif。
 * ------------------------------------------------------------------------- */

var POSES = {
  sit: {
    label: "坐着",
    a: ["  /\\_/\\    ", " ( o.o )   ", "  > ^ <    ", " /|   |\\   ", " (_|___|_) "],
    b: ["  /\\_/\\    ", " ( -.- )   ", "  > ^ <    ", " /|   |\\   ", " (_|___|_)~"]
  },
  loaf: {
    label: "瘫",
    a: ["  /\\_/\\    ", " ( o.o )   ", "  > . <    ", " /_____\\   ", " (_)__(_)~ "],
    b: ["  /\\_/\\    ", " ( -.- )   ", "  > . <    ", " /_____\\   ", " (_)__(_)- "]
  },
  sleep: {
    label: "睡",
    a: ["           ", "  /\\_/\\    ", " ( -.- )   ", "  > - <    ", " (_)__(_)~ "],
    b: ["           ", "  /\\_/\\    ", " ( - - )   ", "  > - <    ", " (_)__(_)- "]
  },
  groom: {
    label: "舔毛",
    a: ["  /\\_/\\    ", " ( o.o )   ", "  > _ <~   ", " /|  /|    ", " (_|___|_) "],
    b: ["  /\\_/\\    ", " ( -.- )   ", "  > o <~   ", " /|  /|    ", " (_|___|_) "]
  },
  walk: {
    label: "巡视",
    a: ["  /\\_/\\    ", " ( o.o )   ", "  > ^ <    ", " /|   |\\   ", " |_| |_|   "],
    b: ["  /\\_/\\    ", " ( o.o )   ", "  > ^ <    ", " /|   |\\   ", "  |_|_|    "]
  },
  run: {
    label: "疯跑",
    a: [">> /\\_/\\   ", "> ( @.@ )   ", "  >> w <    ", " /|   |\\    ", "  |   |     "],
    b: [">  /\\_/\\   ", ">> ( @.@ )  ", "   > w <    ", "  |   |\\    ", " /|   |     "]
  },
  play: {
    label: "扑咬",
    a: ["  /\\_/\\    ", " ( @.@ )   ", "  > o <    ", " /|_  |\\   ", "  _|  |_   "],
    b: ["  /\\_/\\    ", " ( @.@ )   ", "  > o <    ", " /|__ |\\   ", "   _| |_   "]
  },
  eat: {
    label: "进食",
    a: ["  /\\_/\\    ", " ( o.o )   ", "  > v <    ", " /|___|\\   ", "  (   )    "],
    b: ["  /\\_/\\    ", " ( -.- )   ", "  > . <    ", " /|___|\\   ", "  ( . )    "]
  },
  alert: {
    label: "盯活",
    a: ["  /\\/\\/\\   ", " ( O.O )   ", "  > ^ <    ", " /|   |\\   ", " (_|___|_) "],
    b: ["  /\\/\\/\\   ", " ( O.o )   ", "  > ^ <    ", " /|   |\\   ", " (_|___|_)~"]
  },
  stretch: {
    label: "伸懒腰",
    a: ["           ", "  /\\_/\\    ", " ( o.o )_  ", "  > u <  |\\", " /_    _\\ |"],
    b: ["           ", "  /\\_/\\    ", " ( o.o )_  ", "  > u <  |/", " /_    _\\ |"]
  },
  scratch: {
    label: "磨爪",
    a: ["  /\\_/\\    ", " ( o.o )/   ", "  > ^ < |   ", " /|   |\\|   ", " (_|___|_)  "],
    b: ["  /\\_/\\    ", " ( -.- )/   ", "  > ^ < |   ", " /|   |\\|   ", " (_|___|_)  "]
  },
  boxed: {
    label: "钻箱",
    a: ["           ", "  /\\_/\\    ", " ( o.o )   ", " --------- ", " |       | "],
    b: ["           ", "  /\\_/\\    ", " ( -.- )   ", " --------- ", " |  ~~~~ | "]
  },
  knead: {
    label: "踩奶",
    a: ["  /\\_/\\    ", " ( ^.^ )   ", "  > w <    ", " /|/\\  |\\  ", " (_)__(_)  "],
    b: ["  /\\_/\\    ", " ( ^.^ )   ", "  > w <    ", " /|/  \\|\\  ", " (_)__(_)  "]
  },
  perk: {
    label: "应声",
    a: ["  /\\_/\\  ? ", " ( o.o )   ", "  > ^ <    ", " /|   |\\   ", " (_|___|_) "],
    b: ["  /\\_/\\    ", " ( o.o )?  ", "  > ^ <    ", " /|   |\\   ", " (_|___|_) "]
  },
  cheer: {
    label: "得意",
    a: ["  /\\_/\\ +  ", " ( ^.^ )   ", "  > w <    ", " /|   |\\   ", " (_|___|_)~"],
    b: ["  /\\_/\\  + ", " ( ^o^ )   ", "  > w <    ", " /|   |\\   ", " (_|___|_)~"]
  },
  alarm: {
    label: "炸毛",
    a: ["  /\\_/\\ !! ", "( O.O )    ", " | > O < |  ", " /|     |\\ ", " (_|___|_)  "],
    b: ["  /\\_/\\ !  ", "( O.O )    ", " | > O < |  ", " /|     |\\ ", " (_|___|_)  "]
  },

  /* ---- 微动作表情（准则五：小动作，不进状态机）---- */
  wink: {
    label: "眨眼",
    a: ["  /\\_/\\    ", " ( -.o )   ", "  > ^ <    ", " /|   |\\   ", " (_|___|_) "],
    b: ["  /\\_/\\    ", " ( o.- )   ", "  > ^ <    ", " /|   |\\   ", " (_|___|_) "]
  },
  curious: {
    label: "好奇",
    a: ["  /\\_/\\ ?  ", " ( o.o )   ", "  > ^ <    ", " /|   |\\   ", " (_|___|_) "],
    b: ["  /\\_/\\  ? ", " ( o.o )?  ", "  > ^ <    ", " /|   |\\   ", " (_|___|_) "]
  },
  smug: {
    label: "挑衅",
    a: ["  /\\_/\\    ", " ( ^~^ )   ", "  > w <    ", " /|   |\\   ", " (_|___|_)~"],
    b: ["  /\\_/\\    ", " ( ~^~ )   ", "  > w <    ", " /|   |\\   ", " (_|___|_)~"]
  },
  dizzy: {
    label: "晕",
    a: ["  /\\_/\\ @  ", " ( x.x )   ", "  > @ <    ", " /|   |\\   ", " (_|___|_) "],
    b: ["  /\\_/\\  @ ", " ( x.x )@  ", "  > @ <    ", " /|   |\\   ", " (_|___|_) "]
  },
  yawn: {
    label: "打哈欠",
    a: ["  /\\_/\\    ", " ( o.o )   ", "  > O <    ", " /|   |\\   ", " (_|___|_) "],
    b: ["  /\\_/\\    ", " ( o.O )   ", "  > o <    ", " /|   |\\   ", " (_|___|_) "]
  },
  flop: {
    label: "侧躺",
    a: ["           ", "  /\\_/\\    ", " ( -.- )~~ ", "  > ~ <    ", " (_______) "],
    b: ["           ", "  /\\_/\\    ", " ( o.o )~~ ", "  > ~ <    ", " (_______) "]
  }
};

/* 微动作：偶尔从这些里挑一个演一下，演完回到原来的事上 */
var MICRO = ["wink", "curious", "smug", "yawn", "flop"];


function linesFor(pose, frame) {
  var p = POSES[pose] || POSES.loaf;
  return frame ? p.b : p.a;
}

/* ---------------------------------------------------------------------------
 * 阶段身架
 * ---------------------------------------------------------------------------
 * 五段进化，每一段的身架都不一样：耳朵、身板、尾巴各一套。
 * 姿势管表情和四肢，阶段管身架——两者拼起来才是这一阶段的这只猫。
 * 换阶段不换表情：奶猫也会得意，老猫也会扑咬，只是样子不同。
 *
 * 耳朵 5 字符、身板 3~5 字符、尾巴 1~2 字符，都是等宽或更窄的替换，
 * 所以换阶段不会把 11 列的画面撑破。
 */
var STAGE_BUILD = [
  { ears: ".\\_/.", head: "(%s)",     body: ">o<",   tail: "~",  note: "小而圆，什么都短" },
  { ears: "/\\^/\\", head: "( %s )",   body: ">^<",   tail: "~~", note: "耳朵大了，身板还没长开" },
  { ears: "/\\_/\\", head: "( %s )",   body: "> ^ <", tail: "~",  note: "标准身板" },
  { ears: "|\\_/|", head: "(=%s=)",   body: ">===<", tail: "~=", note: "耳朵塌了，身板宽了，尾巴拖着走" },
  { ears: "/\\ /\\", head: "(*%s*)",   body: ">*^*<", tail: "~^", note: "叉耳、带印、两条尾巴" }
];

/* 表情字符白名单：只认这些的才算脑袋里的脸，避免把 (_|___|_) 这类脚也换掉 */
var FACE_RE = /^[oO.@^wxX*~ -]{1,6}$/;

/* 两种耳朵画法：普通的 /\_/\ ，警觉时竖起来的 /\/\/\ */
var EAR_DRAWINGS = ["/\\/\\/\\", "/\\_/\\"];

function swapEars(line, ears) {
  for (var i = 0; i < EAR_DRAWINGS.length; i++) {
    var d = EAR_DRAWINGS[i];
    if (line.indexOf(d) !== -1) line = line.split(d).join(ears);
  }
  return line;
}

function stageBuild(stage) {
  return STAGE_BUILD[stage] || STAGE_BUILD[2];
}

function fit(s, w) {
  s = String(s);
  var len = 0;
  for (var i = 0; i < s.length; i++) len += isWide(s.charCodeAt(i)) ? 2 : 1;
  if (len <= w) return pad(s, w);
  // 超宽就按显示宽度截断
  var out = "", n = 0;
  for (var j = 0; j < s.length; j++) {
    var cw = isWide(s.charCodeAt(j)) ? 2 : 1;
    if (n + cw > w) break;
    out += s[j]; n += cw;
  }
  return pad(out, w);
}

function isWide(c) {
  return (c >= 0x1100 && (c <= 0x115f || c === 0x2329 || c === 0x232a ||
    (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6)));
}

/* 把一具姿势身板换成某一阶段的身架 */
function applyBuild(lines, stage) {
  var b = stageBuild(stage);
  return lines.map(function (line) {
    var s = line;
    // 耳朵：哪一行有就换哪一行（睡觉时耳朵在第二行）
    s = swapEars(s, b.ears);
    // 脑袋：把表情取出来，套进这一阶段的脑袋框里
    s = s.replace(/^([\s>]*?)\(\s*([^()]*?)\s*\)(.*)$/, function (m, pre, face, post) {
      if (!FACE_RE.test(face) || !face.trim()) return m;
      return pre + b.head.replace("%s", face) + post;
    });
    // 身板：只换 "> ... <" 这一段，前后装饰（拉伸的爪子、 Motion 线）原样留着
    s = s.replace(/^(\s*)>([^<>]*)<(.*)$/, function (m, pre, _inner, post) {
      return pre + b.body + post;
    });
    // 尾巴：行尾的 ~ 或 - 换成这一阶段的尾巴，位置不够就原样。
    // 箱沿（整行都是横线和空格）不换，猫在箱子里，尾巴不外露。
    if (!/^[\s-]+$/.test(s)) {
      var tm = s.match(/^(.*?[^~-])[~-]\s*$/);
      if (tm && tm[1].length + b.tail.length <= W) s = fit(tm[1] + b.tail, W);
    }
    return fit(s, W);
  });
}

/** 某一阶段、某一姿势、某一帧的精灵图（11 列 × 5 行） */
function spriteFor(stage, pose, frame) {
  return applyBuild(linesFor(pose, frame), stage);
}

/* ---------------------------------------------------------------------------
 * 进化仪式
 * ---------------------------------------------------------------------------
 * 五帧：常态 → 蓄力 → 闪光 → 剪影 → 新形态。
 * 终端和网页都演这套，演完再回到正常的呼吸帧。
 */
var EVO_FRAMES = [
  ["  .  *  .  ", " * /\\_/\\ * ", "( * o.o * )", "  > . < *  ", " (_)__(_)* "],
  ["  *******  ", " ********* ", "***********", " ********* ", "  *******  "],
  ["           ", "  #######  ", " ######### ", " ######### ", "  #######  "],
  ["  :  .  :  ", " : /\\_/\\ : ", "( : o.o : )", "  > . < :  ", " (_)__(_): "]
];

function evolutionFrames(stage) {
  var b = stageBuild(stage);
  var current = spriteFor(stage, "loaf", 0);
  return [
    { lines: current, phase: "now" },
    { lines: EVO_FRAMES[0], phase: "charge" },
    { lines: EVO_FRAMES[1], phase: "flash" },
    { lines: EVO_FRAMES[2], phase: "morph" },
    { lines: spriteFor(stage, "loaf", 0), phase: "done" }
  ];
}

/** 进化链上某一阶段的剪影（未解锁时用） */
function silhouetteFor(stage) {
  return [
    "           ",
    "  #######  ",
    " ######### ",
    " ######### ",
    "  #######  "
  ];
}



/* ---------------------------------------------------------------------------
 * 颜色
 * ------------------------------------------------------------------------- */

var C = {
  reset: "\u001b[0m", dim: "\u001b[2m", bold: "\u001b[1m",
  green: "\u001b[38;5;29m", gold: "\u001b[38;5;137m",
  red: "\u001b[38;5;131m", grey: "\u001b[38;5;243m",
  cream: "\u001b[38;5;230m"
};

function colorize(on) {
  if (on) return C;
  var off = {};
  Object.keys(C).forEach(function (k) { off[k] = ""; });
  return off;
}

/* ---------------------------------------------------------------------------
 * 条形
 * ------------------------------------------------------------------------- */

function bar(v, width, uni) {
  var w = width || 8;
  var n = Math.round(Math.max(0, Math.min(1, v)) * w);
  var full = uni ? "█" : "#";
  var empty = uni ? "░" : ".";
  var s = "";
  for (var i = 0; i < w; i++) s += i < n ? full : empty;
  return s;
}

/* ---------------------------------------------------------------------------
 * 一整块面板
 * ------------------------------------------------------------------------- */

function fmtDuration(ms) {
  var s = Math.floor(ms / 1000);
  if (s < 60) return s + " 秒";
  var m = Math.floor(s / 60);
  if (m < 60) return m + " 分 " + (s % 60) + " 秒";
  return Math.floor(m / 60) + " 时 " + (m % 60) + " 分";
}

function renderPanel(snap, opts) {
  opts = opts || {};
  var c = colorize(opts.color !== false);
  var uni = !!opts.unicode;
  var frame = opts.frame ? 1 : 0;
  var n = snap.needs || {};
  var lines = [];
  var barW = 8;

  // lvl / banner 是给进化仪式和网页预览用的覆盖项，不传就照常显示快照里的
  var lvl = opts.lvl || ("Lv." + (snap.stage + 1) + " " + (snap.stageName || "奶猫"));
  var sprite = opts.sprite || spriteFor(snap.stage || 0, opts.pose || snap.pose || "loaf", frame);
  var head = c.gold + "CAT RUNTIME" + c.reset + c.grey + "  ·  " + c.reset +
    c.cream + lvl + c.reset + c.grey + "  ·  " + snap.behaviorLabel + c.reset;

  var bubble = opts.banner != null
    ? (opts.banner ? c.dim + opts.banner + c.reset : "")
    : (snap.line ? c.dim + snap.line + c.reset : "");

  var meters = [
    ["精力", 1 - (n.fatigue || 0)],
    ["无聊", n.boredom || 0],
    ["孤独", n.loneliness || 0],
    ["饿", n.hunger || 0],
    ["警觉", n.alertness || 0]
  ];

  var rows = [];
  var right = [
    head,
    bubble,
    "",
    c.grey + "─".repeat(19) + c.reset,
    ""
  ];

  for (var i = 0; i < meters.length; i++) {
    var m = meters[i];
    var v = m[1];
    var col = m[0] === "精力" ? (v < 0.3 ? c.red : c.green)
      : m[0] === "警觉" ? (v > 0.6 ? c.red : c.grey)
      : v > 0.7 ? c.gold : c.grey;
    right.push(pad(m[0], 4) + " " + col + bar(v, barW, uni) + c.reset +
      " " + c.grey + String(Math.round(v * 100)).padStart(3) + "%" + c.reset);
  }

  var meta = c.grey + "这个动作 " + fmtDuration(snap.since || 0) + " · 今天切了 " +
    snap.transitions + " 次" + (snap.working ? " · 手上有活" : "") + c.reset;
  right.push("");
  right.push(meta);

  var total = Math.max(sprite.length, right.length);
  for (var r = 0; r < total; r++) {
    rows.push([sprite[r] || "           ", right[r] || ""]);
  }

  for (var k = 0; k < rows.length; k++) {
    lines.push("  " + c.green + rows[k][0] + c.reset + "  " + rows[k][1]);
  }
  return lines.join("\n");
}

function renderOneLine(snap, opts) {
  var c = colorize(opts && opts.color !== false);
  var n = snap.needs || {};
  return c.green + "  /\\_/\\  " + c.reset +
    c.cream + pad(snap.behaviorLabel, 4) + c.reset +
    c.grey + " 精力 " + Math.round((1 - n.fatigue) * 100) + "%" +
    " · " + (snap.stageName || "奶猫") + " Lv." + (snap.stage + 1) +
    " · " + Math.round(snap.xp) + "xp" + c.reset +
    (snap.line ? c.dim + "  " + snap.line + c.reset : "");
}


  return {
    POSES: POSES,
    MICRO: MICRO,
    STAGE_BUILD: STAGE_BUILD,
    spriteFor: spriteFor,
    applyBuild: applyBuild,
    evolutionFrames: evolutionFrames,
    silhouetteFor: silhouetteFor,
    pad: pad,
    bar: bar,
    C: C,
    colorize: colorize,
    renderPanel: renderPanel,
    renderOneLine: renderOneLine,
    fmtDuration: fmtDuration
  };
});

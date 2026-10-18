/*!
 * CAT RUNTIME · ascii.js
 * ---------------------------------------------------------------------------
 * 终端里的那只猫。十六个姿势，每个姿势两帧（呼吸一帧、眨眼一帧）。
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
  }
};

function linesFor(pose, frame) {
  var p = POSES[pose] || POSES.loaf;
  return frame ? p.b : p.a;
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
  var sprite = linesFor(snap.pose || "loaf", frame);

  var n = snap.needs || {};
  var lines = [];
  var barW = 8;

  var lvl = "Lv." + (snap.stage + 1) + " " + (snap.stageName || "奶猫");
  var head = c.gold + "CAT RUNTIME" + c.reset + c.grey + "  ·  " + c.reset +
    c.cream + lvl + c.reset + c.grey + "  ·  " + snap.behaviorLabel + c.reset;

  var bubble = snap.line ? c.dim + snap.line + c.reset : "";

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
    pad: pad,
    bar: bar,
    C: C,
    colorize: colorize,
    renderPanel: renderPanel,
    renderOneLine: renderOneLine,
    fmtDuration: fmtDuration
  };
});

#!/usr/bin/env node
/*!
 * CAT RUNTIME · learner.js
 * ---------------------------------------------------------------------------
 * 猫怎么学会你。
 *
 * 它不读你的代码，也不上传任何东西。它只看得到事件发生的时间、
 * 发生在哪个目录、命令叫什么、成没成、花了多久。就这些。
 *
 * 记三样东西：
 *   作息   hours[24] / weekdays[7]
 *   领地   projects[dir]
 *   手艺   commands[name] -> 次数、成败、平均耗时
 *
 * 准则八：旧证据按 0.86 衰减。搬了家、换了技术栈，猫会跟着变。
 */

"use strict";

var state = require("./store.js");

var DECAY = 0.86;
var MAX_COMMANDS = 60;

function today(now) {
  var d = now || new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function emptyProfile(now) {
  var d = now || new Date();
  return {
    v: 1,
    born: d.toISOString(),
    updated: d.toISOString(),
    lastDecay: today(d),
    xp: 0,
    stage: 0,
    tasks: { total: 0, ok: 0, fail: 0, msTotal: 0, streakFail: 0, bestFailStreak: 0 },
    hours: new Array(24).fill(0),
    weekdays: new Array(7).fill(0),
    projects: {},
    commands: {},
    interactions: { pet: 0, feed: 0, watch: 0 },
    milestones: []
  };
}

function normalize(p) {
  var base = emptyProfile();
  p = p || {};
  Object.keys(base).forEach(function (k) {
    if (p[k] === undefined) p[k] = base[k];
  });
  if (!Array.isArray(p.hours) || p.hours.length !== 24) p.hours = base.hours;
  if (!Array.isArray(p.weekdays) || p.weekdays.length !== 7) p.weekdays = base.weekdays;
  p.tasks = Object.assign({}, base.tasks, p.tasks || {});
  p.interactions = Object.assign({}, base.interactions, p.interactions || {});
  p.projects = p.projects || {};
  p.commands = p.commands || {};
  p.milestones = p.milestones || [];
  return p;
}

function load() {
  return normalize(state.loadProfile() || emptyProfile());
}

function save(p) {
  p.updated = new Date().toISOString();
  state.saveProfile(p);
  return p;
}

/* ---------------- 衰减 ---------------- */

function decayDays(p, days) {
  if (days <= 0) return;
  var f = Math.pow(DECAY, Math.min(days, 30));
  for (var i = 0; i < 24; i++) p.hours[i] *= f;
  for (var j = 0; j < 7; j++) p.weekdays[j] *= f;
  Object.keys(p.commands).forEach(function (k) {
    var c = p.commands[k];
    c.n *= f; c.ok *= f; c.fail *= f; c.ms *= f;
    if (c.n < 0.4) delete p.commands[k];
  });
  Object.keys(p.projects).forEach(function (k) {
    var pr = p.projects[k];
    pr.hits *= f; pr.ok *= f; pr.fail *= f;
  });
}

function maybeDecay(p, now) {
  var d = now || new Date();
  var last = new Date(p.lastDecay + "T00:00:00");
  var diff = Math.round((new Date(d.toDateString()) - new Date(last.toDateString())) / 86400000);
  if (diff > 0) {
    decayDays(p, diff);
    p.lastDecay = today(d);
  }
  return p;
}

/* ---------------- 记账 ---------------- */

function bump(o, k, v) { o[k] = (o[k] || 0) + (v == null ? 1 : v); }

/**
 * 把一次事件写进档案。
 * event = { type, dir, name, ms, at }
 */
function record(p, event) {
  var now = event.at ? new Date(event.at) : new Date();
  maybeDecay(p, now);

  var hour = now.getHours();
  var wd = now.getDay();

  if (event.type === "task.start" || event.type === "task.ok" || event.type === "task.fail") {
    p.hours[hour] += 1;
    p.weekdays[wd] += 1;
  }

  var dir = event.dir || "";
  var name = event.name || "";

  if (dir) {
    var pr = p.projects[dir] || (p.projects[dir] = { hits: 0, ok: 0, fail: 0, last: null });
    pr.hits += 1;
    pr.last = now.toISOString();
    if (event.type === "task.ok") pr.ok += 1;
    if (event.type === "task.fail") pr.fail += 1;
  }

  if (name && event.type !== "pet" && event.type !== "feed") {
    var c = p.commands[name] || (p.commands[name] = { n: 0, ok: 0, fail: 0, ms: 0 });
    if (event.type === "task.ok" || event.type === "task.fail") {
      c.n += 1;
      if (event.type === "task.ok") c.ok += 1; else c.fail += 1;
      if (typeof event.ms === "number" && event.ms > 0) c.ms += event.ms;
    }
  }

  if (event.type === "task.ok" || event.type === "task.fail") {
    p.tasks.total += 1;
    if (event.type === "task.ok") {
      p.tasks.ok += 1;
      p.tasks.streakFail = 0;
    } else {
      p.tasks.fail += 1;
      p.tasks.streakFail += 1;
      if (p.tasks.streakFail > p.tasks.bestFailStreak) p.tasks.bestFailStreak = p.tasks.streakFail;
    }
    if (typeof event.ms === "number") p.tasks.msTotal += event.ms;
  }

  if (event.type === "pet") p.interactions.pet += 1;
  if (event.type === "feed") p.interactions.feed += 1;

  // 只留最常用的那些命令，别让档案长成一棵树
  var keys = Object.keys(p.commands);
  if (keys.length > MAX_COMMANDS) {
    keys.sort(function (a, b) { return p.commands[b].n - p.commands[a].n; })
        .slice(MAX_COMMANDS)
        .forEach(function (k) { delete p.commands[k]; });
  }

  p.xp = (p.xp || 0) + (event.xp || 0);
  return p;
}

/* ---------------- 解读 ---------------- */

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

function peakHours(p, span) {
  // 找最活跃的连续 span 小时
  var best = { start: 0, sum: -1 };
  for (var s = 0; s < 24; s++) {
    var sum = 0;
    for (var k = 0; k < span; k++) sum += p.hours[(s + k) % 24] || 0;
    if (sum > best.sum) best = { start: s, sum: sum };
  }
  return best;
}

function fmtHour(h) { return String(h).padStart(2, "0") + ":00"; }

/**
 * 用中文说出它学到了什么。每条带一个置信度，低置信度的话说得轻一点。
 */
function describe(p) {
  p = normalize(p);
  var out = [];
  var totalHours = p.hours.reduce(function (a, b) { return a + b; }, 0);
  var tasks = p.tasks.total;

  // 作息
  if (totalHours >= 6) {
    var ph = peakHours(p, 5);
    var share = pct(ph.sum, totalHours);
    var nightShare = 0;
    p.hours.forEach(function (v, h) {
      if (h >= 22 || h < 5) nightShare += v;
    });
    var night = pct(nightShare, totalHours);
    out.push({
      key: "hours",
      confidence: Math.min(1, totalHours / 40),
      text: "你的活有 " + share + "% 落在 " + fmtHour(ph.start) + "–" + fmtHour((ph.start + 5) % 24) +
        "，我按这个点儿调了作息" + (night >= 40 ? "，主要是夜里。" : "。")
    });
  }

  // 领地
  var dirs = Object.keys(p.projects);
  if (dirs.length) {
    dirs.sort(function (a, b) { return p.projects[b].hits - p.projects[a].hits; });
    var top = dirs[0], t = p.projects[top];
    out.push({
      key: "territory",
      confidence: Math.min(1, t.hits / 25),
      text: "最常待的是 " + top + "（" + Math.round(t.hits) + " 次），那里算主领地" +
        (dirs.length > 1 ? "，另外还有 " + (dirs.length - 1) + " 处会去。" : "。")
    });
  }

  // 手艺
  var cmds = Object.keys(p.commands).filter(function (k) { return p.commands[k].n >= 3; });
  if (cmds.length) {
    cmds.sort(function (a, b) { return p.commands[b].n - p.commands[a].n; });
    var cn = cmds[0], c = p.commands[cn];
    var failRate = pct(c.fail, c.n);
    var avg = c.ok > 0 ? Math.round(c.ms / Math.max(1, c.n) / 1000) : 0;
    out.push({
      key: "craft",
      confidence: Math.min(1, c.n / 20),
      text: "「" + cn + "」跑了 " + Math.round(c.n) + " 次，挂掉 " + failRate + "%" +
        (avg ? "，一次大约 " + avg + " 秒" : "") + "。" +
        (failRate >= 30 ? "你重试之前我一般不吵。" : "")
    });
  }

  // 节奏
  if (tasks >= 5) {
    var avgMs = p.tasks.msTotal / Math.max(1, tasks) / 1000;
    var style = avgMs < 20 ? "碎步型：一段一段地推" : avgMs < 120 ? "中段：一次干完一件事" : "长跑型：一件活儿能耗很久";
    out.push({
      key: "rhythm",
      confidence: Math.min(1, tasks / 20),
      text: "你平均一件活 " + Math.round(avgMs) + " 秒，属于" + style + "，我就按这个节奏打盹。"
    });
  }

  // 脾气
  if (tasks >= 10) {
    var fr = pct(p.tasks.fail, tasks);
    out.push({
      key: "temper",
      confidence: Math.min(1, tasks / 30),
      text: fr >= 45 ? "失败率 " + fr + "%。我不催你——失败的时候我趴旁边，不盯着屏幕。"
        : fr >= 20 ? "失败率 " + fr + "%。偶尔翻车，我记着哪类活儿容易翻。"
        : "失败率 " + fr + "%。手挺稳，我就放心睡。"
    });
  }

  // 关系
  if (p.interactions.pet + p.interactions.feed > 0) {
    out.push({
      key: "bond",
      confidence: 1,
      text: "被摸了 " + p.interactions.pet + " 次，喂了 " + p.interactions.feed + " 次。"
    });
  }

  if (!out.length) {
    out.push({
      key: "empty",
      confidence: 0,
      text: "还不认识你。跑几次 catctl run，或者挂上宿主钩子，我才有的学。"
    });
  }

  return out;
}

module.exports = {
  DECAY: DECAY,
  emptyProfile: emptyProfile,
  normalize: normalize,
  load: load,
  save: save,
  record: record,
  maybeDecay: maybeDecay,
  describe: describe,
  peakHours: peakHours
};

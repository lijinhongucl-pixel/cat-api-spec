#!/usr/bin/env node
/*!
 * CAT RUNTIME · store.js
 * ---------------------------------------------------------------------------
 * 猫住哪儿、记什么、怎么不打架。
 *
 *   ~/.cat-api/runtime/
 *     state.json     —— 当下的猫（needs / 行为 / 情绪 / 上次反应）
 *     profile.json   —— 它对你的了解（作息 / 项目 / 命令 / 进化）
 *     events.jsonl   —— 最近 500 条事件流水，给 catctl log 用
 *
 * 两个进程同时 emit 是很常见的（你一边跑测试一边开着 watch）。
 * 所以每次读改写都在一个目录锁里做，锁超过 5 秒算陈旧，自动接管。
 */

"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");

function home() {
  return process.env.CATCTL_HOME || path.join(os.homedir(), ".cat-api", "runtime");
}

function ensure() {
  var dir = home();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  return dir;
}

function file(name) { return path.join(ensure(), name); }

/* ---------------- 原子写：先写临时文件再 rename ---------------- */

function writeJSON(name, obj) {
  var target = file(name);
  var tmp = target + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, target);
  return target;
}

function readJSON(name, fallback) {
  try {
    var raw = fs.readFileSync(file(name), "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

/* ---------------- 目录锁 ---------------- */

var LOCK_STALE_MS = 5000;

function acquire(timeoutMs) {
  var lock = file(".lock");
  var deadline = Date.now() + (timeoutMs || 2500);
  while (Date.now() < deadline) {
    try {
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, "pid"), String(process.pid));
      return function release() {
        try { fs.rmSync(lock, { recursive: true, force: true }); } catch (e) {}
      };
    } catch (e) {
      // 锁在，看看是不是死的
      try {
        var st = fs.statSync(lock);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          fs.rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch (e2) { continue; }
      // 自旋一小会儿，别把 CPU 烧了
      var until = Date.now() + 18;
      while (Date.now() < until) {}
    }
  }
  return null;
}

function withLock(fn) {
  var release = acquire();
  if (!release) {
    // 拿不到锁也照样干活：宁可少记一笔，也别让 CLI 挂住
    return fn();
  }
  try { return fn(); } finally { release(); }
}

/* ---------------- 文件 ---------------- */

function loadState() { return readJSON("state.json", null); }
function saveState(s) { return writeJSON("state.json", s); }

function loadProfile() { return readJSON("profile.json", null); }
function saveProfile(p) { return writeJSON("profile.json", p); }

function appendEvent(ev, maxLines) {
  var f = file("events.jsonl");
  try {
    fs.appendFileSync(f, JSON.stringify(ev) + "\n", "utf8");
    // 超过上限就截断到后半段
    var limit = maxLines || 500;
    var raw = fs.readFileSync(f, "utf8");
    var lines = raw.split("\n").filter(Boolean);
    if (lines.length > limit * 2) {
      fs.writeFileSync(f, lines.slice(-limit).join("\n") + "\n", "utf8");
    }
  } catch (e) {}
}

function readEvents(limit) {
  try {
    var raw = fs.readFileSync(file("events.jsonl"), "utf8");
    var lines = raw.split("\n").filter(Boolean);
    return lines.slice(-(limit || 40)).map(function (l) {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }
}

function wipe() {
  ["state.json", "profile.json", "events.jsonl"].forEach(function (n) {
    try { fs.unlinkSync(file(n)); } catch (e) {}
  });
}

module.exports = {
  home: home,
  ensure: ensure,
  file: file,
  writeJSON: writeJSON,
  readJSON: readJSON,
  withLock: withLock,
  loadState: loadState,
  saveState: saveState,
  loadProfile: loadProfile,
  saveProfile: saveProfile,
  appendEvent: appendEvent,
  readEvents: readEvents,
  wipe: wipe
};

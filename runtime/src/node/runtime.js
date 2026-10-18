#!/usr/bin/env node
/*!
 * CAT RUNTIME · runtime.js
 * ---------------------------------------------------------------------------
 * 把引擎、档案、磁盘三样东西缝在一起。
 *
 * 这里有一个关键决定：**没有后台常驻进程**。
 * 猫活在 state.json 里。你三天不理它，下次任何一条命令进来，
 * 它先把这三天按 20 秒一步补算完，再回答你。所以：
 *
 *   - 不用装 daemon，不用开机自启，不占内存
 *   - 命令行的猫和网页上的猫是同一只
 *   - 崩溃了也不会丢，最多回到上一次写盘
 */

"use strict";

var path = require("path");
var os = require("os");
var cp = require("child_process");

var CatEngine = require("../core/engine.js");
var store = require("./store.js");
var learner = require("./learner.js");

var CHUNK_MS = 20000;          // 补算时一步最多 20 秒
var MAX_CATCHUP_MS = 36 * 3600 * 1000;

/* ---------------- 会话 ---------------- */

function dirName(dir) {
  try {
    return path.basename(path.resolve(dir || process.cwd()));
  } catch (e) { return "unknown"; }
}

function advance(engine, ms) {
  var left = Math.max(0, Math.min(ms, MAX_CATCHUP_MS));
  var steps = 0;
  while (left > 0) {
    var step = Math.min(CHUNK_MS, left);
    engine.tick(step);
    left -= step;
    steps++;
    if (steps > 12000) break;
  }
  return steps;
}

function open(opts) {
  opts = opts || {};
  var profile = learner.load();
  var raw = store.loadState();
  var now = Date.now();
  var seed = raw && typeof raw.seed === "number" ? raw.seed : (now % 2147483647);
  var engine = CatEngine.create({ profile: profile, seed: seed });

  if (raw && raw.state) engine.restore(raw.state);

  var last = raw && raw.tickAt ? raw.tickAt : now;
  var caught = advance(engine, now - last);

  return {
    engine: engine,
    profile: profile,
    seed: seed,
    caughtUpMs: Math.max(0, now - last),
    steps: caught
  };
}

function save(session) {
  store.saveState({
    v: 1,
    tickAt: Date.now(),
    seed: session.seed,
    state: session.engine._state()
  });
}

/* ---------------- 通知 ---------------- */

function notify(title, body, opts) {
  opts = opts || {};
  var platform = process.platform;
  var ok = false;

  function run(cmd, args) {
    try {
      cp.execFileSync(cmd, args, { stdio: "ignore", timeout: 2500 });
      return true;
    } catch (e) { return false; }
  }

  var safe = function (s) { return String(s || "").replace(/["\\]/g, " "); };

  if (platform === "darwin") {
    var script = 'display notification "' + safe(body) + '" with title "' + safe(title) + '"' +
      (opts.sound ? ' sound name "Glass"' : "");
    ok = run("osascript", ["-e", script]);
  } else if (platform === "linux") {
    ok = run("notify-send", ["-a", "catctl", title, safe(body)]);
  } else if (platform === "win32") {
    ok = run("powershell", ["-NoProfile", "-Command",
      "[console]::beep(880,120); $w=New-Object -ComObject Wscript.Shell; $w.Popup('" + safe(body) + "',4,'" + safe(title) + "')"]);
  }

  if (!ok) {
    // 兜底：响一声。至少能听见。
    try { process.stderr.write("\u0007"); } catch (e) {}
  }
  return ok;
}

/* ---------------- 事件 ---------------- */

/**
 * emit("task.ok", { dir, name, ms, streak })
 */
function emit(session, type, meta) {
  meta = meta || {};
  var before = session.engine.snapshot(false);
  var res = session.engine.emit(type, meta);
  var after = session.engine.snapshot(false);

  var prof = session.profile;
  learner.record(prof, {
    type: type,
    dir: meta.dir || dirName(),
    name: meta.name,
    ms: meta.ms
  });
  prof.xp = after.xp;
  prof.stage = after.stage;
  learner.save(prof);
  save(session);

  store.appendEvent({
    at: new Date().toISOString(),
    type: type,
    dir: meta.dir || dirName(),
    name: meta.name || null,
    ms: meta.ms || null,
    behavior: after.behavior,
    reaction: after.reaction ? after.reaction.id : null,
    xp: after.xp
  });

  if (res.levelUp !== undefined && res.levelUp !== null) {
    var st = CatEngine.STAGES[res.levelUp];
    if (st) {
      notify("猫进化了", "现在是「" + st.name + "」。" + st.note, { sound: true });
      prof.milestones.push({ at: new Date().toISOString(), what: "进化到 " + st.name });
    }
  }

  return { before: before, after: after, result: res };
}

/* ---------------- 配置 ---------------- */

function config() {
  var c = store.readJSON("config.json", null) || {};
  return Object.assign({ notify: true, sound: true, quiet: false }, c);
}

function setConfig(patch) {
  var c = Object.assign(config(), patch);
  store.writeJSON("config.json", c);
  return c;
}

module.exports = {
  open: open,
  save: save,
  emit: emit,
  notify: notify,
  advance: advance,
  dirName: dirName,
  config: config,
  setConfig: setConfig,
  HOME: store.home,
  store: store,
  learner: learner,
  engine: CatEngine
};

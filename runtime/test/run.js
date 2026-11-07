#!/usr/bin/env node
/*!
 * CAT RUNTIME · 落盘回归
 * ---------------------------------------------------------------------------
 * 零依赖，只用 Node 自带模块。跑法：node runtime/test/run.js
 *
 * 覆盖：引擎确定性、存档往返、性格维度、220 个 sprite 的 11 列不变量、
 * 进化仪式帧、活动类型推断、周变化、status --json 契约、
 * export/import 换机续养、导入安全、WorkBuddy hook 冒烟。
 * --------------------------------------------------------------------------- */
"use strict";

var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");
var cp = require("child_process");

var ROOT = path.resolve(__dirname, "..", "..");
var RUNTIME = path.join(ROOT, "runtime");
var CLI = path.join(RUNTIME, "src", "node", "cli.js");
var HOOK = path.join(RUNTIME, "hooks", "workbuddy-hook.js");
var E = require(path.join(RUNTIME, "src", "core", "engine.js"));
var A = require(path.join(RUNTIME, "src", "node", "ascii.js"));
var L = require(path.join(RUNTIME, "src", "node", "learner.js"));

var passed = 0;
var failed = 0;

function ok(name, fn) {
  try { fn(); passed++; console.log("OK   " + name); }
  catch (e) { failed++; console.log("FAIL " + name + "  ·  " + e.message); }
}

// 与 ascii.js 的 isWide 完全一致，否则宽度断言会假失败
function isWide(c) {
  return (c >= 0x1100 && (c <= 0x115f || c === 0x2329 || c === 0x232a ||
    (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6)));
}
function width(str) {
  var w = 0;
  for (var ch of str) w += isWide(ch.codePointAt(0)) ? 2 : 1;
  return w;
}
function assertEleven(lines, label) {
  assert(Array.isArray(lines), label + " 不是数组");
  lines.forEach(function (line, i) {
    assert.strictEqual(width(line), 11,
      label + " 第 " + (i + 1) + " 行宽 " + width(line) + " 列：" + JSON.stringify(line));
  });
}

// ---------------------------------------------------------------------------
// 引擎
// ---------------------------------------------------------------------------
ok("同一 seed 与事件序列得到同一只猫", function () {
  function run(seed) {
    var e = E.create({ seed: seed });
    ["task.ok", "task.fail", "pet", "task.ok"].forEach(function (t) { e.emit(t, {}); });
    e.tick(1000); e.tick(1000);
    var s = e.snapshot();
    return JSON.stringify({ b: s.behavior, x: s.xp, st: s.stage, n: s.needs, m: s.mood });
  }
  assert.strictEqual(run(42), run(42));
});

ok("存档能原样恢复", function () {
  var e = E.create({ seed: 7 });
  e.emit("task.ok", {});
  e.tick(3000);
  var before = e.snapshot();
  var dump = JSON.parse(JSON.stringify(e._state()));
  var revived = E.create({ seed: 1 });
  revived.restore(dump);
  var after = revived.snapshot();
  assert.strictEqual(after.behavior, before.behavior);
  assert.strictEqual(after.xp, before.xp);
  assert.strictEqual(after.stage, before.stage);
  assert.deepStrictEqual(after.needs, before.needs);
});

ok("五个性格维度齐全且落在 0 到 1", function () {
  var t = E.deriveTraits(L.emptyProfile(), 9);
  ["nocturnal", "sprinter", "debugger", "playful", "tsundere"].forEach(function (k) {
    assert.strictEqual(typeof t[k], "number", "缺 " + k);
    assert(t[k] >= 0 && t[k] <= 1, k + " 越界：" + t[k]);
  });
});

ok("无数据时 seed 给猫不同的脾气底子", function () {
  var a = E.deriveTraits(L.emptyProfile(), 1);
  var b = E.deriveTraits(L.emptyProfile(), 2);
  assert.notStrictEqual(JSON.stringify(a), JSON.stringify(b));
});

ok("五个进化阶段与十二个行为", function () {
  assert.strictEqual(E.STAGES.length, 5);
  assert(E.BEHAVIORS.length >= 12);
});

// ---------------------------------------------------------------------------
// ASCII 渲染
// ---------------------------------------------------------------------------
ok("220 个 sprite 每行正好 11 显示列", function () {
  var poses = Object.keys(A.POSES);
  assert.strictEqual(poses.length, 22, "姿势数变了：" + poses.length);
  var n = 0;
  poses.forEach(function (pose) {
    [0, 1].forEach(function (frame) {
      for (var stage = 0; stage < A.STAGE_BUILD.length; stage++) {
        assertEleven(A.spriteFor(stage, pose, frame),
          pose + "/stage" + stage + "/frame" + frame);
        n++;
      }
    });
  });
  assert.strictEqual(n, 220);
});

ok("进化仪式五帧与剪影都不破 11 列", function () {
  var frames = A.evolutionFrames(3);
  assert.strictEqual(frames.length, 5);
  frames.forEach(function (f, i) { assertEleven(f.lines, "仪式帧 " + i); });
  for (var st = 0; st < A.STAGE_BUILD.length; st++) {
    assertEleven(A.silhouetteFor(st), "剪影 stage" + st);
  }
});

ok("同姿势跨阶段不会撞脸", function () {
  var seen = {};
  for (var st = 0; st < A.STAGE_BUILD.length; st++) {
    var sig = A.spriteFor(st, "loaf", 0).join("\n");
    assert(!seen[sig], "stage" + st + " 与之前的形态一样");
    seen[sig] = true;
  }
});

// ---------------------------------------------------------------------------
// 学习层
// ---------------------------------------------------------------------------
ok("活动类型推断的优先级是显式大于纠正表大于正则", function () {
  assert.strictEqual(L.inferKind("npm test", null, {}), "test");
  assert.strictEqual(L.inferKind("npm test", "ship", {}), "ship");
  assert.strictEqual(L.inferKind("npm test", null, { "npm test": "build" }), "build");
  assert.strictEqual(L.inferKind("zzzz", null, {}), "other");
  assert.strictEqual(L.inferKind("", null, {}), null);
});

ok("周变化能比出这周与上周", function () {
  var p = L.emptyProfile();
  function key(i) { var d = new Date(); d.setDate(d.getDate() - i); return L.dayKey(d); }
  p.daily[key(0)] = { n: 5, ok: 4, fail: 1, kinds: { test: { n: 3, ok: 2, fail: 1 } } };
  p.daily[key(10)] = { n: 2, ok: 2, fail: 0, kinds: { test: { n: 1, ok: 1, fail: 0 } } };
  var w = L.weekWindows(p);
  assert.strictEqual(w.cur.n, 5);
  assert.strictEqual(w.prev.n, 2);
  var desc = L.describe(p);
  assert(Array.isArray(desc));
  assert(desc.some(function (d) { return d.key === "weekly"; }), "缺 weekly 条目");
});

// ---------------------------------------------------------------------------
// CLI：契约、换机续养、导入安全、hook
// ---------------------------------------------------------------------------
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "catctl-test-"));
process.on("exit", function () {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
});

function cli(args, home, expectOk) {
  var r = cp.spawnSync(process.execPath, [CLI].concat(args), {
    env: Object.assign({}, process.env, { CATCTL_HOME: home }),
    encoding: "utf8", timeout: 15000
  });
  if (expectOk !== false) {
    assert.strictEqual(r.status, 0,
      "catctl " + args.join(" ") + " 退出 " + r.status + "：" + r.stderr);
  }
  return r;
}

var homeA = path.join(tmp, "a");
var homeB = path.join(tmp, "b");
var portrait = path.join(tmp, "cat.json");

ok("status --json 遵守三个顶层键的契约", function () {
  cli(["emit", "task.ok", "--name", "npm test", "--kind", "test"], homeA);
  cli(["emit", "task.ok", "--name", "npm run build", "--kind", "build"], homeA);
  cli(["emit", "task.ok", "--name", "git push", "--kind", "ship"], homeA);
  var j = JSON.parse(cli(["status", "--json"], homeA).stdout);
  assert.deepStrictEqual(Object.keys(j).sort(), ["home", "profile", "snapshot"]);
  assert.strictEqual(typeof j.snapshot.xp, "number");
  assert.strictEqual(typeof j.snapshot.stage, "number");
  assert.strictEqual(typeof j.snapshot.behavior, "string");
  assert.strictEqual(Object.keys(j.snapshot.needs).length, 5);
  assert.strictEqual(j.profile.hours.length, 24);
  assert.strictEqual(j.home, homeA);
});

ok("export 产出自描述画像", function () {
  cli(["export", portrait], homeA);
  var data = JSON.parse(fs.readFileSync(portrait, "utf8"));
  assert.strictEqual(data.format, "cat-runtime-portrait");
  assert.strictEqual(data.version, 1);
  assert(data.state && data.state.state);
  assert(data.profile && data.profile.tasks);
  assert(Array.isArray(data.events) && data.events.length >= 3);
});

ok("import 换机续养后经验与阶段一致", function () {
  var a = JSON.parse(cli(["status", "--json"], homeA).stdout);
  cli(["import", portrait, "--yes"], homeB);
  var b = JSON.parse(cli(["status", "--json"], homeB).stdout);
  assert.strictEqual(b.snapshot.xp, a.snapshot.xp);
  assert.strictEqual(b.snapshot.stage, a.snapshot.stage);
  assert.strictEqual(b.profile.tasks.total, a.profile.tasks.total);
});

ok("没有 --yes 的导入不动任何文件", function () {
  var homeC = path.join(tmp, "c");
  var r = cli(["import", portrait], homeC, false);
  assert.notStrictEqual(r.status, 0);
  assert(!fs.existsSync(path.join(homeC, "state.json")));
});

ok("坏画像被拒绝且留下备份", function () {
  var bad = path.join(tmp, "bad.json");
  fs.writeFileSync(bad, JSON.stringify({
    format: "cat-runtime-portrait", version: 1, state: {}, profile: {}
  }));
  var homeD = path.join(tmp, "d");
  var r = cli(["import", bad, "--yes"], homeD, false);
  assert.notStrictEqual(r.status, 0);
  var backups = fs.readdirSync(homeB).filter(function (n) { return n.indexOf("backup-") === 0; });
  assert(backups.length >= 1, "成功导入没留下备份目录");
});

ok("WorkBuddy hook 永远 exit 0 且不写 stdout", function () {
  var hookHome = path.join(tmp, "hook");
  function hook(payload) {
    return cp.spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify(payload),
      env: Object.assign({}, process.env, { CATCTL_HOME: hookHome }),
      encoding: "utf8", timeout: 12000
    });
  }
  var r1 = hook({ hook_event_name: "UserPromptSubmit", user_prompt: "跑一下单元测试", session_id: "t1" });
  assert.strictEqual(r1.status, 0);
  assert.strictEqual(r1.stdout, "");
  var r2 = hook({ hook_event_name: "Stop", session_id: "t1" });
  assert.strictEqual(r2.status, 0);
  assert.strictEqual(r2.stdout, "");
  var evFile = path.join(hookHome, "events.jsonl");
  assert(fs.existsSync(evFile), "hook 没有写事件");
  var lines = fs.readFileSync(evFile, "utf8").trim().split("\n").filter(Boolean);
  assert(lines.length >= 2, "事件少于 2 条：" + lines.length);
});

// ---------------------------------------------------------------------------
console.log("\n---- " + passed + " 通过 / " + failed + " 失败 ----");
if (failed) process.exit(1);

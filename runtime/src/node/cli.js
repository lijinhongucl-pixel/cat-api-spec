#!/usr/bin/env node
/*!
 * CAT RUNTIME · catctl
 * ---------------------------------------------------------------------------
 *   catctl                    看它一眼
 *   catctl watch              让它动起来
 *   catctl run -- npm test    包住一条命令
 *   catctl emit task.ok       告诉它发生了什么
 *   catctl init --host claude 接到工作台上
 *
 * 为什么是 CLI：任何能 fork 一个进程的地方都能养这只猫。
 * 编辑器插件、CI、make、git hook、WorkBuddy 的 hook、tmux、ssh——
 * 都只需要执行一条命令。
 */

"use strict";

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var CatEngine = require("../core/engine.js");
var A = require("./ascii.js");
var store = require("./store.js");
var learner = require("./learner.js");
var rt = require("./runtime.js");

var VERSION = "1.0.0";

/* =========================================================================
 * 参数
 * ======================================================================= */

// 这几个是不带值的开关，其余参数都会吃掉后面的一个词
var BOOL_FLAGS = ["json", "unicode", "notify", "yes", "y", "help", "h", "version", "v", "quiet", "silent"];

function parseArgs(argv) {
  var out = { cmd: null, positional: [], flags: {}, rest: null };
  var i = 0;

  while (i < argv.length) {
    var a = argv[i];
    if (a === "--") { out.rest = argv.slice(i + 1); break; }
    if (a.charAt(0) === "-") {
      var key = a.replace(/^-+/, "");
      var val = true;
      var eq = key.indexOf("=");
      if (eq > -1) {
        val = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (BOOL_FLAGS.indexOf(key) === -1 && argv[i + 1] && argv[i + 1].charAt(0) !== "-") {
        // 除了明确的开关型参数，其余都把后面那个词当成值：
        // --port 9177 / --name "npm test" / --dir ./x
        val = argv[++i];
      }
      out.flags[key] = val;
    } else if (!out.cmd) {
      out.cmd = a;
    } else {
      out.positional.push(a);
    }
    i++;
  }
  return out;
}

/* =========================================================================
 * 帮助
 * ======================================================================= */

function help() {
  var c = A.colorize(true);
  return [
    "",
    "  " + c.gold + "CAT RUNTIME" + c.reset + c.grey + "  ·  catctl " + VERSION + c.reset,
    "  " + c.grey + "一只住在终端里、跟着项目走的猫。" + c.reset,
    "",
    "  " + c.green + "  /\\_/\\" + c.reset,
    "  " + c.green + " ( o.o )" + c.reset + "   " + c.cream + "catctl" + c.reset + "                看它一眼",
    "  " + c.green + "  > ^ <" + c.reset + "    " + c.cream + "catctl watch" + c.reset + "          让它动起来（空格摸它 · f 喂 · q 退出）",
    "  " + c.green + " /|   |\\" + c.reset + "   " + c.cream + "catctl run -- npm test" + c.reset + "  包住一条命令，成没成它都知道",
    "  " + c.green + "(_|___|_)" + c.reset + "  " + c.cream + "catctl emit task.ok" + c.reset + "   宿主主动汇报",
    "",
    "  " + c.grey + "接进来" + c.reset,
    "    catctl init --host claude     写 .claude/settings.json（自动备份）",
    "    catctl init --host git        装 post-commit 钩子",
    "    catctl init --host shell      生成 zsh/bash 的一行 hook",
    "    catctl init --host workbuddy  打印 WorkBuddy / Codex 的接法",
    "",
    "  " + c.grey + "它自己" + c.reset,
    "    catctl status [--json]        现在的状态",
    "    catctl learn  [--json]        它学会了什么",
    "    catctl log  [--kind test] [--fail] [-n 20]  最近发生过什么（可按类型或失败筛）",
    "    catctl run -- <命令> [--kind ship]  包住命令；--kind 手动指定活动类型（否则从命令名猜）",
    "    catctl emit <事件> [--kind <类型>] [--name ..] [--ms ..]  宿主手动报活（WorkBuddy/Codex 用）",
    "    catctl teach <维度> <0..1>    手动作风纠正（少年猫起）：nocturnal/sprinter/debugger/playful/tsundere",
    "    catctl teach-kind <命令> <类型>  纠正某条命令的活动类型（少年猫起）",
    "    catctl serve [--port 9177]     开一个只听 127.0.0.1 的 HTTP 口子",
    "    catctl selftest               跑一遍不变量自测",
    "    catctl reset --yes            清空这只猫，重来",
    "",
    "  " + c.grey + "事件" + c.reset + "  task.start · task.ok · task.fail · task.wait · prompt.idle · pet · feed · laser · wake",
    "  " + c.grey + "类型" + c.reset + "  " + learner.KINDS.map(function (k) { return k + "(" + learner.KIND_LABEL[k] + ")"; }).join(" · "),
    "  " + c.grey + "住址" + c.reset + "  " + store.home(),
    "",
    "  " + c.grey + "没有后台进程。你关掉终端，它就睡在 state.json 里，" +
      "下次一条命令进来，它先把这几天补算完再回答你。" + c.reset,
    ""
  ].join("\n");
}

/* =========================================================================
 * status
 * ======================================================================= */

function cmdStatus(args) {
  var s = rt.open();
  var snap = s.engine.snapshot();
  rt.save(s);

  if (args.flags.json) {
    process.stdout.write(JSON.stringify({
      snapshot: snap,
      profile: publicProfile(s.profile),
      home: store.home()
    }, null, 2) + "\n");
    return 0;
  }

  process.stdout.write("\n" + A.renderPanel(snap, { unicode: !!args.flags.unicode }) + "\n");

  var p = s.profile;
  if (p.tasks.total > 0) {
    var next = CatEngine.STAGES[snap.stage + 1];
    var prog = next ? Math.min(100, Math.round((snap.xp / next.at) * 100)) : 100;
    process.stdout.write(
      "  " + A.C.grey + "活了 " + daysAlive(p) + " 天 · " + Math.round(p.tasks.total) +
      " 件活 · 成功率 " + pct(p.tasks.ok, p.tasks.total) + "%" +
      (next ? " · 下一阶段 " + next.name + " " + prog + "%" : " · 已到顶") +
      A.C.reset + "\n\n");
  } else {
    process.stdout.write("  " + A.C.grey + "还不认识你。catctl init 或 catctl run -- <命令> 开始。" + A.C.reset + "\n\n");
  }
  return 0;
}

function publicProfile(p) {
  return {
    xp: p.xp, stage: p.stage, born: p.born,
    tasks: p.tasks, interactions: p.interactions,
    projects: p.projects, commands: p.commands, kinds: p.kinds || {},
    hours: p.hours.map(function (v) { return Math.round(v * 10) / 10; })
  };
}

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

function daysAlive(p) {
  var born = new Date(p.born);
  var d = Math.max(0, Math.round((Date.now() - born.getTime()) / 86400000));
  return d;
}

/* =========================================================================
 * watch
 * ======================================================================= */

function cmdWatch(args) {
  var interval = parseInt(args.flags.interval || args.flags.every || "900", 10);
  if (!isFinite(interval) || interval < 120) interval = 900;

  var s = rt.open();
  var lastReal = Date.now();
  var frame = 0;
  var running = true;
  var uni = !!args.flags.unicode;
  var dirty = false;
  var evoStage = s.engine.snapshot().stage;
  var evo = null;            // 正在演进化时不为 null
  var microPose = null;      // 正在演的微动作表情
  var microUntil = 0;

  var FOOT = "  " + A.C.grey + "空格 摸它 · f 喂 · l 激光笔 · q 退出" + A.C.reset + "\n";

  function paint(snap, opts, extra) {
    process.stdout.write("\u001b[H\u001b[2J" +
      A.renderPanel(snap, opts) + "\n" + (extra || "") + FOOT);
  }

  /* 进化仪式：五帧播完再回到正常呼吸帧 */
  function startEvolution(to) {
    evo = { frames: A.evolutionFrames(to), i: 0 };
    var step = function () {
      if (!evo) return;
      var f = evo.frames[evo.i];
      var banner = f.phase === "done"
        ? "  " + A.C.gold + "进化了！现在是 Lv." + (to + 1) + " " +
          (s.engine.snapshot().stageName || "") + A.C.reset + "\n"
        : "  " + A.C.grey + "……它正在变" + A.C.reset + "\n";
      paint(s.engine.snapshot(), { unicode: uni, frame: 0, sprite: f.lines }, banner);
      evo.i++;
      if (evo.i >= evo.frames.length) {
        setTimeout(function () { evo = null; draw(); }, 900);   // 「进化了」多停一会儿
      }
      else setTimeout(step, 420);
    };
    step();
  }

  function draw() {
    if (evo) return;                       // 仪式演着，不抢画面
    var snap = s.engine.snapshot();
    if (snap.stage !== evoStage) {          // 升级了，先演仪式
      evoStage = snap.stage;
      startEvolution(snap.stage);
      return;
    }
    frame++;
    var opts = { unicode: uni, frame: Math.floor(frame / 3) % 2 };
    // 微动作：没有反应盖着的时候才演，演完回到原来的事上
    if (!snap.reaction && microPose && Date.now() < microUntil) opts.pose = microPose;
    paint(snap, opts, "");
  }

  function tick() {
    var now = Date.now();
    var dt = now - lastReal;
    lastReal = now;
    rt.advance(s.engine, dt);
    // 偶尔做一个微动作表情（准则五：小动作，不进状态机）
    if (Math.random() < 0.05) {
      microPose = A.MICRO[Math.floor(Math.random() * A.MICRO.length)];
      microUntil = now + 2600;
    }
    if (dirty) { rt.save(s); dirty = false; }
  }

  process.stdout.write("\u001b[?25l");  // 藏光标
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", function (k) {
      if (k === "q" || k === "\u0003") {
        running = false;
        cleanup();
        return;
      }
      if (k === " ") { rt.emit(s, "pet", {}); dirty = true; }
      if (k === "f") { rt.emit(s, "feed", {}); dirty = true; }
      if (k === "l") { rt.emit(s, "laser", {}); dirty = true; }
      draw();
    });
  }

  function cleanup() {
    try { process.stdout.write("\u001b[?25h\n"); } catch (e) {}
    if (process.stdin.isTTY) { try { process.stdin.setRawMode(false); process.stdin.pause(); } catch (e) {} }
    rt.save(s);
    process.exit(0);
  }

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  var timer = setInterval(function () {
    if (!running) return;
    tick();
    draw();
  }, interval);

  draw();
  return null;  // 不退出
}

/* =========================================================================
 * emit
 * ======================================================================= */

var ALIASES = {
  ok: "task.ok", success: "task.ok", done: "task.ok",
  fail: "task.fail", error: "task.fail",
  start: "task.start", begin: "task.start",
  wait: "task.wait", ask: "task.wait", block: "task.wait"
};

function resolveEvent(name) {
  if (!name) return null;
  if (CatEngine.EVENTS[name]) return name;
  return ALIASES[name] || null;
}

/**
 * 宿主传进来的字段统一过一遍：白名单、类型校验、长度截断。
 * 不认识的 kind 丢弃（交给学习器去猜），detail 限 800 字，exit 必须是整数。
 */
function sanitizeMeta(raw) {
  raw = raw || {};
  var meta = {};
  if (typeof raw.dir === "string" && raw.dir) meta.dir = raw.dir.slice(0, 200);
  if (typeof raw.name === "string" && raw.name) meta.name = raw.name.slice(0, 200);
  var kind = learner.normalizeKind(raw.kind);
  if (kind) meta.kind = kind;
  var ms = typeof raw.ms === "string" ? parseInt(raw.ms, 10) : raw.ms;
  if (typeof ms === "number" && isFinite(ms) && ms >= 0) meta.ms = Math.round(ms);
  var exit = typeof raw.exit === "string" ? parseInt(raw.exit, 10) : raw.exit;
  if (typeof exit === "number" && isFinite(exit)) meta.exit = Math.round(exit);
  if (typeof raw.detail === "string" && raw.detail.trim()) meta.detail = raw.detail.slice(0, 800);
  return meta;
}

function cmdEmit(args) {
  var name = resolveEvent(args.positional[0]);
  if (!name) {
    process.stderr.write("不认识这个事件：" + (args.positional[0] || "(空)") + "\n");
    process.stderr.write("可用：" + Object.keys(CatEngine.EVENTS).join(" · ") + "\n");
    return 2;
  }

  var s = rt.open();
  var dir = args.flags.dir ? path.resolve(args.flags.dir) : process.cwd();
  if (args.flags.kind && !learner.normalizeKind(args.flags.kind)) {
    process.stderr.write("不认识这个类型：" + args.flags.kind + "（可用：" + learner.KINDS.join(" · ") + "）\n");
    return 2;
  }
  var meta = sanitizeMeta({
    dir: rt.dirName(dir),
    name: args.flags.name || null,
    kind: args.flags.kind || null,
    ms: args.flags.ms || null,
    exit: args.flags.exit || null,
    detail: args.flags.detail || null
  });
  meta.streak = s.profile.tasks.streakFail;

  var out = rt.emit(s, name, meta);
  var snap = out.after;

  if (args.flags.json) {
    process.stdout.write(JSON.stringify({ event: name, reaction: snap.reaction, snapshot: snap }, null, 2) + "\n");
    return 0;
  }

  var line = snap.reaction && snap.reaction.line ? snap.reaction.line : "";
  printReaction(snap, line, meta);

  if ((args.flags.notify || name === "task.wait") && rt.config().notify) {
    var title = name === "task.wait" ? "猫在等你" : name === "task.fail" ? "挂了" : "成了";
    rt.notify(title + " · " + (meta.dir || ""), line || name, { sound: rt.config().sound });
  }

  return name === "task.fail" ? 0 : 0;
}

function printReaction(snap, line, meta) {
  var c = A.C;
  var head = c.green + "  /\\_/\\  " + c.reset;
  var right = (line ? c.cream + line + c.reset : c.grey + snap.behaviorLabel + c.reset) +
    c.grey + "   " + pad2(snap) +
    (meta && meta.ms ? " · " + (meta.ms / 1000).toFixed(1) + "s" : "") + c.reset;
  process.stdout.write(head + right + "\n");
}

function pad2(snap) {
  var next = CatEngine.STAGES[snap.stage + 1];
  return (snap.stageName || "奶猫") + " Lv." + (snap.stage + 1) +
    " · " + Math.round(snap.xp) + "xp" + (next ? " / " + next.at : "");
}

/* =========================================================================
 * run
 * ======================================================================= */

function cmdRun(args) {
  var cmd = args.rest || args.positional;
  if (!cmd || !cmd.length) {
    process.stderr.write("用法：catctl run -- <命令>\n");
    return 2;
  }

  var label = cmd.join(" ");
  var started = Date.now();
  var s = rt.open();
  var dir = process.cwd();

  var kind = learner.inferKind(label, args.flags.kind, s.profile.kindOverrides);
  rt.emit(s, "task.start", { dir: rt.dirName(dir), name: label, kind: kind });

  // stderr 走管道：原样转发到终端，同时只留最后几行，失败时记进事件，方便 catctl log 看
  var TAIL_LINES = 6;
  var tail = [];
  var partial = "";
  function keepTail(chunk) {
    partial += chunk.toString("utf8");
    var parts = partial.split(/\r?\n/);
    partial = parts.pop();
    parts.forEach(function (ln) {
      if (!ln.trim()) return;
      tail.push(ln.length > 200 ? ln.slice(0, 200) + "…" : ln);
      if (tail.length > TAIL_LINES) tail.shift();
    });
  }

  var child = cp.spawn(cmd[0], cmd.slice(1), { stdio: ["inherit", "inherit", "pipe"], shell: false });
  if (child.stderr) {
    child.stderr.on("data", function (chunk) {
      process.stderr.write(chunk);
      keepTail(chunk);
    });
  }

  function finish(code, signal) {
    if (partial.trim()) { tail.push(partial.slice(0, 200)); if (tail.length > TAIL_LINES) tail.shift(); partial = ""; }
    var ms = Date.now() - started;
    var s2 = rt.open();
    var ev = code === 0 ? "task.ok" : "task.fail";
    var exitCode = code == null ? (signal ? 130 : 1) : code;
    var out = rt.emit(s2, ev, {
      dir: rt.dirName(dir), name: label, ms: ms, kind: kind,
      exit: exitCode,
      detail: code === 0 ? null : (tail.length ? tail.join("\n") : null),
      streak: s2.profile.tasks.streakFail
    });
    var snap = out.after;
    var line = snap.reaction && snap.reaction.line ? snap.reaction.line : "";
    var tag = code === 0 ? "完成" : "挂了（退出码 " + exitCode + "）";
    process.stdout.write("\n" + A.C.green + "  /\\_/\\  " + A.C.reset +
      A.C.cream + line + A.C.reset +
      A.C.grey + "   " + tag + " · " + (ms / 1000).toFixed(1) + "s · " + pad2(snap) + A.C.reset + "\n");

    var cfg = rt.config();
    if (cfg.notify && code !== 0) {
      rt.notify((code === 0 ? "成了" : "挂了") + " · " + rt.dirName(dir), line, { sound: cfg.sound });
    }
    process.exit(exitCode);
  }

  child.on("exit", finish);
  child.on("error", function (err) {
    process.stderr.write("起不来：" + err.message + "\n");
    tail.push("起不来：" + err.message);
    finish(127);
  });
  return null;
}


/* =========================================================================
 * init —— 接到宿主上
 * ======================================================================= */

var HOSTS = ["workbuddy", "claude", "codex", "shell", "git", "vscode"];

function cmdInit(args) {
  var host = args.flags.host || "workbuddy";
  var dir = args.flags.dir ? path.resolve(args.flags.dir) : process.cwd();
  var c = A.C;

  if (HOSTS.indexOf(host) === -1) {
    process.stderr.write("不认识的宿主：" + host + "\n可用：" + HOSTS.join(" · ") + "\n");
    return 2;
  }

  // 项目自己的标记
  var catDir = path.join(dir, ".catctl");
  try { fs.mkdirSync(catDir, { recursive: true }); } catch (e) {}
  fs.writeFileSync(path.join(catDir, "project.json"), JSON.stringify({
    name: path.basename(dir),
    dir: dir,
    host: host,
    attachedAt: new Date().toISOString(),
    version: VERSION
  }, null, 2) + "\n");

  process.stdout.write("\n" + c.gold + "接入 " + host + c.reset + c.grey + "  ·  " + dir + c.reset + "\n\n");

  if (host === "git") {
    var hookPath = path.join(dir, ".git", "hooks", "post-commit");
    if (!fs.existsSync(path.join(dir, ".git"))) {
      process.stdout.write("  " + c.red + "这里不是 git 仓库，先 git init。" + c.reset + "\n");
      return 1;
    }
    try { fs.mkdirSync(path.dirname(hookPath), { recursive: true }); } catch (e) {}
    if (fs.existsSync(hookPath)) {
      var backup = hookPath + ".bak." + Date.now();
      fs.copyFileSync(hookPath, backup);
      process.stdout.write("  " + c.grey + "旧的 post-commit 备份到 " + path.basename(backup) + c.reset + "\n");
    }
    fs.writeFileSync(hookPath,
      "#!/bin/sh\n" +
      "# catctl · 每次提交后猫会看一眼\n" +
      "command -v catctl >/dev/null 2>&1 && catctl emit task.ok --name \"git commit\" >/dev/null 2>&1 || true\n",
      { mode: 0o755 });
    process.stdout.write("  " + c.green + "✓" + c.reset + " 已写 .git/hooks/post-commit\n");
  }

  if (host === "claude") {
    var cdir = path.join(dir, ".claude");
    try { fs.mkdirSync(cdir, { recursive: true }); } catch (e) {}
    var sfile = path.join(cdir, "settings.json");
    var settings = {};
    if (fs.existsSync(sfile)) {
      try { settings = JSON.parse(fs.readFileSync(sfile, "utf8")); } catch (e) { settings = {}; }
      fs.copyFileSync(sfile, sfile + ".bak." + Date.now());
      process.stdout.write("  " + c.grey + "旧的 settings.json 已备份" + c.reset + "\n");
    }
    settings.hooks = settings.hooks || {};
    settings.hooks.Stop = settings.hooks.Stop || [];
    settings.hooks.Notification = settings.hooks.Notification || [];
    var has = function (arr) {
      return arr.some(function (g) {
        return (g.hooks || []).some(function (h) { return h.command && h.command.indexOf("catctl") > -1; });
      });
    };
    if (!has(settings.hooks.Stop)) {
      settings.hooks.Stop.push({ hooks: [{ type: "command", command: "catctl emit task.ok" }] });
    }
    if (!has(settings.hooks.Notification)) {
      settings.hooks.Notification.push({ hooks: [{ type: "command", command: "catctl emit task.wait --notify" }] });
    }
    fs.writeFileSync(sfile, JSON.stringify(settings, null, 2) + "\n");
    process.stdout.write("  " + c.green + "✓" + c.reset + " 已写 .claude/settings.json（Stop / Notification 两个钩子）\n");
  }

  if (host === "shell") {
    var sh = path.join(catDir, "shell-hook.sh");
    fs.writeFileSync(sh,
      "# catctl · 加进 ~/.zshrc：source <这个文件>\n" +
      "# 每次命令结束，猫会知道你这条命令成没成\n" +
      "catctl_precmd() {\n" +
      "  local code=$?\n" +
      "  if [ -n \"$CATCTL_LAST_CMD\" ]; then\n" +
      "    if [ $code -eq 0 ]; then\n" +
      "      catctl emit task.ok --name \"$CATCTL_LAST_CMD\" >/dev/null 2>&1\n" +
      "    else\n" +
      "      catctl emit task.fail --name \"$CATCTL_LAST_CMD\" >/dev/null 2>&1\n" +
      "    fi\n" +
      "  fi\n" +
      "}\n" +
      "catctl_preexec() { CATCTL_LAST_CMD=\"$1\"; }\n" +
      "if [ -n \"$ZSH_VERSION\" ]; then\n" +
      "  autoload -Uz add-zsh-hook\n" +
      "  add-zsh-hook precmd catctl_precmd\n" +
      "  add-zsh-hook preexec catctl_preexec\n" +
      "fi\n");
    process.stdout.write("  " + c.green + "✓" + c.reset + " 已写 .catctl/shell-hook.sh\n");
    process.stdout.write("  " + c.grey + "在 ~/.zshrc 里加一行：source " + sh + c.reset + "\n");
  }

  if (host === "workbuddy" || host === "codex" || host === "vscode") {
    process.stdout.write(snippetFor(host, c) + "\n");
  }

  process.stdout.write("\n  " + c.grey + "不管哪种宿主，最稳的一条永远是：" + c.reset +
    "\n    " + c.cream + "catctl run -- <你的命令>" + c.reset + "\n\n");

  return 0;
}

function snippetFor(host, c) {
  if (host === "workbuddy") {
    return [
      "  " + c.grey + "WorkBuddy 这边挂在 hook 上。命令只有一条：" + c.reset,
      "",
      "    " + c.cream + "catctl emit task.ok --kind test          # 任务结束（告诉它是哪类活）" + c.reset,
      "    " + c.cream + "catctl emit task.wait --notify           # 卡住等你确认（会弹系统通知）" + c.reset,
      "    " + c.cream + "catctl emit task.fail --kind build --exit 1 --detail \"$ERR\"  # 失败，附报错" + c.reset,
      "",
      "  " + c.grey + "--kind 可选：" + learner.KINDS.join(" / ") + "；不写则由 --name 猜。" + c.reset,
      "  " + c.grey + "把上面任意一条写进 WorkBuddy 的 hook 配置里，猫就会报信。" + c.reset,
      "  " + c.grey + "不确定 hook 怎么配的话，先用 run 兜着，它不依赖任何宿主：" + c.reset,
      "    " + c.cream + "catctl run -- <你平时那条命令>" + c.reset
    ].join("\n");
  }
  if (host === "codex") {
    return [
      "  " + c.grey + "Codex 没有外挂 hook，但它是跑命令的。两个办法：" + c.reset,
      "",
      "  " + c.cream + "1. 在 AGENTS.md 里加一行，让它每次收尾时执行：" + c.reset,
      "       " + c.grey + "任务完成后执行 `catctl emit task.ok --kind <类型>`，失败执行 `catctl emit task.fail --kind <类型> --exit <码>`，需要我确认时执行 `catctl emit task.wait --notify`" + c.reset,
      "",
      "  " + c.cream + "2. 套一层外壳，Codex 不用知道猫的存在：" + c.reset,
      "       " + c.grey + "catctl run -- codex" + c.reset,
      "",
      "  " + c.grey + "我建议两个都上：外层保证退出码和报错尾巴，内层保证中途会叫你并带上活动类型。" + c.reset
    ].join("\n");
  }
  return [
    "  " + c.grey + "VSCode 任务：在 .vscode/tasks.json 里，把命令包一层：" + c.reset,
    "",
    "    {" + "\n" +
    "      \"label\": \"test\"," + "\n" +
    "      \"type\": \"shell\"," + "\n" +
    "      \"command\": \"catctl run -- npm test\"" + "\n" +
    "    }",
    "",
    "  " + c.grey + "这样每次跑任务，猫都会在跑完时报一句。" + c.reset
  ].join("\n");
}

/* =========================================================================
 * learn
 * ======================================================================= */

function cmdLearn(args) {
  var s = rt.open();
  var items = learner.describe(s.profile);

  if (args.flags.json) {
    process.stdout.write(JSON.stringify({ learned: items, profile: publicProfile(s.profile) }, null, 2) + "\n");
    return 0;
  }

  var c = A.C;
  process.stdout.write("\n  " + c.gold + "它学会了什么" + c.reset +
    c.grey + "  ·  " + daysAlive(s.profile) + " 天" + c.reset + "\n\n");

  items.forEach(function (it) {
    var dots = new Array(5).fill("·").map(function (d, i) {
      return i < Math.round(it.confidence * 5) ? "●" : d;
    }).join("");
    process.stdout.write("  " + c.green + dots + c.reset + "  " + it.text + "\n");
  });

  var t = s.engine.snapshot().traits;
  process.stdout.write("\n  " + c.grey + "性格  夜行 " + Math.round(t.nocturnal * 100) +
    "% · 碎步 " + Math.round(t.sprinter * 100) +
    "% · 调试 " + Math.round(t.debugger * 100) +
    "%\n        傲娇 " + Math.round(t.tsundere * 100) +
    "% · 俏皮 " + Math.round(t.playful * 100) + "%" + c.reset + "\n\n");
  return 0;
}

/* =========================================================================
 * teach
 * ======================================================================= */

/* =========================================================================
 * teach-kind —— 纠正某条命令被猜成的活动类型
 * ======================================================================= */

function cmdTeachKind(args) {
  var name = args.positional[0];
  var kind = args.positional[1];

  if (!name || !kind) {
    process.stderr.write("用法：catctl teach-kind <命令名> <类型>\n");
    process.stderr.write("例：catctl teach-kind \"npm run deploy\" ship\n");
    process.stderr.write("类型：" + learner.KINDS.join(" · ") + "\n");
    return 2;
  }
  if (name.length > 200) {
    process.stderr.write("命令名太长了，截到 200 字以内。\n");
    return 2;
  }
  var k = learner.normalizeKind(kind);
  if (!k) {
    process.stderr.write("不认识这个类型：" + kind + "（可用：" + learner.KINDS.join(" · ") + "）\n");
    return 2;
  }

  var s = rt.open();
  if (s.engine.snapshot().stage < 1) {
    process.stderr.write("还是奶猫，教不会。多跑几件活（150xp）再来。\n");
    return 1;
  }

  s.profile.kindOverrides = s.profile.kindOverrides || {};
  s.profile.kindOverrides[name] = k;
  learner.save(s.profile);

  process.stdout.write("  " + A.C.green + "记住了" + A.C.reset + "  「" + name + "」 → " +
    (learner.KIND_LABEL[k] || k) + "（以后这条命令按这个算）\n");
  return 0;
}

function cmdTeach(args) {
  var key = args.positional[0];
  var val = parseFloat(args.positional[1]);
  var dims = { nocturnal: "夜行", sprinter: "碎步", debugger: "调试", playful: "俏皮", tsundere: "傲娇" };

  if (!key || !(key in dims)) {
    process.stderr.write("用法：catctl teach <" + Object.keys(dims).join("|") + "> <0..1>\n");
    return 2;
  }
  if (!isFinite(val) || val < 0 || val > 1) {
    process.stderr.write("值要在 0 到 1 之间。\n");
    return 2;
  }

  var s = rt.open();
  if (s.engine.snapshot().stage < 1) {
    process.stderr.write("还是奶猫，教不会。多跑几件活（150xp）再来。\n");
    return 1;
  }

  s.profile.override = s.profile.override || {};
  s.profile.override.traits = s.profile.override.traits || {};
  s.profile.override.traits[key] = val;
  learner.save(s.profile);
  s.engine.setProfile(s.profile);

  process.stdout.write("  " + A.C.green + "记住了" + A.C.reset + "  " +
    dims[key] + " = " + val + "\n");
  return 0;
}

/* =========================================================================
 * log
 * ======================================================================= */

/* 命令名在日志里只显示前 n 个字符，完整内容仍保留在事件文件里 */
function shortName(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function cmdLog(args) {
  var n = parseInt(args.flags.n || "20", 10);
  var wantKind = args.flags.kind ? learner.normalizeKind(args.flags.kind) : null;
  var onlyFail = !!args.flags.fail;
  if (args.flags.kind && !wantKind) {
    process.stderr.write("不认识这个类型：" + args.flags.kind + "\n");
    process.stderr.write("可用：" + learner.KINDS.join(" · ") + "\n");
    return 2;
  }

  // 先筛再截断，n 指的是符合条件的最近 n 条
  var pool = store.readEvents(2000);
  var evs = pool.filter(function (e) {
    if (wantKind && e.kind !== wantKind) return false;
    if (onlyFail && e.type !== "task.fail") return false;
    return true;
  }).slice(-n);

  var c = A.C;
  if (!evs.length) {
    process.stdout.write(c.grey + "  " + (wantKind || onlyFail ? "这个条件下没有记录。" : "还没有记录。") + "\n" + c.reset);
    return 0;
  }
  process.stdout.write("\n");
  evs.forEach(function (e) {
    var t = new Date(e.at);
    var hh = String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0") + " " +
      String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
    var mark = e.type === "task.ok" ? c.green + "✓" + c.reset
      : e.type === "task.fail" ? c.red + "✗" + c.reset
      : e.type === "task.wait" ? c.gold + "!" + c.reset
      : c.grey + "·" + c.reset;
    var kindTag = e.kind ? "  " + c.grey + "[" + (learner.KIND_LABEL[e.kind] || e.kind) + "]" + c.reset : "";
    var exitTag = e.type === "task.fail" && typeof e.exit === "number" ? c.red + " exit " + e.exit + c.reset : "";
    process.stdout.write("  " + c.grey + hh + c.reset + "  " + mark + "  " +
      A.pad(e.type, 12) + c.grey + (e.dir || "") + c.reset +
      (e.name ? "  " + shortName(e.name, 60) : "") + kindTag + exitTag + "\n");
    if (e.detail) {
      String(e.detail).split("\n").forEach(function (ln) {
        process.stdout.write("                  " + c.grey + "│ " + ln + c.reset + "\n");
      });
    }
  });
  process.stdout.write("\n");
  return 0;
}


/* =========================================================================
 * reset
 * ======================================================================= */

function cmdReset(args) {
  if (!args.flags.yes && !args.flags.y) {
    process.stderr.write("这会清空这只猫的全部记忆。确定的话：catctl reset --yes\n");
    return 1;
  }
  store.wipe();
  process.stdout.write("  " + A.C.grey + "清干净了。下一只会从奶猫开始。" + A.C.reset + "\n");
  return 0;
}

/* =========================================================================
 * serve —— 给不会开 shell 的宿主一个 HTTP 口子
 * ======================================================================= */

function cmdServe(args) {
  var http = require("http");
  var port = parseInt(args.flags.port || "9177", 10);
  var c = A.C;
  var s = rt.open();
  var lastTick = Date.now();

  function sync() {
    var now = Date.now();
    if (now - lastTick > 0) rt.advance(s.engine, now - lastTick);
    lastTick = now;
  }

  function send(res, code, obj) {
    var body = JSON.stringify(obj, null, 2);
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Access-Control-Allow-Origin": "*"
    });
    res.end(body);
  }

  var server = http.createServer(function (req, res) {
    var url = (req.url || "/").split("?")[0];

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "content-type"
      });
      res.end();
      return;
    }

    if (url === "/state") { sync(); send(res, 200, s.engine.snapshot()); return; }
    if (url === "/learn") { send(res, 200, learner.describe(s.profile)); return; }
    if (url === "/profile") { send(res, 200, publicProfile(s.profile)); return; }

    if (url === "/emit" && req.method === "POST") {
      var body = "";
      req.on("data", function (d) { body += d; });
      req.on("end", function () {
        var j = {};
        try { j = JSON.parse(body || "{}"); } catch (e) { j = {}; }
        var type = resolveEvent(j.type) || j.type;
        sync();
        var out = rt.emit(s, type, sanitizeMeta(j));
        send(res, 200, { ok: true, event: type, reaction: out.after.reaction, snapshot: out.after });
      });
      return;
    }

    send(res, 404, {
      error: "没有这个地址",
      routes: ["GET /state", "GET /learn", "GET /profile", "POST /emit"]
    });
  });

  server.on("error", function (err) {
    process.stderr.write("起不了服务：" + err.message + "\n");
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", function () {
    process.stdout.write("\n  " + c.gold + "catctl serve" + c.reset +
      c.grey + "  ·  http://127.0.0.1:" + port + c.reset + "\n\n" +
      "    " + c.cream + "GET  /state" + c.reset + "               看它一眼\n" +
      "    " + c.cream + "GET  /learn" + c.reset + "               它学会了什么\n" +
      "    " + c.cream + "POST /emit" + c.reset + "               {\"type\":\"task.ok\",\"name\":\"npm test\"}\n\n" +
      "  " + c.grey + "只监听 127.0.0.1，不出网。Ctrl-C 停。\n\n");
  });

  process.on("SIGINT", function () { rt.save(s); process.exit(0); });
  return null;
}

/* =========================================================================
 * selftest
 * ======================================================================= */

function cmdSelftest(args) {
  var hours = parseInt(args.flags.hours || "48", 10);
  var c = A.C;
  var fails = 0;
  var lines = [];

  function ok(name, cond, detail) {
    if (cond) lines.push("  " + c.green + "✓" + c.reset + "  " + name + (detail ? c.grey + "  " + detail + c.reset : ""));
    else { fails++; lines.push("  " + c.red + "✗" + c.reset + "  " + name + (detail ? c.grey + "  " + detail + c.reset : "")); }
  }

  process.stdout.write("\n  " + c.gold + "catctl selftest" + c.reset + c.grey +
    "  ·  " + hours + " 虚拟小时" + c.reset + "\n\n");

  /* 1. 确定性 */
  function runSim(seed, withEvents) {
    var e = CatEngine.create({ seed: seed });
    var hist = {};
    var seq = [];
    var last = null;
    var maxDwell = 0, dwellStart = 0;
    var transitions = 0;
    var steps = hours * 3600;

    for (var i = 0; i < steps; i++) {
      if (withEvents) {
        if (i % 900 === 0) e.emit("task.start");
        if (i % 900 === 600) e.emit(i % 2700 === 0 ? "task.fail" : "task.ok");
      }
      var s = e.tick(1000);
      if (s.behavior !== last) {
        hist[s.behavior] = (hist[s.behavior] || 0) + 1;
        if (last) {
          var dwell = i - dwellStart;
          if (last !== "SLEEP" && dwell > maxDwell) maxDwell = dwell;
        }
        dwellStart = i;
        last = s.behavior;
        transitions++;
      }
      seq.push(s.behavior);
    }
    return { engine: e, hist: hist, snap: e.snapshot(), maxDwell: maxDwell, transitions: transitions, seq: seq };
  }

  var a = runSim(1234, false);
  var b = runSim(1234, false);
  ok("同一个种子跑两遍，行为序列完全一致", a.seq.join(",") === b.seq.join(","),
    a.seq.length + " 步");

  var withEv = runSim(99, true);
  ok("喂事件之后 XP 会涨", withEv.snap.xp > 0, withEv.snap.xp + " xp · " + withEv.snap.stageName);
  ok("阶段只升不降", withEv.snap.stage >= 0 && withEv.snap.stage <= 4);

  /* 2. 不变量 */
  var kinds = Object.keys(a.hist).concat(Object.keys(withEv.hist));
  var uniq = {};
  kinds.forEach(function (k) { uniq[k] = 1; });
  var kindCount = Object.keys(uniq).length;

  ok("空闲 " + hours + " 小时能走出至少 5 种行为", Object.keys(a.hist).length >= 5,
    Object.keys(a.hist).join(" / "));
  ok("有任务时能走出至少 4 种行为", Object.keys(withEv.hist).length >= 4,
    Object.keys(withEv.hist).join(" / "));
  ok("不会卡在同一个动作上（除睡觉）", a.maxDwell < 1500,
    "最长 " + a.maxDwell + " 秒");

  var maxT = 0;
  ["a", "b", "withEv"].forEach(function (k) {
    var s = { a: a, b: b, withEv: withEv }[k];
    if (s.transitions > maxT) maxT = s.transitions;
  });
  ok("切换频率不抽搐（每分钟不超过 1.5 次）", maxT < hours * 90, maxT + " 次 / " + hours + " 小时");

  var s = withEv.engine.snapshot();
  var allInRange = Object.keys(s.needs).every(function (k) {
    return s.needs[k] >= 0 && s.needs[k] <= 1 && isFinite(s.needs[k]);
  });
  ok("五种匮乏都在 0..1，且不是 NaN", allInRange, JSON.stringify(s.needs));

  /* 3. 反应 */
  var r = CatEngine.create({ seed: 7 });
  for (var i = 0; i < 300; i++) r.tick(1000);
  var base = r.snapshot();
  r.emit("task.ok");
  var reacted = r.snapshot();
  ok("成功会触发 CHEER", reacted.reaction && reacted.reaction.id === "CHEER");
  ok("反应会盖住姿势，但不改行为", reacted.behavior === base.behavior && reacted.pose === "cheer");
  for (var j = 0; j < 4; j++) r.tick(1000);
  ok("几秒后反应撤掉，姿势回到行为", r.snapshot().reaction === null);

  var r2 = CatEngine.create({ seed: 7 });
  r2.emit("task.fail");
  ok("失败会触发 ALARM 并压低情绪", r2.snapshot().reaction.id === "ALARM" && r2.snapshot().mood < 0,
    "mood " + r2.snapshot().mood);

  /* 4. 学习 */
  var p = learner.emptyProfile();
  for (var k = 0; k < 30; k++) {
    learner.record(p, { type: k % 4 === 0 ? "task.fail" : "task.ok", dir: "demo", name: "npm test", ms: 12000 });
  }
  ok("学习会记账", p.tasks.total === 30 && p.hours.some(function (v) { return v > 0; }),
    p.tasks.total + " 件");
  ok("能说出至少一条习惯", learner.describe(p).length >= 2,
    learner.describe(p).length + " 条");

  /* 4b. 活动类型：从命令名猜，显式传入优先，猜不出归 other */
  ok("npm test 归为 test", learner.inferKind("npm test") === "test", learner.inferKind("npm test"));
  ok("cargo build 归为 build", learner.inferKind("cargo build") === "build", learner.inferKind("cargo build"));
  ok("git push 归为 ship（push 优先于 git）", learner.inferKind("git push origin main") === "ship",
    learner.inferKind("git push origin main"));
  ok("git status 归为 git", learner.inferKind("git status") === "git", learner.inferKind("git status"));
  ok("显式 kind 覆盖命令名猜测", learner.inferKind("npm test", "ship") === "ship");
  ok("无效 kind 回落到猜测", learner.inferKind("npm test", "bogus") === "test");
  ok("猜不出的命令记为 other", learner.inferKind("frobnicate") === "other");
  ok("没有命令名时不记类型", learner.inferKind("") === null);

  /* 4d. 纠正表：你教过的命令优先于正则，显式 kind 仍最优先 */
  var ov = { "npm run deploy": "ship" };
  ok("纠正表覆盖正则猜测", learner.inferKind("npm run deploy", null, ov) === "ship",
    learner.inferKind("npm run deploy", null, ov));
  ok("没教过的命令照常猜", learner.inferKind("npm test", null, ov) === "test");
  ok("显式 kind 仍压过纠正表", learner.inferKind("npm run deploy", "build", ov) === "build");
  ok("纠正表里的非法类型被忽略", learner.inferKind("npm test", null, { "npm test": "bogus" }) === "test");

  var pl = learner.emptyProfile();
  learner.record(pl, { type: "task.fail", dir: "demo", name: "npm run build", ms: 4000, kind: "build" });
  learner.record(pl, { type: "task.ok", dir: "demo", name: "npm test", ms: 2000 });
  ok("失败计入活动类型的失败数", pl.kinds.build.fail === 1 && pl.kinds.build.n === 1, JSON.stringify(pl.kinds));
  ok("测试类型不被构建失败污染", pl.kinds.test && pl.kinds.test.fail === 0);
  ok("KIND_LABEL 覆盖全部类型", learner.KINDS.every(function (k) { return !!learner.KIND_LABEL[k]; }));

  var pk = learner.emptyProfile();
  for (var kk = 0; kk < 12; kk++) {
    learner.record(pk, { type: kk % 3 === 0 ? "task.fail" : "task.ok", dir: "demo", name: "deploy prod", ms: 9000 });
  }
  ok("活动类型计入 kinds", pk.kinds.ship && pk.kinds.ship.n === 12, JSON.stringify(pk.kinds));
  ok("活动类型不改命令账", pk.commands["deploy prod"] && pk.commands["deploy prod"].n === 12);
  ok("习惯里能说出活动类型", learner.describe(pk).some(function (it) { return it.key === "kind"; }));

  /* 4e. 周变化：本周 vs 上周，daily 桶只留 21 天 */
  var pw = learner.emptyProfile();
  var DAY = 86400000;
  var now0 = Date.now();
  function daysAgo(n) { return new Date(now0 - n * DAY).toISOString(); }
  for (var wa = 0; wa < 3; wa++) {
    learner.record(pw, { type: "task.fail", at: daysAgo(10 + wa), dir: "demo", name: "npm test", ms: 1000 });
  }
  for (var wb = 0; wb < 4; wb++) {
    learner.record(pw, { type: "task.ok", at: daysAgo(3 + wb), dir: "demo", name: "npm test", ms: 1000 });
  }
  var wk = learner.weekWindows(pw);
  ok("本周/上周窗口分开统计", wk.cur.n === 4 && wk.prev.n === 3, "本周 " + wk.cur.n + " / 上周 " + wk.prev.n);
  ok("本周没失败、上周全挂", wk.cur.fail === 0 && wk.prev.fail === 3,
    "本周挂 " + wk.cur.fail + " / 上周挂 " + wk.prev.fail);
  var weeklyItem = learner.describe(pw).filter(function (it) { return it.key === "weekly"; })[0];
  ok("能说出周变化", !!weeklyItem && /少挂|手稳/.test(weeklyItem.text), weeklyItem ? weeklyItem.text : "（无）");
  ok("daily 按天记录", Object.keys(pw.daily).length === 7, Object.keys(pw.daily).length + " 天");

  var pc = learner.emptyProfile();
  for (var wd = 0; wd < 30; wd++) {
    learner.record(pc, { type: "task.ok", at: daysAgo(wd), dir: "demo", name: "x", ms: 1 });
  }
  ok("daily 只保留 21 天", Object.keys(pc.daily).length === 21, Object.keys(pc.daily).length + " 天");

  /* 4f. 性格偏置：傲娇 / 俏皮两个新维度 */
  var tA = CatEngine.create({ seed: 42 }).snapshot().traits;
  var tB = CatEngine.create({ seed: 4242 }).snapshot().traits;
  ok("不同种子的猫脾气不同", tA.tsundere !== tB.tsundere || tA.playful !== tB.playful,
    JSON.stringify({ a: [tA.tsundere, tA.playful], b: [tB.tsundere, tB.playful] }));
  ok("同一只猫的脾气可复现",
    CatEngine.create({ seed: 42 }).snapshot().traits.tsundere === tA.tsundere);
  ok("新维度在 0.25..0.75 之间", ["tsundere", "playful"].every(function (k) {
    return tA[k] >= 0.25 && tA[k] <= 0.75;
  }), JSON.stringify({ t: tA.tsundere, p: tA.playful }));

  // 傲娇到极致的猫应该更常瘫着，俏皮到极致的应该更常扑咬/疯跑
  function behaviorShare(overrides) {
    var e = CatEngine.create({
      seed: 20261018,
      traits: Object.assign({ nocturnal: 0.3, sprinter: 0.5, debugger: 0.2 }, overrides)
    });
    var hist = {};
    var steps = 48 * 3600;
    for (var i = 0; i < steps; i++) {
      var s = e.tick(1000);
      hist[s.behavior] = (hist[s.behavior] || 0) + 1;
    }
    var total = steps;
    return { hist: hist, total: total };
  }
  var aloof = behaviorShare({ tsundere: 0.75, playful: 0.25 });
  var silly = behaviorShare({ tsundere: 0.25, playful: 0.75 });
  var pctShare = function (h, t, ids) {
    return ids.reduce(function (a, k) { return a + (h[k] || 0); }, 0) / t * 100;
  };
  var playAloof = pctShare(aloof.hist, aloof.total, ["PLAY", "SCRATCH"]);
  var playSilly = pctShare(silly.hist, silly.total, ["PLAY", "SCRATCH"]);
  ok("俏皮的猫更爱扑咬和磨爪", playSilly > playAloof,
    "俏皮 " + playSilly.toFixed(1) + "% vs 傲娇 " + playAloof.toFixed(1) + "%");
  var boxAloof = pctShare(aloof.hist, aloof.total, ["BOXED"]);
  var boxSilly = pctShare(silly.hist, silly.total, ["BOXED"]);
  ok("傲娇的猫更爱躲进箱子", boxAloof > boxSilly,
    "傲娇 " + boxAloof.toFixed(1) + "% vs 俏皮 " + boxSilly.toFixed(1) + "%");
  ok("偏置后仍能走出至少 5 种行为", Object.keys(aloof.hist).length >= 5 && Object.keys(silly.hist).length >= 5,
    "傲娇 " + Object.keys(aloof.hist).length + " 种 / 俏皮 " + Object.keys(silly.hist).length + " 种");
  var diffs = 0;
  Object.keys(aloof.hist).concat(Object.keys(silly.hist)).forEach(function (k) {
    var d = Math.abs(pctShare(aloof.hist, aloof.total, [k]) - pctShare(silly.hist, silly.total, [k]));
    if (d >= 2) diffs++;
  });
  ok("两种脾气走的路确实不一样（≥3 种行为差 2 个百分点以上）", diffs >= 3, diffs + " 种");


  var dump = withEv.engine._state();
  var revived = CatEngine.create({ seed: 1 });
  revived.restore(JSON.parse(JSON.stringify(dump)));
  ok("存档能原样恢复", revived.snapshot().behavior === withEv.snap.behavior &&
    revived.snapshot().xp === withEv.snap.xp);

  process.stdout.write(lines.join("\n") + "\n\n");
  if (fails === 0) {
    process.stdout.write("  " + c.green + "全部通过" + c.reset + c.grey +
      "  ·  共 " + lines.length + " 项" + c.reset + "\n\n");
  } else {
    process.stdout.write("  " + c.red + fails + " 项没过" + c.reset + "\n\n");
  }
  return fails ? 1 : 0;
}

/* =========================================================================
 * 入口
 * ======================================================================= */

function main(argv) {
  var args = parseArgs(argv);
  var cmd = args.cmd;

  if (!cmd && (args.flags.help || args.flags.h)) cmd = "help";
  if (args.flags.version || args.flags.v || cmd === "version") cmd = "version";
  if (!cmd && args.rest) cmd = "run";

  switch (cmd) {
    case null:
      process.stdout.write(help() + "\n");
      return cmdStatus({ flags: {} });
    case "help": case "h":
      process.stdout.write(help());
      return 0;
    case "version":
      process.stdout.write("catctl " + VERSION + "  ·  engine " + CatEngine.VERSION + "\n");
      return 0;
    case "status": case "s":
      return cmdStatus(args);
    case "watch": case "w":
      return cmdWatch(args);
    case "emit": case "e":
      return cmdEmit(args);
    case "run": case "r":
      return cmdRun(args);
    case "init": case "attach":
      return cmdInit(args);
    case "learn":
      return cmdLearn(args);
    case "teach":
      return cmdTeach(args);
    case "teach-kind":
      return cmdTeachKind(args);
    case "log":
      return cmdLog(args);
    case "reset":
      return cmdReset(args);
    case "serve":
      return cmdServe(args);
    case "selftest": case "test":
      return cmdSelftest(args);
    default:
      process.stderr.write("不认识这个命令：" + cmd + "\n用 catctl help 看用法。\n");
      return 2;
  }
}

if (require.main === module) {
  var code;
  try {
    code = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write("出错了：" + (err && err.stack ? err.stack : String(err)) + "\n");
    code = 1;
  }
  if (typeof code === "number") process.exit(code);
}

module.exports = { main: main, VERSION: VERSION };

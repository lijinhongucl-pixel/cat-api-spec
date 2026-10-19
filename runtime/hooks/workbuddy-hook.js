#!/usr/bin/env node
/*!
 * CAT RUNTIME · workbuddy-hook.js
 * ---------------------------------------------------------------------------
 * WorkBuddy 的 command hook 适配器。
 *
 * WorkBuddy 把事件以 JSON 从 stdin 传进来（字段：hook_event_name、
 * user_prompt、tool_name、tool_input 等）。这个脚本把它翻译成猫的事件：
 *
 *   UserPromptSubmit  → task.start   （你开始让它干活）
 *   Stop              → task.ok      （这一轮收工了）
 *
 * 准则：
 *   1. 永远 exit 0，绝不挡住宿主。
 *   2. 不输出任何可能被宿主当成指令的内容（stdout 保持为空）。
 *   3. 猫没装、catctl 不在 PATH 上，静默跳过。
 *   4. 只看事件名和用户输入的前 60 字（用于猜活动类型），不存整段 prompt。
 */

"use strict";

var cp = require("child_process");
var path = require("path");

var CATCTL = path.join(__dirname, "..", "bin", "catctl.js");

function readStdin(cb) {
  var buf = "";
  var done = false;
  var finish = function () { if (!done) { done = true; cb(buf); } };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", function (d) { buf += d; });
  process.stdin.on("end", finish);
  process.stdin.on("error", finish);
  // 保险：宿主没关 stdin 时，最多等 2 秒
  setTimeout(finish, 2000).unref();
}

// 把用户的一句话变成一个粗略的活动类型提示。只用来猜，不记原文。
function guessKindFromPrompt(text) {
  var s = String(text || "").slice(0, 60).toLowerCase();
  if (/测试|test|spec|pytest|jest/.test(s)) return "test";
  if (/部署|发布|上线|deploy|publish|release/.test(s)) return "ship";
  if (/构建|编译|build|compile/.test(s)) return "build";
  if (/文档|文章|报告|写|docx|pdf|markdown|md/.test(s)) return "write";
  if (/查|搜索|调研|research|search|fetch/.test(s)) return "research";
  if (/提交|commit|分支|merge|git/.test(s)) return "git";
  if (/依赖|安装|install/.test(s)) return "install";
  if (/检查|lint|格式/.test(s)) return "lint";
  return "other";
}

function emit(type, extra) {
  var args = [CATCTL, "emit", type];
  if (extra.kind) args.push("--kind", extra.kind);
  if (extra.name) args.push("--name", extra.name);
  if (extra.dir) args.push("--dir", extra.dir);
  try {
    cp.spawnSync(process.execPath, args, {
      stdio: "ignore",
      timeout: 4000,
      env: process.env
    });
  } catch (e) { /* 静默 */ }
}

function main(raw) {
  var input = {};
  try { input = JSON.parse(raw || "{}"); } catch (e) { input = {}; }

  var ev = input.hook_event_name || "";
  var dir = process.cwd();

  // 把本轮的活动类型记在临时文件里，Stop 时带上它，免得收工那条被算成「杂活」。
  var fs = require("fs");
  var os = require("os");
  var stash = path.join(os.tmpdir(), "catctl-wb-" + (input.session_id || "default") + ".kind");

  if (ev === "UserPromptSubmit") {
    var kind = guessKindFromPrompt(input.user_prompt);
    try { fs.writeFileSync(stash, kind); } catch (e) { /* 写不了就算了 */ }
    emit("task.start", { kind: kind, name: "workbuddy: " + kind, dir: dir });
  } else if (ev === "Stop") {
    var last = "";
    try { last = fs.readFileSync(stash, "utf8").trim(); } catch (e) { last = ""; }
    emit("task.ok", { kind: last || null, name: "workbuddy turn", dir: dir });
    try { fs.unlinkSync(stash); } catch (e) { /* 忽略 */ }
  }
  // 其他事件不处理。
}

readStdin(function (raw) {
  try { main(raw); } catch (e) { /* 任何异常都吞掉 */ }
  process.exit(0);
});

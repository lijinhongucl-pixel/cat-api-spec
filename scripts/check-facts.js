#!/usr/bin/env node
/*!
 * CAT API · 单一事实源自检
 * ---------------------------------------------------------------------------
 * 两件事：
 *   1. facts.json 里的 counts 必须从文件系统推导得出来，不能是人手填的快照
 *   2. README / llms.txt / AGENTS.md 里的关键数字必须与 facts.json 一致
 *
 * 为什么存在：40 个页面攒下来之后，端点数在四份文档里有四个值，
 * 工具页数有三个值。AI 抓到互相矛盾的数字，就不会引用这份规范。
 *
 * 用法：node scripts/check-facts.js
 * --------------------------------------------------------------------------- */
"use strict";

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var ROOT = path.resolve(__dirname, "..");
var facts = JSON.parse(fs.readFileSync(path.join(ROOT, "facts.json"), "utf8"));
var failures = [];
var checks = 0;

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function eq(label, actual, expected) {
  checks++;
  if (actual !== expected) {
    failures.push(label + "：实际 " + actual + "，facts.json 写的是 " + expected);
  }
}
function walk(dir, ext, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === ".git" || e.name === "node_modules") return;
    var p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  });
  return out;
}
function tracked(pattern) {
  return cp.execSync("git ls-files " + pattern, { cwd: ROOT })
    .toString().trim().split("\n").filter(Boolean).length;
}
function oapiPaths(rel) {
  var lines = read(rel).split("\n");
  var start = lines.findIndex(function (l) { return /^paths:\s*$/.test(l); });
  if (start < 0) return 0;
  var n = 0;
  for (var i = start + 1; i < lines.length; i++) {
    if (/^  \/\S+:\s*$/.test(lines[i])) n++;
    else if (lines[i] && !/^\s/.test(lines[i])) break;
  }
  return n;
}

// ---- 1. facts.json 自身必须能被文件系统复现 ----
var allHtml = [];
walk(ROOT, ".html", allHtml);
var counts = facts.counts;
eq("pages", allHtml.length, counts.pages);
eq("toolPages", walk(path.join(ROOT, "tools"), ".html", []).length, counts.toolPages);
eq("referencePages", walk(path.join(ROOT, "reference"), ".html", []).length, counts.referencePages);
eq("siteJsFiles", tracked("'assets/js/*.js'"), counts.siteJsFiles);
eq("chapters", (read("spec/cat.html").match(/class="sec-no"/g) || []).length, counts.chapters);
eq("cliEndpoints", (read("skill/cat-api.js").match(/\bpath:\s*"\/api\/v1\//g) || []).length, counts.cliEndpoints);
eq("openapiPaths", oapiPaths("spec/openapi.yaml"), counts.openapiPaths);
eq("quantifiedPaths", oapiPaths("spec/quantified-api.yaml"), counts.quantifiedPaths);

var indexHtml = read("index.html");
var tabCounts = indexHtml.match(/class="count">(\d+)</g) || [];
var indexEntries = tabCounts.reduce(function (s, m) {
  return s + parseInt(m.replace(/\D/g, ""), 10);
}, 0);
eq("indexEntries", indexEntries, counts.indexEntries);

// CLI 自己打印的端点数不能和实际注册数对不上
var cliList = read("skill/cat-api.js");
var printed = cliList.match(/"\s*(\d+) 个端点。全部纯模拟/);
checks++;
if (!printed || parseInt(printed[1], 10) !== counts.cliEndpoints) {
  failures.push("skill/cat-api.js list() 打印的端点数与 RESOURCES 不一致（应为 " + counts.cliEndpoints + "）");
}

// ---- 2. 文档里的关键数字必须引用同一套事实 ----
function docRule(rel, re, key, label) {
  var text = read(rel);
  var expected = key.indexOf("canon.") === 0
    ? facts.canon[key.slice(6)]
    : facts.counts[key];
  var found = [];
  var m;
  var rx = new RegExp(re.source, re.flags.indexOf("g") < 0 ? re.flags + "g" : re.flags);
  while ((m = rx.exec(text)) !== null) found.push(parseInt(m[1], 10));
  checks++;
  if (!found.length) {
    failures.push(label + "：在 " + rel + " 里找不到这条表述，规则失效了");
  } else if (found.some(function (n) { return n !== expected; })) {
    failures.push(label + "：" + rel + " 写的是 " + found.join("/") + "，应为 " + expected);
  }
}

docRule("README.md", /(\d+) 个交互式?工具页/, "toolPages", "README 工具页数");
docRule("README.md", /\| \*\*实现\*\* \| (\d+) 个交互工具/, "toolPages", "README 实现表工具数");
docRule("README.md", /工具页（(\d+) 个）/, "toolPages", "README 工具页标题");
docRule("README.md", /# (\d+) 个交互式工具/, "toolPages", "README 目录树工具数");
docRule("README.md", /(\d+) 个站点脚本/, "siteJsFiles", "README 站点脚本数");
docRule("README.md", /# (\d+) 个脚本/, "siteJsFiles", "README 目录树脚本数");
docRule("README.md", /(\d+) 个 CLI 端点/, "cliEndpoints", "README CLI 端点数");
docRule("README.md", /(\d+) 个路径的 OpenAPI/, "openapiPaths", "README OpenAPI 路径数");
docRule("README.md", /(\d+) 个性格维度/, "canon.traits", "README 性格维度数");
docRule("llms.txt", /可运行工具（(\d+) 个入口）/, "toolPages", "llms.txt 工具入口数");
docRule("llms.txt", /工具页面（(\d+) 个）/, "toolPages", "llms.txt 目录树工具数");
docRule("llms.txt", /## (\d+) 个核心端点/, "canon.coreEndpoints", "llms.txt 核心端点数");
docRule("AGENTS.md", /(\d+) 个工具页面/, "toolPages", "AGENTS.md 工具页数");

// ---- 3. 事实性表述不能与线上行为冲突 ----
[
  ["README.md", "零依赖零构建零 CDN"],
  ["llms.txt", "全站只有 2 张页面会出网"],
  ["AGENTS.md", "全站只有 2 张页面可以出网"],
  ["CLAUDE.md", "只有 2 张页面可以出网"]
].forEach(function (pair) {
  checks++;
  if (read(pair[0]).indexOf(pair[1]) >= 0) {
    failures.push(pair[0] + " 仍写着「" + pair[1] + "」，与首页可选云 SDK 及 fetch 页面的实际行为不符");
  }
});

// ---- 4. canonical 必须统一到事实源声明的域 ----
var canonBase = facts.canonical;
allHtml.forEach(function (abs) {
  var rel = path.relative(ROOT, abs);
  var text = fs.readFileSync(abs, "utf8");
  var m = text.match(/<link rel="canonical" href="([^"]+)"/);
  checks++;
  if (!m) {
    failures.push(rel + " 缺 canonical");
  } else if (m[1] !== canonBase + (rel === "index.html" ? "" : rel)) {
    failures.push(rel + " canonical 指向 " + m[1]);
  }
});

// ---- 输出 ----
if (failures.length) {
  console.log("事实自检未通过（" + failures.length + " 项）：");
  failures.forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
}
console.log("事实自检通过：" + checks + " 项，facts.json 与文件系统及 6 份文档一致");

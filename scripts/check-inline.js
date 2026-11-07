#!/usr/bin/env node
/*
 * 检查所有 HTML 里的内联 <script> 语法。
 *
 * 为什么单独跑这一步：node --check *.js 只覆盖独立文件，页面里拼接的脚本
 * （例如用字符串拼 SVG 的工具页）不在其中。批量补属性时一旦插进 JS 字符串，
 * 独立文件检查全绿，页面却会直接崩。
 *
 * 用法：node scripts/check-inline.js
 * 规则：跳过 importmap / JSON-LD；type="module" 按 ESM 语法检查；只编译不执行。
 */
"use strict";

var fs = require("fs"), path = require("path"), os = require("os");
var vm = require("vm"), cp = require("child_process");
var ROOT = path.resolve(__dirname, "..");

var files = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === ".git" || e.name === "node_modules") return;
    var p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) files.push(p);
  });
})(ROOT);

var bad = [], total = 0;
var re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
files.sort().forEach(function (f) {
  var src = fs.readFileSync(f, "utf8");
  var m, i = 0;
  while ((m = re.exec(src)) !== null) {
    i++;
    var attrs = m[1] || "", code = m[2];
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/type\s*=\s*["']?(importmap|[^"']*json)/i.test(attrs)) continue;
    if (!code.trim()) continue;
    total++;
    var label = path.relative(ROOT, f) + " <script #" + i + ">";
    try {
      if (/type\s*=\s*["']module["']/i.test(attrs)) {
        var tmp = path.join(os.tmpdir(), "cat-api-inline-" + process.pid + "-" + total + ".mjs");
        fs.writeFileSync(tmp, code);
        try { cp.execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" }); }
        finally { fs.unlinkSync(tmp); }
      } else {
        new vm.Script(code, { filename: label });
      }
    } catch (err) {
      bad.push(label + " :: " + String(err.stderr || err.message).split("\n")[0]);
    }
  }
});

console.log("内联脚本语法检查 " + files.length + " 个 HTML / " + total + " 段脚本，失败 " + bad.length);
if (bad.length) {
  bad.forEach(function (b) { console.log("  " + b); });
  process.exit(1);
}

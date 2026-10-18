#!/usr/bin/env node
/*!
 * catctl —— 入口。真正的逻辑在 ../src/node/cli.js
 * 放这里只是为了 `npm bin` 和软链有个稳定的落点。
 */

"use strict";

var cli = require("../src/node/cli.js");

if (require.main === module) {
  var code;
  try {
    code = cli.main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write("出错了：" + (err && err.stack ? err.stack : String(err)) + "\n");
    code = 1;
  }
  if (typeof code === "number") process.exit(code);
}

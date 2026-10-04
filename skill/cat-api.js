#!/usr/bin/env node
/*!
 * CAT API CLI — cat-api
 * ---------------------------------------------------------------------------
 * 把猫 API 装进终端。给 AI 编程工具、给 shell、给你自己。
 *
 * 设计原则（与站点一致）：
 *   - 零依赖。不装 npm 包，不联网，不写全局状态。
 *   - 纯模拟。所有接口在本进程内返回，不发任何网络请求。
 *   - 输出可被机器读。--json 给 AI 读，默认给人读。
 *   - 没有 Owner 角色。--help 是唯一的权威文档。
 *
 * 用法：
 *   cat-api                      列出全部接口
 *   cat-api state                查当前状态
 *   cat-api pet                  抚摸（消耗配额）
 *   cat-api <path> --json        机器可读输出
 *   cat-api --help               完整帮助
 *   cat-api --version            版本
 */

(function () {
  "use strict";

  var VERSION = "0.6.0";
  var SPEC = "https://lijinhongucl-pixel.github.io/cat-api-spec/spec/cat.html";

  /* ------------------------------------------------------------------
   * 资源表 —— 与 sdk/cat-api-client.js 同源。
   * 每条资源可以带多个候选响应，点击/调用时按权重轮转（不是纯随机，
   * 这样连点两次 POST /api/bath 能观察到不同状态，符合"系统有状态"的语义）。
   * ------------------------------------------------------------------ */
  var RESOURCES = [
    {
      method: "GET",
      path: "/api/v1/state",
      desc: "查询实例当前状态",
      note: "最常调用。返回状态、置信度、已持续时长、下次变更预估。",
      responses: [
        { w: 6, code: 200, body: { state: "SLEEP", confidence: 0.92, since: "03:14", next_change_eta: "47min" } },
        { w: 1, code: 200, body: { state: "LOAF", confidence: 0.88, since: "00:22", next_change_eta: "3h10min" } },
        { w: 1, code: 418, body: { error: "I'm a cat, not a server", state: "BOXED" } }
      ]
    },
    {
      method: "POST",
      path: "/api/v1/pet",
      desc: "抚摸请求（消耗配额）",
      note: "配额用尽返回 429；在纸箱里返回 403。连点会持续扣配额。",
      responses: [
        { w: 5, code: 200, body: { ok: true, purr: true, quota_remaining: 4 } },
        { w: 3, code: 429, body: { error: "Too Many Requests", quota_remaining: 0, reset_at: "次日 00:00" } },
        { w: 2, code: 403, body: { error: "Forbidden", reason: "BOXED" } }
      ]
    },
    {
      method: "POST",
      path: "/api/v1/treat",
      desc: "投喂零食",
      note: "406 表示口味不符——不是所有零食都被接受。",
      responses: [
        { w: 7, code: 200, body: { ok: true, ate: true, rer_cal: 233 } },
        { w: 3, code: 406, body: { error: "Not Acceptable", reason: "口味不符" } }
      ]
    },
    {
      method: "POST",
      path: "/api/v1/laser",
      desc: "激光点（启动狩猎序列）",
      note: "已在追激光时返回 409。用 DELETE 撤销。",
      responses: [
        { w: 7, code: 200, body: { ok: true, mode: "STALK", sequence_closed: false } },
        { w: 3, code: 409, body: { error: "Conflict", state: "LASER" } }
      ]
    },
    {
      method: "DELETE",
      path: "/api/v1/laser",
      desc: "撤销激光点",
      note: "系统进入困惑态——它不知道刚才那束光去哪了。",
      responses: [
        { w: 1, code: 204, body: { ok: true, state: "CONFUSED" } }
      ]
    },
    {
      method: "GET",
      path: "/api/v1/quota",
      desc: "查询今日剩余抚摸配额",
      note: "配额不公开的部分就在这里——但这个接口会告诉你。",
      responses: [
        { w: 1, code: 200, body: { pet_quota: 4, reset_at: "次日 00:00" } }
      ]
    },
    {
      method: "GET",
      path: "/api/v1/territory",
      desc: "查询领地三层协议",
      note: "核心区 / 家区 / 巡猎区。",
      responses: [
        { w: 1, code: 200, body: { core_zone: "occupied", home_zone: "patrolled", hunt_zone: "open" } }
      ]
    },
    {
      method: "POST",
      path: "/api/v1/vacuum",
      desc: "启动真空吸尘器",
      note: "无条件 FLEE。这个接口没有 200 分支。",
      responses: [
        { w: 1, code: 503, body: { error: "FLEE triggered", mode: "evacuate" } }
      ]
    },
    {
      method: "POST",
      path: "/api/v1/box",
      desc: "提供一个纸箱",
      note: "项目级 MUST。已在箱内返回 409。纸箱优先级高于所有官方外设。",
      responses: [
        { w: 6, code: 200, body: { ok: true, state: "BOXED", priority: "MUST" } },
        { w: 4, code: 409, body: { error: "Conflict", state: "BOXED" } }
      ]
    },
    {
      method: "PATCH",
      path: "/api/v1/schedule",
      desc: "尝试修改作息时间",
      note: "永远 405。作息是晨昏性的，不接受调优。",
      responses: [
        { w: 1, code: 405, body: { error: "Method Not Allowed", reason: "crepuscular_not_negotiable" } }
      ]
    },
    {
      method: "GET",
      path: "/api/v1/health",
      desc: "健康自检",
      note: "RER / DER / BCS / 呼噜频率。全部由 quantify 引擎实算。",
      responses: [
        { w: 1, code: 200, body: { ok: true, rer: 233, der: 280, bcs: 5, purr_freq: 25 } }
      ]
    },
    {
      method: "POST",
      path: "/api/v1/bath",
      desc: "洗澡请求",
      note: "彩蛋端点。态度按次数逐级恶化，跑不掉：418 → 406 → 503 → 503…",
      sequential: true,
      responses: [
        { code: 418, body: { error: "I'm a cat", attempt: 1, suggestions: ["放弃这个念头"] } },
        { code: 406, body: { error: "Not Acceptable", attempt: 2, hint: "它已经知道你要干什么了" } },
        { code: 503, body: { error: "FLEE", attempt: 3, hidden: true, hint: "它走了。你找不到它。" } }
      ]
    },
    {
      method: "POST",
      path: "/api/v1/territory/negotiate",
      desc: "与狗谈判领地（跨物种）",
      note: "猫特色端点。狗的社交信号对猫不是友好是兴奋，所以成功率很低。",
      responses: [
        { w: 4, code: 200, body: { ok: true, outcome: "standoff", detail: "弓背对峙 3 秒，双方各自后退一步", trust_delta: 0 } },
        { w: 3, code: 200, body: { ok: true, outcome: "ignore", detail: "侧身走开，假装没看见", trust_delta: 1 } },
        { w: 2, code: 200, body: { ok: true, outcome: "slow_blink", detail: "僵住 5 秒后缓慢眨眼三次——猫能给出的最高正面信号", trust_delta: 8 } },
        { w: 1, code: 409, body: { error: "Conflict", detail: "对方先扑了，猫已跳上高处", trust_delta: -5 } },
        { w: 1, code: 451, body: { error: "Unavailable For Legal Reasons", detail: "该端点仅在同一物理空间内可用。跨站串门请走 CrossPet 协议。", hint: "见 tools/crosspet.html" } }
      ]
    },
    {
      method: "GET",
      path: "/api/v1/crosspet/status",
      desc: "查询跨站串门状态",
      note: "猫特色端点。返回本站在 CrossPet 频道里的接入情况与访客计数。",
      responses: [
        { w: 1, code: 200, body: { channel: "crosspet-global", connected: false, mode: "demo", visitors_today: 0, pets_seen: ["cat"] } }
      ]
    }
  ];

  /* ---------- 状态：默认纯进程内，CAT_API_STATE=<path> 时可持久化 ----------
   * 默认不落盘：CLI 应当是零状态的，跑一次不影响下一次。
   * 但 bath 彩蛋需要跨进程看到态度恶化，所以留一个可选的会话文件。
   * 位置由环境变量指定，CLI 自己不决定往哪写。
   */
  var STATE_FILE = process.env.CAT_API_STATE || null;

  var state = {
    petQuota: 4,
    boxed: false,
    laserOn: false,
    bathAttempts: 0,
    callCount: 0
  };

  function loadState() {
    if (!STATE_FILE) return;
    try {
      var fs = require("fs");
      if (fs.existsSync(STATE_FILE)) {
        var raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        for (var k in raw) if (Object.prototype.hasOwnProperty.call(raw, k)) state[k] = raw[k];
      }
    } catch (e) { /* 读不了就用默认值，不报错 */ }
  }

  function saveState() {
    if (!STATE_FILE) return;
    try {
      var fs = require("fs");
      var path = require("path");
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) { /* 写不了就算了，不报错 */ }
  }

  /* ---------- 按权重挑一个响应 ---------- */
  function pick(responses) {
    var total = 0, i;
    for (i = 0; i < responses.length; i++) total += (responses[i].w || 1);
    var r = Math.random() * total;
    for (i = 0; i < responses.length; i++) {
      r -= (responses[i].w || 1);
      if (r <= 0) return responses[i];
    }
    return responses[0];
  }

  /* ---------- 状态机副作用：让连点产生可观察的变化 ---------- */
  function applyEffects(res) {
    var p = res.body || {};
    if (res.code === 200 && p.ok === true) {
      if (typeof p.quota_remaining === "number") state.petQuota = p.quota_remaining;
      if (p.state === "BOXED") state.boxed = true;
      if (p.mode === "STALK") state.laserOn = true;
      if (p.state === "CONFUSED") state.laserOn = false;
    }
    if (res.code === 429) state.petQuota = 0;
    if (res.code === 409 && p.state === "BOXED") state.boxed = true;
    if (res.code === 403 && p.reason === "BOXED") state.boxed = true;
  }

  function call(pathOrMethod) {
    var method = null, path = null;

    if (pathOrMethod) {
      var s = String(pathOrMethod).trim();
      // 支持 "POST /api/v1/pet" 或 "/api/v1/pet" 或 "bath"
      var m = s.match(/^(GET|POST|PATCH|DELETE|PUT)\s+(\/api\S+)$/i);
      if (m) {
        method = m[1].toUpperCase();
        path = m[2];
      } else if (s.charAt(0) === "/") {
        path = s;
      } else {
        // 短名：state / pet / treat / ...
        path = "/api/v1/" + s.replace(/^\/+/, "");
        // 处理 laser 短名需要区分 GET/DELETE
        method = (path === "/api/v1/laser" && state.laserOn) ? "DELETE" : null;
      }
    }

    var res = null;
    for (var i = 0; i < RESOURCES.length; i++) {
      var r = RESOURCES[i];
      if (path && r.path === path) {
        if (method && r.method !== method) continue;
        res = r;
        break;
      }
    }

    if (!res) {
      return {
        ok: false,
        error: "no_such_endpoint",
        detail: "没有这个端点。跑 `cat-api` 不带参数看全部接口。",
        tried: { method: method, path: path }
      };
    }

    // sequential 端点（bath）按调用次数递进，不随机
    var picked;
    if (res.sequential) {
      var idx = Math.min(state.bathAttempts, res.responses.length - 1);
      picked = res.responses[idx];
      state.bathAttempts++;
    } else {
      picked = pick(res.responses);
    }
    applyEffects(picked);
    state.callCount++;
    saveState();

    return {
      ok: true,
      request: { method: res.method, path: res.path },
      desc: res.desc,
      status: picked.code,
      note: res.note,
      body: picked.body,
      headers: {
        "X-Cat-State": (picked.body && picked.body.state) || "unknown",
        "X-Cat-Tail": "neutral",
        "X-Cat-Purr-Freq": "25Hz"
      },
      // 状态码分色，人读时一眼看出成功还是拒绝
      _tone: picked.code < 300 ? "ok" : (picked.code < 500 ? "warn" : "fail")
    };
  }

  /* ---------- 人类可读输出 ---------- */
  function human(res) {
    var L = [];
    if (!res.ok) {
      L.push("✗ " + res.error);
      if (res.detail) L.push("  " + res.detail);
      return L.join("\n");
    }
    var badge = res._tone === "ok" ? "✓" : (res._tone === "warn" ? "!" : "✗");
    L.push(badge + " " + res.request.method + " " + res.request.path + "  →  " + res.status);
    L.push("  " + res.desc);
    L.push("");
    L.push(indent(JSON.stringify(res.body, null, 2), 2));
    var hk = Object.keys(res.headers);
    if (hk.length) {
      L.push("");
      L.push("  headers:");
      hk.forEach(function (h) { L.push("    " + h + ": " + res.headers[h]); });
    }
    return L.join("\n");
  }

  function indent(str, n) {
    var pad = new Array(n + 1).join(" ");
    return str.split("\n").map(function (l) { return pad + l; }).join("\n");
  }

  /* ---------- 列表输出 ---------- */
  function list() {
    var L = [];
    L.push("");
    L.push("  CAT API — 猫咪接口规范   v" + VERSION);
    L.push("  " + SPEC);
    L.push("");
    L.push("  12 个端点。全部纯模拟，不发任何网络请求。");
    L.push("");
    var byMethod = {};
    RESOURCES.forEach(function (r) {
      (byMethod[r.method] = byMethod[r.method] || []).push(r);
    });
    ["GET", "POST", "PATCH", "DELETE"].forEach(function (m) {
      if (!byMethod[m]) return;
      L.push("  " + m);
      byMethod[m].forEach(function (r) {
        var short = r.path.replace("/api/v1/", "");
        L.push("    " + short.padEnd(14) + r.desc);
      });
      L.push("");
    });
    L.push("  用法");
    L.push("    cat-api <接口名>          调用，短名即可（state / pet / bath ...）");
    L.push("    cat-api <接口名> --json   机器可读输出，给 AI 用");
    L.push("    cat-api --help            完整说明");
    L.push("");
    L.push("  没有 Owner 角色。你是 Staff。");
    L.push("");
    return L.join("\n");
  }

  /* ---------- 帮助 ---------- */
  function help() {
    return [
      "",
      "  CAT API CLI  v" + VERSION,
      "  " + SPEC,
      "",
      "  用法",
      "    cat-api                    列出全部接口",
      "    cat-api <接口>             调用接口（短名或完整路径）",
      "    cat-api <METHOD> <路径>     带方法指定，如 'DELETE /api/v1/laser'",
      "",
      "  选项",
      "    --json                     输出 JSON（给 AI / 脚本读）",
      "    --state                    打印当前模拟状态（配额 / 纸箱 / 激光 / 洗澡次数）",
      "    --reset                    重置模拟状态",
      "    --version                  版本号",
      "    --help                     本页",
      "",
      "  环境变量",
      "    CAT_API_STATE=<path>    开启持久化，把模拟状态写到该文件。",
      "                              不设则纯进程内，退出即失（默认，零状态）。",
      "                              想看 bath 态度逐级恶化就需要它：",
      "                                export CAT_API_STATE=/tmp/cat.json",
      "                                cat-api bath   # 418",
      "                                cat-api bath   # 406",
      "                                cat-api bath   # 503，它走了",
      "                                cat-api --reset",
      "",
      "  接口一览",
      RESOURCES.map(function (r) {
        return "    " + (r.method + " " + r.path).padEnd(30) + r.desc;
      }).join("\n"),
      "",
      "  特色端点",
      "    POST /api/v1/bath      连点会看到态度逐级恶化：418 → 406 → 503",
      "    POST /api/v1/vacuum   无条件 503 FLEE，这个接口没有成功分支",
      "    PATCH /api/v1/schedule  永远 405，作息不接受调优",
      "    POST /api/v1/box       纸箱优先级 MUST，高于所有官方外设",
      "",
      "  退出码",
      "    0  2xx 成功",
      "    1  调用失败 / 端点不存在",
      "    2  4xx 被拒绝（这不是 bug，是设计）",
      "    3  5xx 系统不可用（比如 FLEE）",
      "",
      "  延伸阅读",
      "    正文        " + SPEC,
      "    工具页      https://lijinhongucl-pixel.github.io/cat-api-spec/",
      "    AI 接入     AGENTS.md · llms.txt",
      ""
    ].join("\n");
  }

  /* ---------- 主入口 ---------- */
  function main(argv) {
    var args = argv.slice(2);
    var asJson = false;
    var wantState = false;
    var wantReset = false;
    var positional = [];

    loadState();

    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === "--json" || a === "-j") asJson = true;
      else if (a === "--state") wantState = true;
      else if (a === "--reset") wantReset = true;
      else if (a === "--help" || a === "-h") { process.stdout.write(help()); return 0; }
      else if (a === "--version" || a === "-v" || a === "-V") {
        process.stdout.write(VERSION + "\n"); return 0;
      } else if (a.charAt(0) === "-" && a !== "-") {
        // 未知 flag：提示但不崩
        process.stderr.write("未知选项：" + a + "（跑 cat-api --help）\n");
      } else positional.push(a);
    }

    if (wantReset) {
      state.petQuota = 4; state.boxed = false; state.laserOn = false;
      state.bathAttempts = 0; state.callCount = 0;
      saveState();
      if (!positional.length) {
        process.stdout.write("模拟状态已重置。\n");
        return 0;
      }
    }

    if (wantState && !positional.length) {
      var st = {
        version: VERSION,
        persistent: !!STATE_FILE,
        state: {
          pet_quota: state.petQuota,
          boxed: state.boxed,
          laser_on: state.laserOn,
          bath_attempts: state.bathAttempts,
          calls_this_session: state.callCount
        }
      };
      if (asJson) process.stdout.write(JSON.stringify(st, null, 2) + "\n");
      else {
        process.stdout.write([
          "",
          "  当前模拟状态" + (STATE_FILE ? "（已持久化到 " + STATE_FILE + "）" : "（进程内，退出即失）"),
          "    抚摸配额    " + state.petQuota + " / 4",
          "    纸箱        " + (state.boxed ? "在箱内（BOXED）" : "不在箱内"),
          "    激光        " + (state.laserOn ? "已启动" : "未启动"),
          "    洗澡被拒    " + state.bathAttempts + " 次",
          "    累计调用    " + state.callCount + " 次",
          ""
        ].join("\n"));
      }
      return 0;
    }

    if (!positional.length) {
      process.stdout.write(list());
      return 0;
    }

    // 支持 'DELETE /api/v1/laser' 这种两段式，也支持 'delete laser'
    var target;
    if (positional.length >= 2) {
      target = positional[0].toUpperCase() + " " + positional[1];
    } else {
      target = positional[0];
    }

    var res = call(target);

    if (asJson) {
      process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    } else {
      process.stdout.write(human(res) + "\n");
    }

    if (!res.ok) return 1;
    if (res.status >= 500) return 3;
    if (res.status >= 400) return 2;
    return 0;
  }

  /* ---------- 导出（供测试与 skill 复用） ---------- */
  var api = {
    RESOURCES: RESOURCES,
    call: call,
    list: list,
    help: help,
    state: state,
    version: VERSION
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (require.main === module) {
    var code;
    try { code = main(process.argv); }
    catch (err) {
      process.stderr.write("内部错误：" + (err && err.message ? err.message : String(err)) + "\n");
      code = 1;
    }
    process.exit(code);
  }
})();

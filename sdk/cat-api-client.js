/*!
 * CAT API SDK —— cat-api-client.js
 * ---------------------------------------------------------------------------
 * 一个纯模拟的接口调用器。点击即「调用」，返回模拟响应。
 * 不发起任何网络请求，不收集任何数据，也不会真的去铲屎。
 *
 * 资源表与命令行实现同源（skill/cat-api.js）：
 * 两边都从 /api/v1 起步，方法、路径、状态码、话术逐条对应。
 * 改了一边，另一边必须同步——判据是本文件末尾的 selfCheck()。
 */
(function (root) {
  "use strict";

  var RESOURCES = [
    {
      method: "GET", path: "/api/v1/state",
      desc: "查询实例当前状态",
      note: "最常调用。返回状态、置信度、已持续时长、下次变更预估。",
      responses: [
        { w: 6, code: 200, body: { state: "SLEEP", confidence: 0.92, since: "03:14", next_change_eta: "47min" } },
        { w: 1, code: 200, body: { state: "LOAF", confidence: 0.88, since: "00:22", next_change_eta: "3h10min" } },
        { w: 1, code: 418, body: { error: "I'm a cat, not a server", state: "BOXED" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/pet",
      desc: "抚摸请求（消耗配额）",
      note: "配额用尽返回 429；在纸箱里返回 403。连点会持续扣配额。",
      responses: [
        { w: 5, code: 200, body: { ok: true, purr: true, quota_remaining: 4 } },
        { w: 3, code: 429, body: { error: "Too Many Requests", quota_remaining: 0, reset_at: "次日 00:00" } },
        { w: 2, code: 403, body: { error: "Forbidden", reason: "BOXED" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/treat",
      desc: "投喂零食",
      note: "406 表示口味不符——不是所有零食都被接受。",
      responses: [
        { w: 7, code: 200, body: { ok: true, ate: true, rer_cal: 233 } },
        { w: 3, code: 406, body: { error: "Not Acceptable", reason: "口味不符" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/laser",
      desc: "激光点（启动狩猎序列）",
      note: "已在追激光时返回 409。用 DELETE 撤销。",
      responses: [
        { w: 7, code: 200, body: { ok: true, mode: "STALK", sequence_closed: false } },
        { w: 3, code: 409, body: { error: "Conflict", state: "LASER" } }
      ]
    },
    {
      method: "DELETE", path: "/api/v1/laser",
      desc: "撤销激光点",
      note: "系统进入困惑态——它不知道刚才那束光去哪了。",
      responses: [
        { w: 1, code: 204, body: { ok: true, state: "CONFUSED" } }
      ]
    },
    {
      method: "GET", path: "/api/v1/quota",
      desc: "查询今日剩余抚摸配额",
      note: "配额不公开的部分就在这里——但这个接口会告诉你。",
      responses: [
        { w: 1, code: 200, body: { pet_quota: 4, reset_at: "次日 00:00" } }
      ]
    },
    {
      method: "GET", path: "/api/v1/territory",
      desc: "查询领地三层协议",
      note: "核心区 / 家区 / 巡猎区。",
      responses: [
        { w: 1, code: 200, body: { core_zone: "occupied", home_zone: "patrolled", hunt_zone: "open" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/vacuum",
      desc: "启动真空吸尘器",
      note: "无条件 FLEE。这个接口没有 200 分支。",
      responses: [
        { w: 1, code: 503, body: { error: "FLEE triggered", mode: "evacuate" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/box",
      desc: "提供一个纸箱",
      note: "项目级 MUST。已在箱内返回 409。纸箱优先级高于所有官方外设。",
      responses: [
        { w: 6, code: 200, body: { ok: true, state: "BOXED", priority: "MUST" } },
        { w: 4, code: 409, body: { error: "Conflict", state: "BOXED" } }
      ]
    },
    {
      method: "PATCH", path: "/api/v1/schedule",
      desc: "尝试修改作息时间",
      note: "永远 405。作息是晨昏性的，不接受调优。",
      responses: [
        { w: 1, code: 405, body: { error: "Method Not Allowed", reason: "crepuscular_not_negotiable" } }
      ]
    },
    {
      method: "GET", path: "/api/v1/health",
      desc: "健康自检",
      note: "RER / DER / BCS / 呼噜频率。全部由 quantify 引擎实算。",
      responses: [
        { w: 1, code: 200, body: { ok: true, rer: 233, der: 280, bcs: 5, purr_freq: 25 } }
      ]
    },
    {
      method: "POST", path: "/api/v1/bath",
      desc: "洗澡请求",
      note: "彩蛋端点。态度按次数逐级恶化，跑不掉：418 → 406 → 503。",
      sequential: true,
      responses: [
        { code: 418, body: { error: "I'm a cat", attempt: 1, suggestions: ["放弃这个念头"] } },
        { code: 406, body: { error: "Not Acceptable", attempt: 2, hint: "它已经知道你要干什么了" } },
        { code: 503, body: { error: "FLEE", attempt: 3, hidden: true, hint: "它走了。你找不到它。" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/territory/negotiate",
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
      method: "GET", path: "/api/v1/crosspet/status",
      desc: "查询跨站串门状态",
      note: "猫特色端点。返回本站在 CrossPet 频道里的接入情况与访客计数。",
      responses: [
        { w: 1, code: 200, body: { channel: "crosspet-global", connected: false, mode: "demo", visitors_today: 0, pets_seen: ["cat"] } }
      ]
    }
  ];

  /* ---------- 进程内状态（跨调用保持，跟 CLI 同语义） ---------- */
  var state = {
    petQuota: 4,
    boxed: false,
    laserOn: false,
    bathAttempts: 0,
    callCount: 0
  };

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

  function call(resource, callback) {
    var chosen;
    if (resource.sequential) {
      var idx = Math.min(state.bathAttempts, resource.responses.length - 1);
      chosen = resource.responses[idx];
      state.bathAttempts++;
    } else {
      chosen = pick(resource.responses);
    }
    applyEffects(chosen);
    state.callCount++;

    setTimeout(function () {
      callback(null, {
        status: chosen.code,
        note: resource.note || "",
        body: chosen.body,
        headers: {
          "X-Cat-State": (chosen.body && chosen.body.state) || "unknown",
          "X-Cat-Tail": "neutral",
          "X-Cat-Purr-Freq": "25Hz"
        },
        time: new Date().toISOString(),
        seq: state.callCount
      });
    }, 180 + Math.random() * 260);
  }

  /* ---------- 自检：浏览器端与 CLI 同源，判据是这份表 ---------- */
  function selfCheck() {
    var out = [], pass = 0, fail = 0;
    function t(name, ok) {
      if (ok) { pass++; out.push({ ok: true, name: name }); }
      else { fail++; out.push({ ok: false, name: name }); }
    }

    t('端点数 14', RESOURCES.length === 14);
    t('路径全部 /api/v1 起步', RESOURCES.every(function (r) { return r.path.indexOf('/api/v1/') === 0; }));
    t('方法合法', RESOURCES.every(function (r) {
      return ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'].indexOf(r.method) >= 0;
    }));
    t('每条都有 desc', RESOURCES.every(function (r) { return !!r.desc; }));
    t('每条都有 note', RESOURCES.every(function (r) { return !!r.note; }));
    t('每条都有 responses', RESOURCES.every(function (r) { return r.responses && r.responses.length; }));
    t('方法+路径不重复', (function () {
      var seen = {}, dup = false;
      RESOURCES.forEach(function (r) {
        var k = r.method + ' ' + r.path;
        if (seen[k]) dup = true;
        seen[k] = 1;
      });
      return !dup;
    })());
    t('响应码都是合法 HTTP 码', RESOURCES.every(function (r) {
      return r.responses.every(function (x) { return x.code >= 100 && x.code < 600; });
    }));
    t('bath 是 sequential 三级', (function () {
      var b = RESOURCES.filter(function (r) { return r.path === '/api/v1/bath'; })[0];
      return b && b.sequential === true && b.responses.length === 3;
    })());
    t('vacuum 无 200 分支', (function () {
      var v = RESOURCES.filter(function (r) { return r.path === '/api/v1/vacuum'; })[0];
      return v && !v.responses.some(function (x) { return x.code === 200; });
    })());
    t('schedule 只有 405', (function () {
      var s = RESOURCES.filter(function (r) { return r.path === '/api/v1/schedule'; })[0];
      return s && s.responses.every(function (x) { return x.code === 405; });
    })());
    t('权重和为正', RESOURCES.every(function (r) {
      if (r.sequential) return true;
      var sum = 0;
      r.responses.forEach(function (x) { sum += (x.w || 1); });
      return sum > 0;
    }));
    t('负权重不存在', RESOURCES.every(function (r) {
      return r.responses.every(function (x) { return (x.w === undefined) || x.w >= 0; });
    }));

    return { pass: pass, fail: fail, total: pass + fail, items: out };
  }

  function reset() {
    state.petQuota = 4; state.boxed = false; state.laserOn = false;
    state.bathAttempts = 0; state.callCount = 0;
  }

  var api = {
    RESOURCES: RESOURCES,
    call: call,
    state: state,
    reset: reset,
    selfCheck: selfCheck,
    version: "0.5.1"
  };

  root.CatAPIClient = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);

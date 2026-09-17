/*!
 * CAT API SDK —— cat-api-client.js
 * ---------------------------------------------------------------------------
 * 一个纯模拟的接口调用器。点击即"调用"，返回模拟响应。
 * 不发起任何网络请求，不收集任何数据，也不会真的去铲屎。
 */
(function (root) {
  "use strict";

  var RESOURCES = [
    {
      method: "GET", path: "/api/v1/state",
      desc: "查询实例当前状态",
      statuses: [
        { code: 200, note: "正常返回", body: { state: "SLEEP", confidence: 0.92, since: "03:14", next_change_eta: "47min" } },
        { code: 418, note: "I'm a cat（实例拒绝被查询）", body: { error: "I'm a cat, not a server", state: "BOXED" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/pet",
      desc: "抚摸请求（消耗配额）",
      statuses: [
        { code: 200, note: "请求被接受", body: { ok: true, purr: true, quota_remaining: 4 } },
        { code: 429, note: "今日配额已用完", body: { error: "Too Many Requests", quota_remaining: 0, reset_at: "次日 00:00" } },
        { code: 403, note: "系统在纸箱中，输入被拒绝", body: { error: "Forbidden", reason: "BOXED" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/treat",
      desc: "投喂零食",
      statuses: [
        { code: 200, note: "通讯正常", body: { ok: true, ate: true, rer_cal: 233 } },
        { code: 406, note: "Not Acceptable（这个东西不行）", body: { error: "Not Acceptable", reason: "口味不符" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/laser",
      desc: "激光点（启动狩猎序列）",
      statuses: [
        { code: 200, note: "狩猎序列已启动", body: { ok: true, mode: "STALK", sequence_closed: false } },
        { code: 409, note: "Conflict（已在追激光）", body: { error: "Conflict", state: "LASER" } }
      ]
    },
    {
      method: "DELETE", path: "/api/v1/laser",
      desc: "撤销激光点",
      statuses: [
        { code: 204, note: "已撤销（系统进入困惑态）", body: { ok: true, state: "CONFUSED" } }
      ]
    },
    {
      method: "GET", path: "/api/v1/quota",
      desc: "查询今日剩余配额",
      statuses: [
        { code: 200, note: "正常返回", body: { pet_quota: 4, reset_at: "次日 00:00" } }
      ]
    },
    {
      method: "GET", path: "/api/v1/territory",
      desc: "查询领地三层协议",
      statuses: [
        { code: 200, note: "正常返回", body: { core_zone: "occupied", home_zone: "patrolled", hunt_zone: "open" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/vacuum",
      desc: "启动真空吸尘器",
      statuses: [
        { code: 503, note: "Service Unavailable（无条件 FLEE）", body: { error: "FLEE triggered", mode: " evacuate" } }
      ]
    },
    {
      method: "POST", path: "/api/v1/box",
      desc: "提供一个纸箱",
      statuses: [
        { code: 200, note: "MUST 满足", body: { ok: true, state: "BOXED", priority: "MUST" } },
        { code: 409, note: "Conflict（已在纸箱内）", body: { error: "Conflict", state: "BOXED" } }
      ]
    },
    {
      method: "PATCH", path: "/api/v1/schedule",
      desc: "尝试修改作息时间",
      statuses: [
        { code: 405, note: "Method Not Allowed（作息不接受调优）", body: { error: "Method Not Allowed", reason: "crepuscular_not_negotiable" } }
      ]
    },
    {
      method: "GET", path: "/api/v1/health",
      desc: "健康自检",
      statuses: [
        { code: 200, note: "一切正常", body: { ok: true, rer: 233, der: 280, bcs: 5, purr_freq: 25 } }
      ]
    },
    {
      method: "POST", path: "/api/v1/bath",
      desc: "洗澡请求",
      statuses: [
        { code: 418, note: "I'm a cat（请求被反复拒绝）", body: { error: "I'm a cat", suggestions: ["放弃这个念头"] } },
        { code: 406, note: "Not Acceptable（再次拒绝）", body: { error: "Not Acceptable", attempts_remaining: -1 } },
        { code: 503, note: "Service Unavailable（系统已离开）", body: { error: "FLEE", hidden: true } }
      ]
    }
  ];

  function call(resource, callback) {
    setTimeout(function () {
      var pick = resource.statuses[Math.floor(Math.random() * resource.statuses.length)];
      callback(null, {
        status: pick.code,
        note: pick.note,
        body: pick.body,
        headers: {
          "X-Cat-State": pick.body.state || "unknown",
          "X-Cat-Tail": "neutral",
          "X-Cat-Purr-Freq": "25Hz"
        },
        time: new Date().toISOString()
      });
    }, 280 + Math.random() * 350);
  }

  root.CatAPIClient = {
    RESOURCES: RESOURCES,
    call: call
  };
})(typeof self !== "undefined" ? self : this);

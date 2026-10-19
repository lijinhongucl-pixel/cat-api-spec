/*!
 * CAT RUNTIME · schedule-worker.js
 * 在 Web Worker 里跑整日引擎模拟，不阻塞页面。
 * 输入：{ id, dateKey }   输出：{ id, dateKey, hours }
 * hours 是长度 24 的数组，每项为 { 行为ID: 毫秒数 }。
 */
importScripts("../../runtime/src/core/engine.js");

self.onmessage = function (e) {
  var msg = e.data || {};
  var E = self.CatEngine;
  var dateKey = msg.dateKey;
  var base = new Date(dateKey + "T00:00:00").getTime();
  var now = base;
  var eng = E.create({ seed: 20261018, clock: function () { return now; } });
  var STEP = 2000;
  var hours = [];
  for (var h = 0; h < 24; h++) hours.push({});
  var steps = (24 * 3600 * 1000) / STEP;
  for (var n = 0; n < steps; n++) {
    now = base + n * STEP;
    eng.tick(STEP);
    var hour = new Date(now).getHours();
    var b = eng.snapshot(false).behavior;
    hours[hour][b] = (hours[hour][b] || 0) + STEP;
  }
  self.postMessage({ id: msg.id, dateKey: dateKey, hours: hours });
};

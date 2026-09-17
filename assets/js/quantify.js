/*!
 * CAT API 量化引擎 — quantify.js
 * ---------------------------------------------------------------------------
 * 实现 §13 定义的派生指标与评分模型。
 * 所有公式有出处等级标注：A 同行评议/大规模实测，B 临床指南，C 本项目复合。
 *
 * 零依赖，浏览器（window.CatQuantify）与 Node（require）双用。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CatQuantify = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- 静息能量需求 RER（A 级 · 全品种通用）---------- */
  // 来源：AAHA Nutritional Assessment Guidelines 2014 / FEDIAF 2021
  // 公式：RER = 70 × W^0.75（W 单位 kg）
  function rer(weight) {
    var w = Math.max(0.5, Math.min(20, Number(weight) || 0));
    return Math.round(70 * Math.pow(w, 0.75));
  }

  /* ---------- 每日能量需求 DER（B 级 · 系数取决于生活阶段/活动/目标）---------- */
  // 来源：FEDIAF Nutritional Guidelines 2021
  var DER_FACTORS = {
    "kitten":   2.5,   // < 1 岁
    "adult":    1.2,   // 1-7 岁，绝育室内
    "intact":   1.4,   // 未绝育成年
    "active":   1.6,   // 活跃 / 室外
    "senior":   1.1,   // > 7 岁
    "weightloss": 0.8, // 减重目标
    "lactating": 2.5   // 哺乳期
  };
  function der(weight, factor) {
    var f = DER_FACTORS[factor] || DER_FACTORS.adult;
    return Math.round(rer(weight) * f);
  }

  /* ---------- 每日饮水量（B 级 · 粗排）---------- */
  // 来源：Sparkes 2011 — 约 40-60 ml/kg/天
  function dailyWater(weight) {
    var w = Number(weight) || 0;
    return {
      low: Math.round(w * 0.040 * 1000),
      high: Math.round(w * 0.060 * 1000)
    };
  }

  /* ---------- 每日行为预算（C 级 · 本项目定义）---------- */
  // 24 小时分配（来源：spec §5）
  var BUDGET = {
    sleep:      60, // 50-70% 日均睡眠
    groom:      8,  // 醒着的 15-30% 用于理毛
    patrol:     5,  // 巡视
    play:       4,  // 狩猎模拟 + 游戏
    eat:        2,  // 进食（含狩猎）
    rest:       18, // 静息观察
    creep:      3   // crepuscular 晨昏活跃
  };

  /* ---------- DNS — Daily Needs Score（C 级 · 五维度）---------- */
  // 五维：睡眠 / 嗅闻 / 狩猎模拟 / 互动 / 独处空间
  // 各维 0-10 分，总分加权后映射到 0-100
  function dns(activity) {
    var sleep = clamp((activity.sleepHours / 16) * 10, 0, 10);
    var sniff = clamp((activity.sniffMin / 30) * 10, 0, 10);
    var hunt = clamp((activity.playMin / 30) * 10, 0, 10);
    var social = clamp((activity.interactMin / 20) * 10, 0, 10);
    var alone = activity.hasSafeSpace ? 10 : 3;
    var raw = (sleep * 0.25 + sniff * 0.15 + hunt * 0.25 + social * 0.15 + alone * 0.20);
    return {
      sleep: round(sleep), sniff: round(sniff), hunt: round(hunt),
      social: round(social), alone: round(alone),
      total: round(raw * 10),
      grade: raw >= 8 ? "A" : raw >= 6 ? "B" : raw >= 4 ? "C" : "D"
    };
  }

  /* ---------- 热风险指数 HRI（B 级 · 基于气温+湿度+被毛）---------- */
  // 喘气散热只对狗有效，猫主要靠蒸发散热，效率更低
  // 参照：Hinwood 1994; 兽医急诊手册
  function hri(tempC, humidity, coat) {
    var score = 0;
    if (tempC >= 38) score += 4;
    else if (tempC >= 32) score += 3;
    else if (tempC >= 28) score += 2;
    else if (tempC >= 24) score += 1;
    if (humidity >= 75) score += 2;
    else if (humidity >= 60) score += 1;
    if (coat === "long") score += 1;
    if (coat === "hairless") score -= 1;
    var level = score >= 6 ? "P0" : score >= 4 ? "P1" : score >= 2 ? "P2" : "P3";
    return { score: score, level: level,
      advice: heatAdvice(score) };
  }
  function heatAdvice(score) {
    if (score >= 6) return "极高风险。立即提供冰垫 + 通风，观察是否张口呼吸。";
    if (score >= 4) return "高风险。限制活动，确保阴凉处水源，禁激烈游戏。";
    if (score >= 2) return "中等。注意通风，保持常温水源即可。";
    return "舒适区间。";
  }

  /* ---------- 就诊应激指数 VSI（C 级）---------- */
  // 因子：车程、既往负经历、基线焦虑、信息素、嘴套预适应、空腹强化、避开候诊
  function vsi(visit) {
    var score = 30; // 基线 30
    score += Math.min(visit.travelMin / 3, 15);
    if (visit.negativeExp) score += 18;
    if (visit.anxiety) score += 12;
    if (visit.ownerStress) score += 8;
    if (visit.pheromone) score -= 10;
    if (visit.muzzleTrain) score -= 12;
    if (visit.happyVisit) score -= 15;
    if (visit.fastSwap) score -= 8;
    if (visit.carWait) score -= 5;
    score = clamp(score, 5, 100);
    return {
      score: Math.round(score),
      level: score >= 70 ? "P1" : score >= 45 ? "P2" : "P3",
      advice: stressAdvice(score)
    };
  }
  function stressAdvice(score) {
    if (score >= 70) return "应激高危。建议预约专门诊室或上门服务。";
    if (score >= 45) return "中等应激。提前 30 分钟使用信息素 + 遮光猫包。";
    return "低应激。常规预约即可。";
  }

  /* ---------- 分诊 triage（B 级 · AAHA 2020）---------- */
  var PO_SIGNS = [
    "张口呼吸", "牙龈苍白或发绀", "剧烈呕吐 > 3 次", "无法排尿（公猫紧急）",
    "体温 > 41.1°C 或 < 35°C", "惊厥", "大出血"
  ];
  var P1_SIGNS = [
    "持续呕吐 24 小时", "食欲废绝 > 48 小时", "腹泻带血", "跛行 > 24 小时",
    "饮水量骤增或骤减", "呼噜模式异常（非舒适时持续呼噜）"
  ];

  /* ---------- 免疫排程（B 级 · AAHA Feline Vaccination Guidelines 2020）---------- */
  function immunization(ageMonths, indoor) {
    var core = [], nonCore = [];
    if (ageMonths < 2) {
      core.push({ name: "FVRCP", note: "8 周首针", due: "P3" });
    } else if (ageMonths < 4) {
      core.push({ name: "FVRCP ×2", note: "间隔 3-4 周", due: "P3" });
      core.push({ name: "Rabies", note: "12-16 周首针", due: "P3" });
    } else if (ageMonths < 12) {
      core.push({ name: "FVRCP 加强", note: "完成最后一针 1 年后", due: "P3" });
      core.push({ name: "Rabies 加强", note: "1 年后", due: "P3" });
    } else {
      core.push({ name: "FVRCP", note: "每 3 年", due: "P3" });
      core.push({ name: "Rabies", note: "每 1-3 年（按法规）", due: "P3" });
    }
    if (!indoor) {
      nonCore.push({ name: "FeLV", note: "外出 / 多猫 / 接触流浪", due: "P2" });
    }
    return { core: core, nonCore: nonCore };
  }

  /* ---------- 寄生虫预防（C 级 · 取决于环境）---------- */
  function parasite(indoor, monthlyHeartworm) {
    var items = [];
    items.push({ name: "跳蚤预防", freq: indoor ? "春夏季每月" : "全年每月", due: "P3" });
    if (!indoor || monthlyHeartworm) {
      items.push({ name: "心丝虫预防", freq: "全年每月", due: "P2" });
    }
    items.push({ name: "体内驱虫", freq: indoor ? "半年一次" : "每季度一次", due: "P3" });
    return items;
  }

  /* ---------- 综合评估 ---------- */
  function evaluate(input) {
    var r = rer(input.weight);
    var d = der(input.weight, input.factor);
    var water = dailyWater(input.weight);
    var dnsRes = dns(input.activity);
    var hriRes = hri(input.env.temp, input.env.humidity, input.env.coat);
    var vsiRes = vsi(input.visit);
    var imm = immunization(input.ageMonths, input.indoor);
    var para = parasite(input.indoor, input.monthlyHeartworm);

    return {
      rer: r,
      der: d,
      waterLow: water.low,
      waterHigh: water.high,
      budget: BUDGET,
      dns: dnsRes,
      hri: hriRes,
      vsi: vsiRes,
      immunization: imm,
      parasite: para
    };
  }

  /* ---------- 辅助 ---------- */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round(v, d) { d = d || 1; var m = Math.pow(10, d); return Math.round(v * m) / m; }

  return {
    RER: rer, DER: der, dailyWater: dailyWater,
    BUDGET: BUDGET, DER_FACTORS: DER_FACTORS,
    dns: dns, hri: hri, vsi: vsi,
    immunization: immunization, parasite: parasite,
    PO_SIGNS: PO_SIGNS, P1_SIGNS: P1_SIGNS,
    evaluate: evaluate
  };
});

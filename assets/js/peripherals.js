/* ============================================================
   CAT API — 外设总线引擎 PERIPHERAL BUS v1
   14 类外设 · 13 道门槛 · 序列闭合检查 · 纸箱优先级 MUST
   ============================================================ */

(function (global) {
  "use strict";

  /* ---------- 外设类别（按狩猎序列阶段分类，不按材质） ---------- */
  var CLASSES = [
    { code: "WAND",    name: "逗猫棒",    stage: "STALK",    role: "逗猎型",    huntWeight: 0.25, note: "模拟飞行猎物的轨迹，触发 STALK→POUNCE" },
    { code: "LASER",   name: "激光笔",    stage: "STALK",    role: "逗猎型",    huntWeight: 0.20, note: "完美触发追猎序列，但没有 KILL BITE 对象。长期使用会导致序列永不闭合" },
    { code: "BALL",    name: "滚球/电动球", stage: "STALK",   role: "逗猎型",    huntWeight: 0.15, note: "随机运动轨迹触发追猎驱动。有实物可完成 KILL BITE" },
    { code: "MOUSE",   name: "仿真鼠",    stage: "POUNCE",   role: "模拟猎物型", huntWeight: 0.20, note: "毛发质感+尺寸接近天然猎物，可完成 KILL BITE→CONSUME（模拟）" },
    { code: "FEATHER", name: "羽毛玩具",  stage: "POUNCE",   role: "模拟猎物型", huntWeight: 0.18, note: "触发鸟类猎物的捕获序列。含小零件误吞风险" },
    { code: "TUNNEL",  name: "猫隧道",    stage: "AMBUSH",   role: "潜伏等候型", huntWeight: 0.10, note: "模拟草丛/洞穴伏击位。满足 AMBUSH 阶段的隐蔽需求" },
    { code: "TREE",    name: "猫爬架",    stage: "AMBUSH",   role: "潜伏等候型", huntWeight: 0.08, note: "高处监视位。满足领地三层中的核心区扩展需求" },
    { code: "BOX",     name: "纸箱",      stage: "REST",     role: "封闭态载体", huntWeight: 0.05, note: "项目级 MUST：优先级高于所有官方外设。实测有效率 97%" },
    { code: "SCRATCH", name: "抓板/猫柱", stage: "MARK",     role: "信息素注入型", huntWeight: 0.05, note: "承接爪间腺体标记行为。不是磨爪，是写入领地声明" },
    { code: "NIP",     name: "猫薄荷玩具", stage: "DRIVE",   role: "驱动级外设",  huntWeight: 0.03, note: "50-70% 实例有反应。反应期 5-15 分钟，耐受期 1-2 小时" },
    { code: "VALERIAN",name: "缬草玩具",  stage: "DRIVE",   role: "驱动级外设",  huntWeight: 0.03, note: "对猫薄荷无反应的实例可能对缬草有反应" },
    { code: "PUZZLE",  name: "益智喂食器", stage: "COGNITIVE",role: "认知型",     huntWeight: 0.08, note: "模拟野生进食模式（一天8-12次小餐）。降低呕吐频率" },
    { code: "WATER",   name: "流动饮水机", stage: "MAINTAIN", role: "生存保障型", huntWeight: 0.02, note: "流动水源摄入量高于静水碗。降低泌尿结石发生率" },
    { code: "BED",     name: "猫窝/吊床", stage: "REST",     role: "静态陪伴型",  huntWeight: 0.03, note: "核心区睡眠点的正式载体。优先级低于纸箱" }
  ];

  /* ---------- 门槛定义 ---------- */
  var GATES = [
    { id: "G01", name: "尺寸安全",      rule: "最小外径 ≥ 3cm（或整体无法吞入）",   grade: "A", fail: "choke_hazard",      severity: "P0" },
    { id: "G02", name: "无松散小件",    rule: "无眼睛、鼻子、铃铛等可咬掉吞入的零件", grade: "A", fail: "small_parts",       severity: "P0" },
    { id: "G03", name: "绳索安全",      rule: "无绕颈风险，绳长 ≤ 15cm 或可断裂",   grade: "A", fail: "strangulation",     severity: "P0" },
    { id: "G04", name: "边缘光滑",      rule: "无尖锐边缘、无已出现的尖点",         grade: "B", fail: "sharp_edge",        severity: "P1" },
    { id: "G05", name: "材料无毒",      rule: "无毒塑料、天然纤维、食品级硅胶",     grade: "A", fail: "toxic_material",    severity: "P0" },
    { id: "G06", name: "电池封闭",      rule: "电池仓螺丝密封、不可被爪子打开",     grade: "A", fail: "battery_exposed",   severity: "P0" },
    { id: "G07", name: "激光笔闭合",    rule: "激光追逐必须以实物 KILL BITE 收尾",   grade: "C", fail: "unclosed_hunt",    severity: "P2" },
    { id: "G08", name: "猫薄荷配额",    rule: "单次 ≤ 15 分钟，间隔 ≥ 2 小时",      grade: "B", fail: "nip_overdose",     severity: "P2" },
    { id: "G09", name: "逗猎时长",      rule: "单次逗猎 ≤ 15 分钟，避免过度兴奋",   grade: "B", fail: "overstimulation",   severity: "P1" },
    { id: "G10", name: "羽毛件检查",    rule: "羽毛玩具含可吞入的硬质零件",         grade: "A", fail: "feather_ingestion", severity: "P0" },
    { id: "G11", name: "高处防跌",      rule: "猫爬架高度 ≥ 1m 时需稳定底座",       grade: "B", fail: "fall_risk",        severity: "P1" },
    { id: "G12", name: "饮水机清洁",    rule: "滤芯每 2-4 周更换，防止细菌滋生",    grade: "B", fail: "water_contamination",severity: "P1" },
    { id: "G13", name: "纸箱优先级",    rule: "纸箱 MUST 优先于所有官方外设",       grade: "C", fail: "box_override",     severity: "HEURISTIC" }
  ];

  /* ---------- 序列阶段 ---------- */
  var SEQUENCE = ["STALK", "AMBUSH", "POUNCE", "KILL_BITE", "CONSUME"];

  /* ---------- 失效模式 ---------- */
  var FAILURE_MODES = [
    { code: "choke_hazard",       name: "窒息风险",      cause: "外设整体或碎片可被吞入并阻塞气道" },
    { code: "small_parts",        name: "小件脱落",      cause: "眼睛、鼻子、铃铛等粘合件被咬掉" },
    { code: "strangulation",      name: "绕颈风险",      cause: "绳状结构缠绕颈部不可自行脱开" },
    { code: "sharp_edge",         name: "尖锐边缘",      cause: "塑料碎裂或金属丝外露" },
    { code: "toxic_material",     name: "材料毒性",      cause: "含邻苯二甲酸酯、BPA、铅等" },
    { code: "battery_exposed",    name: "电池外露",      cause: "电池仓被爪子打开，电池被吞入" },
    { code: "unclosed_hunt",      name: "狩猎序列不闭合", cause: "激光笔长期使用，KILL BITE 无对象" },
    { code: "nip_overdose",       name: "猫薄荷过量",    cause: "单次超过 15 分钟或间隔不足 2 小时" },
    { code: "overstimulation",    name: "过度兴奋",      cause: "逗猎超过 15 分钟，系统无法降温" },
    { code: "feather_ingestion",  name: "羽毛误吞",      cause: "羽毛玩具的金属丝或硬质底座被吞入" },
    { code: "fall_risk",          name: "高处跌落",      cause: "猫爬架不稳定或高度超过能力" },
    { code: "water_contamination",name: "水源污染",      cause: "饮水机滤芯未按周期更换" },
    { code: "box_override",       name: "纸箱冲突",      cause: "Staff 试图将系统从纸箱中取出" }
  ];

  /* ---------- 猫薄荷反应基因 ---------- */
  // 约 50-70% 的实例有反应（常染色体显性）

  /* ---------- 核心：评估外设清单 ---------- */
  function evaluate(profile, env, peripherals) {
    var weight = profile.weight || 4.5;       // kg
    var ageMonths = profile.ageMonths || 36;
    var isKitten = ageMonths < 12;
    var isSenior = ageMonths > 120;
    var activityLevel = profile.activityLevel || 3; // 1-5
    var huntDrive = profile.huntDrive || 3;         // 1-5
    var nipReactive = profile.nipReactive !== false; // ~60% 默认有反应
    var catCount = profile.catCount || 1;

    // 计算每日狩猎序列闭合情况
    var stagesCovered = { STALK: 0, AMBUSH: 0, POUNCE: 0, KILL_BITE: 0, CONSUME: 0 };
    var totalHuntScore = 0;
    var laserMinutes = 0;
    var wandMinutes = 0;
    var nipMinutes = 0;
    var hasBox = false;
    var hasScratch = false;
    var hasWater = false;
    var gates = []; // 逐设备门槛判定
    var failures = [];

    peripherals.forEach(function (d, i) {
      var c = cls(d.cls);
      if (!c) return;

      // 计算狩猎贡献
      var huntScore = c.huntWeight * d.sessions * Math.sqrt(d.minutes / 10);
      totalHuntScore += huntScore;

      // 序列阶段覆盖
      if (c.stage === "STALK")    stagesCovered.STALK += huntScore;
      if (c.stage === "AMBUSH")   stagesCovered.AMBUSH += huntScore;
      if (c.stage === "POUNCE")   stagesCovered.POUNCE += huntScore;

      // 特殊阶段标记
      if (d.cls === "MOUSE" || d.cls === "BALL" || d.cls === "FEATHER") {
        stagesCovered.KILL_BITE += huntScore * 0.8;
        stagesCovered.CONSUME += huntScore * 0.3;
      }

      // 纸箱检测
      if (d.cls === "BOX") hasBox = true;

      // 抓板
      if (d.cls === "SCRATCH") hasScratch = true;

      // 饮水机
      if (d.cls === "WATER") hasWater = true;

      // 激光笔特殊处理
      if (d.cls === "LASER") {
        laserMinutes += d.minutes * d.sessions;
        if (!d.killObject) {
          failures.push({ device: i, gate: "G07", mode: "unclosed_hunt", severity: "P2",
            msg: "激光笔使用未以实物 KILL BITE 收尾。狩猎序列永不闭合，长期使用导致焦虑和过度梳理。" });
        }
      }

      // 逗猫棒时长检查
      if (d.cls === "WAND") {
        wandMinutes += d.minutes * d.sessions;
        if (d.minutes > 15) {
          failures.push({ device: i, gate: "G09", mode: "overstimulation", severity: "P1",
            msg: "单次逗猎 " + d.minutes + " 分钟超过 15 分钟上限。过度兴奋可能导致攻击行为转移。" });
        }
      }

      // 猫薄荷配额
      if (d.cls === "NIP" || d.cls === "VALERIAN") {
        nipMinutes += d.minutes * d.sessions;
        if (nipReactive && d.minutes > 15) {
          failures.push({ device: i, gate: "G08", mode: "nip_overdose", severity: "P2",
            msg: "猫薄荷/缬草单次 " + d.minutes + " 分钟超过 15 分钟。虽无成瘾性，但可能导致短暂肠胃不适。" });
        }
      }

      // 小件检查
      if (d.hasSmallParts) {
        failures.push({ device: i, gate: "G02", mode: "small_parts", severity: "P0",
          msg: (c.name || d.cls) + " 含有小件（眼睛/鼻子/铃铛）。咬掉吞入=气道阻塞=P0。" });
      }

      // 尺寸检查
      if (d.diameter && d.diameter < 30 && !d.isWallMounted) {
        failures.push({ device: i, gate: "G01", mode: "choke_hazard", severity: "P0",
          msg: (c.name || d.cls) + " 最小外径 " + d.diameter + "mm < 30mm。整体可被吞入。" });
      }

      // 绳索
      if (d.hasString && d.stringLen > 15) {
        failures.push({ device: i, gate: "G03", mode: "strangulation", severity: "P0",
          msg: (c.name || d.cls) + " 含 " + d.stringLen + "cm 绳状结构。绕颈风险。" });
      }

      // 尖点
      if (d.hasSharpEdge) {
        failures.push({ device: i, gate: "G04", mode: "sharp_edge", severity: "P1",
          msg: (c.name || d.cls) + " 已出现尖点。可能导致爪垫或面部割伤。" });
      }

      // 电池
      if (d.hasBattery && !d.batterySealed) {
        failures.push({ device: i, gate: "G06", mode: "battery_exposed", severity: "P0",
          msg: (c.name || d.cls) + " 电池仓未密封。猫爪可能打开电池仓，电池被吞入=重金属中毒。" });
      }
    });

    // 序列闭合判定
    var seqComplete = stagesCovered.STALK > 0.5 && stagesCovered.POUNCE > 0.3 && stagesCovered.KILL_BITE > 0.2;
    var seqPartial = stagesCovered.STALK > 0.5 && !seqComplete;
    var seqStuck = laserMinutes > 10 && stagesCovered.KILL_BITE < 0.2;

    // 纸箱优先级检查
    var boxWarning = "";
    if (!hasBox) {
      boxWarning = "未部署纸箱。根据项目级 MUST，纸箱的优先级高于所有官方外设。建议立即部署一个。尺寸不重要。";
    }

    // 每日互动需求
    var dailyPlayNeed = Math.max(20, 30 + (activityLevel - 3) * 10 + (isKitten ? 30 : 0) - (isSenior ? 10 : 0));
    var playCovered = Math.min(wandMinutes + (laserMinutes * 0.7), dailyPlayNeed);
    var playGap = Math.max(0, dailyPlayNeed - playCovered);

    // 多猫环境
    var scratchNeed = catCount + 1;
    var scratchGap = hasScratch ? 0 : scratchNeed;

    // 水源
    var waterWarning = !hasWater ? "未部署流动饮水机。干粮喂养的实例慢性脱水风险高。" : "";

    // 猫薄荷总量
    var nipDailyMax = 30; // 分钟
    var nipWarning = nipMinutes > nipDailyMax
      ? "猫薄荷类外设今日总计 " + nipMinutes + " 分钟，超过每日 30 分钟上限。"
      : "";

    // 综合评分
    var healthScore = 100;
    failures.forEach(function (f) {
      if (f.severity === "P0") healthScore -= 25;
      if (f.severity === "P1") healthScore -= 10;
      if (f.severity === "P2") healthScore -= 5;
    });
    if (playGap > 0) healthScore -= Math.min(15, playGap / 2);
    if (!hasScratch) healthScore -= 8;
    if (!hasWater) healthScore -= 5;
    if (!hasBox) healthScore -= 3;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // 配额分配
    var quota = {
      hunt: { label: "狩猎序列闭合", value: seqComplete ? 100 : seqPartial ? 55 : seqStuck ? 15 : 0, unit: "%" },
      play: { label: "互动配额", value: Math.round((playCovered / dailyPlayNeed) * 100), unit: "%", gap: Math.round(playGap) },
      scratch: { label: "抓挠标记位", value: Math.round(((scratchNeed - scratchGap) / scratchNeed) * 100), unit: "%" },
      enrichment: { label: "环境丰富度", value: Math.min(100, Math.round(totalHuntScore * 8)), unit: "%" },
      box: { label: "纸箱 MUST", value: hasBox ? 100 : 0, unit: "%" }
    };

    // 分诊
    var hasP0 = failures.some(function (f) { return f.severity === "P0"; });
    var triage = hasP0 ? "P0" : failures.some(function(f) { return f.severity === "P1"; }) ? "P1" :
                 failures.length > 0 ? "P2" : "OK";

    return {
      profile: { weight: weight, ageMonths: ageMonths, isKitten: isKitten, isSenior: isSenior },
      stages: stagesCovered,
      seqComplete: seqComplete,
      seqPartial: seqPartial,
      seqStuck: seqStuck,
      totalHuntScore: totalHuntScore,
      laserMinutes: laserMinutes,
      wandMinutes: wandMinutes,
      nipMinutes: nipMinutes,
      hasBox: hasBox,
      hasScratch: hasScratch,
      hasWater: hasWater,
      failures: failures,
      quota: quota,
      healthScore: healthScore,
      triage: triage,
      boxWarning: boxWarning,
      waterWarning: waterWarning,
      nipWarning: nipWarning,
      dailyPlayNeed: dailyPlayNeed,
      scratchNeed: scratchNeed,
      scratchGap: scratchGap,
      playGap: Math.round(playGap),
      catCount: catCount
    };
  }

  function cls(code) {
    for (var i = 0; i < CLASSES.length; i++) if (CLASSES[i].code === code) return CLASSES[i];
    return null;
  }

  /* ---------- 导出 ---------- */
  global.CatPeriph = {
    CLASSES: CLASSES,
    GATES: GATES,
    SEQUENCE: SEQUENCE,
    FAILURE_MODES: FAILURE_MODES,
    evaluate: evaluate,
    cls: cls
  };

})(typeof window !== "undefined" ? window : this);

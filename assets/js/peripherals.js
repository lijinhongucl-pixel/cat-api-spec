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

  /* ---------- 工具：按 code 查类别 ---------- */
  function cls(code) {
    for (var i = 0; i < CLASSES.length; i++) if (CLASSES[i].code === code) return CLASSES[i];
    return null;
  }

  /* ---------- 门槛判定器 ---------- */
  // 所有 13 道门槛都走这一个出口，所以「门槛注册表」与「逐设备判定」
  // 不可能出现一边有、一边没有的情况。之前 13 道门槛里有 5 道
  // （G05 材料、G10 羽毛件、G11 防跌、G12 滤芯、G13 纸箱）
  // 只在文档里存在，代码里没有任何一处会触发它们。
  //
  // severity === "HEURISTIC" 的门槛只进门槛矩阵，不进 failures：
  // 它是「系统的优先队列被违反了」，不是健康问题，不该抬高分诊等级。
  function createGateTracker() {
    var gateStat = {};   // G01..G13 → { checked, failed, devices }
    var failures = [];   // 非启发式失败明细

    function judge(id, i, ok, mode, severity, msg) {
      var s = gateStat[id] || (gateStat[id] = { checked: 0, failed: 0, devices: [] });
      s.checked++;
      if (s.devices.indexOf(i) < 0) s.devices.push(i);
      if (!ok) {
        s.failed++;
        if (severity !== "HEURISTIC") {
          failures.push({ device: i, gate: id, mode: mode, severity: severity, msg: msg });
        }
      }
      return ok;
    }

    function getStat(id) { return gateStat[id]; }
    function getFailures() { return failures; }

    return { judge: judge, getStat: getStat, getFailures: getFailures };
  }

  /* ---------- 入参容错：字符串 / 对象归一 ---------- */
  // 此前只吃对象，传字符串会走 `cls(undefined)` → null → 整条被静默跳过，
  // 最终返回一份「什么都没买」的全零报告。调用方拿到的是合法 JSON、
  // 没有任何报错，只会以为引擎算错了。全零结果是最难排查的一类失败，
  // 所以在这里补一次归一化。
  function normalizePeripherals(peripherals) {
    return (peripherals || []).map(function (d) {
      if (typeof d === "string") return { cls: d, sessions: 1, minutes: 10 };
      return d;
    });
  }

  /* ---------- 单件外设的逐条门槛判定 ---------- */
  // 这是原本 evaluate 里最重的一段：130 行的 peripherals.forEach。
  // 拆出来后，evaluate 只负责编排（循环 + 累加），不关心单件判定细节。
  //
  // ctx 是累加器，跨设备共享：
  //   ctx.gate         createGateTracker() 的实例
  //   ctx.stages       序列阶段覆盖分
  //   ctx 返回前会被填上本次设备的各种 minute / flag 累加
  function evaluateDevice(d, idx, ctx) {
    var c = cls(d.cls);
    if (!c) return;

    var judge = ctx.gate.judge;
    var envFloor = ctx.envFloor;
    var envGrip = ctx.envGrip;
    var nipReactive = ctx.nipReactive;
    var stages = ctx.stages;

    // 计算狩猎贡献
    var huntScore = c.huntWeight * d.sessions * Math.sqrt(d.minutes / 10);
    ctx.totalHuntScore += huntScore;

    // 序列阶段覆盖
    if (c.stage === "STALK")    stages.STALK += huntScore;
    if (c.stage === "AMBUSH")   stages.AMBUSH += huntScore;
    if (c.stage === "POUNCE")   stages.POUNCE += huntScore;

    // 阶段覆盖：KILL_BITE / CONSUME 只认「有实物可捕获」的外设。
    //
    // 两个来源，取其一，不叠加：
    //   1) 模拟猎物类（MOUSE / BALL / FEATHER）本身就有实体，天生可完成捕获
    //   2) 任意类别上勾选了 killObject，表示该次互动以实物收尾
    //
    // 第 2 条是必须的：逗猫棒的正确用法本来就是最后让猫咬到玩具，
    // 而激光笔只有配上实物收尾才算一次完整序列。此前 killObject 只在
    // LASER 分支被读一次，且只用于「消掉 G07 告警」，从不给 KILL_BITE 记分——
    // 于是勾了实物收尾的激光笔仍被判 seqStuck，报告自相矛盾。
    var physicalCatch = d.cls === "MOUSE" || d.cls === "BALL" || d.cls === "FEATHER" || d.killObject === true;
    if (physicalCatch) {
      stages.KILL_BITE += huntScore * 0.8;
      stages.CONSUME   += huntScore * 0.3;
    }

    // 纸箱 / 抓板 / 饮水机存在性
    if (d.cls === "BOX")     ctx.hasBox = true;
    if (d.cls === "SCRATCH") ctx.hasScratch = true;
    if (d.cls === "WATER")   ctx.hasWater = true;

    // 激光笔特殊处理
    if (d.cls === "LASER") {
      ctx.laserMinutes += d.minutes * d.sessions;
      judge("G07", idx, !!d.killObject, "unclosed_hunt", "P2",
        "激光笔使用未以实物 KILL BITE 收尾。狩猎序列永不闭合，长期使用导致焦虑和过度梳理。");
    }

    // 逗猫棒时长检查
    if (d.cls === "WAND") {
      ctx.wandMinutes += d.minutes * d.sessions;
      judge("G09", idx, !(d.minutes > 15), "overstimulation", "P1",
        "单次逗猎 " + d.minutes + " 分钟超过 15 分钟上限。过度兴奋可能导致攻击行为转移。");
    }

    // 猫薄荷配额
    if (d.cls === "NIP" || d.cls === "VALERIAN") {
      ctx.nipMinutes += d.minutes * d.sessions;
      judge("G08", idx, !(nipReactive && d.minutes > 15), "nip_overdose", "P2",
        "猫薄荷/缬草单次 " + d.minutes + " 分钟超过 15 分钟。虽无成瘾性，但可能导致短暂肠胃不适。");
    }

    // G05 材料无毒。只有被明确标注为含毒材质才拦。
    // 默认放行——引擎看不到实物，没有证据时不该替用户定罪。
    if (d.toxicMaterial != null) {
      judge("G05", idx, d.toxicMaterial !== true, "toxic_material", "P0",
        (c.name || d.cls) + " 含邻苯二甲酸酯 / BPA / 铅等增塑剂或重金属。舔舐即摄入。");
    }

    // G02 小件
    if (d.hasSmallParts != null) {
      judge("G02", idx, d.hasSmallParts !== true, "small_parts", "P0",
        (c.name || d.cls) + " 含有小件（眼睛/鼻子/铃铛）。咬掉吞入=气道阻塞=P0。");
    }

    // G01 尺寸：只判"整体可被吞入"，壁挂件豁免
    if (d.diameter != null && !d.isWallMounted) {
      judge("G01", idx, !(d.diameter < 30), "choke_hazard", "P0",
        (c.name || d.cls) + " 最小外径 " + d.diameter + "mm < 30mm。整体可被吞入。");
    }

    // G03 绳索
    if (d.hasString != null) {
      judge("G03", idx, !(d.hasString === true && d.stringLen > 15), "strangulation", "P0",
        (c.name || d.cls) + " 含 " + d.stringLen + "cm 绳状结构。绕颈风险。");
    }

    // G04 尖点
    if (d.hasSharpEdge != null) {
      judge("G04", idx, d.hasSharpEdge !== true, "sharp_edge", "P1",
        (c.name || d.cls) + " 已出现尖点。可能导致爪垫或面部割伤。");
    }

    // G06 电池仓
    if (d.hasBattery != null) {
      judge("G06", idx, !(d.hasBattery === true && d.batterySealed !== true), "battery_exposed", "P0",
        (c.name || d.cls) + " 电池仓未密封。猫爪可能打开电池仓，电池被吞入=重金属中毒。");
    }

    // G10 羽毛件：羽毛玩具的硬质底座 / 金属丝是可吞入件。
    // 只判羽毛类——其他玩具的硬质小件由 G01/G02 覆盖。
    if (d.cls === "FEATHER") {
      judge("G10", idx, d.hasHardParts !== true, "feather_ingestion", "P0",
        (c.name || d.cls) + " 含可吞入的硬质件（金属丝底座 / 塑料配重）。羽毛本身无害，底座不是。");
    }

    // G11 高处防跌：只判猫能上去的攀爬类（TREE / TUNNEL），
    // 离地 ≥ 1m 时要求底座稳、且地面抓得住。
    if (c.stage === "AMBUSH") {
      var tall = (d.heightM || 0) >= 1;
      var gripOk = d.stableBase === true && envGrip >= 4;
      judge("G11", idx, !tall || gripOk, "fall_risk", "P1",
        (c.name || d.cls) + " 离地 " + (d.heightM || 0) + "m 但底座不稳或地面过滑（" +
        envFloor + " / 抓地 " + envGrip + "/10）。起跳落地失败会导致骨折。");
    }

    // G12 饮水机清洁：滤芯周期是这类设备唯一的耗材型故障点。
    if (d.cls === "WATER") {
      var overdue = (d.filterDays || 0) > 28;
      judge("G12", idx, !overdue, "water_contamination", "P1",
        (c.name || d.cls) + " 滤芯已用 " + (d.filterDays || 0) + " 天，超过 28 天上限。生物膜会反过来污染水源。");
    }
  }

  /* ---------- 全局门槛：纸箱优先级 ---------- */
  // G13 是全局门槛（跟具体某件外设无关），所以 device = -1。
  // 严重级 HEURISTIC：只进门槛矩阵，不抬高分诊等级 —— 纸箱缺失不会伤到猫，
  // 违反的是系统的优先队列，不是健康指标。
  function judgeGlobalGates(gate, ctx) {
    var boxWarning = "";
    if (!ctx.hasBox) {
      boxWarning = "未部署纸箱。根据项目级 MUST，纸箱的优先级高于所有官方外设。建议立即部署一个。尺寸不重要。";
    }
    gate.judge("G13", -1, ctx.hasBox, "box_override", "HEURISTIC",
      "未部署纸箱。纸箱 MUST 优先于所有官方外设，优先级高于预算本身。");
    return boxWarning;
  }

  /* ---------- 综合评分 ---------- */
  function computeHealthScore(failures, ctx, playGap) {
    var score = 100;
    failures.forEach(function (f) {
      if (f.severity === "P0") score -= 25;
      if (f.severity === "P1") score -= 10;
      if (f.severity === "P2") score -= 5;
    });
    if (playGap > 0) score -= Math.min(15, playGap / 2);
    if (!ctx.hasScratch) score -= 8;
    if (!ctx.hasWater)   score -= 5;
    if (!ctx.hasBox)     score -= 3;
    return Math.max(0, Math.min(100, score));
  }

  /* ---------- 配额分配 ---------- */
  function buildQuota(ctx, seqComplete, seqPartial, seqStuck, playCovered, dailyPlayNeed, scratchNeed, scratchGap, totalHuntScore) {
    return {
      hunt:        { label: "狩猎序列闭合", value: seqComplete ? 100 : seqPartial ? 55 : seqStuck ? 15 : 0, unit: "%" },
      play:        { label: "互动配额",     value: Math.round((playCovered / dailyPlayNeed) * 100), unit: "%", gap: Math.round(dailyPlayNeed - playCovered > 0 ? dailyPlayNeed - playCovered : 0) },
      scratch:     { label: "抓挠标记位",   value: Math.round(((scratchNeed - scratchGap) / scratchNeed) * 100), unit: "%" },
      enrichment:  { label: "环境丰富度",   value: Math.min(100, Math.round(totalHuntScore * 8)), unit: "%" },
      box:         { label: "纸箱 MUST",    value: ctx.hasBox ? 100 : 0, unit: "%" }
    };
  }

  /* ---------- 分诊 ---------- */
  function computeTriage(failures) {
    var hasP0 = failures.some(function (f) { return f.severity === "P0"; });
    var hasP1 = failures.some(function (f) { return f.severity === "P1"; });
    return hasP0 ? "P0" : hasP1 ? "P1" : failures.length > 0 ? "P2" : "OK";
  }

  /* ---------- 门槛矩阵 ---------- */
  //   PASS —— 判过，全部通过
  //   FAIL —— 判过，至少一件外设不通过
  //   NA   —— 本清单里没有可判对象，例如没买羽毛玩具就谈不上 G10
  //
  // NA 必须和 PASS 分开。把「没检查」显示成「检查通过」是报告里
  // 最容易被信任、也最容易骗人的一格。
  function buildGateMatrix(gate) {
    var gates = GATES.map(function (g) {
      var s = gate.getStat(g.id);
      var status = !s || s.checked === 0 ? "NA" : (s.failed > 0 ? "FAIL" : "PASS");
      return {
        id: g.id,
        name: g.name,
        rule: g.rule,
        grade: g.grade,
        severity: g.severity,
        fail: g.fail,
        status: status,
        checked: s ? s.checked : 0,
        failed: s ? s.failed : 0,
        devices: s ? s.devices : []
      };
    });
    return {
      gates: gates,
      gateFailCount: gates.filter(function (g) { return g.status === "FAIL"; }).length,
      gateNaCount:   gates.filter(function (g) { return g.status === "NA"; }).length
    };
  }

  /* ---------- 核心：评估外设清单（编排函数） ---------- */
  // evaluate 现在只做编排：建 tracker / 归一化入参 / 循环 / 调用子函数 / 组装返回。
  // 所有判定细节都下放到 evaluateDevice / computeHealthScore / buildQuota 等子函数里。
  function evaluate(profile, env, peripherals) {
    var weight      = profile.weight || 4.5;            // kg
    var ageMonths   = profile.ageMonths || 36;
    var isKitten    = ageMonths < 12;
    var isSenior    = ageMonths > 120;
    var activityLevel = profile.activityLevel || 3;     // 1-5
    var huntDrive   = profile.huntDrive || 3;           // 1-5
    var nipReactive = profile.nipReactive !== false;    // ~60% 默认有反应
    var catCount    = profile.catCount || 1;

    // env 描述「房子本身」，与「外设」分开。
    // 此前这个参数在函数体里一次都没被读过（页面也就顺手传了 {}），
    // 于是门槛表里跟环境有关的规则永远不可能触发。G11 现在真的吃 env.floor。
    env = env || {};
    var envFloor = env.floor || "wood";                  // wood | tile | carpet
    var envGrip  = env.surface == null ? ({ wood: 6, tile: 3, carpet: 8 }[envFloor] || 6) : env.surface;

    // 跨设备累加器（evaluateDevice 会往里写）
    var ctx = {
      gate: createGateTracker(),
      envFloor: envFloor,
      envGrip: envGrip,
      nipReactive: nipReactive,
      stages: { STALK: 0, AMBUSH: 0, POUNCE: 0, KILL_BITE: 0, CONSUME: 0 },
      totalHuntScore: 0,
      laserMinutes: 0,
      wandMinutes: 0,
      nipMinutes: 0,
      hasBox: false,
      hasScratch: false,
      hasWater: false
    };

    // 入参归一化 + 逐件判定
    var list = normalizePeripherals(peripherals);
    list.forEach(function (d, i) { evaluateDevice(d, i, ctx); });

    // 全局门槛：纸箱优先级
    var boxWarning = judgeGlobalGates(ctx.gate, ctx);

    // 序列闭合判定
    var seqComplete = ctx.stages.STALK > 0.5 && ctx.stages.POUNCE > 0.3 && ctx.stages.KILL_BITE > 0.2;
    var seqPartial  = ctx.stages.STALK > 0.5 && !seqComplete;
    var seqStuck    = ctx.laserMinutes > 10 && ctx.stages.KILL_BITE < 0.2;

    // 每日互动需求
    var dailyPlayNeed = Math.max(20, 30 + (activityLevel - 3) * 10 + (isKitten ? 30 : 0) - (isSenior ? 10 : 0));
    var playCovered   = Math.min(ctx.wandMinutes + (ctx.laserMinutes * 0.7), dailyPlayNeed);
    var playGap       = Math.max(0, dailyPlayNeed - playCovered);

    // 多猫环境
    var scratchNeed = catCount + 1;
    var scratchGap  = ctx.hasScratch ? 0 : scratchNeed;

    // 提醒文案
    var waterWarning = !ctx.hasWater ? "未部署流动饮水机。干粮喂养的实例慢性脱水风险高。" : "";
    var nipDailyMax  = 30; // 分钟
    var nipWarning   = ctx.nipMinutes > nipDailyMax
      ? "猫薄荷类外设今日总计 " + ctx.nipMinutes + " 分钟，超过每日 30 分钟上限。"
      : "";

    // 综合评分 + 分诊
    var failures     = ctx.gate.getFailures();
    var healthScore  = computeHealthScore(failures, ctx, playGap);
    var triage       = computeTriage(failures);

    // 配额 + 门槛矩阵
    var quota        = buildQuota(ctx, seqComplete, seqPartial, seqStuck,
                                  playCovered, dailyPlayNeed, scratchNeed, scratchGap,
                                  ctx.totalHuntScore);
    var gateMatrix   = buildGateMatrix(ctx.gate);

    return {
      profile: { weight: weight, ageMonths: ageMonths, isKitten: isKitten, isSenior: isSenior },
      stages: ctx.stages,
      seqComplete: seqComplete,
      seqPartial:  seqPartial,
      seqStuck:    seqStuck,
      totalHuntScore: ctx.totalHuntScore,
      laserMinutes: ctx.laserMinutes,
      wandMinutes:  ctx.wandMinutes,
      nipMinutes:   ctx.nipMinutes,
      hasBox:    ctx.hasBox,
      hasScratch:ctx.hasScratch,
      hasWater:  ctx.hasWater,
      failures:  failures,
      gates: gateMatrix.gates,
      gateFailCount: gateMatrix.gateFailCount,
      gateNaCount:   gateMatrix.gateNaCount,
      env: { floor: envFloor, surface: envGrip },
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

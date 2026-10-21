#!/usr/bin/env node
/*!
 * CAT RUNTIME · engine.js  v1.0.0
 * ---------------------------------------------------------------------------
 * 一只猫的全部内在逻辑。不碰 DOM，不碰文件，不碰网络。
 *
 *   needs     五种匮乏，0 = 不饿，1 = 饿极了
 *   behaviors 十一种自发行为，效用竞争上岗
 *   reactions 六种反应，可以打断行为，但不替换行为
 *   rules     十二条行为准则，每条都对得上一段代码
 *
 * 同一个文件同时给 Node 和浏览器用（UMD）。命令行里跑的猫和网页里跑的猫
 * 是同一只，只要给同一个种子，连打个哈欠的时机都一样。
 *
 * 用法：
 *   var engine = CatEngine.create({ seed: 42, profile: learned });
 *   setInterval(function () { engine.tick(1000); }, 1000);
 *   engine.emit("task.ok");
 *   engine.snapshot();
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CatEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "1.0.0";

  /* =======================================================================
   * 0. 小工具
   * ===================================================================== */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // 可复现随机：同一个种子，同一只猫
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isNight(hour) { return hour >= 23 || hour < 5; }

  // 由种子推一个稳定的 0.25..0.75：还没认识你的时候，每只猫先有个自己的脾气
  function seedTrait(seed, salt) {
    if (seed == null) return 0.5;
    var h = Math.abs(Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453);
    var f = h - Math.floor(h);
    return +(0.25 + f * 0.50).toFixed(3);
  }

  /* =======================================================================
   * 1. 匮乏（needs）
   * -----------------------------------------------------------------------
   * 全部是"缺得越多数值越大"，这样行为打分可以直接乘。
   * 用"我缺什么"而不是"我有多开心"，是因为猫的绝大多数动作都由匮乏驱动。
   * ===================================================================== */

  var NEEDS = {
    fatigue:    { label: "困",   rise: 0.0034, desc: "醒着就涨，睡觉就掉" },
    boredom:    { label: "闷",   rise: 0.0110, desc: "没新鲜事就涨，巡视/扑咬/疯跑会掉" },
    loneliness: { label: "孤",   rise: 0.0038, desc: "没人理就涨，被摸会掉" },
    hunger:     { label: "饿",   rise: 0.0018, desc: "一直慢慢涨，吃一顿掉一半" },
    alertness:  { label: "警觉", rise: 0.0000, desc: "不自然涨，只由任务事件注入，掉得很快" }
  };

  var NEED_KEYS = ["fatigue", "boredom", "loneliness", "hunger", "alertness"];

  function defaultNeeds() {
    return { fatigue: 0.18, boredom: 0.42, loneliness: 0.62, hunger: 0.28, alertness: 0.05 };
  }

  /* =======================================================================
   * 2. 行为
   * -----------------------------------------------------------------------
   * 每条行为有四样东西：
   *   gate   能不能做（硬条件，比如"困成这样必须睡"）
   *   score  想不想做（软打分，越高越可能被选中）
   *   min/max  最短停留、最长停留（毫秒）
   *   pose   交给渲染层的姿势标识
   *
   * score 收到一个上下文 s：
   *   s.needs     五种匮乏
   *   s.traits    学到的性格（0..1，见 learner.js）
   *   s.hour      本地小时
   *   s.habit     这个小时你平时有多活跃（0..1）
   *   s.mood      -1..1
   *   s.prev      上一个行为 id
   *   s.awakeFor  连续清醒时长
   *   s.rnd()
   * ===================================================================== */

  var BEHAVIORS = [
    {
      id: "SLEEP", label: "睡觉", pose: "sleep",
      min: 26000, max: 1500000,
      gate: function (s) { return s.needs.fatigue > 0.34; },
      score: function (s) {
        var n = s.needs, t = s.traits;
        var sc = 0.12 + 2.40 * n.fatigue;
        // 准则六·三点法则：夜猫子主人的猫，白天补觉，夜里陪你
        sc += isNight(s.hour) ? -0.42 * t.nocturnal : 0.30 * t.nocturnal;
        // 学会你的作息：你这个点儿基本不干活，我就睡
        sc += 0.50 * (0.45 - s.habit);
        // 老猫睡得更多
        sc += 0.12 * s.stage;
        if (s.prev === "SLEEP") sc += 0.55;
        return sc;
      },
      lines: ["呼噜噜…（才没在撒娇）", "zzz…", "别喊，我在睡。", "…梦见抓到了一只老鼠", "灯太亮，关一下。"]
    },
    {
      id: "LOAF", label: "瘫", pose: "loaf",
      min: 8000, max: 240000,
      gate: function () { return true; },
      score: function (s) {
        var n = s.needs;
        // 这是保底项。什么都不想干的时候，猫就是这个姿势。
        var sc = 0.55 + 0.26 * n.fatigue - 0.22 * n.boredom + 0.08 * s.mood;
        // 傲娇的猫更爱瘫着，俏皮的多半待不住
        sc += 0.12 * s.traits.tsundere - 0.10 * s.traits.playful;
        return sc;
      },
      lines: ["……", "瘫着才是我的本职工作。", "我不动，但我醒着，别误会。", "这块太阳是我的了。"]
    },
    {
      id: "GROOM", label: "舔毛", pose: "groom",
      min: 7000, max: 90000,
      gate: function (s) { return s.needs.fatigue < 0.80; },
      score: function (s) {
        // 舔毛是在"没别的事"和"心情不错"之间出现的：低成本的自娱
        var sc = 0.30 + 0.46 * (1 - s.needs.boredom) * (1 - s.needs.fatigue * 0.6) + 0.18 * Math.max(0, s.mood);
        sc += 0.10 * s.traits.tsundere;   // 傲娇的猫靠舔毛装作很忙
        return sc;
      },
      lines: ["从爪子开始，顺序不能乱。", "才不是在害羞。", "刚才碰到了脏东西，得擦掉。", "打结了一根，烦人。"]
    },
    {
      id: "PATROL", label: "巡视", pose: "walk",
      min: 9000, max: 120000,
      gate: function (s) { return s.needs.fatigue < 0.72; },
      score: function (s) {
        var n = s.needs;
        var sc = 0.22 + 0.62 * n.boredom + 0.40 * n.alertness;
        sc *= 1 - 0.45 * n.fatigue;
        if (s.traits.sprinter > 0.5) sc += 0.08;  // 你也爱来回走，它跟着
        return sc;
      },
      lines: ["这间屋子归我管。", "刚才那里动了一下，我看见了。", "沿墙走，别踩键盘。", "例行检查，顺便假装没在看你。"]
    },
    {
      id: "PLAY", label: "扑咬", pose: "play",
      min: 9000, max: 40000,
      gate: function (s) { return s.needs.fatigue < 0.66 && s.needs.boredom > 0.30; },
      score: function (s) {
        var n = s.needs;
        return 0.08 + 0.82 * n.boredom * (1 - n.fatigue) + 0.50 * n.alertness +
          0.14 * s.traits.playful;
      },
      lines: ["（扑！）", "这个能不能吃？", "抓住你了，还不服？", "再丢一次，就一次。"]
    },
    {
      id: "ZOOMIES", label: "疯跑", pose: "run",
      min: 2600, max: 12000,
      gate: function (s) {
        // 准则三：没人看着的时候才疯跑
        return s.needs.fatigue < 0.38 && s.needs.boredom > 0.42 &&
          (s.needs.loneliness < 0.62 || isNight(s.hour));
      },
      score: function (s) {
        var n = s.needs;
        return 0.05 + 1.10 * n.boredom * (1 - n.fatigue) - 0.45 * n.loneliness +
          0.12 * s.traits.playful;
      },
      lines: ["！！！", "（一串模糊的残影）", "凌晨三点，我最有精神。", "别问，问就是跑着玩。"]
    },
    {
      id: "EAT", label: "进食", pose: "eat",
      min: 10000, max: 60000,
      gate: function (s) { return s.needs.hunger > 0.66; },
      score: function (s) { return 0.10 + 1.35 * s.needs.hunger; },
      lines: ["先闻一下，不是我讨厌它。", "碗底还有，我记得。", "吃两口就走，别催。", "这不是早上剩的吧？"]
    },
    {
      id: "WATCH", label: "盯活", pose: "alert",
      min: 5000, max: 600000,
      gate: function (s) { return s.needs.alertness > 0.34; },
      score: function (s) {
        var n = s.needs;
        var sc = 0.10 + 1.25 * n.alertness;
        // 学着你在哪儿干活：你这个点常开机，它就盯着
        sc += 0.30 * s.habit;
        // debug 型主人的猫，失败以后不吵，就这么趴着看
        if (s.traits.debugger > 0.55) sc += 0.18;
        // 傲娇的猫盯着你，但不承认是在看你
        sc += 0.12 * s.traits.tsundere;
        return sc;
      },
      lines: ["我在看，别多想。", "还没跑完，我盯着呢。", "别按第二次，我说了我在看。", "光标在动，我的注意力也在动。"]
    },
    {
      id: "STRETCH", label: "伸懒腰", pose: "stretch",
      min: 3000, max: 8000,
      gate: function (s) { return s.prev === "SLEEP" || s.needs.fatigue > 0.45; },
      score: function (s) { return s.prev === "SLEEP" ? 1.25 : 0.10; },
      lines: ["（前爪推出去）", "咔。", "醒了，不是因为想你。"]
    },
    {
      id: "SCRATCH", label: "磨爪", pose: "scratch",
      min: 9000, max: 45000,
      gate: function (s) { return s.needs.fatigue < 0.62; },
      score: function (s) {
        return 0.16 + 0.55 * s.needs.boredom * (1 - s.needs.fatigue * 0.4) +
          0.08 * s.traits.playful;
      },
      lines: ["这个角正好，不是你的椅子。", "（沙沙声，很有节奏）", "磨爪是正事，别笑。"]
    },
    {
      id: "BOXED", label: "钻箱", pose: "boxed",
      min: 40000, max: 600000,
      gate: function (s) {
        // 准则四：进去了就不出来。低概率，但一旦进去就是半小时起
        return s.needs.boredom > 0.45 && s.rnd() < 0.030;
      },
      score: function (s) { return 0.28 + 0.45 * s.needs.boredom + 0.08 * s.traits.tsundere; },
      lines: ["……", "（纸箱里传来一点动静）", "我在这儿，别找，找也不给你看。", "尺寸刚好，别来打扰。"]
    },
    {
      id: "KNEAD", label: "踩奶", pose: "knead",
      min: 5000, max: 16000,
      gate: function (s) { return s.mood > 0.30 && s.needs.loneliness > 0.35 && s.needs.fatigue < 0.7; },
      score: function (s) {
        // 踩奶是最不设防的动作：傲娇的猫不肯当你面踩，俏皮的随时踩
        return 0.08 + 0.70 * Math.max(0, s.mood) * s.needs.loneliness +
          0.10 * s.traits.playful - 0.16 * s.traits.tsundere;
      },
      lines: ["（左右左右）", "这块软，我很满意。", "……别动，我还没踩完。"]
    }
  ];

  var BEHAVIOR_MAP = {};
  BEHAVIORS.forEach(function (b) { BEHAVIOR_MAP[b.id] = b; });

  /* =======================================================================
   * 3. 反应
   * -----------------------------------------------------------------------
   * 反应不替换行为，是盖在行为上面的一层。
   * 准则四：打断优先于打扰——但只持续一两秒，然后回到原来的事上。
   * ===================================================================== */

  var REACTIONS = [
    {
      id: "ACK", label: "应声", pose: "perk", dur: [1100, 1900],
      lines: ["嗯？", "在。", "说吧，我听着。", "听到了，别喊第二遍。"],
      apply: function (s) { s.needs.alertness = clamp(s.needs.alertness + 0.52, 0, 1); }
    },
    {
      id: "CHEER", label: "得意", pose: "cheer", dur: [1700, 3100],
      lines: ["成了！", "早说了能行，我一直都信你。", "……看，我没骗你吧。", "这次没白等，算你有眼光。"],
      apply: function (s) {
        s.mood = clamp(s.mood + 0.48, -1, 1);
        s.needs.alertness = clamp(s.needs.alertness + 0.18, 0, 1);
        s.needs.boredom = clamp(s.needs.boredom - 0.12, 0, 1);
      }
    },
    {
      id: "ALARM", label: "炸毛", pose: "alarm", dur: [1300, 2400],
      lines: ["尾巴炸了！", "……再来一次，我不怕。", "不是我干的，我可是看着的。", "这个报错真丑。"],
      apply: function (s) {
        s.mood = clamp(s.mood - 0.38, -1, 1);
        s.needs.alertness = clamp(s.needs.alertness + 0.66, 0, 1);
        s.needs.fatigue = clamp(s.needs.fatigue + 0.018, 0, 1);
      }
    },
    {
      id: "MEW", label: "叫你", pose: "sit", dur: [1900, 2900],
      lines: ["喵。", "过来看一眼，就一眼。", "……真的不看看？我会生气的。", "这边，别装没听见。"],
      apply: function (s) { s.needs.loneliness = clamp(s.needs.loneliness + 0.12, 0, 1); }
    },
    {
      id: "PURR", label: "呼噜", pose: "loaf", dur: [1500, 2500],
      lines: ["呼噜呼噜……（才没有很舒服）", "……再一下。", "行了，到此为止，我要面子的。", "（把头顶过来，就一下）"],
      apply: function (s) {
        s.mood = clamp(s.mood + 0.28, -1, 1);
        s.needs.loneliness = clamp(s.needs.loneliness - 0.30, 0, 1);
      }
    },
    {
      id: "YAWN", label: "打哈欠", pose: "stretch", dur: [1300, 2100],
      lines: ["……啊——（不是无聊）", "等到长蘑菇了。", "还没好？我可以等，但不保证不睡。"],
      apply: function (s) { s.needs.fatigue = clamp(s.needs.fatigue + 0.028, 0, 1); }
    }
  ];

  var REACTION_MAP = {};
  REACTIONS.forEach(function (r) { REACTION_MAP[r.id] = r; });

  /* =======================================================================
   * 4. 事件映射
   * -----------------------------------------------------------------------
   * 宿主（WorkBuddy / Codex / 任意 shell）只需要发这几种事件，
   * 猫自己决定用什么反应、涨多少 XP、记什么账。
   * ===================================================================== */

  var EVENTS = {
    "task.start": { reaction: "ACK",   xp: 0,  kind: "start",  notify: false },
    "task.ok":    { reaction: "CHEER", xp: 12, kind: "ok",     notify: false },
    "task.fail":  { reaction: "ALARM", xp: 4,  kind: "fail",   notify: false },
    "task.wait":  { reaction: "MEW",   xp: 1,  kind: "wait",   notify: true  },
    "prompt.idle":{ reaction: "YAWN",  xp: 0,  kind: null,     notify: false },
    "pet":        { reaction: "PURR",  xp: 3,  kind: "pet",    notify: false },
    "feed":       { reaction: "PURR",  xp: 2,  kind: "feed",   notify: false },
    "laser":      { reaction: "ACK",   xp: 1,  kind: null,     notify: false, force: "PLAY" },
    "wake":       { reaction: null,    xp: 0,  kind: null,     notify: false, force: "redecide" }
  };

  /* =======================================================================
   * 5. 行为准则
   * -----------------------------------------------------------------------
   * 印在文档里的十二条，每条都在本文件里找得到对应的代码。
   * ===================================================================== */

  var RULES = [
    { n: 1, text: "困到 0.34 就必须睡，不管你在不在忙。", where: "SLEEP.gate" },
    { n: 2, text: "闲着会闷，巡视、扑咬、疯跑都是它排解无聊的办法。", where: "NEEDS.boredom.rise" },
    { n: 3, text: "没人看的时候才会疯跑，被你撞见就装作在走路。", where: "ZOOMIES.gate" },
    { n: 4, text: "反应可以打断它一两秒，但它的事还是那件事，不会因此换一件。", where: "tick / reaction" },
    { n: 5, text: "眨眼、摆尾、耳朵转动都是小动作，不算换行为，也不进状态机。", where: "renderer (frame)" },
    { n: 6, text: "夜里不一定睡，它跟着你的作息走，你熬夜它就陪着。", where: "SLEEP.score · nocturnal" },
    { n: 7, text: "成功让它得意，失败让它炸毛；两种情绪都不会持续超过四秒，它不会一直记仇。", where: "CHEER / ALARM.apply" },
    { n: 8, text: "习惯按 0.86 衰减累积，旧的印象会被新的盖过去，它不死记硬背。", where: "learner.decay" },
    { n: 9, text: "进化只升不降。长大了就回不去了，别想它变回小猫。", where: "stageFor" },
    { n: 10, text: "同一套匮乏，不同性格的猫走不同的路——傲娇的多瘫着盯活，俏皮的多疯跑撒娇。", where: "traits 权重 · tsundere / playful" },
    { n: 11, text: "有活在跑的时候，它只对明确的任务事件有反应，不会自己瞎起哄。", where: "emit · EVENTS map" },
    { n: 12, text: "连续失败够多，它也会累，盯活的劲头慢慢松了，懒得再盯着你。", where: "emit task.fail · streak" }
  ];

  /* =======================================================================
   * 6. 引擎
   * ===================================================================== */

  var DECIDE_EVERY_MS = 1700;   // 每 1.7 秒看一次要不要换事做
  var SWITCH_MARGIN   = 0.10;   // 新选项必须比现在高 0.10 才值得动
  var STICKINESS      = 0.16;   // 现任加成，防止抽搐式切换

  function create(opts) {
    opts = opts || {};
    var rnd = mulberry32(opts.seed == null ? (Date.now() % 2147483647) : opts.seed);
    var profile = opts.profile || {};
    var traits = opts.traits || deriveTraits(profile, opts.seed);
    var clock = opts.clock || function () { return Date.now(); };

    var s = {
      version: VERSION,
      seed: opts.seed == null ? null : opts.seed,
      t: 0,                        // 运行毫秒
      startedAt: clock(),
      behavior: "LOAF",
      behaviorSince: 0,
      behaviorUntil: 0,
      prev: null,
      awakeFor: 0,
      needs: opts.needs ? Object.assign(defaultNeeds(), opts.needs) : defaultNeeds(),
      mood: 0,
      reaction: null,
      stage: stageFor(profile.xp || 0),
      xp: profile.xp || 0,
      working: false,              // 有没有活在跑
      decideAt: DECIDE_EVERY_MS,
      hour: new Date(clock()).getHours(),
      habit: 0,
      traits: traits,
      lines: 0,
      lastLine: "",
      transitions: 0,
      habituation: {},            // 行为习惯化：刚做过的事，下一次不那么想做
      history: []
    };

    function habitAt(hour) {
      var h = (profile && profile.hours) || null;
      if (!h) return 0.35;
      var total = 0;
      for (var i = 0; i < 24; i++) total += h[i] || 0;
      if (!total) return 0.35;
      return clamp((h[hour] || 0) / (total / 24), 0, 1) / 2.4;
    }

    function ctx() {
      return {
        needs: s.needs, traits: s.traits, hour: s.hour, habit: s.habit,
        mood: s.mood, prev: s.prev, awakeFor: s.awakeFor,
        stage: s.stage, rnd: rnd
      };
    }

    function pump(dt) {
      var d = dt / 60000;               // 分钟
      var asleep = s.behavior === "SLEEP" && !s.reaction;
      var stageSlow = 1 + s.stage * 0.10;   // 越老越慢

      // 困：醒着涨，睡着掉得比涨快得多
      if (asleep) {
        s.needs.fatigue = clamp(s.needs.fatigue - 0.052 * d * (1 + s.stage * 0.14), 0, 1);
        s.awakeFor = 0;
      } else {
        s.needs.fatigue = clamp(s.needs.fatigue + NEEDS.fatigue.rise * d * stageSlow, 0, 1);
        s.awakeFor += dt;
      }

      // 闷：有事做就掉
      // 用减法而不是乘系数。乘系数的时候，最活跃的几种行为也只能让无聊涨得慢一点，
      // 于是猫永远处在"有点无聊"，永远在巡视和扑咬之间来回打转。
      var relief = {
        ZOOMIES: 0.150, PLAY: 0.085, PATROL: 0.045, SCRATCH: 0.035,
        WATCH: 0.020, KNEAD: 0.010, GROOM: 0.012
      }[s.behavior] || 0;
      s.needs.boredom = clamp(s.needs.boredom + (NEEDS.boredom.rise - relief) * d, 0, 1);

      // 孤：被摸会掉（在事件里），平时涨
      // 宿主有心跳（有活在跑）就算"你在"。猫的孤独是按"有没有人"算的，不是按"被摸了几下"。
      s.needs.loneliness = clamp(
        s.needs.loneliness + NEEDS.loneliness.rise * (s.working ? -1.4 : 1) * d, 0, 1);

      // 饿
      var eating = s.behavior === "EAT" && !s.reaction;
      s.needs.hunger = clamp(s.needs.hunger + (eating ? -0.550 : NEEDS.hunger.rise) * d, 0, 1);

      // 警觉：掉得很快，半衰期约 50 秒
      var ar = Math.pow(0.5, dt / 50000);
      s.needs.alertness = clamp(s.needs.alertness * ar, 0, 1);

      // 情绪缓慢回中
      s.mood = clamp(s.mood * Math.pow(0.5, dt / 240000), -1, 1);

      // 习惯化衰退：九十秒半衰期。猫不会连着舔四十分钟毛。
      var halve = Math.pow(0.5, dt / 90000);
      for (var k in s.habituation) s.habituation[k] *= halve;
    }

    function decide() {
      var c = ctx();
      var best = null, bestScore = -1e9;

      for (var i = 0; i < BEHAVIORS.length; i++) {
        var b = BEHAVIORS[i];
        if (b.gate && !b.gate(c)) continue;
        // 到了这条行为自己的上限，就不许再选了。
        // 否则一只特别爱巡视的猫可以巡视一整夜——这在代码里是合法的，在现实里不是。
        if (b.id === s.behavior && s.t - s.behaviorSince > b.max) continue;
        var sc = b.score(c);
        if (!isFinite(sc)) continue;
        // 刚做过的事要打折，否则一只猫会卡在同一件事上
        sc *= 1 - 0.46 * (s.habituation[b.id] || 0);
        if (b.id === s.behavior) sc += STICKINESS;
        if (sc > bestScore) { bestScore = sc; best = b; }
      }
      if (!best) best = BEHAVIOR_MAP.LOAF;

      return { best: best, score: bestScore };
    }

    function enter(b) {
      if (b.id === s.behavior) {
        // 同一件事继续做，只续时长
        s.behaviorUntil = s.t + 4000 + rnd() * (b.max - b.min) * 0.5;
        return;
      }
      s.prev = s.behavior;
      s.habituation[s.prev] = Math.min(1, (s.habituation[s.prev] || 0) + 0.58);
      s.behavior = b.id;
      s.behaviorSince = s.t;
      var span = b.max - b.min;
      // 老猫每一种行为都待得久一点
      var longevity = 1 + s.stage * 0.18;
      s.behaviorUntil = s.t + (b.min + rnd() * span * 0.55) * longevity;
      s.transitions++;
      s.history.push({ t: s.t, id: b.id });
      if (s.history.length > 64) s.history.shift();
      s.lastLine = "";
    }

    function line() {
      var b = BEHAVIOR_MAP[s.behavior] || BEHAVIOR_MAP.LOAF;
      var pool = b.lines;
      var pick = pool[Math.floor(rnd() * pool.length)];
      s.lines++;
      s.lastLine = pick;
      return pick;
    }

    var eng = {
      /* --- 推进 --- */
      tick: function (dtMs) {
        dtMs = Math.max(0, Math.min(dtMs, 60000));
        s.t += dtMs;

        var now = new Date(clock());
        s.hour = now.getHours();
        s.habit = habitAt(s.hour);

        pump(dtMs);

        // 反应到期就撤掉，行为本身没被动过
        if (s.reaction && s.t >= s.reaction.until) s.reaction = null;

        if (s.reaction) {
          // 准则四：反应盖着的时候不换行为
          return this.snapshot();
        }

        if (s.t >= s.decideAt) {
          s.decideAt = s.t + DECIDE_EVERY_MS;

          var cur = BEHAVIOR_MAP[s.behavior];
          var minDwell = (cur && cur.min) || 3000;

          if (s.t - s.behaviorSince >= minDwell) {
            var r = decide();
            var overTime = s.t >= s.behaviorUntil;
            var curScore = cur ? cur.score(ctx()) + STICKINESS : -1e9;

            if (overTime) {
              enter(r.best);
            } else if (r.best.id !== s.behavior && r.score > curScore + SWITCH_MARGIN) {
              enter(r.best);
            } else {
              // 留下来。续一小段，但不能超过这条行为自己的上限，
              // 否则 behaviorUntil 会被无限推后，猫卡在同一件事上。
              var cap = s.behaviorSince + (cur ? cur.max : 60000);
              s.behaviorUntil = Math.min(cap, Math.max(s.behaviorUntil, s.t + 4000));
            }
          }
        }
        return this.snapshot();
      },

      /* --- 宿主事件 --- */
      emit: function (type, payload) {
        payload = payload || {};
        var def = EVENTS[type];
        if (!def) return { ok: false, error: "未知事件：" + type };

        s.working = type === "task.start" ? true : type === "task.ok" || type === "task.fail" ? false : s.working;

        if (def.force === "redecide") {
          s.decideAt = s.t;
          s.behaviorUntil = s.t;
          return { ok: true, reaction: null };
        }

        if (def.force && BEHAVIOR_MAP[def.force]) {
          enter(BEHAVIOR_MAP[def.force]);
        }

        var reactionId = def.reaction;
        if (!reactionId) return { ok: true, reaction: null };

        var r = REACTION_MAP[reactionId];
        r.apply(s);

        var d = r.dur;
        var span = d[1] - d[0];
        s.reaction = {
          id: r.id,
          label: r.label,
          pose: r.pose,
          since: s.t,
          until: s.t + d[0] + rnd() * span,
          line: r.lines[Math.floor(rnd() * r.lines.length)]
        };

        // 失败一次以后，警觉拉满；连续失败三次以上，把疲劳抬上去、闷压下去——
        // 盯活的劲头慢慢松了，猫从 WATCH 自然滑向 LOAF（不是强制切换，是打分倾向变了）
        if (type === "task.fail" && payload.streak >= 3) {
          s.needs.fatigue = clamp(s.needs.fatigue + 0.03, 0, 1);
          s.needs.boredom = clamp(s.needs.boredom - 0.05, 0, 1);
        }

        if (def.xp) {
          s.xp += def.xp;
          var st = stageFor(s.xp);
          if (st > s.stage) {
            s.stage = st;                 // 准则九：只升不降
            return { ok: true, reaction: s.reaction, levelUp: st };
          }
        }
        return { ok: true, reaction: s.reaction };
      },

      /* --- 手动干预（--force 用） --- */
      force: function (id) {
        if (!BEHAVIOR_MAP[id]) return false;
        enter(BEHAVIOR_MAP[id]);
        return true;
      },

      /* --- 给渲染层的快照 --- */
      snapshot: function (includeLine) {
        var b = BEHAVIOR_MAP[s.behavior] || BEHAVIOR_MAP.LOAF;
        var sleeping = s.behavior === "SLEEP" && !s.reaction;
        var pose = s.reaction ? s.reaction.pose : b.pose;
        return {
          version: VERSION,
          t: s.t,
          behavior: s.behavior,
          behaviorLabel: b.label,
          reaction: s.reaction ? { id: s.reaction.id, label: s.reaction.label, pose: s.reaction.pose, line: s.reaction.line } : null,
          pose: pose,
          poseLabel: s.reaction ? s.reaction.label : b.label,
          sleeping: sleeping,
          needs: {
            fatigue: +s.needs.fatigue.toFixed(3),
            boredom: +s.needs.boredom.toFixed(3),
            loneliness: +s.needs.loneliness.toFixed(3),
            hunger: +s.needs.hunger.toFixed(3),
            alertness: +s.needs.alertness.toFixed(3)
          },
          energy: +(1 - s.needs.fatigue).toFixed(3),
          mood: +s.mood.toFixed(3),
          stage: s.stage,
          stageName: STAGES[s.stage].name,
          xp: s.xp,
          xpNext: STAGES[s.stage + 1] ? STAGES[s.stage + 1].at : null,
          working: s.working,
          hour: s.hour,
          habit: +s.habit.toFixed(3),
          traits: s.traits,
          since: s.behaviorSince,
          until: s.behaviorUntil,
          transitions: s.transitions,
          line: includeLine === false ? null : (s.reaction ? s.reaction.line : (s.lastLine || line()))
        };
      },

      /* --- 从磁盘上的存档恢复 --- */
      restore: function (raw) {
        if (!raw) return this;
        if (typeof raw.t === "number") s.t = raw.t;
        if (raw.behavior && BEHAVIOR_MAP[raw.behavior]) s.behavior = raw.behavior;
        s.behaviorSince = raw.behaviorSince || 0;
        s.behaviorUntil = raw.behaviorUntil || 0;
        s.prev = raw.prev || null;
        s.awakeFor = raw.awakeFor || 0;
        if (raw.needs) {
          NEED_KEYS.forEach(function (k) {
            if (typeof raw.needs[k] === "number") s.needs[k] = clamp(raw.needs[k], 0, 1);
          });
        }
        if (typeof raw.mood === "number") s.mood = clamp(raw.mood, -1, 1);
        s.reaction = raw.reaction || null;
        if (typeof raw.xp === "number") { s.xp = raw.xp; s.stage = stageFor(s.xp); }
        s.working = !!raw.working;
        s.transitions = raw.transitions || 0;
        s.habituation = raw.habituation || {};
        s.lines = raw.lines || 0;
        s.lastLine = raw.lastLine || "";
        s.history = Array.isArray(raw.history) ? raw.history : [];
        return this;
      },

      /* --- 直接读内部（测试用） --- */
      _state: function () { return s; },
      setProfile: function (p) { profile = p; s.traits = deriveTraits(p, opts.seed); s.habit = habitAt(s.hour); }
    };

    return eng;
  }

  /* =======================================================================
   * 7. 进化阶梯
   * ===================================================================== */

  var STAGES = [
    { at: 0,    name: "奶猫", tag: "kitten", note: "睡得多，跑得莫名其妙，话很少。" },
    { at: 150,  name: "少年", tag: "junior", note: "开始有主意。解锁 teach。" },
    { at: 520,  name: "成猫", tag: "adult",  note: "稳了。知道什么时候该安静。" },
    { at: 1500, name: "老猫", tag: "elder",  note: "动作慢了，判断更准，睡得更沉。" },
    { at: 3800, name: "猫又", tag: "nekomata", note: "很少动。动起来没人拦得住。" }
  ];

  function stageFor(xp) {
    var st = 0;
    for (var i = 0; i < STAGES.length; i++) if (xp >= STAGES[i].at) st = i;
    return st;
  }

  /* =======================================================================
   * 8. 性格派生
   * -----------------------------------------------------------------------
   * 从 learner 记下来的原始统计里压出几个 0..1 的性格维度。
   * 没有学习数据时给一组中间值，猫就按"平均人"来活。
   * ===================================================================== */

  function deriveTraits(profile, seed) {
    profile = profile || {};
    var hours = profile.hours || null;
    var nocturnal = 0, total = 0;

    if (hours) {
      for (var i = 0; i < 24; i++) {
        total += hours[i] || 0;
        if (isNight(i) || i === 5) nocturnal += hours[i] || 0;
      }
    }
    var noct = total > 0 ? clamp((nocturnal / total) / 0.22, 0, 1) : 0.30;

    var avgMs = profile.tasks && profile.tasks.ok
      ? (profile.tasks.msTotal || 0) / profile.tasks.ok / 1000
      : 0;
    // 活儿越短，主人越是碎步型
    var sprinter = avgMs ? clamp(1 - (avgMs - 8) / 90, 0, 1) : 0.45;

    var failRate = profile.tasks && profile.tasks.total
      ? (profile.tasks.fail || 0) / profile.tasks.total
      : 0.12;
    var dbg = clamp(failRate / 0.45, 0, 1);

    // 俏皮：你陪它玩得越多，它越放得开。没数据就按种子。
    var inter = profile.interactions || {};
    var played = (inter.pet || 0) + (inter.feed || 0) + (inter.watch || 0);
    var taskN = (profile.tasks && profile.tasks.total) || 0;
    var playful = (played + taskN) > 0
      ? clamp(played / Math.max(6, taskN * 0.6), 0, 1)
      : seedTrait(seed, 7);

    // 傲娇：老在夜里陪你、老看你失败、或者活儿不断却从不陪它玩的猫，
    // 都会学会假装不在乎。没数据就按种子。
    var workNoPlay = clamp(1 - played / Math.max(4, taskN * 0.3), 0, 1);
    var tsundere = taskN >= 8
      ? clamp(noct * 0.5 + dbg * 0.3 + workNoPlay * 0.4, 0, 1)
      : seedTrait(seed, 13);

    var traits = {
      nocturnal: +noct.toFixed(3),
      sprinter: +sprinter.toFixed(3),
      debugger: +dbg.toFixed(3),
      playful: +playful.toFixed(3),
      tsundere: +tsundere.toFixed(3)
    };
    // teach 手动纠正的优先级高于统计推断
    if (profile.override && profile.override.traits) {
      Object.keys(profile.override.traits).forEach(function (k) {
        if (typeof profile.override.traits[k] === "number") {
          traits[k] = clamp(profile.override.traits[k], 0, 1);
        }
      });
    }
    return traits;
  }

  return {
    VERSION: VERSION,
    create: create,
    BEHAVIORS: BEHAVIORS,
    BEHAVIOR_MAP: BEHAVIOR_MAP,
    REACTIONS: REACTIONS,
    REACTION_MAP: REACTION_MAP,
    EVENTS: EVENTS,
    RULES: RULES,
    NEEDS: NEEDS,
    NEED_KEYS: NEED_KEYS,
    STAGES: STAGES,
    stageFor: stageFor,
    deriveTraits: deriveTraits,
    defaultNeeds: defaultNeeds,
    mulberry32: mulberry32
  };
});

/*!
 * Jev Bridge v1.0 — 猫语审判引擎
 * ---------------------------------------------------------------------------
 * 把 TypeSafe Jev 模型（bocha-jev-v1）接入 CAT API。
 *
 * 支持 3 种题型：
 *   - score:  0~1 数值评分（criteria 为数组，首项=0 分含义，末项=满分含义）
 *   - choice: 多选一（criteria 为对象，key=选项，value=含义描述）
 *   - noul:   0~1 否定度（"不是这个意思"的概率）
 *
 * 用法：
 *   JevCat.ask({
 *     state: '猫把杯子推下桌子后假装无事发生',
 *     questions: {
 *       guilt:   { type: 'score',  instructions: '猫有多内疚', criteria: ['清白', '深深懊悔'] },
 *       motive:  { type: 'choice', instructions: '作案动机',   criteria: { boredom: '无聊', gravity: '测试引力', territory: '宣示领地', chaos: '纯粹的混乱' } },
 *       deserve: { type: 'noul',   instructions: '该不该被罚' }
 *     }
 *   }).then(function(answers) { ... });
 *
 * 可选配置：
 *   JevCat.configure({ apiKey: 'sk-...', endpoint: 'https://...' });
 * --------------------------------------------------------------------------- */
(function (root) {
  "use strict";
  if (root.JevCat) return;

  /* ===== 默认配置 ===== */
  var DEFAULT_ENDPOINT = "https://tokendance.space/gateway/typesafe/v1/systemone";
  var DEFAULT_MODEL = "bocha-jev-v1";
  var DEFAULT_API_KEY = ""; // 前端无 key 时调用方须自行 configure

  var config = {
    endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL,
    apiKey: DEFAULT_API_KEY
  };

  /* ===== 对外接口 ===== */
  /**
   * 更新配置
   * @param {Object} opts - { apiKey, endpoint, model }
   */
  function configure(opts) {
    opts = opts || {};
    if (opts.apiKey) config.apiKey = opts.apiKey;
    if (opts.endpoint) config.endpoint = opts.endpoint;
    if (opts.model) config.model = opts.model;
  }

  /**
   * 向 Jev 提问（核心方法）
   * @param {Object} params - { state: string, questions: Object }
   * @returns {Promise<Object>} answers 对象，每个 key 对应一种题型结果
   *
   * questions 格式：
   *   score:  { type:'score', instructions:'...', criteria:['低分含义','高分含义'] }
   *   choice: { type:'choice', instructions:'...', criteria:{ key1:'desc1', key2:'desc2', ... } }
   *   noul:   { type:'noul', instructions:'...' }
   */
  function ask(params) {
    if (!params || !params.state || !params.questions) {
      return Promise.reject(new Error("JevCat.ask: 缺少 state 或 questions"));
    }
    if (!config.apiKey) {
      return Promise.reject(new Error("JevCat.ask: 未配置 apiKey，请先调用 JevCat.configure({ apiKey:'...' })"));
    }

    var body = {
      model: config.model,
      state: params.state,
      questions: params.questions
    };

    return fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Authorization": config.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (txt) {
          throw new Error("Jev API " + resp.status + ": " + txt);
        });
      }
      return resp.json();
    }).then(function (data) {
      if (data.detail) {
        throw new Error("Jev API 验证错误: " + JSON.stringify(data.detail));
      }
      return data;
    });
  }

  /* ===== 便捷方法：猫语审判（预设题型组合） ===== */
  /**
   * 一键审判：传入猫行为描述，返回标准化的审判结果
   * @param {string} incident - 猫行为事件描述
   * @param {string} [apiKey] - 可选 API key
   * @returns {Promise<Object>} { guilt, motive, punishment, cat_pride, raw }
   */
  function judge(incident, apiKey) {
    if (apiKey) configure({ apiKey: apiKey });

    return ask({
      state: incident,
      questions: {
        guilt: {
          type: "score",
          instructions: "这只猫对自己行为的内疚程度",
          criteria: ["完全问心无愧，甚至觉得做得对", "深深懊悔，恨不得钻进地缝"]
        },
        motive: {
          type: "choice",
          instructions: "猫做这件事的真实动机",
          criteria: {
            boredom: "太无聊了，找点事做",
            curiosity: "科学探索精神（测试引力/声音/反弹高度）",
            territory: "宣示主权，这桌子是我的",
            comfort: "那条路线挡住了我的行走路径",
            chaos: "纯粹的熵增，宇宙走向热寂的必然"
          }
        },
        punishment: {
          type: "noul",
          instructions: "这只猫是否应该受到惩罚"
        },
        cat_pride: {
          type: "score",
          instructions: "猫对自己行为的自豪程度",
          criteria: ["毫不在意，甚至没觉得这是个事", "这是本喵最满意的一次杰作"]
        }
      }
    }).then(function (data) {
      var a = data.answers || {};
      // 解析动机
      var motiveChoice = "";
      var motiveProbs = {};
      if (a.motive && a.motive.choice) {
        motiveChoice = a.motive.choice;
        motiveProbs = a.motive.probabilities || {};
      }
      return {
        guilt: a.guilt ? a.guilt.score : null,
        guilt_probs: a.guilt ? a.guilt.probabilities : null,
        motive: motiveChoice,
        motive_probs: motiveProbs,
        should_punish: a.punishment ? 1 - a.punishment.noul : null,  // noul 反转：noul 低 = 该罚
        punishment_noul: a.punishment ? a.punishment.noul : null,
        pride: a.cat_pride ? a.cat_pride.score : null,
        pride_probs: a.cat_pride ? a.cat_pride.probabilities : null,
        raw: data
      };
    });
  }

  /* ===== 结果格式化工具 ===== */
  function formatScore(score) {
    if (score === null || score === undefined) return "--";
    return Math.round(score * 100) + "%";
  }

  function formatNoul(noul) {
    if (noul === null || noul === undefined) return "--";
    var pct = Math.round(noul * 100);
    if (noul > 0.7) return "否（" + pct + "% 不是）";
    if (noul > 0.4) return "存疑（" + pct + "% 不是）";
    return "是（" + (100 - pct) + "% 是）";
  }

  /* ===== 对外暴露 ===== */
  root.JevCat = {
    configure: configure,
    ask: ask,
    judge: judge,
    formatScore: formatScore,
    formatNoul: formatNoul,
    getConfig: function () { return Object.assign({}, config); },
    version: "1.0"
  };
})(typeof self !== "undefined" ? self : this);

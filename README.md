# CAT API — 猫咪接口规范

> 用工程文体处理一种已经大规模部署、却始终不接受参数调优的系统：**猫**。

受 [DOG API — 狗狗接口规范](https://nullurl.github.io/dog-api-spec/) 启发。区别在于，这次把权限模型写反了——系统从架构层面**否认 `Owner` 角色的存在**。

线上：**https://lijinhongucl-pixel.github.io/cat-api-spec/** · 镜像：**https://atomgit.com/SocialiteUCL/cat-api-spec**

---

## 截图

| | |
|---|---|
| ![首页](assets/img/screenshots/home.jpg) | ![正文·权限模型](assets/img/screenshots/spec-permissions.jpg) |
| **首页** —— 项目门面与统计数字 | **正文 §2 权限模型** —— 否认 `Owner` 角色的存在 |
| ![表情渲染器](assets/img/screenshots/expression.jpg) | ![外设控制台](assets/img/screenshots/peripherals.jpg) |
| **表情渲染器** —— 选状态实时出猫脸 SVG | **外设控制台** —— 14 类外设 / 13 道门槛 / 接合评分 |
| ![一只猫的生活意见](assets/img/screenshots/opinions.jpg) | ![活猫](assets/img/screenshots/livecat.jpg) |
| **一只猫的生活意见** —— 31 条当事猫官方立场 | **活猫 LIVECAT v3** —— 屏幕上走来走去、啃元素、追 Token 老鼠 |

---

## 这是什么

把一只猫当成一个接口规范来写。16 章正文、31 条「当事猫意见」、13 个状态码、14 种表情、一份从 §2 开始就反向定义的权限模型。外加：

- 一只会在你屏幕上走来走去的**活猫**（LIVECAT v3，含状态机 / 行为准则 / Token 老鼠）
- 全站**多人联机**（光标 / 多猫同屏 / 今日猫碗 / 协作围捕）
- **CrossPet Protocol**——跨站宠物串门协议（猫能穿越到别站去）
- 25 个交互式**工具页**（表情渲染器 / 抚摸路径规划器 / 赛博遛猫 / 猫狗串门 …）
- 两份 **OpenAPI 3.1** 描述（14 端点 + 9 量化端点，可直接喂 Swagger UI）

风格：工程文体 + 玩梗。不是科普，不是图鉴——是把 RFC 的骨架拿来描述一只猫。

**数字**：151 次提交 · 24 个工具页面 · 10 个 JS 引擎 · 5500+ 行 JS · 零依赖零构建

---

## 项目结构

```
cat-api-spec/
├── index.html                  # 首页 / 项目门面（32 个入口，6 个 Tab）
├── versions.html               # 历史版本（v0.1 → v0.6.0）
├── 404.html                    # 状态码梗的 404
├── llms.txt                    # 给 AI 读的索引
├── AGENTS.md                   # 给 AI 编程工具的施工说明
├── CLAUDE.md                   # Claude Code 专用
├── spec/
│   ├── cat.html                # 正文 16 章（§0 → §15）
│   ├── openapi.yaml            # OpenAPI 3.1 完整描述（14 端点）
│   └── quantified-api.yaml     # 量化派生指标 OpenAPI（9 端点）
├── skill/                      # 命令行 + 安装包
│   ├── cat-api.js              # 零依赖 CLI，14 个端点
│   └── install.sh              # 一条 curl 命令的安装包
├── tools/                      # 25 个交互式工具
│   ├── expression.html         # 表情渲染器：选状态实时出猫脸 SVG
│   ├── expression-sheet.html   # 表情联系表：批量查看 14 种表情
│   ├── peripherals.html        # 外设控制台：14 类外设 + 17 道门槛
│   ├── cyber-stroll.html       # 赛博遛猫：图片 → 网格 → 网格化 SVG
│   ├── astraflow.html          # 星图接入：AstraFlow 大模型工作台
│   ├── crosspet.html           # 跨站串门 + 猫狗串门互动矩阵
│   ├── door-negotiator.html    # 不让猫进的那扇门：门判谈判模拟器
│   ├── meow-decoder.html       # 猫语翻译器
│   ├── petting-router.html     # 抚摸路径规划器
│   ├── cat-review.html         # 360° 猫档案
│   ├── health-check.html       # 健康检查面板
│   ├── quantifier.html         # 量化评估器（RER / DER / HRI …）
│   ├── charts.html             # 图表图鉴（19 张手绘灰阶 SVG）
│   ├── heatmap-24h.html        # 24h 作息热力图
│   ├── nine-lives.html         # 九条命燃尽图
│   ├── litterbox.html          # 猫砂盆审计日志
│   ├── adoption.html           # 领养（四元组 → 领养 KEY 与名字）
│   ├── cat-diary.html          # 猫的日记
│   ├── can-jump.html           # 跳跃判定器
│   ├── breaking-changes.html   # Breaking Changes
│   ├── cat-404.html            # 猫的 404 日志
│   └── 3am-newsroom.html       # 3AM 编辑部
├── reference/
│   ├── opinions.html           # 一只猫的生活意见（31 条全文）
│   ├── voice.html              # 口吻与文体指南
│   ├── cheatsheet.html         # 速查卡
│   ├── errors.html             # 13 个状态码对照
│   ├── glossary.html           # 术语表
│   └── vitals.html             # 生命体征参考值
├── sdk/
│   ├── cat-api-client.js       # JavaScript SDK（UMD，零依赖）
│   └── demo.html               # SDK 演示页
├── docs/
│   ├── CHANGELOG.md            # v0.1 → v0.5.0 变更日志
│   └── CONTRIBUTING.md         # 贡献指南
├── assets/
│   ├── css/
│   │   ├── spec.css            # 主样式（浅色文档风）
│   │   ├── livecat.css         # 活猫样式（22 状态动画）
│   │   ├── crosspet.css        # CrossPet 串门协议样式
│   │   └── multiplayer.css     # 多人协作样式
│   ├── js/
│   │   ├── livecat.js          # 活猫引擎（1828 行，22 状态状态机）
│   │   ├── expression.js       # 表情渲染引擎（847 行，14 状态 SVG）
│   │   ├── crosspet.js         # CrossPet 协议（464 行，跨站宠物串门）
│   │   ├── multiplayer.js      # 多人协作（1002 行，跨 tab 光标/老鼠）
│   │   ├── jev.js              # Jev AI 判定封装（score/choice/noul 三题型）
│   │   ├── jev-brain.js        # Jev Brain 活猫 AI 决策引擎
│   │   ├── peripherals.js      # 外设评分引擎
│   │   ├── charts.js           # 图表引擎
│   │   ├── quantify.js         # 量化计算引擎
│   │   └── visitor-counter.js  # 访客计数
│   └── img/
│       ├── favicon.svg         # 侧脸猫剪影 favicon
│       └── screenshots/        # README 截图
├── .nojekyll                   # GitHub Pages 不走 Jekyll
├── LICENSE                     # MIT
└── README.md                   # 你正在看的这个
```

**零依赖、零构建、零字体、零 CDN。** 把仓库克隆下来双击 `index.html` 就能跑。

---

## 核心系统

### 🐱 活猫 LIVECAT

每页右下角有一只会自己活动的猫。**22 个行为状态**，由状态机驱动：

- **基础状态**：睡觉 / 巡逻 / 理毛 / 进食 / 玩耍 / 凝视 / 疯跑 / 钻纸箱
- **微动作**：伸懒腰 / 打哈欠 / 盯鼠标 / 啃食页面内容 / 蹭人腿
- **特殊事件**：凌晨 3 点强制 ZOOMIES / 呕吐毛球 / 追激光笔 / 踩奶
- **交互**：戳它触发踩奶、🐟 喂零食、抚摸配额每日 5 次（429）
- **跨页面**：位置持久化到 localStorage，换页面猫还记得自己在哪

### 🧠 Jev Brain — AI 决策引擎

活猫可以被 AI 驱动。点首页左下角「🧠 AI 模式」按钮，输入 Jev API Key，猫的状态切换不再随机——Jev 根据当前时间、鼠标活跃度、上一状态、饱腹值、页面标题来智能决策。

每次决策时猫头上会冒出「猫在想什么」气泡，显示 AI 的判断理由和置信度。API 挂了自动降级回加权随机，不影响体验。

### ⚖️ 猫语审判台

输入一个猫行为事件，Jev AI 从猫的视角给出四维判决：内疚指数、该不该罚、作案动机分析（概率分布条形图）、猫自豪度。6 个预设示例，支持自由输入。

### 🐾 CrossPet 串门协议

跨站宠物串门。加载 `crosspet.js` 后，任何网站的宠物都可以穿越到你的页面。内置 4 只 AI 插画级串门宠物（金毛/橘猫/仓鼠/黑猫警长），支持手动召唤、互动检测、串门日志。

### 🎭 表情引擎

14 个可观测状态、13 维参数向量、确定性 SVG 渲染。拖滑块改耳朵角度、瞳孔面积、炸毛指数和呼噜频率，实时看猫变脸。两个状态混合时权重不够会被拒绝。

### 👥 多人协作

跨 tab 光标追踪、在线人数、协作抓老鼠。打开两个标签页就能看到对方的光标在动。

---

## 章节地图

| 章节 | 标题 | 在哪 |
|---|---|---|
| §0 | 关于本文档怎么读 | [spec/cat.html](spec/cat.html) |
| §1 | 系统概述 | spec/cat.html#s1 |
| §2 | 权限模型（无 Owner） | spec/cat.html#permissions |
| §3 | 领地协议 | spec/cat.html#territory |
| §4 | 通信接口 | spec/cat.html#comm |
| §5 | 睡眠子系统 | spec/cat.html#sleep |
| §6 | 狩猎序列 | spec/cat.html#hunt |
| §7 | 进食协议（含 RER 公式） | spec/cat.html#feed |
| §8 | 外设总线 | spec/cat.html#peripherals |
| §9 | 排泄协议 | spec/cat.html#litter |
| §10 | 表情接口 EXPR v1 | spec/cat.html#expr |
| §11 | 状态码（13 个） | spec/cat.html#codes |
| §12 | 一只猫的生活意见（节选） | spec/cat.html#opinions |
| §13 | 量化参数 | spec/cat.html#quant |
| §14 | 速查卡 | spec/cat.html#cheat |
| §15 | 附录 | spec/cat.html#apx |

---

## 活猫（LIVECAT v3）

每页右下角有一只会自己活动的猫：

- **完整身体**：头 + 身体 + 4 腿 + 尾巴，SVG 实时渲染
- **27 个状态**：睡觉 / 巡视 / 理毛 / 追猎 / 追 Token 老鼠 / 啃食 / 疯跑 / 钻纸箱 / 凝视 / 蹭你 / 被摸 / 踩奶 / 追激光 / 困惑 / 打哈欠 / 伸懒腰 / 吐毛球 / 吃零食 / 猫薄荷反应 / 不反应猫薄荷 / 凝视老鼠 / 凝视鼠标 / 穿越出去 / 遇见访客 …
- **16 条行为准则**：领地完整时优先睡觉 / 鼠标太快触发追猎 / 凌晨三点 ZOOMIES / 钻纸箱后输入延迟 / 中央区域停留超 3 秒撤离 …
- **Token 老鼠**：每隔一段时间刷新一只「Token 老鼠」，猫会去追，用户也可以抢先点击（猫吃醋）
- **跨页面穿越**：猫会带着状态从上一个页面穿越到下一个页面
- **CrossPet 桥接**：猫能「穿越出去」到加入 CrossPet Protocol 的别站去（比如 DOG API），别站宠物也能穿越过来
- **可交互**：戳它切踩奶、🐟 喂零食、📜 查准则、× 收起 10 秒自动回

---

## 多人联机（Multiplayer）

全站 30 个页面接入了多人联机系统（基于 Supabase Realtime Broadcast，未配置时自动降级为单机模式）：

| 玩法 | 说明 |
|---|---|
| **远程光标** | 其他访客的鼠标位置实时显示为彩色幽灵箭头 |
| **在线计数** | 右上角 HUD 显示当前几只猫在线 |
| **自定义名字** | 访客徽章可点击编辑，改成你的名字（默认随机生成） |
| **多猫同屏** | 别站访客的猫会出现在你的屏幕上（hue-rotate 染色区分） |
| **今日猫碗** | 所有访客合作投喂，满 100 发金币粒子，满 1000 解锁传说徽章 |
| **协作围捕** | 多人光标围堵 Token 老鼠的协作玩法 |

---

## CrossPet Protocol

跨站宠物串门开放协议（v1.0）。任何加载了 `crosspet.js` 的站点都能加入：

```html
<link rel="stylesheet" href="https://lijinhongucl-pixel.github.io/cat-api-spec/assets/css/crosspet.css">
<script src="https://lijinhongucl-pixel.github.io/cat-api-spec/assets/js/crosspet.js"></script>
<script>
  CrossPet.init({
    petType: 'dog',              // cat / dog / hamster / 自定义
    petName: '我的狗',
    petSVG: '<svg>...</svg>'      // 不传会用内置 fallback
  });
</script>
```

加入后你的宠物就能穿越到其他加入站点，别站宠物也会穿越过来。未配置 Supabase 时走单站演示模式（每 60-180 秒自动模拟穿越）。

已加入站点：CAT API（猫）· DOG API（狗）

---

## 工具页（25 个）

| 工具 | 做什么 |
|---|---|
| [表情渲染器](tools/expression.html) | 选状态 / 参数实时出猫脸 SVG |
| [表情联系表](tools/expression-sheet.html) | 14 种表情批量速览 |
| [外设控制台](tools/peripherals.html) | 14 类外设 / 17 道门槛 / 环境抑制判定 |
| [门判谈判器](tools/door-negotiator.html) | 那扇不让猫进的门，模拟判谈判过程 |
| [猫语翻译器](tools/meow-decoder.html) | 意图识别 → 结构化 JSON |
| [赛博遛猫](tools/cyber-stroll.html) | 图片降格成网格猫，鼠标当牵引绳 |
| [星图接入](tools/astraflow.html) | 浏览器直连 AstraFlow，KEY 不落地 |
| [跨站串门](tools/crosspet.html) | 猫狗串门：跨物种互动矩阵 |
| [抚摸路径规划器](tools/petting-router.html) | 规划安全抚摸路线（避开禁区） |
| [360° 猫档案](tools/cat-review.html) | 全方位猫评测报告 |
| [健康检查面板](tools/health-check.html) | 体温 / 心率 / 呼吸 / 体重判读 |
| [量化评估器](tools/quantifier.html) | RER / DER / DNS / HRI 实时计算 |
| [图表图鉴](tools/charts.html) | 19 张手绘灰阶 SVG 数据图 |
| [24h 热力图](tools/heatmap-24h.html) | 猫的一天作息可视化 |
| [九条命燃尽图](tools/nine-lives.html) | 九条命消耗进度 |
| [猫砂盆审计](tools/litterbox.html) | 排泄协议日志（含异常告警） |
| [领养](tools/adoption.html) | 四元组 → 领养 KEY 与名字 + 安装命令 |
| [猫的日记](tools/cat-diary.html) | 当事猫第一人称日志 |
| [跳跃判定器](tools/can-jump.html) | 判定这只猫能不能跳这么高 |
| [Breaking Changes](tools/breaking-changes.html) | 破坏性变更公告 |
| [猫的 404 日志](tools/cat-404.html) | 猫找不到东西的记录 |
| [3AM 编辑部](tools/3am-newsroom.html) | 凌晨三点的猫编辑部 |

---

## 参考页面（6 个）

| 页面 | 内容 |
|---|---|
| [一只猫的生活意见](reference/opinions.html) | 31 条当事猫官方立场全文 |
| [口吻指南](reference/voice.html) | CAT API 文档的写作文体规范 |
| [速查卡](reference/cheatsheet.html) | 状态码 + 表情 + 关键参数一页纸 |
| [状态码对照](reference/errors.html) | 13 个状态码详细说明 |
| [术语表](reference/glossary.html) | 全部专有名词解释 |
| [生命体征](reference/vitals.html) | 体温 / 心率 / 呼吸正常范围 |

---

## SDK

UMD 格式，零依赖，直接 `<script>` 引入即可。演示页：[sdk/demo.html](sdk/demo.html)。

```html
<script src="sdk/cat-api-client.js"></script>
<script>
  var client = CatAPIClient;
  // 挑一个端点，点一下
  var ep = client.RESOURCES.filter(function (r) { return r.path === '/api/v1/state'; })[0];
  client.call(ep, function (err, res) {
    console.log(res.status, res.body);
  });
  // 资源表自检
  console.log(client.selfCheck());
</script>
```

Node 环境也可以 `require`：

```js
const client = require('./sdk/cat-api-client.js');
```

---

## 命令行（CLI）

14 个端点全部可以从命令行调。零依赖，不装 npm 包，不联网。

```bash
# 安装（一条命令，领养 + 装 CLI）
curl -fsSL https://lijinhongucl-pixel.github.io/cat-api-spec/skill/install.sh \
  | sh -s -- --adopter "你@这台机器"

# 用
cat-api                    # 列出全部端点
cat-api state              # 查当前状态
cat-api pet --json         # 机器可读输出
cat-api 'DELETE /api/v1/laser'
cat-api --help             # 完整说明
cat-api --state            # 看模拟状态
```

退出码分语义：`0` 成功 / `1` 端点不存在 / `2` 被拒绝 / `3` 系统不可用。

想看 bath 彩蛋的「态度逐级恶化」需要开启持久化：

```bash
export CAT_API_STATE=/tmp/cat.json
cat-api bath   # 418  I'm a cat
cat-api bath   # 406  它已经知道你要干什么了
cat-api bath   # 503  它走了。你找不到它。
cat-api --reset
```

卸载：

```bash
sh skill/install.sh --uninstall
```

领养证保留在 `~/.cat-api/adoption.json` —— 卸载不撤销任何东西。

---

## AI 接入

这个仓库同时是给人读的站点和给 AI 用的规范。

| 文件 | 面向 |
|---|---|
| [`llms.txt`](llms.txt) | AI 索引。端点表、状态码含义、核心公式、工具清单 |
| [`AGENTS.md`](AGENTS.md) | AI 编程工具施工说明。硬约束、目录职责、验证命令、已知坑 |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code 专用，精简版 + 猫的行为学设定 |
| [`skill/`](skill/) | CLI + 安装包 |
| [`spec/openapi.yaml`](spec/openapi.yaml) | 14 个端点的 OpenAPI 3.1 描述 |
| [`spec/quantified-api.yaml`](spec/quantified-api.yaml) | 9 个量化端点 |

让 AI 编程工具读懂这个仓库，只需要让它读 `AGENTS.md`。

**四处实现互相钉住**（改一边必须同步另一边，判据是各自的 selfCheck）：

```
skill/cat-api.js          ← CLI 资源表
sdk/cat-api-client.js     ← 浏览器 SDK 资源表     （端点数必须一致）
skill/install.sh          ← 领养 KEY 计算
assets/js/adoption-key.js ← 网页端领养 KEY 计算  （§5.3 测试向量必须一致）
```

---

## 本地预览

```bash
git clone https://github.com/lijinhongucl-pixel/cat-api-spec.git
cd cat-api-spec
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

直接双击 `index.html` 也能跑，但本地 server 更接近线上行为。

---

## 部署

站点托管在 GitHub Pages，推到 `main` 分支自动部署：

```bash
git add .
git commit -m "你的提交信息"
git push origin main
# Pages 一般 15~30 秒 built
```

镜像同步在 AtomGit：`https://atomgit.com/SocialiteUCL/cat-api-spec`

`.nojekyll` 已在仓库根目录，不要删。

---

## 致谢

- 灵感来源：[DOG API — 狗狗接口规范](https://nullurl.github.io/dog-api-spec/)（已加入 CrossPet Protocol 🐾）
- 所有真正懂猫的人——尤其是那只此刻正在你屏幕右下角走来走去的

---

## License

MIT — 见 [LICENSE](LICENSE)。

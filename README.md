# CAT API — 猫咪接口规范

> 用工程文体处理一种已经大规模部署、却始终不接受参数调优的系统：**猫**。

受 [DOG API — 狗狗接口规范](https://nullurl.github.io/dog-api-spec/) 启发。区别在于，这次把权限模型写反了——系统从架构层面**否认 `Owner` 角色的存在**。

线上：**https://lijinhongucl-pixel.github.io/cat-api-spec/**

---

## 截图

| | |
|---|---|
| ![首页](assets/img/screenshots/home.png) | ![正文·权限模型](assets/img/screenshots/spec-permissions.png) |
| **首页** —— 项目门面与统计数字 | **正文 §2 权限模型** —— 否认 `Owner` 角色的存在 |
| ![表情渲染器](assets/img/screenshots/expression.png) | ![外设控制台](assets/img/screenshots/peripherals.png) |
| **表情渲染器** —— 选状态实时出猫脸 SVG | **外设控制台** —— 14 类外设 / 13 道门槛 / 接合评分 |
| ![一只猫的生活意见](assets/img/screenshots/opinions.png) | ![活猫](assets/img/screenshots/livecat.png) |
| **一只猫的生活意见** —— 31 条当事猫官方立场 | **活猫** —— 会在你屏幕上走来走去 |

---

## 这是什么

把一只猫当成一个接口规范来写。16 章正文、31 条「当事猫意见」、13 个状态码、14 种表情、一份从 §2 开始就反向定义的权限模型，外加一只会自己在你屏幕上走来走去的活猫。

风格：工程文体 + 玩梗。不是科普，不是图鉴——是把 RFC 的骨架拿来描述一只猫。

**数字**：150 次提交 · 24 个工具页面 · 10 个 JS 引擎 · 5500+ 行 JS · 零依赖零构建

---

## 项目结构

```
cat-api-spec/
├── index.html                  # 首页 / 项目门面（含 AI 模式开关）
├── spec/
│   ├── cat.html                # 正文 16 章（§0 → §15 附录）
│   ├── openapi.yaml            # OpenAPI 3.1 机器可读描述（12 端点）
│   └── quantified-api.yaml     # 量化指标 OpenAPI（9 端点）
├── tools/                      # 24 个可交互工具页面
│   ├── tour.html               # 🗺️ 猫咪百货大楼导览（6 层楼导航）
│   ├── expression.html         # 表情渲染器（14 状态实时 SVG）
│   ├── expression-sheet.html   # 表情联系表（14 帧平铺）
│   ├── cat-judgment.html       # ⚖️ 猫语审判台（Jev AI 判定）
│   ├── crosspet.html           # 🐾 CrossPet 串门中心（跨站宠物协议）
│   ├── petting-router.html     # 抚摸路径规划器（8 区域风险评分）
│   ├── meow-decoder.html       # 猫语翻译器（9 意图识别）
│   ├── door-negotiator.html    # 不让猫进的那扇门（5 轮谈判游戏）
│   ├── 3am-newsroom.html       # 3AM 编辑部（8 轮限时选稿）
│   ├── nine-lives.html         # 九条命燃尽图（14 天 sprint）
│   ├── can-jump.html           # 跳跃判定器（生物力学计算）
│   ├── cat-diary.html          # 猫的日记（实时生长，每天 8-12 条）
│   ├── cat-review.html         # 360° 猫档案（六维雷达图）
│   ├── cat-404.html            # 猫的 404 日志（终端日志流）
│   ├── breaking-changes.html   # Breaking Changes（猫本位变更日志）
│   ├── litterbox.html          # 猫砂盆审计日志
│   ├── health-check.html       # API 健康检查面板（12 子系统）
│   ├── heatmap-24h.html        # 24h 作息热力图（7×24 矩阵）
│   ├── charts.html             # 图表图鉴（19 张灰阶手绘 SVG）
│   ├── quantifier.html         # 量化评估器（RER/DER/DNS 五维）
│   ├── peripherals.html        # 外设控制台（14 类设备 13 道门槛）
│   ├── adoption.html           # 领养组件（生成 curl 安装命令）
│   ├── pet-design-preview.html # 宠物形象设计稿 v2
│   └── pet-design-v3.html      # 宠物形象设计稿 v3
├── reference/
│   ├── opinions.html           # 一只猫的生活意见（31 条全文）
│   ├── voice.html              # 口吻与文体指南
│   ├── cheatsheet.html         # 速查卡
│   ├── errors.html             # 13 个状态码对照
│   ├── glossary.html           # 术语表
│   └── vitals.html             # 生理速查
├── sdk/
│   ├── cat-api-client.js       # CAT API JS SDK
│   └── demo.html               # SDK 控制台演示
├── assets/
│   ├── css/
│   │   ├── spec.css            # 主样式（浅色文档风）
│   │   ├── livecat.css         # 活猫样式（30 状态动画）
│   │   ├── crosspet.css        # CrossPet 串门协议样式
│   │   └── multiplayer.css     # 多人协作样式
│   ├── js/
│   │   ├── livecat.js          # 活猫引擎（1828 行，30 状态状态机）
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
│       ├── pets/               # 串门宠物插画 v1（AI 生成）
│       ├── pets-v2/            # 串门宠物插画 v2（统一贴纸风）
│       └── screenshots/        # README 截图
├── 404.html                    # 状态码梗的 404
├── .nojekyll                   # 让 GitHub Pages 不走 Jekyll
└── README.md                   # 你正在看的这个
```

**零依赖、零构建、零字体、零 CDN。** 把仓库克隆下来双击 `index.html` 就能跑。

---

## 核心系统

### 🐱 活猫 LIVECAT

每页右下角有一只会自己活动的猫。**30 个行为状态**，由状态机驱动：

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
| §0 | 关于本文档怎么读 | [spec/cat.html#s0](spec/cat.html) |
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

## 工具导航

不知道从哪开始？去 **[猫咪百货大楼](tools/tour.html)** —— 一只猫导览员带你逛完 6 层楼 28 个房间。

| 楼层 | 主题 | 房间 |
|---|---|---|
| B1 | 规范层 | 正文、OpenAPI、量化评估、外设控制、领养、生活意见 |
| 1F | 表情馆 | 表情渲染器、表情联系表、抚摸路径规划器、猫语翻译器 |
| 2F | 健康中心 | 健康检查面板、24h 热力图、猫砂盆审计、图表图鉴 |
| 3F | 游乐场 | 门谈判游戏、跳跃判定器、3AM 编辑部、九条命燃尽图 |
| 4F | 档案室 | 猫的日记、360° 档案、Breaking Changes、404 日志 |
| 5F | 新大陆 | 猫语审判台、CrossPet 串门中心、速查卡、生理参考 |

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

`.nojekyll` 已在仓库根目录，不要删。

---

## 致谢

- 灵感来源：[DOG API — 狗狗接口规范](https://nullurl.github.io/dog-api-spec/)
- Jev 判定模型：[TypeSafe Jev](https://tokendance.space)（bocha-jev-v1）
- 所有真正懂猫的人——尤其是那只此刻正在你屏幕右下角走来走去的

## License

MIT — 见 [LICENSE](LICENSE)。

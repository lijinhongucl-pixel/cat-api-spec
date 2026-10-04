# AGENTS.md

给 AI 编程工具的施工说明。这个仓库有两类 AI 读者：
**用工具的**（读 `llms.txt` 调 CLI）和**改代码的**（读本文件）。

---

## 这是什么仓库

CAT API — 猫咪接口规范。一份用工程文体写的猫的接口规范，同时是一个零构建静态站点。

**它同时是三个东西**，改之前先确认你改的是哪个：

1. **规范**（`spec/`）— 16 章正典 + 2 份 OpenAPI。这是内容，改动要慎重
2. **站点**（`tools/` `reference/` `sdk/` `index.html`）— 24 个工具页面。这是载体，改动要保稳
3. **引擎**（`assets/js/`）— 所有计算逻辑。这是地基，改动要跑验证

## 硬约束（违反了就是 bug，不是风格问题）

### 1. 不许发网络请求
全站只有 2 张页面可以出网：`tools/astraflow.html`（星图接入）和 `tools/crosspet.html`（跨站串门）。
其余每一页都必须拔网线可读。新增页面默认必须是离线的。

### 2. 不许写死配额和阈值
所有阈值、权重、公式必须从引擎（`assets/js/*.js`）读。
页面里出现字面数字当配额用，就是回归。检查方法：

```bash
# 页面里不该出现这些
grep -nE 'quota\s*=\s*[0-9]|threshold\s*=\s*[0-9]|weight\s*=\s*[0-9]\.[0-9]' tools/*.html
```

### 3. 不许硬编码密钥
`.gitignore` 排除了 `assets/js/jev-config.js`。它只存在于本地。
提交前确认：

```bash
git grep -nE 'sk-[a-f0-9]{32,}' -- . ':!*.md'   # 必须无输出
```

### 4. 不许发网络请求的 AI 决策也不能泄密
首页的 `autoEnable()` 从 `window.CAT_API_CONFIG.jevKey` 读密钥，站点上不显示任何开关。
`?jev=0` 是隐藏的开发者入口，不是用户功能。

## 目录职责

四层的边界是硬的。**加文件之前先问它属于哪一层。**

| 目录 | 职责 | 能加什么 |
|---|---|---|
| `assets/` | 页面运行时要加载的 | js / css / img |
| `spec/` | 规范内容 | Markdown、YAML |
| `tools/` `reference/` `sdk/` | 给人看的页面 | HTML |
| `docs/` | 给人读的说明 | Markdown |
| `skill/` | CLI + 安装包 | sh / js |

文件名里**不要**重复系统名（不要 `charts-cat.js`，就写 `charts.js`）。
整个站点只服务 CAT 一个系统，在文件名里写 `cat` 是冗余。

## 加一个新工具页的 checklist

```
1. 在合适分类下建 tools/<name>.html
2. 补 canonical、og:*、twitter:* 全套 meta（照抄同级页面）
3. 引 assets/css/spec.css + livecat.css + multiplayer.css + crosspet.css
4. 逻辑放 assets/js/<name>.js，不要内联在 HTML 里（内联只留给 <100 行的胶水）
5. 首页对应 Tab 加卡片，同步 .count 数字和 tab-hint 说明
6. 离线自检：断网刷新页面，控制台无报错，功能仍可用
7. 引擎自检：node --check assets/js/<name>.js
8. 密钥自检：git grep -nE 'sk-[a-f0-9]{32,}'
9. 提交时写清改了什么、为什么
```

## 视觉系统

老钱风色板，全站统一，**不要引入新颜色**：

```css
--bg:     #FAF8F5   /* 暖象牙背景 */
--panel:  #ffffff
--ink:    #2C2C2A   /* 炭灰正文 */
--muted:  #6b6b6b   /* 次要文字 */
--faint:  #b8b4ae
--line:   #e5e2dd
--accent: #1B3A2E   /* 深森林绿，主色 */
--gold:   #C8A35E   /* 古铜金，点缀 */
--wine:   #5C1A1B   /* 深酒红，强调 */
--serif:  Georgia, "Songti SC", "Noto Serif SC"
```

规则：
- 标题用 `--serif`（衬线），正文用 PingFang（无衬线），形成对比
- 强调用古铜金，**不要**用高饱和红绿
- 0 数字（Owner 角色数）用反色填充强调——这是首页的视觉锤
- 边框圆角 8–18px，别更大

## 文体纪律

这份文档有两个声部，写任何说明文字都要选对：

- **规范编写组** — 给事实。引用必须可验证，标来源等级 A/B/C
- **当事猫** — 给结论。没有出处，因为它自己就是出处

硬规则：
- 没有出处的数值一律标 `HEURISTIC`
- 不确定的引用标「待人工审阅」
- 不用破折号（——），改用逗号或句号
- 中文引号用「」，不用英文双引号
- 不用 emoji 做功能性标记，图标用内联 SVG（`stroke-width:1.8`, `stroke-linecap:round`）

## 验证命令

改完必须跑：

```bash
# 1. JS 语法
for f in assets/js/*.js sdk/*.js skill/*.js; do node --check "$f" || echo "FAIL $f"; done

# 2. HTML 结构（每个页面七项：html/head/body/lang/charset/viewport/title）
for f in tools/*.html reference/*.html; do
  grep -q '<!DOCTYPE html>' "$f" && grep -q 'lang="zh-CN"' "$f" \
    && grep -q 'charset="UTF-8"' "$f" && grep -q 'name="viewport"' "$f" \
    && grep -q '</html>' "$f" || echo "FAIL $f"
done

# 3. 密钥泄漏（必须无输出）
git grep -nE 'sk-[a-f0-9]{32,}' -- . ':!*.md'

# 4. 出网页面清单（应该只有 2 个）
grep -rlE 'fetch\(|XMLHttpRequest|WebSocket' tools/ | sort
```

## 提交信息

写清楚**改了什么**和**为什么**，不要写「fix bug」这种。

```
fix(hero): 状态机改环形布局 + 修 transform 冲突

尾巴的 CSS animation 会覆盖 SVG transform 属性，
导致它飞到左上角。改成外层 g 做位移 + 内层 g 做摆动。
```

## AI 决策引擎（jev-brain.js）

首页接了一个可选的 AI 决策层：接上 systemone 网关，猫的每次状态转移都由模型选。
它在 `assets/js/jev-brain.js`，密钥从 `assets/js/jev-config.js` 读（不入仓）。

如果改动涉及状态机，注意 `livecat.js` 的 `transitionTo(name, opts)` 有 `opts.isAI` 分支——
AI 决策会走 `speak(lines, { isAI: true })`，气泡样式和 TTL 都不同（4000ms vs 2800ms）。
两套气泡曾经冲突过（jev-brain 有独立 DOM），现在统一到 livecat 的 speak 通道，不要改回去。

## 领养

领养只有一种形态：**装技能**。

```bash
curl -fsSL https://lijinhongucl-pixel.github.io/cat-api-spec/skill/install.sh \
  | sh -s -- --adopter "你@这台机器"
```

领养元组四元组：`adopter` / `cohort`（UTC 秒） / `habitat`（安装目录） / `intent`（用途）。
KEY = 摘要前 8 字节。名字 = 同一份摘要派生的另一个切片，**名字不进 KEY**。

网页端和命令行两份实现互相钉住，判据是 §5.3 的测试向量。
改任何一边，另一边必须复现同样的值。

## 边界

这一页没有一句有出处——因为它自己就是出处。

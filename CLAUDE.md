# CLAUDE.md

给 Claude Code 的施工说明。完整版见 `AGENTS.md`，这里只放 Claude Code 需要知道的。

## 先读这个

改这个仓库之前，按顺序读：

1. `AGENTS.md` — 硬约束、目录职责、验证命令
2. `llms.txt` — 这份规范是什么、核心认知转变
3. `spec/cat.html` — 只读需要改的那一章

## 四条硬约束

**1. 全站默认离线。** 只有 2 张页面可以出网（`tools/astraflow.html`、`tools/crosspet.html`）。
新增页面必须拔网线可读。

**2. 阈值不许写死。** 所有配额、权重、公式从 `assets/js/*.js` 引擎读。
页面里出现字面数字当配额就是回归。

**3. 密钥不入仓。** `.gitignore` 排除了 `assets/js/jev-config.js`。
提交前跑 `git grep -nE 'sk-[a-f0-9]{32,}' -- . ':!*.md'`，必须无输出。

**4. 文件名不重复系统名。** 写 `charts.js` 不写 `charts-cat.js`。

## 常用命令

```bash
# 本地起服务（file:// 不能跑 fetch，必须起 http）
python3 -m http.server 8899

# 真实渲染验证（比看 diff 靠谱）
# 用 playwright-core + 系统 Chrome，page.on('pageerror') 抓报错
# 记得用 ?jev=0 关掉 AI 决策避免网络请求干扰

# 全套自检
node --check assets/js/*.js && node --check sdk/*.js && node --check skill/*.js
git grep -nE 'sk-[a-f0-9]{32,}' -- . ':!*.md'   # 必须无输出
```

## 已知的坑

**CSS `transform` 会覆盖 SVG 的 `transform` 属性。**
如果一个 SVG 元素既要定位又要动画，必须拆成两层 `<g>`：外层定位，内层动画。
这个坑在状态机的尾巴上踩过一次——尾巴飞到左上角变成黑三角，排查花了不少时间。

**公众号/静态站不要用 `display:flex` 做复杂布局。** 如果目标包含编辑器粘贴场景，
用 `<table>` + `<td width>` 而不是 flex。但本项目的页面是直接浏览，不受此限。

**`livecat.js` 和 `jev-brain.js` 的气泡曾经冲突过。**
现在统一到 `livecat.js` 的 `speak()` 通道，`jev-brain.js` 不再自己建 DOM。
看到有人想给 jev-brain 加独立气泡，先拦下来。

**共享状态用原子读-改-写。**
`localStorage` 的 Token 计数曾经因为「读-改-写」两步之间被别的 tab 插进来而丢更新。
模式是：读 → 改 → 立刻写，中间不 await。

## 猫的设定（写文案时会用到）

- 猫是**晨昏性动物**（crepuscular），不是夜行动物。凌晨两点疯跑、下午一点睡死
- **慢眨眼**是最高正面信号；**盯着看**等于「我在评估你作为猎物」，意思完全相反
- **喵叫**几乎不用于猫与猫之间——它是猫为**人类**开发的外部接口
- 蹭你不是欢迎你，是重新写入你身上的信息素标签（你外面沾了别的味道）
- 踩奶是幼态安全模式残留
- **纸箱优先级 MUST**，高于所有官方外设，实测有效率 97%
- **Owner 角色不存在**。只有 Staff 和入侵者

## 文体

- 不用破折号（——），用逗号或句号
- 中文引号用「」，不用英文双引号
- 图标用内联 SVG，不用 emoji
- 没有出处的数值标 `HEURISTIC`
- 不确定的引用标「待人工审阅」

## 提交

写清改了什么和为什么。参考：

```
fix(hero): 状态机改环形布局 + 修 transform 冲突

尾巴的 CSS animation 会覆盖 SVG transform 属性，导致它飞到左上角。
改成外层 g 做位移 + 内层 g 做摆动。
```

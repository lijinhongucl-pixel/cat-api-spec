# CAT API 变更日志

本项目的版本号遵循两个约定：
1. 正文章节大改动（新增 / 删除 / 重写整章）→ 中位数版本号 +1
2. 工具 / 引擎 / 参考页新增 → 小数版本号 +1

每个版本都会附一个内部代号——猫的品种或猫相关的文化符号。

---

## v0.5.0 — "Full Spec Release" (2026-09-17)

工程页面全面补齐。

### 新增
- **量化评估器** `tools/quantifier.html` + `assets/js/quantify.js`
  - RER / DER / 饮水量 / DNS 五维 / HRI / VSI / 免疫 / 寄生虫排程
  - 来源等级标注 A / B / C
  - JSON 输出可复制
- **生理指标速查** `reference/vitals.html`
  - 8 项 A 级指标 + P0/P1/P2/P3 分档
  - 可打印
- **SDK 控制台** `sdk/demo.html` + `sdk/cat-api-client.js`
  - 12 个模拟接口（含 `/api/bath` 连点彩蛋）
- **表情联系表** `tools/expression-sheet.html`
  - 14 帧平铺，PAIN 帧带橙边
- **OpenAPI 描述** `spec/openapi.yaml`
- **量化接口 OpenAPI** `spec/quantified-api.yaml`
  - 含 451 短路语义（P0 分诊触发）
- **变更日志** `docs/CHANGELOG.md`（本文件）
- **贡献指南** `docs/CONTRIBUTING.md`
- **历史版本页** `versions.html`

### 隐藏
- 移除全部 Dog API 引用（导航栏 / hero / 页脚 / meta）
- 版本号升级到 v0.5.0

---

## v0.4.2 — "Staff Release" (2026-09-17)

活猫对照 spec 行为学大整改。

### 行为准则落地（12/12 = 100%）
- **抚摸配额系统**（规则 6+7）：每日 5 次，耗尽返回 429，localStorage 持久化
- **修正状态权重**：SLEEP 50% / GROOM 20%（真实猫作息分布）
- **钻纸箱输入冻结**（规则 4）：BOXED 态拒绝输入
- **激光追逐**（规则 11）：Shift+点击放激光，猫无视一切去追
- **踩奶独立态**（§4.4）：连续戳 3 次触发
- **猫薄荷交互**（§8.3）：65% 反应率，翻滚动画
- **缓慢眨眼**（§4.2）：双击彩蛋
- **呕吐毛球**：6% 随机触发，「409 CONFLICT」
- **蹭人腿**（§4.3）：鼠标静止 30 秒触发
- **呼噜可视化**（§4.1）：3 圈同心圆扩散
- **中央撤离**（规则 12）：3 秒超时
- **状态名一致性大修**：统一使用 label

---

## v0.4.0 — "Live Cat" (2026-09-16)

活猫 v2 上线。

### 新增
- `assets/js/livecat.js` 自由活动猫引擎
  - 7 状态加权轮转 + crepuscular
  - 行为准则 12 条
  - SVG 身体 + CSS 动画
  - 移动端适配 + reduced-motion
- 活猫覆盖在整个站点右下角

---

## v0.3.0 — "Expression Engine" (2026-09-16)

表情渲染引擎完成。

### 新增
- `assets/js/expression.js` 13 维参数向量渲染引擎
  - 14 状态 · 逐像素确定性 SVG
  - 浏览器 + Node 双用
  - 零依赖
- `tools/expression.html` 拖滑块改参数实时看效果
- `tools/peripherals.html` 外设控制台
  - 14 类设备 · 13 道门槛

---

## v0.2.0 — "Spec Complete" (2026-09-16)

正文章节写完。

### 新增
- `spec/cat.html` 16 章 + 附录 A-C
  - §2 权限模型（Owner 不存在）
  - §3 领地协议
  - §4 通信接口（声学 / 视觉 / 化学 / 触觉）
  - §5 睡眠 · §6 狩猎 · §7 进食 · §8 外设 · §9 排泄
  - §10 表情 · §11 状态码 · §12 生活意见
- `reference/voice.html` 口吻与文体
- `reference/opinions.html` 31 条当事猫意见
- `reference/cheatsheet.html` 速查卡
- `reference/errors.html` 状态码对照
- `reference/glossary.html` 术语表

---

## v0.1.0 — "First Purr" (2026-09-16)

项目初始化。

### 新增
- 项目骨架
- `index.html` 首页
- `README.md`
- `LICENSE` PolyForm Noncommercial 1.0.0

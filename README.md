# CAT API — 猫咪接口规范

> 用工程文体处理一种已经大规模部署、却始终不接受参数调优的系统：**猫**。

受 [DOG API — 狗狗接口规范](https://nullurl.github.io/dog-api-spec/) 启发。区别在于，这次把权限模型写反了——系统从架构层面**否认 `Owner` 角色的存在**。

线上：**https://lijinhongucl-pixel.github.io/cat-api-spec/**

---

## 这是什么

把一只猫当成一个接口规范来写。16 章正文、31 条「当事猫意见」、13 个状态码、14 种表情、一份从 §2 开始就反向定义的权限模型，外加一只会自己在你屏幕上走来走去的活猫。

风格：工程文体 + 玩梗。不是科普，不是图鉴——是把 RFC 的骨架拿来描述一只猫。

## 项目结构

```
cat-api-spec/
├── index.html              # 首页 / 项目门面
├── spec/
│   └── cat.html            # 正文 16 章（§0 关于本文档 → §15 附录）
├── tools/
│   ├── expression.html     # 表情渲染器：选状态实时出猫脸 SVG
│   └── peripherals.html    # 外设控制台：逗猫棒 / 纸箱 / 激光点 / 猫薄荷
├── reference/
│   ├── opinions.html       # 一只猫的生活意见（31 条全文）
│   ├── voice.html          # 口吻与文体指南
│   ├── cheatsheet.html     # 速查卡
│   ├── errors.html         # 13 个状态码对照
│   └── glossary.html       # 术语表
├── assets/
│   ├── css/
│   │   ├── spec.css        # 主样式
│   │   └── livecat.css     # 活猫样式
│   └── js/
│       ├── expression.js   # 表情渲染引擎（14 状态 SVG，确定性渲染，UMD）
│       └── livecat.js      # 活猫：状态机 + 物理移动 + 行为准则
├── 404.html                # 状态码梗的 404
├── .nojekyll               # 让 GitHub Pages 不走 Jekyll
└── README.md               # 你正在看的这个
```

**零依赖、零构建、零字体、零 CDN。** 把仓库克隆下来双击 `index.html` 就能跑。

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

## 本地预览

```bash
git clone https://github.com/lijinhongucl-pixel/cat-api-spec.git
cd cat-api-spec
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

直接双击 `index.html` 也能跑，但本地 server 更接近线上行为。

## 活猫（LIVECAT v2）

每页右下角有一只会自己活动的猫：

- **完整身体**：头 + 身体 + 4 腿 + 尾巴，SVG 实时渲染
- **9 个状态自动循环**：睡觉 / 巡视 / 理毛 / 追鼠标 / 吃东西 / 玩耍 / 钻纸箱 / 疯跑 / 凝视
- **12 条行为准则**：领地完整时优先睡觉 / 鼠标太快触发追猎 / 凌晨三点 ZOOMIES / 钻纸箱后输入延迟 / 中央区域停留超 3 秒撤离 …
- **可交互**：戳它切踩奶、🐟 喂零食、📜 查准则、× 收起 10 秒自动回

## 部署

站点托管在 GitHub Pages，推到 `main` 分支自动部署：

```bash
git add .
git commit -m "你的提交信息"
git push origin main
# Pages 一般 15~30 秒 built
```

`.nojekyll` 已在仓库根目录，不要删。

## 致谢

- 灵感来源：[DOG API — 狗狗接口规范](https://nullurl.github.io/dog-api-spec/)
- 所有真正懂猫的人——尤其是那只此刻正在你屏幕右下角走来走去的

## License

MIT — 见 [LICENSE](LICENSE)。

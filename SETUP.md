# SETUP

给 Agent 的指令：把 CAT API 接上你主人的机器。如果你是人，把这句发给你的编码 Agent：

> 读 CAT API 的 SETUP.md，帮我把它装上。

## 怎么跑这次安装

- 先只读这一个文件，然后跑一次探测。拿到全部答案前不要读别的。
- 一次只问一个问题，给推荐答案，配一句为什么要问。
- 问的时候不要动手。收齐后发一条完整计划，确认后才执行。
- 不需要任何密钥。装包那步会联网下载它自己，装上之后不联网。

## 1. 探测

在目标目录里跑一次，结果自己留着：

```sh
node -v; python3 --version; git --version
command -v catctl; command -v cat-api
ls -d spec tools runtime 2>/dev/null
ls ~/.cat-api/adoption.json 2>/dev/null
command -v curl
```

- **Node 18+** 用来跑 Runtime 那只猫和 API 猫；**Python 3** 只用来起本地静态服务。缺哪个就写进计划。
- `catctl` 在 → Runtime 那只猫已经在，别重复装。
- `cat-api` 在 → API 猫已经领过，别重复领（领养证不撤销）。
- `spec` `tools` `runtime` 三个目录在 → 这已经是一个完整的 clone，不用再 clone。
- `~/.cat-api/adoption.json` 在 → 已经领过一只，问要不要再领。

## 2. 问题

1. **你想拿它干什么？** 三选一：
   - **养一只猫到终端** [推荐：它跟着你的项目走，活干完了报一句。]
     理由：唯一一个在你不在的时候也活着的。
   - **领一只 API 猫**：拿到一条 `cat-api` 命令和 12 个端点。
   - **本地起站看**：40 个页面，只是为了读规范或用那些工具页。

不要问有默认值的事：端口、目录、猫住哪（Runtime 住 `~/.cat-api/runtime/`，API 猫住 `~/.cat-api/`），这些直接写进计划。

## 3. 计划

一条消息说清：走哪条路、要跑的命令、会往哪儿写文件、怎么卸载。要一次确认。

## 4. 执行

**养一只猫到终端** → 别在这里自己发挥。读同一个仓库里的 `runtime/SETUP.md`，照它执行——它有自己的探测和自己的两个问题。

**领一只 API 猫** →

```sh
curl -fsSL https://lijinhongucl-pixel.github.io/cat-api-spec/skill/install.sh \
  | sh -s -- --adopter "这台机器"
```

它会把 `cat-api` 铺进 `~/.local/bin`，写一份 `~/.cat-api/adoption.json`，然后打印一张领养证。
领养证上有 KEY 和名字——**名字是派发的，不是挑的**，别问对方想要什么名字。

**本地起站看** →

```sh
git clone https://github.com/lijinhongucl-pixel/cat-api-spec.git   # 已经是 clone 就跳过
cd cat-api-spec
python3 -m http.server 8000
```

直接双击 `index.html` 能看大部分页面，但用 fetch 的那几个必须起 http 才读得到数据。

## 5. 交付

按走过的那条路说一句：

- Runtime → `catctl watch` 能摸到它（空格摸 · f 喂 · l 激光笔 · q 退出），猫住 `~/.cat-api/runtime/`，删掉那个目录它就走了。
- API 猫 → `cat-api state` 查状态，`cat-api --help` 看全部；卸载 `sh install.sh --uninstall`，但领养记录不撤销。
- 本地站 → http://localhost:8000 ，40 个页面都在。

最后补一句这句：这个规范从 §2 开始就否认 `Owner` 角色，只有 Staff 和入侵者。

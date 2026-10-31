# SETUP

给 Agent 的指令：把猫接上你主人的终端。如果你是人，把这句发给你的编码 Agent：

> 读 CAT RUNTIME 的 SETUP.md，帮我把猫装上。

## 怎么跑这次安装

- 先只读这一个文件，然后跑一次探测。拿到全部答案前不要读别的。
- 一次只问一个问题，给推荐答案，配一句为什么要问。
- 问的时候不要动手。收齐后发一条完整计划，确认后才执行。
- 不需要任何密钥：这东西不联网、不要账号。

## 1. 探测

在目标项目目录里跑一次，结果自己留着：

```sh
node -v
command -v catctl && catctl status --json | head -c 200
ls ~/.cat-api/runtime 2>/dev/null
echo "$SHELL"; ls ~/.zshrc ~/.bashrc 2>/dev/null
ls .claude/settings.json .codebuddy 2>/dev/null
git rev-parse --is-inside-work-tree 2>/dev/null
```

- Node 18+ 即可，只有标准库，不用装依赖。
- `catctl` 已存在 → 跳过安装，直接问接哪个宿主。
- `~/.cat-api/runtime` 有东西 → 已经养过一只，问要不要接着养（否则会覆盖）。
- `$SHELL` 决定后面写哪个 rc 文件。
- `.claude/settings.json` 在 → 推荐 claude 宿主；`.codebuddy` 在 → 推荐 workbuddy。

## 2. 问题

1. **接到哪儿？** 可用：workbuddy · claude · codex · shell · git · vscode。
   [推荐 workbuddy：改最少的东西，不动对方的任何全局配置。]
   理由：只往项目里写一个 `.catctl/` 目录。
2. **放哪个目录？** [推荐当前目录。]
   （shell 宿主多问一句 rc 文件，按探测结果给推荐。）

不要问有默认值的事：猫住 `~/.cat-api/runtime/`，软链到 `~/.local/bin/catctl`，这些直接写进计划。

## 3. 计划

一条消息说清：装什么（软链 + init）、动哪个文件、猫住哪儿。要一次确认。

## 4. 执行

1. `ln -s "$(pwd)/runtime/bin/catctl.js" ~/.local/bin/catctl`
2. `catctl init --host <第 1 题答案>`
3. 按宿主收尾：
   - shell → 把 `source 项目/.catctl/shell-hook.sh` 追加进 rc 文件，告诉对方要开新终端才生效
   - claude → init 已写 `.claude/settings.json`（有备份），不用加别的
   - git → init 装 post-commit 钩子，不在 git 仓库里会直接失败
   - workbuddy / codex / vscode → init 打印接法，原样给对方
4. 验证：`catctl status` 看到猫就是通了；再让对方跑一次 `catctl run -- <他自己的命令>` 确认真的记上了。

## 5. 交付

一句话告诉对方：怎么摸它（`catctl watch`，空格摸 · f 喂 · l 激光笔 · q 退出）、猫住哪、怎么让它走（删掉 `~/.cat-api/runtime`）。

# catctl status --json 字段契约

给脚本、CI 与编码 Agent 读的输出。`catctl status --json` 只往 stdout 写一个 JSON 对象，
stderr 为空，退出码 0。给人读的版本是不带 `--json` 的 `catctl status`，两者不要混用。

字段来源：`runtime/src/node/cli.js` 的 `cmdStatus()` 与 `publicProfile()`，
以及 `runtime/src/core/engine.js` 的 `snapshot()`。本文件描述 1.x 的契约。

## 顶层

| 字段 | 类型 | 说明 |
|---|---|---|
| `snapshot` | object | 当下这一刻的猫 |
| `profile` | object | 它对你作息与习惯的了解，已裁掉内部字段 |
| `home` | string | 数据目录绝对路径，取 `CATCTL_HOME` 或默认的 `~/.cat-api/runtime` |

## snapshot

| 字段 | 类型 | 说明 |
|---|---|---|
| `version` | string | 引擎版本 |
| `t` | number | 引擎内累计毫秒 |
| `behavior` | string | 当前行为 ID，如 `LOAF` |
| `behaviorLabel` | string | 行为中文标签 |
| `reaction` | object 或 null | 当前反应，含 `id` / `label` / `pose` / `line` |
| `pose` | string | 用于渲染的姿势名，反应期间会被反应覆盖 |
| `poseLabel` | string | 姿势中文标签 |
| `sleeping` | boolean | 是否处于无反应的睡眠态 |
| `needs` | object | 五维匮乏：`fatigue` / `boredom` / `loneliness` / `hunger` / `alertness`，各为 0 到 1 的三位小数 |
| `energy` | number | `1 - fatigue` |
| `mood` | number | 心情，三位小数 |
| `stage` | number | 进化阶段下标，0 起 |
| `stageName` | string | 阶段名，如 `奶猫` |
| `xp` | number | 累计经验 |
| `xpNext` | number 或 null | 下一阶段门槛，已到顶为 null |
| `working` | boolean | 是否有活在进行 |
| `hour` | number | 引擎内的小时 |
| `habit` | number | 习惯强度，三位小数 |
| `traits` | object | 五个性格维度的值 |
| `since` / `until` | number | 当前行为的起止时刻 |
| `transitions` | number | 累计行为切换次数 |
| `line` | string 或 null | 终端面板上的一句话，可能为空 |

## profile

| 字段 | 类型 | 说明 |
|---|---|---|
| `xp` / `stage` | number | 与 snapshot 同源 |
| `born` | string | 出生时间，ISO 8601 |
| `tasks` | object | 累计件数、成功数、失败数、连败等 |
| `interactions` | object | 抚摸、投喂、围观的累计次数 |
| `projects` | object | 按目录聚合的活 |
| `commands` | object | 按命令名聚合的活 |
| `kinds` | object | 按活动类型聚合的活 |
| `hours` | number[] | 24 个小时桶，各为一位小数 |

`profile` 是裁剪过的公开视图。完整的学习档案在 `~/.cat-api/runtime/profile.json`，
包含 `daily`、`kindOverrides`、`milestones` 等内部字段，不在 `status --json` 契约内。

## 稳定性承诺

- 顶层三个键、字段名与类型在 1.x 内不变，新增字段只会追加，不会改名或删除
- 数值字段的取值范围可能随模型调整，不要用固定阈值做断言，只判断类型与相对关系
- `snapshot.line` 是渲染用话术，可能为空，不要拿它判断状态
- `home` 随机器变化，不要写进版本库或当作稳定标识

## 换机续养的另一份契约

`catctl export` 产出的画像文件是 `cat-runtime-portrait` v1，包含
`format` / `version` / `exportedAt` / `engine` / `state` / `profile` / `events`。
`catctl import <文件> --yes` 会先校验格式、让引擎试恢复状态、备份旧档，再写入。
导入没有 `--yes` 时只提示，不动任何文件。

## 验证

```bash
node runtime/test/run.js
```

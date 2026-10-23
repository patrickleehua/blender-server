# 使用入口独立审计

基线：`fe3bc3ef3c9422a53a62596bb27c6d464fe6806f`；Windows 原生 Node `v24.20.0`、Blender `4.5.15 LTS`。本轮仅使用隔离无头进程与 HTTP fixture，没有启动可见 GUI、修改全局配置、运行真实 Claude/Codex 模型或推送提交。

## 基线行为与证据

| 场景 | 实际结果 | 证据 |
|---|---|---|
| 显式 backend + 连续独立 CLI 进程 + 固定 session | 通过：对象、K marker、位置修改在三次 do 与一次 see 后保持；worker PID 始终 35560；停止成功 | `continuous-summary.json`、`01..09` 原始回执与对应输入 |
| 真实取图 | 返回原生 PNG 内容与 320×180 文件；独立打开可见立方体。此图仅证明真实取图，未承担构图或建模成品质量验收 | `usage.png`、`06-see.stdout.json` |
| 无 GUI doctor | exit 1，kind=blender-unreachable；没有冒称 GUI 通过 | `02-doctor.stdout.json` |
| GUI busy，frame 返回错误 | 缺陷：see 自动启动 interactive worker、返回另一场景图片并 isError=false；同样状态 do/watch 返回 GUI_NOT_READY | `gui-busy-fixture.json` 完整请求 trace |
| 两 MCP client 共享同配置 | 缺陷：A 自动拥有 backend，B 附着建未保存模型；A close 杀掉 backend 45436 和 B worker 58432；B 后续 do 自动启动新 backend 48400、K/模型状态丢失 | `shared-mcp-clients.json`，真实 Blender 与真实 MCP SDK |
| CLI do session 隐式 worker，无显式 backend | 缺陷：首条 exit 0、无 warning，退出时场景销毁；第二条同 session 读 marker 报 AttributeError | `implicit-cli-summary.json`、`implicit-*.input.json`/`stdout.json` |
| 安装预览、幂等、已有配置、卸载 | 预览零写、重装零差异；已有 `.mcp.json` 原样保留；卸载保留用户改 Skill 与 runtime 文件 | `installer-upgrade.json` 每步前后文件 hash |
| 基线安装器升级 | 缺陷：自管 Skill 仍等于 manifest 旧 hash，包内容更新后仍直接 conflict、无法升级 | `installer-upgrade.json`，隔离包布局与真实安装器脚本 |
| 既有发布 tarball | SHA-256 `8051116a63779d2b2b05701b51658b36113f84d54feb1bc805b89ffe8c3dce7e`；含规范 `assets/skill` 与旧 `assets/skills/blender-agent` 两份不同 Skill。基线 stage 不清理后者 | 解包保存在 `tmp/mvp-usage-audit/release-extracted/`；release manifest 记录 5d9fd19，核心/CLI/安装器 hash 与基线 fe3bc3e 一致 |

GUI busy 的证据是协议 fixture，不能称为真实 GUI busy 验收；没有将 paused 状态等同于 addon 当前真实行为。

## 本子任务修复及验证

按父任务明确分工，本子任务仅修改安装器、stage、对应文档和测试；路由/会话生命周期缺陷交由父任务统一处理。上述基线失败记录保留，不能当成修复后结果。

安装器现在把“当前 hash 等于 manifest 旧 hash”的自管文件列为 `update`，用同目录临时文件和 rename 更新，再记录新 hash。用户改动或未归属文件仍 conflict，整次安装零写。用户在宿主配置加入其他 server/设置时保持原样并阻止升级，不自动重写合并。原有既有配置候选与卸载保留机制不变。

stage 只删除旧生成位置 `assets/skills/blender-agent`，保留其他资产/目录；当前唯一产品 Skill 来源为 `assets/skill`。符号链接父目录会拒绝清理。

验证：

- `node scripts/portable-setup-selftest.mjs`：13 项通过，含安全升级、升级预览零写、用户修改冲突零写、其他 server 保留、升级后卸载，原有路径/归属保护全部保持。
- `node --test packages/blender-agent/test/stage.test.mjs`：1 项通过，隔离的真实 stage 脚本删除旧 Skill，并保留其他资产目录。
- `node tmp/mvp-usage-audit/installer-fixed.mjs`：隔离包实际升级两个宿主 Skill，已有配置字节不变；每步前后 hash 和原始计划见 `installer-upgrade-fixed.json`。
- 对本子任务修改路径执行 `git diff --check` 通过。

父任务还需统一 build/pack，以把新安装器和清理后的资产带入新包；这些本地 filesystem/协议/无头结果不替代新的 GUI、Claude 或 Codex 成品验收。

复现脚本：`tmp/mvp-usage-audit/audit.mjs`、`shared-clients.mjs`、`installer.mjs`、`installer-fixed.mjs`。端口限制为 43877/43876/43879 起的独立 worker 端口，所有由本轮启动的 backend/worker 已按归属关闭。

# 安装命令与 npm 本地分发验证

**本轮新增的 CLI 入口和独立 tarball 已通过本地验证。** 用户可以使用 `blender-agent help`、`install`、`uninstall`，无需定位内部安装脚本；消费端不需要 TypeScript 编译或 CI。本报告固定记录首发前准备包 `@blender-agent/bridge`；后续个人包名与 registry 交付见 [npm 首发验证](npm-release.md)。

日期：2026-10-23。源码提交：`baeb14c674a08e533f86782bc99e29829e34ca06`。Windows、Node.js 24.20.0、npm 11.19.0；真实 Blender 4.5.15 LTS 无头会话。CI 按本轮要求未调整、未执行。

## 本轮制品

| 项目 | 记录 |
| --- | --- |
| 包 | `@blender-agent/bridge@1.0.0` |
| 本地 tarball | `release/blender-agent-bridge-1.0.0.tgz`，909,677 字节，87 个文件 |
| SHA256 | `cbaddc9d2fb2cc5a9348024606002c3ac15a0d4dcafc9f7098b200663203d582` |
| 引擎/适配器指纹 | `642f3086feb714bfcf91587f1ce77f81407c68019b7976c002ff4bd650676e2e` |
| 发行清单 | [manifest-baeb14c.json](../release/archive/manifest-baeb14c.json)，`sourceDirty=false` |
| 原始命令与 MCP 回执 | [result.json](../evidence/distribution-2026-10-23/result.json) |
| 当次独立包验证脚本 | [verify.mjs](../evidence/distribution-2026-10-23/verify.mjs)，保留本机路径，需从仓库根目录运行 |
| Blender 产物 | [PNG](../evidence/distribution-2026-10-23/npm-smoke.png)、[blend](../evidence/distribution-2026-10-23/npm-smoke.blend) |

tarball 为本地制品，未随 Git 推送。`1.0.0` 尚未发布到 registry，本轮仍为首发准备；历史包已归档，未覆盖为本轮通过。将来 npm 首次发布后，同版本不可重发。

## 实际检查

| 检查 | 结果与独立判据 |
| --- | --- |
| 类型检查 | `npm run typecheck` 通过 |
| 协议、启动、发行与新 CLI 回归 | `npm test` **17/17**；新增四组检查覆盖帮助、默认项目、参数校验、双宿主接入、退出码、配置保护和卸载 |
| 原安装器回归 | `node scripts/portable-setup-selftest.mjs` **13/13**；保留升级、冲突零写、路径与用户文件保护 |
| 独立 npm 安装 | 在新建中文/空格目录用隔离的 global prefix 安装 tarball，带 `--ignore-scripts`；退出 0，安装目录无 TypeScript，59 个运行资产 hash 均与清单一致 |
| npm 真实命令入口 | 运行 npm 生成的 `blender-agent.ps1`：`help`、`help install`、`install --help`、`--version` 均通过 |
| 默认预览与实际接入 | `install` 不加 `--apply` 时项目零写；实际安装后双宿主 Skill 存在，内容等于随包 Skill；生成的 MCP 配置指向独立安装包的 CLI |
| MCP 与真实 Blender | 直接用上述生成配置连接官方 MCP client，发现 15 个工具；独立无头会话建立 2m 立方体，回传 320×180 原生 PNG，保存 `.blend` |
| 产物独立检查 | 直接打开 PNG 确认实际几何；另起 Blender 进程重开 `.blend`，断言 `NpmDistributionProof` 世界尺寸为 `(2, 2, 2)`，输出 `NPM_BLEND_REOPEN_OK` 并退出 0 |
| 进程清理 | MCP 关闭后，自动后台与 worker PID 均已退出 |
| 卸载保护 | `uninstall` 默认预览保留文件；`--apply` 清理自管配置，保留修改过的 Skill 与用户模型文件 |
| npm 发布预检 | 对同一 tarball 执行 `npm publish … --access public --dry-run --json`，退出 0；明确报告未登录，没有执行实际 publish |

独立安装测试使用的 prefix 位于测试目录；没有把工具安装进用户日常全局目录，没有修改全局 Claude/Codex 配置。测试未使用源码的 CLI 或 runtime；仅 Blender 可执行文件来自本机已验证 portable 安装。

## 覆盖边界

本轮改变安装命令、打包元数据和文档，未改 Blender 引擎、MCP 工具实现或 Skill。真实 Claude Opus 5.5 / Codex gpt-6.1-sol、GUI、Blender 5.x 的完整历史验收见 [MVP 报告](acceptance-report.md)，本轮未重复该模型/GUI验收，也不将旧包结果冒充新包实测。

npm 的 dry-run 证明内容与参数可预览，不能证明账号拥有 `@blender-agent` scope 或已经发布。完成 npm 登录和 scope 发布权限配置后，维护者可按 [分发说明](distribution.md) 发布已验收的同一 tarball，再补 registry 安装验证。当前源码、本地包与生成的项目接入路径已可使用。

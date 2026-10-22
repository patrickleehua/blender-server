# Blender Agent 1.0.0 交付与验收

**独立重构已交付，Claude 和 Codex 的真实任务均通过。** 两个模型实际调用 MCP 建模、查看原生图片、修改模型、保存 `.blend` 和导出 GLB；另外启动 Blender 重开和重导入，独立核对四个对象的尺寸与世界位置，全部符合场景预期。

日期：2026-10-23，Asia/Singapore。实现提交：`5d9fd1925279ce3907438f64e3376cbc7851acb1`。本报告与证据作为后续文档提交归档，运行代码未变化。

## 成品

| 内容 | 位置 |
| --- | --- |
| 独立 npm 安装包，约 0.90 MB | [blender-agent-bridge-1.0.0.tgz](../release/blender-agent-bridge-1.0.0.tgz) |
| 包 SHA-256、来源提交、95 个文件清单 | [release/manifest.json](../release/manifest.json) |
| 中文安装、配置、使用、卸载 | [使用指南](portable/使用指南.md) |
| 共享核心与 CLI/MCP | [packages/blender-agent](../packages/blender-agent/) |
| 通用 Skill | [skills/blender-agent/SKILL.md](../skills/blender-agent/SKILL.md) |
| 独立架构与行为场景 | [设计](adapter-design.md)、[场景](acceptance-scenarios.md) |

包 SHA-256：`8051116a63779d2b2b05701b51658b36113f84d54feb1bc805b89ffe8c3dce7e`。

运行资产指纹：`4c0226b037cc80f64a06019cafea5b77ee85ef8e36f3baf80669c642b104f3dc`。

本工程重新初始化 Git，拥有自己的依赖锁、工具合同和运行时入口。固定上游版本只留在忽略的 `.upstream/`，独立包不依赖它，也不加载 DSH 插件或 DSH 包。稳定几何/审计/导出模块保留来源许可，迁入 `bridge/`；控制层使用明确的 runtime 工厂与子进程归属接口。

当前工作区已生成项目级 Claude/Codex Skill 与 MCP 配置，指向项目内的 Blender 4.5.15 portable，端口为 HTTP 39877 / addon 39876 / worker 39879。重新加载宿主后可使用 `/blender-agent` 或 `$blender-agent`。配置未写入全局，机器路径按设计不进入交付包。

## 指定模型的真实验收

环境为 Windows、Node 24.20.0、官方 Blender 4.5.15 LTS。安装包先装入独立的中文/空格目录，两个宿主均使用该已安装包，未从源码目录导入运行实现。模型没有替换或降级。

| 宿主 | 实际调用 | 真实 MCP 调用 / 不同图像 | 模型进程 / 独立产物检查 |
| --- | --- | --- | --- |
| Claude Code 2.1.306 | `claude -p --model claude-opus-5-5 --effort medium` | 13 次 / 3 张 | 退出 0 / 通过 |
| Codex CLI 0.163.0 | `codex exec --model gpt-6.1-sol -c model_reasoning_effort=medium` | 20 次 / 4 张 | 退出 0 / 通过 |

场景为三腿圆凳：先做半径 0.40 m 的凳面并看图，再扩大到 0.45 m、设置红色凳面和棕色腿、再次看图，保存并导出四个网格。独立检查读取另一个 Blender 进程中的真实几何边界：凳面尺寸 0.90×0.90×0.08 m，三条腿各 0.08×0.08×0.75 m，中心位置均符合场景规定。也直接查看了归档的最终图片，颜色、三腿与形体清楚可见。

两个模型都遇到了本场景预期的 GUI doctor 不可达，随后使用明确命名的无头会话；这没有计为 GUI 验收通过。GUI 通路由下面独立的真实隐藏 GUI 测试证明。

| 可复查材料 | Claude | Codex |
| --- | --- | --- |
| 运行结果、指纹、独立检查 | [result](../evidence/hosts/claude-result.json) | [result](../evidence/hosts/codex-result.json) |
| 去除图片 base64 的工具事件 | [trace](../evidence/hosts/claude-trace.json) | [trace](../evidence/hosts/codex-trace.json) |
| 输入、模型和最终预览 | [任务](../evidence/hosts/claude/task.txt)、[blend](../evidence/hosts/claude/stool.blend)、[GLB](../evidence/hosts/claude/stool.glb)、[图](../evidence/hosts/claude/final.png) | [任务](../evidence/hosts/codex/task.txt)、[blend](../evidence/hosts/codex/stool.blend)、[GLB](../evidence/hosts/codex/stool.glb)、[图](../evidence/hosts/codex/final.png) |

Claude 报告无权限拒绝；Codex 的宿主日志有原有全局 Skill 格式警告和一次模型列表刷新超时，任务仍以指定模型参数成功完成。这些全局文件未修改，也未据此改写 Blender 验收状态。

## 其余必要检查

| 检查 | 结果与覆盖 |
| --- | --- |
| TypeScript、协议与服务归属 | 类型检查通过；5 组协议回归全通过，含官方 MCP client、原生图像、非法输入、外来端口拒绝、流式超时、取消与不重放写入 |
| 真实 Blender/MCP | 2 组通过：同场景切换能力、增量预载保留 PID/对象/内核、blend 相对脚本、真实 PNG、错误传播、跨 CLI 租约与清理 |
| 项目安装器 | 10 项通过：dry-run 零写、不覆盖、重复安装、三端口、冲突预检、卸载保留用户改动、独立包布局、路径保护 |
| 真实 GUI | 本包 addon 1.10 / protocol 11，`doctor.kind=ok`、视口；执行、事务恢复、配方、性能分析、精简分析、目录、内环 bench 通过 |
| 原有 Blender 能力 | contract 28/0，另有 2 块 view 证据明确跳过；plan 18/0；integration 128/0，无跳过。原断言未降低 |
| 已复现缺陷的永久回归 | 相机无泄漏；静态画面不误报、动画可识别；watch 错误失败；preset dry-run 只读；同名并发启动；35 秒忙碌请求不被 TTL 回收；停止后端口释放 |
| 默认渲染与作业 | EEVEE 三入口在 Blender 4.5.15 选择有效引擎并真实渲染 PNG；`engine=none` 作业保留输入 CYCLES，引擎前导未执行 |
| Skill | YAML/命名校验、参考链接与项目安装检查通过；两个指定模型按 Skill 完成了真实任务 |

原始失败、修复与回归证据分别见 [runtime 记录](../evidence/runtime/RESULTS.md) 和 [独立复审](../evidence/review/RESULTS.md)。所有本轮模型宿主的 backend/worker 已停止，端口 29877/29879/30877/30879 已释放；runtime 测试自己的 GUI 与后台进程也已清理。

## 使用与复跑

当前工程可直接运行 `npm test`、`npm run typecheck`、`node scripts/portable-setup-selftest.mjs`。真实 Blender 回归、指定模型复跑入口分别为 [runtime 测试说明](../tests/runtime/README.md) 和 `scripts/verify-hosts.mjs`。模型复跑必须使用全新的 `--run-root`，旧产物不能满足新一次验收。

例如先把交付 tarball 安装到独立工具目录，再执行：

```text
node scripts/verify-hosts.mjs --package <已安装的@blender-agent/bridge目录> --blender <Blender可执行文件> --run-root <新的验收目录> --host both
```

不应再用未安装 DSH 依赖的原项目 `npm test` 作为新项目入口；新项目的检查和锁文件均独立。纯 MCP 安装不需要系统 Python/uv，使用 Blender 自带 Python。

## 已知覆盖边界

- 本机真实验证 Windows + Blender 4.5.15；Linux/macOS 的 CI 配置已提供，尚未在这些宿主运行；Blender 5 的枚举兼容分支尚未实机验证。
- 未声称 217 个算子及所有参数组合逐项验收，也没有把原始 contract 的两块 SKIP 改成通过。
- Open3D、manifold3d、glTF-Validator、OpenCV/MediaPipe、OCR、外部付费服务等未安装或未配置；不计为可用能力。写实生物、角色绑定、电影级布光等保持目录原有边界。
- 已完成本地交付与本地 Git 提交；未推送、打 tag 或发布 npm。工具支持范围内的验证通过，不等于对任意模型任务或任意系统作绝对正确保证。

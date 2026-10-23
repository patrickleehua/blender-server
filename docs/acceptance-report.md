# Blender Agent 1.0.0 最终交付与验收

**独立重构的 MVP 已完成，规定场景的必要验证均通过。** Claude Opus 5.5 与 Codex gpt-6.1-sol 在真实 Blender 中建模、查看原生图像、修改、保存和导出；独立 Blender 进程重开 `.blend` 和导入 GLB 后，尺寸与位置核对通过。本轮进一步修复了假成功、错场景、并发状态丢失、GUI 像素重排及 EEVEE 回滚问题。

日期：2026-10-23，Asia/Singapore。产品来源提交：`792017712e587ebee196fb000bf29e79c43c3f12`；主体修复：`1bd1ba3e45a6c658d422c25743f3e708e2de8835`。后续证据提交不改变产品实现。历史报告和包清单保存在 `evidence/mvp-audit/previous-*`，旧失败没有覆盖成通过。

## 成品与使用

| 内容 | 位置 |
| --- | --- |
| 独立 npm 包，908,511 字节 | [blender-agent-bridge-1.0.0.tgz](../release/blender-agent-bridge-1.0.0.tgz) |
| SHA256、提交与 87 个实际发行文件 | [release/manifest.json](../release/manifest.json) |
| 安装、接入、CLI、GUI、升级与卸载 | [使用指南](portable/使用指南.md) |
| 通用 Skill | [SKILL.md](../skills/blender-agent/SKILL.md) |
| 职责边界与行为判据 | [设计](adapter-design.md)、[场景](acceptance-scenarios.md) |
| 本轮原始结果与修复记录 | [evidence/mvp-audit](../evidence/mvp-audit/) |

包 SHA256：`4fc5cecf3172224577015252ef7e355e9b4e1965fca470aa09fe59ce650ac8ef`。

最终运行指纹：`bbc1ac1d3c1b1aa78226ba226256591c58e42d9b1fe2809f1f8e436ad412b2eb`。

这是重新初始化 Git 的独立项目，CLI/MCP 共用 TypeScript 核心，Blender 自带 Python 执行建模。上游 `7601534cc71296e176bb752dd044bd405a8d2563` 只作只读参考，不是运行依赖。安装包不含上游 checkout、Blender 程序或个人运行环境，只有一种当前 Skill，保留来源许可证。

工作区已更新项目级 Claude/Codex Skill 与 MCP 配置，使用项目内 Blender 4.5.15 portable，HTTP 39877 / addon 39876 / worker 39879。重新加载宿主后使用 `/blender-agent` 或 `$blender-agent`。没有修改全局配置。CLI 场景操作先 `backend start`，保持同一组端口/工作目录、稳定 `--holder` 与 worker 名称；缺少前提会明确拒绝，避免退出即丢未保存场景。

## 指定模型的真实验收

Windows、Node 24.20.0、Blender 4.5.15 LTS；工具先安装到独立中文/空格目录。两个宿主使用实际安装包，模型未替换。

| 宿主 | 实际命令与档位 | MCP 调用 / 返回的不同 PNG | 模型退出 / 独立重开检查 |
| --- | --- | --- | --- |
| Claude Code 2.1.306 | `claude -p --model claude-opus-5-5 --effort medium` | 14 次 / 4 张 | 0 / 通过 |
| Codex CLI 0.163.0 | `codex exec --model gpt-6.1-sol -c model_reasoning_effort=medium` | 26 次 / 4 张 | 0 / 通过 |

场景：三腿圆凳，初始顶面半径 0.40m，取图后扩大到 0.45m，设置红色顶面与棕色腿，再看图、保存与导出四个网格。独立计算世界边界确认：顶面 0.90×0.90×0.08m，腿各 0.08×0.08×0.75m，中心位置符合任务。最终图片已直接打开查看，形体、三腿和颜色清楚。Workbench 默认灰色看形体；颜色预览用 `blender_rt_see(session=..., shading="MATERIAL")`，这不等同于最终光照/着色器渲染。

| 材料 | Claude | Codex |
| --- | --- | --- |
| 原始运行结果与独立检查 | [result](../evidence/mvp-audit/hosts/claude-result.json) | [result](../evidence/mvp-audit/hosts/codex-result.json) |
| 去除图片 base64 的工具事件 | [trace](../evidence/mvp-audit/hosts/claude-trace.json) | [trace](../evidence/mvp-audit/hosts/codex-trace.json) |
| 可编辑文件 | [blend](../evidence/mvp-audit/hosts/claude/stool.blend)、[GLB](../evidence/mvp-audit/hosts/claude/stool.glb) | [blend](../evidence/mvp-audit/hosts/codex/stool.blend)、[GLB](../evidence/mvp-audit/hosts/codex/stool.glb) |
| 最终图像 | [PNG](../evidence/mvp-audit/hosts/claude/seen-04.png) | [PNG](../evidence/mvp-audit/hosts/codex/seen-04.png) |

图像计数按 PNG 字节去重，可能包含元数据不同而画面相同的图片；计数本身不作为视觉闭环证明。实际闭环由模型记录、前后形体和最终亲看图片支持。Codex 一次可选证据复制因脚本缺少 `pathlib` 失败，错误保留，独立重开/导出检查另行通过；没有吞错。宿主全局 Skill 格式/PowerShell snapshot 警告未修改，也未伪装成 Blender 产品缺陷。

模型运行包的指纹为 `be8bc90...`。随后打包核对发现 manifest 含 npm 自动省略的 `.npmignore`；最终仅移除此非运行文件的清单记录。**87 个发行文件中，除资产清单自身外，86 个文件与模型运行包逐字节相同**。独立安装最终 tarball 又真实完成 MCP、场景、图像、保存、Python 异常和清理。比较与最终包实测见 [package-verification](../evidence/mvp-audit/package-verification.json) 和 [final-package-smoke](../evidence/mvp-audit/final-package-smoke/result.json)，没有混写不同指纹。

## 按完成标准核对

| 场景 | 当前证据与结论 |
| --- | --- |
| AC-01 独立安装 | 最终 tarball 在第二个中文/空格目录独立安装；87 文件与引擎清单 hash 匹配，单一 Skill，无来源环境残留；原生 MCP/PNG/保存真实通过 |
| AC-02 合同/错误 | 13 项协议、启动与发行回归通过；非法参数、嵌套 error、取图失败、Python 非零退出、不重放、argv 数组、watch 尺寸与图像索引均核对 |
| AC-03 归属/生命周期 | 双 MCP 共后台，创建者 close 或 SIGKILL 后另一方 PID/对象/K 保留；最后退出清理；其他 client 阻止 stop；同时首次启动同实例；持久化升级跨回收周期保留 |
| AC-04 持久建模/视觉 | 真实 Blender/MCP/CLI 5 项通过；最终 GUI 默认/自定义图片亲看，修改前后对应；GPU 已知颜色逐字节核对；GUI 暂停不切到其他场景 |
| AC-05 保存/导出 | 两模型的 blend 重开和 GLB 导入核对四对象世界尺寸/位置；最终包保存的独立场景和 PNG 另行实测 |
| AC-06 恢复/失败 | Python 原 traceback 保留，错误后原场景可用；GUI snapshot/restore、对象/场景 preset dry-run、EEVEE/Cycles apply/revert 原路径回归 |
| AC-07 长任务/并发 | Python 失败不报成功；runId/jobId status/collect/wait/kill 与重启后别名回读通过；同名跨 holder 七种操作拒绝，不同 worker 独立；35秒忙碌跨TTL巡检证据保留 |
| AC-08 安装/升级 | 13 项安装检查通过：dry-run、幂等、安全升级、冲突零写、既有配置/用户修改保护、卸载保留产物、路径保护；本项目实际更新已归档 |
| AC-09 Claude | 指定 Opus 5.5 medium 真实 MCP/Skill 建模、看图与交付，独立产物检查通过 |
| AC-10 Codex | 指定 gpt-6.1-sol medium 真实 MCP/Skill 建模、看图与交付，独立产物检查通过 |
| AC-11 GUI | 4.5.15 独立 factory GUI，48次调用符合预期，doctor.kind=ok、opt 真合并面数不变、txn/preset/perf/loop、暂停保护、图像与清理均通过 |

13 项协议/启动/发行检查、类型检查、安装器和 Skill 格式结果见 [final-checks.json](../evidence/mvp-audit/final-checks.json)。真实生命周期记录见 [lifecycle](../evidence/mvp-audit/lifecycle/)，GUI 的发现、定位、原始失败与最终结果见 [GUI报告](../evidence/mvp-audit/gui/RESULTS.md)。

最终发行包还通过只读原始回归：contract **28/0**（两块 view 证据按原条件明确 SKIP）、plan **18/0**、upstream integration **128/0，无SKIP**。原断言未降低，执行的是最终安装包和真实 Blender，见 [最终回归](../evidence/mvp-audit/final-upstream/summary.json)。

Blender **5.0.1** 官方 portable 与 SHA256 核对通过：MCP 场景、增量 preload、真实图像、错误恢复、事务、blend/GLB 独立边界、EEVEE 三入口与 35秒 TTL 回归通过。EEVEE/Cycles 新恢复测试在 4.5.15 和 5.0.1 分别通过，见 [5.x 报告](../evidence/mvp-audit/blender5/RESULTS.md) 和 [perf回归](../evidence/mvp-audit/perf/)。

## 修复、复跑与边界

本轮修复：Python 假成功、cmd error 传播、精简映射、worker 归属、共享后台清理、CLI 临时状态丢失、首次并发启动、持久化升级与注册失败退出、GUI 错场景、watch/argv/图像引用、安装升级、重复 Skill、GPU Buffer 多维 stride 重排、EEVEE 回滚。原始缺陷与定点回归保存在 [protocol](../evidence/mvp-audit/protocol/)、[usage](../evidence/mvp-audit/usage/) 和 GUI 子目录。

检查入口见 [runtime 测试说明](../tests/runtime/README.md)。真实宿主复跑必须使用新目录：

```text
node scripts/verify-hosts.mjs --package <已安装包目录> --blender <Blender可执行文件> --run-root <全新目录> --evidence-root <新证据目录> --host both
```

两次测试执行失误也保留：并行 build/live 导致临时资产缺失；测试把 worker 端口选在 Windows 动态端口区间，第二个 worker 撞到 TIME_WAIT。前者等构建结束复跑，后者修正测试端口预留，未改产品或降低断言，真实 5/5 通过。Skill 格式检查使用 `uv --with pyyaml` 与 UTF-8，没有修改全局 Python 环境。

- 本机实测 Windows、Blender 4.5.15 / 5.0.1 无头；GUI 与指定模型为 4.5.15。Linux/macOS CI 已提供，尚未在这些机器执行，不声称三系统全部验收。
- 未穷举 217 个操作的所有参数；按上述闭环与原断言回归验证。Open3D、manifold3d、glTF-Validator、OCR、OpenCV/MediaPipe、外部付费服务未配置，不计为可用依赖。
- 本地成品、证据与 Git 提交已维护；没有推送、打 tag 或发布 npm。完成指本报告范围内 MVP 可操作、必要回归与指定模型验证通过，不对任意未来模型/宿主/设备作绝对无缺陷保证。

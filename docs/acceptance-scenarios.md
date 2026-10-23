# 验收场景

依据：用户要求独立重构，通用 MCP/Skill，Claude 与 Codex 实际可用；保留上游正常能力。采用 `scenario-acceptance` 的文字用例与真实执行方式、`code-test-boundaries` 的风险取证原则。测试在隔离工作目录进行。

| 标识 | 前置与操作 | 可观察预期 |
| --- | --- | --- |
| AC-01 独立安装 | 将 npm tarball 安装到与源码无关的中文/空格目录，从包启动 CLI/MCP | 无 `.upstream`、DSH、全局依赖仍可列出 15 个工具与能力目录 |
| AC-02 合同与错误 | 真实 MCP 握手、列工具、合法/非法参数调用；CLI 同样调用；Python 异常与命令 error | JSON Schema 正确；非法输入明确失败；stdout 无普通日志污染；Python/嵌套错误不假成功；取图失败保留执行是否已完成，禁止重放修改 |
| AC-03 运行归属 | 启动/连接/停止自己的 backend；用其他服务占端口；重复启动；两 MCP 共后台，先启动者正常/异常退出 | 核对服务身份/工作目录和代码版本；拒绝误接管；其他客户端的原 PID/模型/内核保留；显式 stop 不得清理活跃他端；最后客户端退出清自动后端；持久后端无人仍保留 |
| AC-04 持久建模与视觉 | 真实 Blender worker 创建模型，跨调用查询，取图/再次修改取图；CLI 独立调用；GUI busy/paused | 对象和内核状态保留；图像有效且对应修改后的场景；MCP 有 image 内容；CLI 拒绝会退出即丢场景的用法；GUI 不确定状态明确报错、不切换到别的场景 |
| AC-05 保存与导出 | 保存 `.blend` 和 GLB，另起 Blender 打开 `.blend`、导入 GLB | 约定对象、尺寸和位置一致；文件真实可重开，不能仅检查存在 |
| AC-06 恢复与失败 | 语法错误/无效操作后继续查询；快照后改动并恢复 | 原始错误保留；场景可继续用；恢复后数据与已保存基线一致 |
| AC-07 长任务与租约 | 查询/回收长任务；runId/jobId 回收；不同写入者竞争同一 GUI 或同名 worker，分别使用不同 worker | 超时不丢结果；同一场景冲突写入被挡；不同 worker 独立；状态可核对；Python 异常为失败，原 traceback 可查 |
| AC-08 项目接入 | dry-run、apply、已有配置冲突、重复安装、未修改自管文件升级、修改文件后升级/卸载 | dry-run零写；未修改自管文件安全更新；用户配置/修改保持；冲突预检；卸载不删用户改过文件和模型产物；包内只有当前 Skill |
| AC-09 Claude 真机 | `claude -p --model claude-opus-5-5 --effort medium` 使用 Skill/MCP 完成场景 | 调用真实工具、收到图像、保存与导出；独立产物检查通过，无权限拒绝冒称通过 |
| AC-10 Codex 真机 | `codex exec --model gpt-6.1-sol -c model_reasoning_effort=medium` 使用 Skill/MCP | 与 Claude 相同的真实行为与独立检查；精确记录模型、宿主版本和结果 |
| AC-11 GUI 通路 | 独立 Blender GUI 启用本包 addon，执行、取图、事务/诊断 | `doctor.kind=ok`；真实场景回读与视口；测试后无未归属进程残留 |

运行结果和原始证据索引在最终验收报告与 `evidence/` 中维护；未执行或受阻保持原状态，不以静态检查替代。

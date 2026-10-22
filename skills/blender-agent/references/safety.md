# 安全与故障恢复

## 写入与场景保留

不要清空全场景、覆盖原始 `.blend`、强抢 lease，或为修一个部件改变其他正常对象。用任务集合与明确对象范围操作；输出新文件名。文件级 snapshot 后再做拓扑、UV、应用修改器与不可逆合并，记录快照路径。需要恢复时确认会恢复整个文件，避免覆盖快照之后别人的正常工作。

共享 GUI 写入前 `who` → `lease`，记录 holder 与作用域；结束释放自己的 lease。适配器会识别后端归属，已有 DSH 后端不是可随意接管的服务；端口冲突换一组配置，不 stop 别人的进程。并行任务优先独立 worker/输出目录。

CLI 每次命令都是新进程：显式 `--holder <本次工作会话id>` 或在该命令环境设置 `BLENDER_AGENT_HOLDER`，lease、后续受租约保护的写入及 release 都复用同一个值。不要只在 lease 的 JSON 里填 holder，却让后续写入使用默认 PID。并行 agent 必须使用不同值；不要在团队项目 MCP 配置里给所有宿主硬编码一个共用 holder。MCP 默认使用自身服务进程的身份。

## 故障表

| 回执/现象 | 下一步 |
|---|---|
| `blender-unreachable` | GUI 是否启动、随包 addon 是否启用并 Connect；需要 GUI 时 launch。确无 GUI 才走 worker，并 start+see 验证 |
| `main-thread-busy` | 等渲染/模态操作结束；独立批处理可用 headless，不能假定它会读到 GUI 未保存内容 |
| 后端不可达/端口被占 | 核对当前 adapter 的 port/workdir/backend status，先确认进程归属，别结束未知进程 |
| `409 leased` | `who` 查 holder/剩余时间；停止冲突写入，不 force |
| `EXPLICIT_HOLDER_REQUIRED` | CLI lease/release 没有显式会话身份；给本轮 lease、写入和 release 都加同一 `--holder` 或 `BLENDER_AGENT_HOLDER` |
| `PERSISTENT_BACKEND_REQUIRED` | 先用同端口/workdir执行 `backend start`，再启动worker/job/headless；不能用临时后端维持后台作业 |
| 缺 Blender 可执行文件 | 配项目 `--blender` 或 `DSH_BLENDER_EXE`，核对文件存在与可执行 |
| 未知 op / 参数 | 查 catalog/help，按 did_you_mean 修改；没有开始写入的参数错误可修正后再调用 |
| 超时 / `fetch failed` / lost connection | 结果可能已执行；查 job/status/日志、场景与落盘文件；未确认失败前不重复 write/start |
| worker 状态丢失 | 查 list/status 和空闲 TTL；从最近保存文件恢复，不假装原内核还存在 |
| 图片路径存在但宿主看不到 | 核对 Node 与 Blender 对同一物理目录的读写能力；Windows/WSL 路径映射、权限与实际文件时间；不要仅凭路径宣称看过图 |
| verdict=degraded/skipped/unresolved | 读 reason/coverage/warnings，补证据或明确未完成，不能改成 pass |

## 保存、导出与超时

保存 `.blend` 用 Blender 的文件保存能力（例如已验证路径后的 `bpy.ops.wm.save_as_mainfile(filepath=...)`），先检查目标是否已存在；保存后核对磁盘文件和当前 filepath。导出用 catalog 的对应 op，不能只把 `.blend` 改后缀。

长活保留 jobId/runId、session、输出目录、日志和最近快照。客户端等待超时不代表 Blender 失败；先 collect/status，已完成就收产物，仍运行就继续等待。确需取消用对应 job kill；确认进程停下、再判断是否重试。适配层不自动重放写入。

不要把材质设为 GPU 就当作真实 GPU 渲染：看回执设备与降级信息。缺依赖时说明缺什么，不能静默安装或声称当前能力已覆盖。

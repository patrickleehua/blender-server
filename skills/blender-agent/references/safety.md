# 安全与故障恢复

## 写入与场景保留

不要清空全场景、覆盖原始 `.blend`、强抢 lease，或为修一个部件改变其他正常对象。用任务集合与明确对象范围操作；输出新文件名。文件级 snapshot 后再做拓扑、UV、应用修改器与不可逆合并，记录快照路径。需要恢复时确认会恢复整个文件，避免覆盖快照之后别人的正常工作。

共享 GUI 写入前 `who` → `lease`，记录 holder 与作用域；结束释放自己的 lease。适配器会识别后端归属，已有 DSH 后端不是可随意接管的服务；端口冲突换一组配置，不 stop 别人的进程。并行任务优先独立 worker/输出目录。

CLI 每次命令都是新进程：场景操作先启动 persistent backend，显式 `--holder <本次工作会话id>` 或 `BLENDER_AGENT_HOLDER`，跨调用保持相同 holder 与 worker名；lease、写入及 release 同样复用该值。不要只在 lease JSON 填 holder。并行 agent 使用不同 holder 与 worker名；MCP使用自身进程身份，不硬编码共用holder。

共享自动 backend 按活跃 MCP 客户端计数，其他客户端仍在时场景保留，最后客户端离开后清理；persistent backend 无客户端也保留。显式 stop 收到 `BACKEND_IN_USE` 时先关闭其他客户端，不终止其进程。

## 故障表

| 回执/现象 | 下一步 |
|---|---|
| `blender-unreachable` | GUI 是否启动、随包 addon 是否启用并 Connect；需要 GUI 时 launch。确无 GUI 才走 worker，并 start+see 验证 |
| `main-thread-busy` / paused / GUI状态不明 | 等渲染/模态操作结束或处理暂停，不自动改走另一场景；full UI截图必须等GUI恢复 |
| 后端不可达/端口被占 | 核对当前 adapter 的 port/workdir/backend status，先确认进程归属，别结束未知进程 |
| `409 leased` | `who` 查 holder/剩余时间；停止冲突写入，不 force |
| `EXPLICIT_HOLDER_REQUIRED` | CLI场景调用或lease/release缺身份；给本轮操作都加稳定 `--holder` 或 `BLENDER_AGENT_HOLDER`，范围见能力路由 |
| `PERSISTENT_BACKEND_REQUIRED` | 先用同端口/workdir执行 `backend start`，再操作场景；不能用临时后端维持worker/job |
| `WORKER_OWNED` / worker HTTP 409 | worker属于其他holder；查list/status，使用独立worker名，不强抢 |
| `BACKEND_IN_USE` | 其他MCP客户端仍连接；关闭其他客户端，再停止自己的backend |
| `isError=true` 且 `executionCompleted=true` | 修改已经完成、图片失败；仅重试see，禁止重放code |
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

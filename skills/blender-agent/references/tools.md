# 能力路由

工具及参数以当前 `tools/list`、CLI `tools` 和 `blender_rt_plan(op="catalog")` 的回执为准。本适配层保留 v2.6 基线的 15 工具；catalog 基线为 33 family / 217 op，升级后重新核对。

| 工作 | 工具 | 要点 |
|---|---|---|
| 诊断、启动 GUI、共享场景协调 | `blender_viewport` | doctor / status / launch / who / lease / release。后端启动用 portable CLI `backend start`；不要占用旧 DSH 后端端口 |
| 读图 | `blender_rt_see` | GUI 视口或自定义视角；无 GUI 先明确 worker/session，确认回执实际路线 |
| 执行 Python | `blender_rt_do` | 持久内核 K；修改前读状态；无头所有调用保持同一 session |
| 动态画面检查 | `blender_rt_watch` | 最多六帧与 hash；相同画面不重复读取 |
| 持久无头交互 | `blender_rt_worker` | start → exec/see/watch → status → stop；默认空闲 TTL 15 分钟，失效后不要假设场景仍在 |
| 能力查找与结构化操作 | `blender_rt_plan` | catalog；单族 `args={family:"audit"}`；具体 op 的 help。支持的 family 可用 `session="auto"` 走无头 |
| 参数搜索 | `blender_rt_loop` | 无头用 target=session；收敛后独立量测/渲染验收 |
| 一次性批处理 | `blender_rt_headless` | 独立进程；长活 `as_job=true`；与 GUI 场景分离，需要明确输入文件 |
| 长任务回收 | `blender_rt_job` | start/status/wait/collect/list/kill；保存 id，不因客户端超时重复提交 |
| 快照与回滚 | `blender_rt_txn` | snapshot/restore 是文件级；mark/revert 不含拓扑/UV |
| 复用参数 | `blender_rt_preset` | save/list/get/apply/export/import；导入前查来源 |
| 性能分析/对象精简 | `blender_rt_perf` / `blender_rt_opt` | 先 analyze，再按任务决定 apply/join；精简后检查材质、命名、结构和导出 |
| addon 原生命令 | `blender_rt_commands` / `blender_rt_cmd` | 先查 39 命令及集成状态；这些命令依赖 GUI addon |

常用能力族：参考图 `img_*`；几何 `shape_* / geo_* / vehicle_* / sweep_*`；白模和参考包 `blockout_*`；审计 `audit_*`；装配 `asm_*`；视觉 `qc_* / visualreport_*`；门与交付 `gate_* / deliver_*`；评估 `eval_*`。名称出现在目录不代表每种任务、依赖或质量级别都受支持，先读该族限制。

## Python 与单位

无头优先 `bpy.data`、`bmesh` 和显式对象引用，依赖当前 editor/selection 的 `bpy.ops` 先做小步验证。调用 Python 时不要依赖某次 GUI 当前模式碰巧正确；记录 Blender 版本，5.x 与 4.x 的节点/材质 API 不混用。

读取 `scene.unit_settings` 后统一换算。默认 scale_length=1 时 1 BU=1 m，但不能替已有项目做这个假设。装配 manifest / blockout 参数的毫米口径与 Blender 内部单位应在入口统一转换。不要每个零件各用一套常量。

## CLI 与 MCP

MCP 是首选模型入口，图片为原生 image 内容。CLI 示例（JSON 文件避免不同 shell 的转义差异）：

```text
blender-agent tools
blender-agent catalog --family audit
blender-agent call blender_rt_plan --file request.json
```

`request.json` 示例：`{"op":"catalog","args":{"family":"audit"}}`。端口/workdir/blender 使用项目安装生成的同一组参数。CLI 的 worker start、job start 和 headless 先显式 backend start；lease、受保护写入及 release 另加同一个 `--holder <本次会话id>`，或在当前工作会话设置 `BLENDER_AGENT_HOLDER`。不同写者不用相同 holder。CLI JSON 中图片可能带 base64，避免把整段图片数据再贴进上下文；读取回执提供的真实图片文件。

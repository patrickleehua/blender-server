# Blender 5.0.1 Windows 兼容补测

结论：本轮在真实 Windows x64 Blender 5.0.1 无头环境完成 MCP 建模、图片、audit 增量加载、事务、文件交付与核心回归，列出的检查全部通过，未发现该范围内的产品缺陷。这补足 5.x 的实际执行证据，不能推导所有 5.x 版本或全部 catalog 操作都已验收。

## 版本与来源

- 源码开始时 HEAD：`fe3bc3ef3c9422a53a62596bb27c6d464fe6806f`；测试者没有修改产品实现、版本或全局配置。并行任务在本轮结束前修改了 engine/server/stage/setup，最终合入状态仍须由主任务验证。
- Blender：`5.0.1`，build hash `a3db93c5b259`，Windows Release，构建时间 2025-12-16 01:32:30。完整输出见 `version.txt`。
- Node：`v24.20.0`；包为本地 `packages/blender-agent/dist` 的 1.0.0 CLI/MCP（dist/cli.js 修改时间 2026-10-23 03:09:02 +08:00）。
- 官方便携包：<https://download.blender.org/release/Blender5.0/blender-5.0.1-windows-x64.zip>；选择稳定的 5.0 分支补丁版，不声称它是当前最新 5.x。
- 官方校验文件：<https://download.blender.org/release/Blender5.0/blender-5.0.1.sha256>。ZIP 实际 SHA256 与官方逐字匹配：`921d77f6c505a35b2c2f6e67d4ad1c10b72418338ba0e0d3ea7f582a5e5fe46e`。见 `download.json` 和保留的官方 `.sha256`。
- 软件仅解压到项目 `.local/blender-5.0.1-windows-x64/`，下载包不提交。Blender 调用使用 `--factory-startup`，未写入用户 preferences。

## 已实测

| 路径 | 可观察结果 | 证据 |
| --- | --- | --- |
| 最小进程 | Blender 5.0.1 启动，factory scene 默认引擎为 `BLENDER_EEVEE` | `tmp/mvp-blender5/minimal.log`（本地原文） |
| MCP 协议与持续场景 | 真实 stdio 握手列出 15 工具；16 次调用。audit_mesh 增量加载后 worker PID 不变，原对象与 K.marker 保留 | `mcp-calls.json`、`mcp-result.json` |
| 路径 | 中文/空格 workdir 可运行，已保存 blend 旁边的相对 Python 文件执行成功 | `mcp-calls.json` |
| 图像 | MCP 返回原生 `image/png`，独立读取 560×315，实际打开查看完整灰色长方体，无裁切 | `mcp.png` |
| 错误恢复 | 人为 RuntimeError 返回 isError=true，下一次读取同场景成功 | `mcp-calls.json` |
| 事务 | 真 snapshot → 将 x 改为 99 → restore 后 x 回到 1，并回写自己的原 blend | `mcp-calls.json`、`snapshots/` |
| 文件交付 | 保存 blend、导出 GLB（glTF 魔数），两个独立 Blender 进程重开/导入后检查对象与世界 bbox | `scene.blend`、`scene.glb`、`independent-*.json` 与对应 stdout/stderr |
| 几何一致 | 两者 bbox 都是 x=[0,2]、y=[0,4]、z=[0,3]；blend 8 顶点、GLB 因法线拆分为 24 顶点 | `independent-blend.json`、`independent-glb.json` |
| 既有真实 runtime 回归 | 3 次 see 无相机 datablock 泄漏；静态 watch distinct=1、动画 distinct=2；前置代码错误传播；对象/场景 preset dry_run 只读且真实 apply 生效 | `runtime-regression/regression.json`、`runtime-regression/stdout.txt`、`runtime-regression/stderr.txt` |
| 5.x EEVEE | worker `_engine_setup`、perf apply、实际 GPU_PRELUDE 三入口均落在真实 `BLENDER_EEVEE`；128×72 PNG 魔数/尺寸/可见像素变化通过；已打开查看 | `runtime-regression/regression.json`、`runtime-regression/eevee.png` |
| 生命周期 | 并发 start 同 PID；audit 增量 preload 保场景；35 秒忙请求穿过 30 秒 TTL 巡检；stop 后 owned port 释放 | `lifecycle/lifecycle.json` |
| MCP 清理 | MCP close 后后台与 worker PID 均不存在，44877/44879 释放 | `cleanup.json` |

端口使用 44876/44877/44879；生命周期使用 44889。生命周期脚本保留既有暂时探测空闲随机端口的逻辑，但实际 worker 固定在 44889；不占用其他并行任务的服务端口。

首次截图构图偏近，调整为正交 scale=12 后重新执行 MCP 脚本并实际查看；中间一次测试脚本把 from/look_at 写成数组，被合同明确拒绝，改为 schema 规定的逗号字符串。这是测试输入修正，没有产品修复，最终原始结果保留最终运行。

## 重跑

从仓库根目录，先保证当前包已正常 build，并保留上述项目内 Blender；无需 GUI：

```powershell
$env:BLENDER_AGENT_EXE=(Resolve-Path '.local/blender-5.0.1-windows-x64/blender.exe').Path
node tests/runtime/runtime_regression.mjs evidence/mvp-audit/blender5/runtime-regression
node evidence/mvp-audit/blender5/live.mjs
$env:BLENDER_AGENT_TEST_OUT=(Join-Path (Get-Location) 'evidence/mvp-audit/blender5/lifecycle')
node evidence/mvp-audit/blender5/worker-lifecycle.mjs --ttl
```

`live.mjs` 是本次定向验收脚本，`worker-lifecycle.mjs` 基于既有 `tests/runtime/worker_lifecycle.mjs`，仅适配位置和固定端口。既有 runtime 回归未降低断言。模型构建、事务、导出只操作本轮证据目录；重跑会覆盖本轮同名产物。

## 边界

未测 5.x GUI addon/doctor.kind=ok、Claude/Codex 真宿主、其他 OS、其他 5.x 版本、217 操作全覆盖、外部可选原生依赖、Cycles GPU。headless doctor 明确返回 `blender-unreachable`，仅说明没有 GUI 通道，不将其写成 GUI 通过。EEVEE 结果保留实际 renderer `Intel(R) Graphics`，不能据此代表所有 GPU。

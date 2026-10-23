# Runtime真实回归

环境需要真实 Blender 4.x/5.x，无mock，不自动安装软件。

```powershell
$env:BLENDER_AGENT_EXE='绝对路径\blender.exe'
node tests/runtime/runtime_regression.mjs
```

可给第2参数指定证据目录。默认落 `tmp/runtime-regression/`。失败时保留stdout/stderr原文；`--python-exit-code 1`确保Python断言失败不会被Blender默认退出码0隐藏。

保护本轮实际复现缺陷：see相机数据泄漏、PNG元数据使静态watch误报、watch前置代码错误不传播、preset dry_run改变对象/场景。还核对真实动画能被watch识别，避免用永远相同的哈希伪造稳定。

本轮更广的HTTP、保存重开、GLB重新导入、GUI桥与原上游回归证据见 `evidence/runtime/RESULTS.md`。

持久worker生命周期真实回归：

```powershell
node tests/runtime/worker_lifecycle.mjs
node tests/runtime/worker_lifecycle.mjs --ttl
```

第二条会执行35秒真实代码，穿过30秒TTL巡检。覆盖并发启动只产生一个PID、增量加载audit不丢场景、忙碌请求不被回收，以及stop完成后owned端口必须已释放。该测试直接加载独立bridge代码，复用真实Blender，不依赖旧宿主。

`runtime_regression.mjs` 还从最终 `bridge/runtime/paths.mjs` 生成实际GPU_PRELUDE，并在真实Blender内检查worker/perf/prelude三个EEVEE配置入口。最后真实渲染128×72PNG，独立检查魔数、尺寸与可见像素变化。用于保护4.x/5.x间EEVEE枚举变化时默认引擎配置不能静默失败。

它还检查 EEVEE 性能预设 apply/revert 完整恢复、第二次预设使用新基线、Cycles 预设恢复不回退。两种版本必须分别真实执行。

```powershell
$env:BLENDER_AGENT_TEST_OUT=(Join-Path $PWD 'tmp/runtime-protocol')
node tests/runtime/protocol_regression.mjs
```

上面核对真实 Python 异常非零退出、runId/jobId 别名回收、同名 worker 的归属保护、不同 worker 并行以及实际对象合并。opt 的 addon wire 由夹具把原代码送入真实 worker；此项不能当作 GUI 验收。

适配器真实入口（先 `npm run build`）：

```powershell
$env:BLENDER_AGENT_TEST_EXE=$env:BLENDER_AGENT_EXE
npm --prefix packages/blender-agent run test:live
```

包含两个 MCP 共后台、创建者退出/终止、最后客户端清理、CLI 持久状态与稳定 holder 等回归。无 Blender 时不会替换成 mock。

Windows 隔离隐藏 GUI 入口：

```powershell
$env:BLENDER_AGENT_GUI_OUT=(Join-Path $PWD 'tmp/gui-live/evidence')
$env:BLENDER_AGENT_GUI_WORK=(Join-Path $PWD 'tmp/gui-live/work')
node tests/runtime/gui_live.mjs
```

默认独占 45877/45876/45879；全部使用自己启动的 factory GUI 和配置目录。核对 doctor、默认/自定义图像、实际 GPU 清屏像素、opt、txn、preset、perf、暂停保护与清理。脚本通过后仍需打开生成图片确认目标形体，PNG 魔数或 hash 不能代替视觉验收。

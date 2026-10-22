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

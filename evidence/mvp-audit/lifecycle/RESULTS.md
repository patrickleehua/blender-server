# 多客户端与 CLI 生命周期真实回归

结论：新增永久测试 `packages/blender-agent/test/lifecycle-live.mjs`，真实 Blender 5.0.1 Windows x64 执行 3/3 通过，0 fail/skip。测试未使用 mock，未改全局配置，未启动可见 GUI。

验证对象是本轮统一构建后的产物，assets fingerprint：`9dcb840637e8f20683d568a2d2b7fc1ee396460225c05366089c1046d39611b0`。Blender hash 为 `a3db93c5b259`，Node `v24.20.0`。时间与 dist SHA256 见 `run-1.json`；原始 Node 输出见 `run-1.tap.txt`。

| 场景 | 实际检查 | 结果 |
| --- | --- | --- |
| 两个 MCP，创建者正常退出 | A 创建后台与 owner worker；B 同配置建 survivor worker、对象与 K.marker；显式 stop 返回 BACKEND_IN_USE；A close 后后台 PID 和 B worker PID 不变，B 对象/K 保留；人为错误后继续读取；最后 B close 清理全部后台/两个 worker/两个 MCP PID 与 worker 端口 | pass，约 2.48 秒 |
| 两个 MCP，创建者被终止 | 只对 SDK 返回且本测试记录的 A MCP 子进程发 SIGKILL；等待 A 退出并跨过一秒回收间隔；B 的原 PID/对象/K 保留，错误不伪装成功；B 最后 close 后全部测试进程与端口清理 | pass，约 3.63 秒 |
| 跨 CLI 持久状态 | 未 backend start 的显式/隐式 do、see、watch、plan 均返回 PERSISTENT_BACKEND_REQUIRED，HTTP 端口与后台 marker 从未创建；start 后无人附着 1.3 秒仍存活；缺 holder 的 do/worker stop 返回 EXPLICIT_HOLDER_REQUIRED；同 holder 跨多个真实 CLI 进程保持同后台/worker/K/对象；RuntimeError 返回失败但下一调用状态保留；显式 stop 清理 | pass，约 6.34 秒 |

每个场景的 `calls.json`、MCP stderr 原文、cleanup 与结果保留在 `run-1/` 的对应目录。清理通过调用原后台的身份校验接口完成，不通过 PID 猜测或杀其他端口进程。SIGKILL 只用于测试启动的 A MCP 进程；没有杀 Blender GUI 或任何非测试 PID。

重跑（先正常 build）：

```powershell
$env:BLENDER_AGENT_TEST_EXE=(Resolve-Path '.local/blender-5.0.1-windows-x64/blender.exe').Path
$env:BLENDER_AGENT_LIFECYCLE_OUT=(Join-Path (Get-Location) 'evidence/mvp-audit/lifecycle/new-run')
node --test packages/blender-agent/test/lifecycle-live.mjs
```

脚本明确要求真实 Blender；不加入默认 `*.test.mjs` 的环境无关测试。以上只覆盖本次生命周期修复，不能代替 GUI、真实 Agent 宿主或全 catalog 验收。

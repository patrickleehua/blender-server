# 最终真实 GUI 回归

结论：隐藏的独立 Blender 4.5.15 GUI 上完成 48 次 Bridge 工具调用，全部符合预期；最终默认视口和自定义视角图像均已真实打开查看，图像清楚且对应同一 GUI 场景。先前发现的视口像素重排和 EEVEE 回滚缺陷，经产品修复后原路径复验通过。

最终运行记录：`result.json`、`environment.json`、`calls.json`、`cleanup.json`、`final-run.stdout.txt`。新增可重跑入口为 `tests/runtime/gui_live.mjs`。

## 精确环境

- Windows x64；Blender `4.5.15 LTS`（构建 hash `5afeabba6097`），Node `v24.20.0`。
- 最终运行 assets fingerprint：`be8bc90e415187fcf7b85b798608c9004eb4a6e8c08feb193dd0674a7d70f78d`。
- CLI SHA256：`af797f3023a35008429e839200f47546b1e6f1632d54fa71bcefa19c3be04bd2`。
- 上一轮同业务代码 fingerprint `c3d189b5a0721afce1e6e09d9d422c5741ae1a0d2cf9ee593cb2319993078af3` 也已通过。最终一轮仅调整测试取景的正交 scale，从 10 到 14，使拉高模型完整入镜；运行前主任务更新了后台 persistent reaper guard，最终脚本实际读取并验证的 fingerprint 如上，不把上一轮指纹冒称最终指纹。
- `Start-Process -WindowStyle Hidden` 启动测试专属 GUI PID `7412`；`--factory-startup`，独立 config/scripts 位于项目 `tmp/mvp-gui/`。使用本包 staged addon，没有打开用户文件或保存用户偏好。
- token backend PID `34152`；HTTP/addon/worker 端口 `45877/45876/45879`。最终全部测试进程退出，全部端口释放。

## 最终实测范围

| 范围 | 检查和结果 |
| --- | --- |
| GUI 真实性 | doctor.kind=`ok`，Python 读回 `bpy.app.background=False` 和独立用户 config；创建操作只发生在本轮 GUI |
| 默认/自定义看图 | 默认原生 image PNG 清晰显示网格、两个 cube；自定义 before 显示双 cube；do 拉长右 cube 后 after 对应变高；final 显示合并后的双几何。已直接 view_image 亲看，无斜纹、无裁切 |
| GPU 已知颜色 | 产品 `_read_rgba8` 在真实 GUI GPU 上读回 16×8 clear，全部 512 字节逐像素匹配 `[64,128,191,255]`，容差 1；独立一维 Buffer 路径也通过 |
| opt | analyze 找到 2 个可合并对象；默认 dry-run 不改对象/面数；真实 join 后从 2 个对象到 1，产品回执 12→12 面，另一路 bpy 读取 12 面/16 顶点保持，保存 before-join 回退文件 |
| cmd 错误 | 未知 addon command 返回 isError=true，保留原始 Unknown command 错误 |
| txn | snapshot → GUI z 改成 19 → restore → 原始位置与 12 面独立读取一致 |
| preset | 无 targets 预览和显式 dry_run 均不动原对象；实际 apply 后 GUI location 精确 `[1,2,3]`，再删除本轮 preset |
| perf EEVEE | RT=false、samples=16、shadow_ray=1、shadow_step=4 基线 → apply 确认生效 → revert → 独立读取原字段全部恢复 |
| perf Cycles | samples=32 → apply/revert → 独立读取恢复 32；没有将设置验证扩写成 Cycles GPU 性能验收 |
| loop | GUI 路由 bench 2 次与 status 返回成功 |
| 暂停/恢复 | 测试本地 timer 设置真实 addon 的 `scene.dshbb_ai_paused`；暂停 see/do 明确失败，worker list 前后均为空，没有另起无头场景；timer 恢复后 doctor.kind=ok，同一 K.gui_marker/GuiJoined 保留 |
| 清理 | Bridge dispose 后后台退出；仅终止脚本启动且记录的 GUI PID；不触碰任何其他 GUI/服务 |

## 缺陷取证与复验

1. EEVEE `perf apply` 原先成功，但紧接 `revert` 报“没有保存过的快照（未 apply 过）”。`first-run/calls.json` 保留原始失败。主任务补齐 EEVEE 快照/恢复后，最终 `perf-eevee-apply`、`perf-eevee-revert`、`perf-eevee-revert-readback` 均通过，没有把失败改为允许。
2. 自定义 viewport 返回有效 PNG、hash 会变，但直接查看是斜纹，原图在 `second-run/`、`probe-run/`。真实 probe 表明 GPU Buffer 的逻辑 to_list 每 pixel 正确，但多维 memoryview exporter 的 shape=`[8,16,4]`、strides=`[1,8,128]`，导致 bytes(memoryview) 和 numpy 展开次序错误。将 Buffer dimensions 设为 w×h×4 后 strides=`[1]`，逐字节检查通过。证据在 `stride-probe-run/`、`flat-buffer-probe-run/`。
3. 不能把初期“可能是 float buffer”的猜测当事实：实测 format=`B`、itemsize=1。UBYTE read_color 但不展平仍失败，保留于 `ubyte-candidate-run/`。最后产品统一显式 RGBA8 读回并展平，默认/custom viewport 都恢复清楚图像。render 模式仅作同场景对照，没有替代默认 viewport 验收。

## 重跑和边界

仓库根目录先正常 build，确保 45876/45877/45879 空闲，再执行：

```powershell
node tests/runtime/gui_live.mjs
```

可用 `BLENDER_AGENT_TEST_EXE`、`BLENDER_AGENT_GUI_OUT`、`BLENDER_AGENT_GUI_WORK`、`BLENDER_AGENT_GUI_PORT` 覆盖本轮路径/端口。只操作测试专属文件和 PID。重新运行会覆盖最终同名证据，历史失败子目录保留不动。

本轮没有重新穷举 217 个操作，没有验证真实 Agent 宿主、其他 OS/GPU、4.5 之外的 GUI、OCR/外部原生依赖。暂停后正常拒绝是预期负向验证，未计成 GUI 失效。历史 probe 轮次用于定位，最终交付看顶层 `result.json` 与清晰 PNG。

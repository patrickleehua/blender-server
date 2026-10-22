# 独立项目真实 Blender 验收场景与结果（2026-10-23）

依据：只读上游 `.upstream/dsh-blender-plugin/AGENTS.md`、`README.zh-CN.md`、`docs/配置参考.md`、`tests/README.md` 的业务契约，及新项目 `docs/portable/` 宿主方案。上游基线7601534；执行实现位于独立项目 `bridge/runtime` / `bridge/addon`，宿主核心位于 `packages/blender-agent`。详细结果、证据文件与边界见本目录 `RESULTS.md`。

环境：官方Blender4.5.15 LTS portable，Node24.20.0，Windows；仅项目内.local，不改系统/用户偏好。原测试HTTP19877/worker19879/addon19876；最终工厂HTTP19977/worker19989与新Bridge核心HTTP19997/worker19999隔离。

| 场景 | 操作与独立预期 | 结果与证据 |
|---|---|---|
| RT-01 可运行 | 官方包SHA256匹配；真实blender --version回4.5LTS | 通过；blender-source.json / blender-version.txt |
| RT-02 持久会话 | start+exec建命名物体，后续exec查询；PID稳定，尺寸与输入一致 | 通过；start.json / create-save.json / status.json |
| RT-03 可观察 | see PNG魔数与独立尺寸检查，画面非空；watch静止不变、动画变化、错误不冒充成功 | 通过；scene-0.png / watch.json / final-permanent-regression/regression.json |
| RT-04 保存与重开 | .blend由另一个Blender进程打开，目标尺寸/8顶点/bbox一致 | 通过；independent-blend.json |
| RT-05 文件回滚 | snapshot后改变拓扑再restore，顶点数与尺寸恢复 | 通过；snapshot.json / mutate-topology.json / restore.json / export.json |
| RT-06 导出 | GLB魔数glTF；独立进程重新导入核对世界坐标bbox | 通过；independent-glb.json / scene.glb |
| RT-07 停止与资源 | stop后status不alive；factory stop后所有owned子进程退出、端口释放 | 通过；stop.json / stopped-status.json / final-worker-lifecycle/lifecycle.json（工厂异步退出竞态已修复并真实复核） |
| RT-08 原有能力 | 只读原上游测试，真实bridge运行，断言不改 | contract28/0（2块view证据SKIP），plan18/0，integration128/0无SKIP |
| RT-09 GUI桥 | 隐藏独立factory GUI，本包addon bootstrap自定义端口；doctor kind=ok、真实see图片、txn/perf/opt/preset/cmd | 通过；launch-bootstrap-status.json / gui-doctor.json / gui-viewport.png / gui-*.json；最终新factory也通过final-factory.json |
| RT-10 宿主共享会话 | 新Bridge do建场景→plan audit增量preload→原对象与PID保留；相对blend路径脚本执行；嵌套失败isError=true | 通过；final-core-calls.json / final-core-*.json |
| RT-11 长任务保护 | 并发同名start复用；TTL1ms下35秒请求跨30秒回收周期仍完成，inflight归0 | 通过；worker-concurrent-ttl-regression.json |

专业依赖未安装时不声称完整支持；degraded不等于pass；不是对全部217个算子所有参数组合的逐项实测。原始失败、修复说明与永久回归见RESULTS.md。


RT-12 默认EEVEE渲染：三条引擎配置入口在真实Blender4.5返回ok=true，有效EEVEE枚举正确；真实渲染128×72 PNG并核对像素。**通过**，见 `eevee-original-failure.json`（修复前）和 `final-eevee-regression/`（修复后）。Blender5兼容分支未作本机实测。

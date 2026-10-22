# 真实运行验收结果

环境：Windows、Node 24.20.0、官方 Blender **4.5.15 LTS**；下载SHA-256与官方清单一致，见 `blender-source.json`。使用项目 `.local` portable，不安装系统组件、不写用户偏好。源引擎由上游 `7601534` 迁至独立项目 `bridge/runtime`，当前验证包含本轮修复；旧项目只读留在 `.upstream/dsh-blender-plugin`。

## 已通过

- **真实持久无头闭环**：start → exec建模 → see(3次) → watch → save → snapshot → 改拓扑 → restore → GLB export → status同PID → stop。PNG魔数/640×360尺寸独立读取通过；画面经直接查看确认含物体。`calls.json`、各步骤JSON、`scene-0.png`。
- **独立产物检查**：第二个Blender进程重开 `scene.blend`，目标物体8顶点，尺寸[2,4,3]；第三个进程导入 `scene.glb`，世界坐标边界与保存场景一致。GLB导入会为法线/面角拆分为24顶点，验收核对几何边界而不是错误要求顶点总数相同。`independent-blend.json`、`independent-glb.json`。
- **真实GUI桥**：`--factory-startup`、独立配置目录、隐藏窗口；最终 `LAUNCH_BOOT_PY` 直接加载本包addon，端口19876，`doctor.addon.kind=ok`；addon 1.10/protocol 11。视口截图直接查看确认目标物体。`launch-bootstrap-status.json`、`gui-doctor.json`、`gui-viewport.png`。
- **GUI工具链**：cmd get_addon_info、commands、act、perf status、opt analyze、txn snapshot/restore、preset save/apply/读取状态核对/delete、plan audit_mesh、loop bench。每步见 `gui-*.json`。这里opt仅分析安全分组，未将其泛称所有合并边界均已验证。
- **原有真实回归**：经新bridge `/headless` 运行只读上游测试，断言未改：contract **28通过/0失败**（view证据记账与staleness两块因没preload view而明确SKIP）；plan **18/0**；upstream integration **128/0，无SKIP**。范围涵盖雕刻真实网格位移、UV、薄壁/悬垂、扫掠、AO贴图烘焙、gate三态、装配/几何/流水线等。见 `*-selftest.json`。
- **永久真实缺陷回归**：`tests/runtime/runtime_regression.mjs` + `.py`；相机数据不泄漏、静态画面哈希稳定、动画确实变化、watch代码失败不继续取图、对象和场景preset dry_run不改变数据，真实apply仍改变数据。见 `permanent-regression/regression.json`。
- **并发与回收**：同名并发start复用同一PID；TTL设1ms，35秒真实执行跨30秒回收巡检仍完成，inflight从1回0。`worker-concurrent-ttl-regression.json`。

## 已复现并修复

1. `see` 删除临时相机对象后引用失效，遗留camera datablock；原始3帧遗留3相机见 `camera-original-failure.json`，已修为先保留data引用、finally成对释放。
2. `watch` 哈希包含PNG的Frame/Time元数据，静态帧被判changed。原始两帧IDAT像素数据相同见 `watch-original-failure.json`；改用实际像素hash，并临时关闭画面stamp后还原场景设置。
3. `watch` 前置code报错仍返回成功且继续渲染；原始证据 `watch-error-original-failure.json`。修为停止采样并传播错误；HTTP外层see/watch/reset也尊重内部失败。
4. preset `dry_run=true` 实际写入对象，原始[1,2,3]→[9,9,9]见 `preset-dryrun-original-failure.json`；修为仅验证目标路径，真实apply不受影响。修复后见 `preset-dryrun-regression.json`。
5. GUI launch只等待自定义addon端口，却没配置addon监听端口；修为传入环境并显式connect，最终隐藏GUI真实19876已通过。
6. 后台spawn补windowsHide；同名worker启动去重；worker进行中请求计数阻止TTL回收；连接提前关闭及时报错。

## 边界

- 未声称全部217算子/所有参数组合已逐项真实验收；上述为原有强断言与关键交互闭环证据。
- Open3D/manifold3d/glTF-Validator/cv2/MediaPipe、OCR、外部付费模型/资产服务未安装或未配置，不计入通过。
- 当前runtime日志/字段保留上游DSH协议标记以兼容业务能力，新宿主适配层由另一工作流独立验收。server factory/onChild与增量preload若后续修改，应在最终stage后补关键回归。
- 首次运行脚本曾在服务监听前连接报ECONNREFUSED，随后实际探测监听后成功；这属于执行时序，不计为产品修复。GUI audit首次以错误参数object调用返回did_you_mean，改为文档参数objects后通过，未为此修改产品。

追加最终入口复核（独立重构之后）：

- 最终 `startRuntimeServer` 工厂实际启动HTTP19977：隐藏GUI doctor.kind=ok与视口PNG、headless真实建模与PNG、watch前置错误HTTP外层ok=false、bridge元数据version=1.0.0；见 `final-factory.json`、`final-factory-gui.png`、`final-factory-headless.png`。
- 新 `Bridge` API实际启动自身后端HTTP19997：同session `rt_do`先建物体再 `rt_plan audit_mesh`增量加载，前后PID相同、原8顶点3m物体保留；相对保存blend目录的Python文件可执行；错误参数嵌套失败返回isError=true。见 `final-core-calls.json`与 `final-core-*.json`。
- 最终源码永久图像/preset缺陷回归再跑通过，见 `final-permanent-regression/regression.json`。
- 另发现工厂 `stop()`返回时owned Blender子进程尚未退出，立即端口探测可连接；已交负责工厂接口的开发者修复并待重跑对应清理断言，未把该项掩盖成通过。

最终关闭修复回归（已完成）：`engine.stop` 等待所有owned background子进程close，`server.stop`等待engine清理；永久 `worker_lifecycle.mjs --ttl` 在最终代码真实通过：并发start同PID、增量preload保留场景、TTL1ms下35秒忙碌执行完成、stop返回后端口已释放。证据 `final-worker-lifecycle/lifecycle.json`。前述清理竞态已关闭。

新Core `blender_viewport(op=launch,dry_run=true)` 默认采用随包addon路径、参数正确映射；核对生成bootstrap包含自定义端口与connect逻辑，`final-launch-dryrun.json`通过。实际隐藏GUI启动本包bootstrap的证据仍为 `launch-bootstrap-status.json`与 `final-factory.json`，未额外打开用户可见窗口。

本轮owned GUI、原HTTP后端与worker均已停止；模型产物保留。`cleanup-listeners.json`记录所用端口无监听残留。后续其他验收产生的进程由其执行者负责，不混入此处结论。

追加默认EEVEE兼容修复（最终代码）：Blender4.5.15的有效引擎枚举是 `BLENDER_EEVEE_NEXT`，原 `GPU_PRELUDE` / worker `_engine_setup` / perf预设硬写 `BLENDER_EEVEE` 会报TypeError并回ok=false。原始真实失败见 `eevee-original-failure.json`。三处统一动态尝试NEXT，遇TypeError/ValueError再回退legacy枚举，遵循已有qc_render对不同版本的兼容策略。未改变Cycles、Workbench或keep路径。

最终永久回归扩展并通过：worker配置、perf预设、实际 `paths.mjs` 导出的GPU_PRELUDE均回ok=true，实际引擎 `BLENDER_EEVEE_NEXT`、光追开启；真实EEVEE渲染出128×72 PNG，独立核对PNG魔数/尺寸及可见像素变化，直接看图确认cube。证据 `final-eevee-regression/regression.json`、`final-eevee-regression/eevee.png`。本机只实测4.5.15，另一个legacy枚举分支用于兼容，不冒称已实机验证Blender5。

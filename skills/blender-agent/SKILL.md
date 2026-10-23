---
name: blender-agent
description: 在真实 Blender 中创建或修改模型、按参考图还原、检查装配与网格、渲染并导出交付；通过 Blender Agent 的 MCP 或 CLI 操作，保留画面和验收证据。用于实际 Blender 场景任务，不用于纯图片生成。
license: MIT
---

# Blender 场景工作

以用户要拿到的模型、图片或交换文件为目标，先确认当前场景，再小步修改、看图和验收。复用宿主现有的执行、权限与上下文机制。

## 工具依赖

需要 **`@patricklee2001/blender-agent` 独立工具包**及其配套 Blender runtime（本 Skill 对应 1.x 的 15 工具合同）；可用 `npm install -g @patricklee2001/blender-agent` 安装。Skill 本身不带 Blender 引擎。MCP 暴露 `blender_rt_*` 和 `blender_viewport`，宿主可能加服务器前缀；CLI 为 `blender-agent`。优先使用已连接的 MCP，CLI 调用同一实现。没有工具时先完成项目安装与诊断，不伪造执行结果。

CLI 等价入口：`blender-agent call <工具名> --file <参数.json>`。场景操作先 `blender-agent backend start`，保持相同端口、workdir、Blender路径及稳定 `--holder <本次会话id>`（或 `BLENDER_AGENT_HOLDER`）。同一 worker/session 复用相同 holder；并行写者用不同 holder 与 worker 名。具体要求见[能力路由](references/tools.md)。MCP 使用服务进程身份，无需固定 holder；共享自动后端在最后活跃客户端离开后清理。

## 开始前

1. 查 `blender_viewport(op="doctor")`，用 `blender_rt_plan(op="catalog")` 查能力、参数和限制。未知 op 先查 family/help，按 `did_you_mean` 修正，别猜名字。
2. **GUI 优先、无头备用**。GUI 使用随包 addon v1.10+ / protocol 11，验收要 doctor `kind=ok`。只有明确不可达才自动走 worker；忙碌、暂停或状态不明时不换场景。完整 UI 截图必须用 GUI。无 GUI、批处理或长任务使用独立 worker，先 start 再 see；GUI doctor 不可达属预期。
3. 读取当前文件、对象/集合、单位和选择，取一张真实画面。确认任务作用域、比例/尺寸、保留对象和输出位置；已有事实与未确认假设分开记录。
4. 多会话或共享 GUI 写入前查看 `who`，申请自己的 lease。遇到 `409 leased` 查持有者并停止冲突写入，不强抢。不要清空用户场景来开始任务。

## 按任务读一份参考

| 当前工作 | 按需阅读 |
|---|---|
| 选择工具、GUI/worker 路由、批量与长任务 | [能力路由](references/tools.md) |
| 新建/修改模型、参考图还原、装配与导出 | [场景工作流](references/workflows.md) |
| 超时、断线、回滚、写入与路径问题 | [安全与故障恢复](references/safety.md) |
| 看图、数字门、交付文件、验收回执 | [视觉与交付验收](references/acceptance.md) |

## 修改闭环

- 先用最简单形体验证整体包络与比例，再做局部；硬表面、重复结构、旋转体分别选择合适基本体、阵列、截面/旋转通路。优先现有 catalog 能力，缺少对应操作时使用 `bpy.data` / `bmesh`。
- 每次有意义的形体改动后取图，先 420–560 px 看整体，有疑点再局部放大。**必须真正打开并观察返回图片**；路径、hash 或“渲染成功”文字不能替代看图。MCP 使用原生 image；CLI 返回本地图片时用宿主图片读取能力打开。
- 对照具体目标指出哪里正确、哪里仍错，随后修正。搜索内环的最佳分数不能自证交付；关键尺寸换一种计算方式复核。
- 拓扑、UV 或应用修改器前做文件级 `blender_rt_txn snapshot`；对象级 mark 不覆盖这些变更。保存 `.blend` 与导出交换文件是不同动作，都核对实际文件。
- 长活用 job/headless 作业句柄回收。**超时或失联后的写入结果未知时，先查状态与产物，不自动重放写入。**
- do 回执 `executionCompleted=true` 但取图失败时仍为 `isError=true`；只重试 see，禁止重放 code。

## 完成标准

用户要求的文件实际存在；已查看关键视图；尺寸/装配/网格检查按任务要求完成；相关 gate 的 `verdict=pass`。`ok=true` 只代表调用完成，`degraded`、`skipped`、`unresolved` 都不能写成通过。交付给出产物路径、证据、仍有限制，不把某条路线可用说成所有宿主/平台均验收。

不承诺上游明确不覆盖的写实生物/有机造型、电影级布光/体积/合成、角色动画绑定；不声称已安装 OCR、landmark/人脸、cv2/MediaPipe、DXF、Open3D、manifold3d 或 glTF-Validator。任务超出能力时说明缺口并给可完成的范围。

# 独立实现复审与定点复验

记录日期：**2026-10-23，Asia/Singapore（UTC+08:00）**。机器记录见 [review-results.json](review-results.json)。本报告整理本次已经执行的结果，记录阶段未扩大验证范围。

结论：独立审查复现了4项问题；修复后，本审查者负责的 **8项合同/CLI租约检查全部通过**。preload和相对blend路径的修复交由另一位runtime审查者复验，本报告不替代其结果。

## 版本与隔离边界

- 工具包：`@blender-agent/bridge` **1.0.0**；Node **v24.20.0**；Windows。
- 实际Blender：**4.5.15 LTS**，构建hash `5afeabba6097`。
- 独占本轮测试端口：后端 **41877**、addon配置 **41876**、worker起始端口 **41879**。未使用19877、29877、30877。
- 各次运行使用独立临时工作目录；未启动可见GUI，未改全局宿主配置。完成后停止或dispose自己的后端；最终8项检查的`backend stop`退出码为0。
- 记录时读取的资产fingerprint：`292beebdf8d6f7732bb86d9c588f568e45b8e433fbc819180e725c32b75b78da`，来源为`packages/blender-agent/assets/manifest.json`。

**fingerprint仅标识记录时的当前资产。** 最终8项执行时没有另行留存fingerprint，且adapter之后还在收尾cleanup。本报告只能支持下面明确列出的合同与CLI修复，不能声称覆盖每个最终字节、全部最终运行时或全部宿主。

## 原始复现

下列输入/输出来自本会话实际工具执行。JSON中的`<isolated workdir>`是为可读性替换的临时绝对路径；对应原目录、参数及结果字段保留在机器记录。它们是忠实整理的复现记录，**不是声称后来生成的JSON就是原封不动的终端原文**。所列源码位置为发现问题时的位置，修复后行号可能移动。

| 编号 | 实际输入 | 预期 | 原始结果与影响 |
|---|---|---|---|
| R-01 / P1 | 同session先`rt_do(code='print("REVIEW_CREATED",len(bpy.data.objects))',see=false)`，再`rt_plan(op='audit_mesh',args={summary_only:true})` | 保留当前模型并增量加载audit能力 | 第一调用成功输出`REVIEW_CREATED 3`；第二调用失败：`AttributeError: module 'dsh_rt_kernel' has no attribute 'dsh_audit_api'`。现成worker提前返回，忽略新增preload |
| R-02 / P1-P2 | 显式backend start；三个独立CLI依次lease→preset save→release，不指定稳定holder | 同一工作会话能跨CLI写入和释放，其他写者仍受阻 | lease持有者为`blender-agent-47412`；下一CLI写入409 leased，holderAlive=null；第三CLI释放返回`released:null`，原租约仍有600秒TTL |
| R-03 / P2 | worker/job分别传`op='this-operation-does-not-exist'` | 清楚拒绝非法操作 | worker假成功返回status；job假成功返回list，均`isError=false,ok=true` |
| R-04 / P2 | worker保存`<workdir>/saved.blend`，旁边放`relative-script.py`，再同session `rt_do(file='relative-script.py',see=false)` | 按合同以当前blend目录解析脚本 | 保存成功；执行脚本失败，Node在源码cwd查找`E:\workplace\blender-server\relative-script.py`并报ENOENT |

涉及位置：R-01为`src/core.ts`的startWorker/plan路径及`bridge/runtime/engine.mjs`已就绪worker复用分支；R-02为默认PID holder与运行时租约；R-03为独立tool合同与worker/job兜底分支；R-04为无头分支的Node `path.resolve(args.file)`。完整路径与发现时行号见机器记录。

R-01、R-04使用了真实Blender worker；R-02、R-03通过真实后端复现，不需要Blender执行。审查者未自行修改packages/bridge实现。

## 最终8项必要复验

最终工作目录：`C:\Users\LIBING~1\AppData\Local\Temp\blender-agent-final-holder-Q44KME`。后端/调用复用41877/41876/41879及同一工作目录，CLI环境先移除已有`BLENDER_AGENT_HOLDER`与`DSH_BLENDER_HOLDER`，避免个人环境污染结果。

| 编号 | 实际操作与预期 | 观察结果 | 证据类型 |
|---|---|---|---|
| F-01 | worker非法op应`INVALID_ARGUMENTS`，不得调用传输 | `isError=true`，code正确，传输计数0 | 实际构建core＋失败哨兵，未调用Blender |
| F-02 | job非法op应`INVALID_ARGUMENTS`，不得调用传输 | `isError=true`，code正确，传输计数0 | 实际构建core＋失败哨兵，未调用Blender |
| F-03 | CLI lease无显式holder，在启动后端前拒绝 | 退出1，`EXPLICIT_HOLDER_REQUIRED`，后端state文件未创建 | 真实CLI |
| F-04 | backend start后，用`--holder final-review-a` lease | 退出0，lease.holder=`final-review-a` | 真实CLI＋后端 |
| F-05 | A持有租约时，B以`--holder final-review-b`启动写文件job | 退出1，HTTP409，回执持有者仍是A | 真实CLI＋后端；写入未获准 |
| F-06 | A在新CLI进程启动相同写文件job，再新CLI wait回收 | start/wait均退出0，job done/exitCode0，文件实际内容为`holder-write-ok` | **真实Blender无头作业** |
| F-07 | 新CLI仍以A执行release | 退出0，released=A，lease.active=false | 真实CLI＋后端 |
| F-08 | 两个CLI分别通过`BLENDER_AGENT_HOLDER=final-review-env` lease/release | 获取与释放均匹配env holder，退出0 | 真实CLI＋后端 |

F-01/F-02的哨兵只替换该隔离Bridge实例的`backend.request`：一旦被调用就计数并抛`NETWORK_MUST_NOT_BE_REACHED`，没有提供假成功响应。它们证明校验先于传输，**不证明完整MCP、真实Blender或宿主模型业务验收**。

F-06实际Python为`open(<workdir>/holder-write.txt,"w").write("holder-write-ok")`；job id为`job-mvjwf34udw6`。它验证租约允许本会话跨CLI执行真实作业及回收结果，并不验证建模、导出或渲染质量。

## 原文件证据与保留的限制

从真实最终作业目录按字节复制了以下文件，机器记录包含源路径、大小和SHA-256：

- [实际写入文件](artifacts/holder-write.txt)
- [原始job summary](artifacts/job-summary.json)：done、exitCode0、507ms。
- [原始stdout](artifacts/job-stdout.log)
- [原始stderr](artifacts/job-stderr.log)

原始stdout还包含一条`DSH_GPU ok=false`：Blender 4.5中`BLENDER_EEVEE`枚举不存在，实际为`BLENDER_EEVEE_NEXT`。这次文件写入脚本及作业仍然成功退出；**本项没有渲染，不能据此声称EEVEE/GPU初始化或渲染通过**。保留原日志而不把该信息删掉。

定点复验前，曾尝试用preset save作为同holder写入：租约门放行后，由于41876没有GUI addon而失败。它没有计入“写入成功”；随后用F-06的真实Blender后台job及落盘文件替换验证。该过程没有打开GUI。

剩余边界：本报告未复跑R-01/R-04修复；未验GUI addon、Claude/Codex模型任务、所有操作系统或所有渲染/导出能力。文档与Skill已同步稳定holder、并行不同holder、CLI持久后端要求；格式和安装器检查也不能替代这些未执行验收。

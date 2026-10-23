# Blender Agent Bridge

面向 Claude Code、Codex 与其他 MCP 宿主的 Blender CLI / MCP stdio 服务。CLI 和 MCP 共用执行核心，提供 **15 个工具、33 类 / 217 个目录操作**，支持建模、真实图像回看、量测、装配检查、保存和导出。

需要 **Node.js 22+、npm 和另行安装的 Blender 4.x / 5.x**。包内附 runtime、GUI addon、工具合同、Skill 与项目安装器；无需安装旧宿主或保留源码仓库。Python 由 Blender 提供，无需另装系统 Python、uv 或 pip。

## 安装工具包

安装公开 npm 包，使用固定安装位置接入项目：

```sh
npm install -g @patricklee2001/blender-agent
blender-agent help
blender-agent help install
blender-agent install --help
```

包已含编译结果，使用者不用执行构建；npm 仍需安装运行依赖。也可用 `npm install -g ./patricklee2001-blender-agent-1.0.0.tgz` 安装维护者提供的同一制品。全局安装提供稳定 CLI 路径，适合项目 MCP 长期引用。不要用临时 `npx` 缓存路径生成项目配置。

有源码权限时，也可在仓库根目录构建运行：

```sh
git clone https://github.com/patrickleehua/blender-server.git
cd blender-server
npm --prefix packages/blender-agent ci
npm run build
node packages/blender-agent/dist/cli.js help
node packages/blender-agent/dist/cli.js install --project "C:/my project" --dry-run
```

仓库当前为私有，克隆需要相应权限。源码根目录运行 `npm run pack`，在 `release/` 生成独立 `.tgz` 与发行清单。

## 接入项目

以下命令写入指定的已存在项目；`--project` 默认当前目录，`--host` 默认 `both`，可选 `claude` / `codex`。默认只预览，加 `--apply` 才写入：

```sh
blender-agent install --project "C:/my project" --host both --blender "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe" --dry-run
blender-agent install --project "C:/my project" --host both --blender "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe" --apply
```

Blender 可自动发现时省略 `--blender`；多实例可指定 `--port`、`--addon-port`、`--worker-port` 和 `--workdir`。默认端口分别为 HTTP `9877`、addon `9876`、worker `9879`，工作目录默认项目内 `.blender-agent/runtime`。

| 宿主 | Skill | MCP 配置 |
| --- | --- | --- |
| Claude Code | `.claude/skills/blender-agent/` | `.mcp.json` |
| Codex | `.agents/skills/blender-agent/` | `.codex/config.toml` |

安装器只管理项目文件，不改全局宿主设置。已有 MCP 配置保留原样，并生成 `.blender-agent/config-candidates/claude.json` / `codex.toml`，将候选中的 `blender-agent` 条目审阅合入。其他文件发生冲突时整次安装零写入。

**重新加载宿主**，按其提示信任项目并允许 MCP；Claude 用 `/blender-agent`，Codex 用 `$blender-agent`。`config --host claude|codex` 可单独打印配置片段。

升级工具包后，对原项目重新执行同一组 `install` 参数，先预览再 `--apply`。`update` 只更新 manifest 记录且未被用户修改的文件；`conflict` 保留用户修改并阻止写入。配置引用 Node 与 CLI 的绝对路径，移动工具目录或换机器后需重新生成。

旧入口保持兼容：`node <已安装包目录>/scripts/portable-setup.mjs --project <项目目录> --dry-run|--apply`。源码中对应仓库根目录的 `scripts/portable-setup.mjs`。

## GUI 与无头

有现成 Blender 场景时优先 GUI。安装并启用 `assets/addon/dsh_blender_bridge.py`，在 Blender 的 N 面板选择 Bridge，将端口设为本项目 addon 端口后 Connect；也可通过 `blender_viewport` 的 `launch` 操作打开配套 Blender。

GUI 就绪必须以 `doctor.kind=ok` 为准，仅后端启动不代表 Blender 已连接。addon 可读取多选对象或集合、暂停 AI 写入；将选择插入某宿主聊天草稿还需要该宿主另行集成。

没有 GUI 时使用持久无头 worker，仍返回实际图像。只有 doctor 明确 GUI 不可达时才自动走无头；忙碌、暂停或不明状态不会切到其他场景。完整 UI 截图需要 GUI。

## 连续 CLI 操作

CLI 每次调用是独立进程。场景操作需先 `backend start`，复用相同端口、工作目录、Blender 路径、稳定 `--holder` 和 worker 名。不同工作流用不同 holder / worker；独立实例另用不同端口和目录。

```powershell
$bridgeOptions = @('--workdir', 'C:/my project/blender work', '--blender', 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe', '--holder', 'model-session-a')
blender-agent backend start @bridgeOptions
blender-agent call blender_rt_worker --json '{"op":"start","name":"model","engine":"workbench","warmup":false}' @bridgeOptions
blender-agent call blender_rt_do --json '{"session":"model","code":"import bpy; bpy.ops.mesh.primitive_cube_add()","see":false}' @bridgeOptions
blender-agent call blender_rt_see --json '{"session":"model","view_size":"560x315"}' @bridgeOptions
blender-agent backend stop @bridgeOptions
```

含引号或多行的 JSON 优先使用 `call <工具> --file args.json` 或 `--stdin`，支持 UTF-8 BOM、中文与空格路径。相对 `blender_rt_do.file` 路径以 worker 当前保存的 `.blend` 所在目录为基准；未保存场景需绝对路径。

缺持久后端返回 `PERSISTENT_BACKEND_REQUIRED`；需要场景身份时缺 holder 返回 `EXPLICIT_HOLDER_REQUIRED`。也可用 `BLENDER_AGENT_HOLDER` 提供身份。同名 worker 被其他 holder 操作时返回 `WORKER_OWNED` / HTTP 409，先查 list/status，再使用自己的 worker 名。MCP 使用服务进程身份，无需硬编码统一 holder。

自动 MCP 后端保留其他活跃客户端的场景，最后客户端离开时清理；显式持久后端保持运行。其他客户端仍连接时显式 stop 返回 `BACKEND_IN_USE`。停止会清理后台 Blender 子进程，用户 GUI 窗口保留。

## 工具与回执

`tools` 列出全部 15 个 Schema；`catalog --family audit` 按类查找，`catalog --full` 查看完整目录。现有 plan 名称与 Python `K` API 保持兼容。

CLI 在 stdout 输出 JSON，MCP 用原生 `image` 内容块返回图片；日志位于 `<workdir>/.blender-agent/`。超时或取消后先查询 job / worker 状态，禁止盲目重放写操作。长无头任务先获取句柄，再用 `blender_rt_job` 查询、收集或停止。

执行成功但取图失败时，回执为 `isError=true` 且 `executionCompleted=true`，只重试 see。headless/job 的 `args` 使用字符串数组，worker see/watch 支持 `view_size`。QC 保留 `pass / fail / degraded`，`degraded` 不算验收通过。

后端校验身份、引擎指纹、工作目录和端口，不接管外部占用端口；HTTP 绑定本机回环地址并认证请求。工具支持 Blender Python 执行，npm 分发不隐藏实现，也未新增任意 shell 工具。Open3D、manifold3d、OpenCV/MediaPipe、glTF Validator 等可选依赖未捆绑。

## 卸载与验证

先保存模型、停止自己的 worker/backend，再清理项目接入；最后才删除工具包：

```sh
blender-agent uninstall --project "C:/my project" --dry-run
blender-agent uninstall --project "C:/my project" --apply
npm uninstall -g @patricklee2001/blender-agent
```

卸载只删除 manifest 记录且 hash 未变的文件，保留用户修改、工作目录与产物。手工合入既有 MCP 配置的条目需手工移除；空目录保留。原脚本的 `--uninstall` 入口继续可用。

源码中 `npm test` 执行协议、身份、超时与生命周期回归；设置 `BLENDER_AGENT_TEST_EXE` 后运行 `npm --prefix packages/blender-agent run test:live` 做真实 Blender 验证。历史 MVP 覆盖 Windows、Blender 4.5.15 / 5.0.1 无头、4.5.15 GUI，以及 Claude Opus 5.5 medium / Codex gpt-6.1-sol medium。报告对应其记录的旧制品，不能作为新版本或新入口的验收；Linux/macOS 尚无本项目真实机器验收记录。

完整资料见[源码仓库](https://github.com/patrickleehua/blender-server)内 `docs/portable/使用指南.md`、`docs/distribution.md` 与 `docs/acceptance-report.md`，访问需仓库权限。

本包与复用引擎保留 BSD-3-Clause 声明；Skill 另附 MIT 许可。参见 `LICENSE`、`assets/LICENSE`、`assets/NOTICE.md` 和 `assets/skill/LICENSE`。Blender 是独立产品，需另行安装。

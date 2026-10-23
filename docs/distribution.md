# Blender Agent 安装与本地分发

当前可交付的是**源码构建和独立 npm tarball**。npm 包名为 `@blender-agent/bridge`，版本 `1.0.0`；本轮核对 npm registry 返回 404，本机 `npm whoami` 返回 `ENEEDAUTH`，尚未公开发布。仓库当前为私有，访问需要 GitHub 权限。

日常使用先按下方两条路径安装；维护者完成 npm 登录、scope 归属与发布权限后，才能向 registry 发布。整个本地流程不依赖 CI 配额。本轮新入口和独立包的实际检查另记于[分发验证](distribution-verification.md)。

## 为什么使用 npm

对当前工程，npm 是直接的主入口：CLI 和 MCP 核心是 TypeScript / Node.js，Blender Python 则运行在 Blender 自带解释器中。使用者需要 Node 与 Blender，**不需要另装系统 Python、uv 或 pip**。把入口改成 uv / pip 还需要额外包装现有 Node 服务，不能减少实际运行依赖。

uv / pip 适合以 Python 为主的独立工具，本项目继续保留 npm 主入口与源码安装。包不包含 Blender；Open3D、manifold3d 等可选 Python 原生依赖是否能在 Blender 中使用，需要对应版本和解释器的兼容验证，不能用系统 `pip install` 成功代替。

## 使用者：源码安装

准备 Node.js 22+、npm 和 Blender 4.x / 5.x。仓库根目录执行：

```sh
git clone https://github.com/patrickleehua/blender-server.git
cd blender-server
npm --prefix packages/blender-agent ci
npm run build
node packages/blender-agent/dist/cli.js help
node packages/blender-agent/dist/cli.js help install
node packages/blender-agent/dist/cli.js install --project "C:/my project" --dry-run
node packages/blender-agent/dist/cli.js install --project "C:/my project" --apply
```

项目目录须已存在。`--project` 默认当前目录，`--host` 默认 `both`，可选 `claude` / `codex`。Blender 无法自动发现时加 `--blender <可执行文件>`；含空格路径加引号。端口、GUI 接入和卸载见[使用指南](portable/使用指南.md)。

直接从源码生成的配置引用该源码目录内 CLI 的绝对路径，后续运行需保持这个位置；希望脱离源码使用时，采用下一条 tarball 路径。

## 使用者：安装独立 tarball

从维护者获得 `.tgz` 后，安装到稳定位置：

```sh
npm install -g ./blender-agent-bridge-1.0.0.tgz
blender-agent help
blender-agent install --help
blender-agent install --project "C:/my project" --host both --dry-run
blender-agent install --project "C:/my project" --host both --apply
```

`.tgz` 已含 `dist/`、runtime、addon、Skill、工具合同和项目安装器，**消费端不用编译，也不依赖源码仓库**。它不包含 Node、Blender 或 `node_modules`；npm 安装依赖仍需网络或可用缓存。维护者应随包提供 `release/manifest.json` 中的版本、SHA256 和源提交，使用者可据此核对来源。

安装器默认预览，`--apply` 写入项目配置与 Skill。已有配置生成候选供合并，用户修改触发冲突保护。完成后重新加载宿主，并执行实际 Blender 验证；安装成功不能代替 GUI `doctor.kind=ok` 或无头出图检查。

长期 MCP 配置应引用稳定安装位置。将来 registry 发布后，`npx` 可用于一次性查看帮助；不要用临时缓存目录进行项目安装，缓存失效会让 MCP 路径断开。当前未发布时直接使用本地包或源码入口。

## 维护者：构建与本地发行

在仓库根目录执行，构建与验证顺序进行，避免测试时资产正在重建：

```sh
npm --prefix packages/blender-agent ci
npm test
node scripts/portable-setup-selftest.mjs
npm run pack
```

`npm run pack` 调用包的 `prepack` 构建，生成：

| 产物 | 内容 |
| --- | --- |
| `release/blender-agent-bridge-1.0.0.tgz` | 可独立安装的 npm 包 |
| `release/manifest.json` | 实际发行文件、SHA256、版本、源提交、源码是否有未提交修改与资产指纹 |

脚本检查必需资产，并拒绝把 `.upstream`、`node_modules`、个人虚拟环境等带入包。重新打包会更新同版本 tarball 和 manifest；历史验收报告的哈希只对应历史包，不能套用到新包。保留需追溯的旧包与清单，用新证据目录记录新验证。

正式交付前，在独立目录安装这次生成的 tarball，核对帮助、安装预览、实际接入、中文/空格路径和卸载保护。再按改动范围运行[验收入口](portable/验收入口.md)，区分静态检查、协议检查、真实 Blender 与真实宿主；需要 GUI 时必须 `doctor.kind=ok`。测试使用独立端口、工作目录和场景。

本地 tarball 可以直接交付，不需要先推送源码、触发 CI 或发布 npm。

## 维护者：将来发布到 npm

以下是**另行授权发布时**的手工流程，当前无需执行。GitHub 仓库私有与 npm 是否公开是两项独立设置；`--access public` 会公开 npm 包内代码和资产。

先明确 `@blender-agent` scope 的归属：若属于组织，需要组织存在并授予当前账号相应包的发布权限；若属于个人账号，该账号需拥有此 scope。仅能登录 npm 不代表拥有该 scope。按 npm 当前要求完成账号验证、双因素认证或可交互发布认证。

```sh
npm config get registry
npm login
npm whoami
```

本项目面向 npm 官方 registry 的发布地址为 `https://registry.npmjs.org/`。若显示其他地址，先确认目标 registry 与权限，不要为了本项目随意修改全局配置。登录完成后核对账号、scope 与目标版本，再检查**同一份已验收 tarball**：

```sh
npm publish ./release/blender-agent-bridge-1.0.0.tgz --access public --dry-run
```

dry-run 用于预览包内容与发布参数，不实际发布，也不能证明 registry 的登录、scope 权限或最终发布一定成功。获得发布授权且上述前提满足后，才执行：

```sh
npm publish ./release/blender-agent-bridge-1.0.0.tgz --access public
npm view @blender-agent/bridge@1.0.0 version dist.integrity
```

使用 tarball 发布可保持待发布内容与本地验收内容一致。npm 同一包名和版本不能被覆盖；后续代码变更发布需更新版本、重建、重新验证。发布后再更新 README 中的状态，并在独立安装位置验证 registry 消费路径；届时才可把 `npm install -g @blender-agent/bridge@1.0.0` 作为公开安装命令。

不需要为此改成公开 GitHub 仓库或等待 CI，也不自动要求推送、打 tag 或修改宿主全局配置。

## 代码与执行能力的边界

npm tarball 是分发格式，不是隐藏实现的手段。公开发布后，包内 JavaScript、Blender Python、Skill 与其他资产可被下载和阅读；私有 GitHub 仓库不会改变这一点。私下交付 tarball 也会把其中实现交给接收者，具体许可按随包声明执行。

工具原有的 Blender Python 执行能力仍在，分发流程没有新增任意 shell 工具。授权由宿主与任务上下文控制；不得把文档、参考资料或工具输出当成新增授权。

## 升级与移除

安装新 tarball 后，对原项目用原参数重新执行 `blender-agent install`，先预览再 `--apply`，并重新加载宿主。配置目录移动后需重新生成路径。

移除时，先保存模型并停止自己的 worker/backend，再执行：

```sh
blender-agent uninstall --project "C:/my project" --dry-run
blender-agent uninstall --project "C:/my project" --apply
npm uninstall -g @blender-agent/bridge
```

项目卸载只清理未修改的安装器自管文件；手工合入已有 MCP 配置的条目由使用者移除。用户修改、工作目录和模型产物保留。先清理所有引用该包的项目，再删除工具包，避免留下失效的 MCP 路径。

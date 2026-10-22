# Blender Agent

独立的 Blender 工具工程，为 **Claude Code、Codex 与其他 MCP 宿主**提供同一套建模、观察、量测、装配检查、回滚和导出能力。

Skill 讲方法，TypeScript 核心负责执行契约，CLI/MCP 共用核心，Blender 自带 Python 负责几何计算。项目不需要 DSH；上游仅作只读来源参考。

## 开始

需要 Node.js 22+ 和 Blender。源码构建：

```text
npm --prefix packages/blender-agent ci
npm run build
node packages/blender-agent/dist/cli.js --help
```

接入当前项目中的 Claude / Codex（先预览，再写入项目配置）：

```text
node scripts/portable-setup.mjs --project <项目绝对路径> --host both --blender <Blender绝对路径> --dry-run
node scripts/portable-setup.mjs --project <项目绝对路径> --host both --blender <Blender绝对路径> --apply
```

宿主重新加载后，使用 `/blender-agent`（Claude）或 `$blender-agent`（Codex）。GUI 有现成场景时优先连接随包 addon；无 GUI 使用持久 worker，仍返回真实图片。

- [完整使用指南](docs/portable/使用指南.md)：安装、配置、连续 CLI 操作、GUI/无头、卸载。
- [独立重构设计](docs/adapter-design.md)：职责与兼容边界。
- [验收场景](docs/acceptance-scenarios.md)：实际验收的独立判据。
- [最终验收报告](docs/acceptance-report.md)：指定 Claude/Codex 真实运行与独立产物检查。
- [通用 Skill](skills/blender-agent/SKILL.md)：能力选择与建模闭环。
- [许可与来源](NOTICE.md)：固定上游版本和保留的许可证。

## 开发与打包

```text
npm test
node scripts/portable-setup-selftest.mjs
npm run pack
```

独立 npm 包携带工具合同、运行引擎、addon、Skill 和项目安装器。安装 tarball 后可脱离源码目录运行。不会自动改全局宿主配置、升级业务项目运行时或发布到远端。

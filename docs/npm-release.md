# npm 首发验证

包名：`@patricklee2001/blender-agent@1.0.0`，CLI：`blender-agent`。

**`1.0.0` 已公开发布，官方 registry 全新安装和真实 Blender 验证通过。** 安装不需要 npm 登录、发布 Token、源码权限或消费端编译；仍需 Node.js 22+、Blender 和 npm 运行依赖。CLI 名称保持 `blender-agent`。

```sh
npm install -g @patricklee2001/blender-agent
blender-agent help
blender-agent install --project "C:/my project" --host both --dry-run
blender-agent install --project "C:/my project" --host both --apply
```

日期：2026-10-23，Asia/Singapore。公开页面：[npm 包](https://www.npmjs.com/package/@patricklee2001/blender-agent)。首次发布使用由账号所有者生成的 7 天 granular token，权限限于个人 scope、允许直接发布并启用 Bypass 2FA；Token 只在本次发布进程内存中使用，没有进入仓库或持久化 npm 配置。

| 项目 | 记录 |
| --- | --- |
| 产品源码提交 | `6328b330e44214af96d8f4e67cd4a835b3ed7c5e` |
| 本地/线上同一制品 | `release/patricklee2001-blender-agent-1.0.0.tgz` |
| SHA256 | `60cd4bbf1ada6df3e2cb16d517a80d176c48ec1b4504920c8ca0b1c121a71386` |
| 大小 / 文件数 | 909,687 字节 / 87 文件 |
| 资产指纹 | `642f3086feb714bfcf91587f1ce77f81407c68019b7976c002ff4bd650676e2e` |
| 发行清单 | [release/manifest.json](../release/manifest.json)，`sourceDirty=false` |
| 制品比较 | [package-comparison.json](../evidence/npm-release-2026-10-23/package-comparison.json)；84 个文件与上一安装验收包逐字节相同，仅元数据、README 和 Skill 安装说明变化 |
| 发布前独立安装与真实 Blender | [candidate/result.json](../evidence/npm-release-2026-10-23/candidate/result.json) |
| 实际发布回执 | [publish-receipt.json](../evidence/npm-release-2026-10-23/publish-receipt.json)，退出 0 |
| 官方 registry 完整性与匿名下载 | [registry-metadata.json](../evidence/npm-release-2026-10-23/registry-metadata.json)；SHA512、SHA1、SHA256 均一致，下载字节等于本地包 |
| 官方 registry 全新安装与真实 Blender | [registry/result.json](../evidence/npm-release-2026-10-23/registry/result.json)，`ok=true` |
| 复跑脚本 | [verify.mjs](../evidence/npm-release-2026-10-23/verify.mjs)；默认验证候选，`--registry` 验证公开 registry 安装 |

候选与 registry 安装都使用中文/空格路径、隔离 global prefix、空 npm 用户配置与新缓存，并设置 `--ignore-scripts`。registry 安装按包名 `@patricklee2001/blender-agent@1.0.0` 从官方源下载，没有从本地 tarball 安装，也不依赖发布者的账号凭据。

两次独立安装均实际运行 npm 生成的 CLI，核对 help/version、默认 install 零写、双宿主 Skill 与配置、卸载保留用户修改及产物。通过生成的项目配置连接官方 MCP client，发现 15 个工具，在真实 Blender 4.5.15 无头会话创建 2m 立方体，回传原生 PNG、保存 blend。另一 Blender 进程重开产物后尺寸断言通过，MCP 关闭后自动 backend/worker PID 均已退出。线上安装产物见 [PNG](../evidence/npm-release-2026-10-23/registry/npm-smoke.png)、[blend](../evidence/npm-release-2026-10-23/registry/npm-smoke.blend)。

没有在用户日常全局目录安装工具，没有修改全局 Claude/Codex 配置。类型检查和 17 项回归通过；CI 未调整。真实宿主/GUI/Blender 5.x 的历史覆盖仍以 [MVP 报告](acceptance-report.md) 所记制品为准，本轮未重复模型验收。

## 原始失败与同步过程

- 普通登录和第一个 Token 发布返回 `E403`，原始记录保留于 [publish-attempt](../evidence/npm-release-2026-10-23/publish-attempt.json)、[token-first-attempt](../evidence/npm-release-2026-10-23/token-first-attempt.json) 与 [auth-diagnosis](../evidence/npm-release-2026-10-23/auth-diagnosis.json)。CLI 的 `auth-and-writes` 字段没有证明网站已完成安全密钥注册；网页实际仍显示 Enable 2FA，未把它记成已完成。
- 新 Token 按核对后的 Bypass 2FA / 直接发布 / 个人 scope 配置生成后，发布命令退出 0。首次读取 registry 时只见 `0.0.0-stage` 占位版本，`1.0.0` 安装返回 `ETARGET`；[首次安装失败](../evidence/npm-release-2026-10-23/registry-initial-failure.json) 与 [初始 metadata](../evidence/npm-release-2026-10-23/registry-metadata-initial.json) 保留。
- 随后 registry 出现正式 `1.0.0`，`latest` 指向 `1.0.0`；本任务没有再执行审核或二次发布操作。[同步核对](../evidence/npm-release-2026-10-23/registry-propagation.json) 记录正式版本 metadata；最终以远端包字节相同、匿名全新安装及真实运行通过作为交付判据，没有仅凭发布命令成功宣告完成。

# 最终 MVP 复核索引

产品提交 `792017712e587ebee196fb000bf29e79c43c3f12`，包与完整结论见 [验收报告](../../docs/acceptance-report.md) 和 [最终包比较](package-verification.json)。主修复提交 `1bd1ba3`；产品在原始上游外独立开发，本目录旧失败没有重写。

| 证据 | 覆盖 |
| --- | --- |
| [final-checks.json](final-checks.json) | 类型检查，13项协议/启动/发行，13项安装，Skill格式 |
| [protocol](protocol/) | 最初协议缺陷、runtime修复、启动复审和定点复验 |
| [usage](usage/) | 错场景、共享客户端、CLI临时状态与安全升级 |
| [gui](gui/RESULTS.md) | 48次真实GUI调用，图像亲看，GPU stride定位与修复，EEVEE回滚 |
| [lifecycle](lifecycle/RESULTS.md) | 双MCP正常/异常退出与CLI持久状态，原始5.0验证；最终4.5目录追加记录 |
| [blender5](blender5/RESULTS.md) | 官方5.0.1下载核对、MCP/产物/EEVEE/TTL实测 |
| [perf](perf/) | 4.5和5.0分别执行EEVEE/Cycles apply/revert恢复回归 |
| [final-runtime-4.5](final-runtime-4.5/protocol-regression.json) | 最终runtime协议/作业/归属/对象合并 |
| [最终原始回归](final-upstream/summary.json) | 最终独立安装包执行contract28/0、plan18/0、integration128/0 |
| [指定模型](hosts/summary.json) | Opus5.5 medium与gpt6.1-sol medium，真实工具/图像/文件及独立检查 |
| [最终安装包smoke](final-package-smoke/result.json) | 最终tarball MCP、真实图像、保存、异常失败与清理 |
| [项目接入](project-setup.json) | 安全更新当前项目双宿主Skill，不改全局 |
| [最后核对](completion-check.json) | 报告文件链接、包hash与本轮端口无监听 |

最终4.5真实 `test:live` 5/5通过，目录 `lifecycle/final-4.5-listeners/`。前两次执行的失败保留于 `final-4.5/` 与 `final-4.5-after-build/`：前者并行build删除staged资产期间启动服务；后者测试选择的第二worker监听端口51279处于Windows TIME_WAIT。调整测试监听端口到动态源端口区间外并保留双端口预留后通过；未降低任何产品断言，没有为测试吞掉产品错误。

生命周期正常/异常退出检查保留所有已记录测试PID退出与worker端口释放。`completion-check.json`另外检查历史固定测试端口，均已释放。没有推送、发布或修改全局宿主配置。

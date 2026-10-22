# Agent Skills SOP 与 Harness 技术栈调研（可供新开参考）

团队规范决策参考 · 2026 年 10 月 19 日

面向 Windows、Linux、macOS 混合团队：统一目录、调用协议和交付方式，按职责选语言。

**建议采用受控双栈**

Skill 与 SOP 用 Markdown＋YAML；共享 Harness 核心默认 TypeScript，构建为 JavaScript 发布；独立小工具可用低依赖 \.mjs；数据、文档、模型工具用 Python＋uv；Shell 和 PowerShell 负责平台专用适配。

依据官方规范、24 个代表性仓库的元数据与目录树及相关依赖清单。以下为样本占比，不是行业份额；稳定性比较为工程判断，未对这些项目做运行故障率、延迟或跨平台性能实测。

# 先分清要规范的对象

|对象|工作|载体|
|---|---|---|
|Skill|告诉 Agent 何时使用能力、如何操作、怎样验收|SKILL\.md＋按需添加的脚本、参考资料和模板|
|SOP|步骤、分支条件、交付物、失败处理|Markdown；确有机器执行需求时另设有 Schema 的 YAML/JSON|
|工具脚本|确定性的计算、文件处理、查询与写入|JavaScript、TypeScript、Python 等|
|Harness|执行循环、状态、超时、权限、恢复、事件、评估|工程化程序；可以复用现成宿主或 SDK|
|MCP|跨 Agent 提供统一工具协议|协议适配层，与 CLI 共用同一工具实现|

Node\.js 是运行时；JavaScript、TypeScript、Python 是语言。\.mjs 明确表示 JavaScript ES Module，\.cjs 表示 CommonJS，\.js 的解释与 package\.json 的 type 等条件有关。\.ts 是 TypeScript 源码格式，不能与 Node\.js 当作互斥语言比较。

Agent Skills 开放规范要求 SKILL\.md 使用 YAML 元信息与 Markdown 正文，脚本可选，语言支持取决于宿主。OpenAI 官方建议：指令和现有工具已能可靠完成任务时，不额外添加脚本。来源：[Agent Skills 规范](https://agentskills.io/specification)、[OpenAI Build skills](https://developers.openai.com/plugins/build/skills)。

# 语言占比与统计边界

这些比例只能描述选中的样本。样本偏向公开、知名且便于检查的项目；厂商的不同语言版本分别计数，不能代表用户、调用量或独立产品占比。

## Skill 目录内辅助脚本

8 个生态仓库中，5 个有符合口径的文件，合计 182 个。

|语言|数量|占比|
|---|---|---|
|Python|142|78\.0%|
|JavaScript|31|17\.0%|
|Shell|8|4\.4%|
|PowerShell|1|0\.5%|

## Skills 与 SOP 生态全部辅助脚本

8 个仓库、395 个文件，含安装器、Hooks、CI 和维护工具。

|语言|数量|占比|
|---|---|---|
|JavaScript|186|47\.1%|
|Python|158|40\.0%|
|Shell|36|9\.1%|
|PowerShell|13|3\.3%|
|TypeScript|2|0\.5%|

## 框架与 SDK 的主语言

12 个仓库，一仓库一票，使用 GitHub 主语言元数据。

|语言|数量|占比|
|---|---|---|
|Python|7|58\.3%|
|TypeScript|5|41\.7%|

## 编码 Agent 宿主的主语言

4 个仓库单列，避免底层实现语言混入 Skill 统计。

|语言|数量|占比|
|---|---|---|
|TypeScript|3|75\.0%|
|Rust|1|25\.0%|

**为什么两个脚本口径差别很大？**文档类 Skills 增加 Python 文件，安装与编排工具增加 JavaScript 文件。GSD 单仓库贡献 139 个 JS 辅助文件；去掉它，其他 7 仓库的 245 个辅助文件中，Python 为 64\.5%，JS 为 19\.2%。样本、目录布局、代码如何拆文件，都足以改变比例。

**TS 在辅助脚本中仅 0\.5%，不表示 TS 不常用。**此口径只选 scripts、hooks、bin，许多 TS 核心位于 src、packages、sdk，不进入分母。OpenSpec 的清单显示其使用 TS 构建和 Vitest 测试，运行入口则是 JS。

**完整统计口径**

- 默认分支目录树，8 个脚本仓库均无截断；保存对应 commit SHA。

- 计入 scripts、hooks、bin 任意层级目录下的已识别源码后缀；排除明确列出的依赖、构建、测试、fixture 目录、常见测试文件与 \.d\.ts。包含 CI、文档构建等仓库辅助工具。

- Skill 内子集要求文件位于实际存在 SKILL\.md 的目录或其后代。0 表示没有文件符合此口径，不表示该项目没有代码或不能生成 Skill。

- 每个文件路径一票，不是代码行、字节数、下载量或调用量；内容相同的副本不去重，Python \_\_init\_\_\.py 也计数。

- 框架按 GitHub 主语言元数据一仓库一票；双语言发行分别计入。该样本没有覆盖所有框架与语言。

|仓库|Commit|Py|JS|TS|Shell|PS|其中 Skill 内|
|---|---|---|---|---|---|---|---|
|[anthropics/skills](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44)|dbd4588f9e10|62|0|0|2|0|64|
|[openai/skills](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431)|49f948faa925|42|14|0|4|1|61|
|[vercel\-labs/agent\-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278)|063bee94c3f4|0|16|0|0|0|15|
|[obra/superpowers](https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3)|bb92a7774141|0|2|0|7|0|4|
|[github/spec\-kit](https://github.com/github/spec-kit/tree/c6a4c18f1d01a8bec241c618eb6dfea952508744)|c6a4c18f1d01|16|0|0|12|12|0|
|[gsd\-build/get\-shit\-done](https://github.com/gsd-build/get-shit-done/tree/bdcaab2c752d9a33a1a1ca9acf3a3c81fb991815)|bdcaab2c752d|0|139|2|9|0|0|
|[bmad\-code\-org/BMAD\-METHOD](https://github.com/bmad-code-org/BMAD-METHOD/tree/61e01f82644c4bb533750cfa0d6d61ab61d2cc9b)|61e01f82644c|38|7|0|1|0|38|
|[Fission\-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec/tree/c794978f4f8845ce59693373c9dd882ee776588c)|c794978f4f88|0|8|0|1|0|0|

JS 合并 \.js、\.mjs、\.cjs。395 个辅助文件的后缀：\.py 158、\.cjs 108、\.mjs 49、\.sh 36、\.js 29、\.ps1 13、\.ts 2。Skill 正文的 Markdown 不进入可执行脚本分母。

**12 个框架 SDK 与 4 个编码宿主名单**

|仓库|主语言|分组|
|---|---|---|
|[openai/openai\-agents\-python](https://github.com/openai/openai-agents-python)|Python|框架或 SDK|
|[openai/openai\-agents\-js](https://github.com/openai/openai-agents-js)|TypeScript|框架或 SDK|
|[langchain\-ai/langgraph](https://github.com/langchain-ai/langgraph)|Python|框架或 SDK|
|[langchain\-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs)|TypeScript|框架或 SDK|
|[langchain\-ai/deepagents](https://github.com/langchain-ai/deepagents)|Python|框架或 SDK|
|[langchain\-ai/deepagentsjs](https://github.com/langchain-ai/deepagentsjs)|TypeScript|框架或 SDK|
|[crewAIInc/crewAI](https://github.com/crewAIInc/crewAI)|Python|框架或 SDK|
|[pydantic/pydantic\-ai](https://github.com/pydantic/pydantic-ai)|Python|框架或 SDK|
|[mastra\-ai/mastra](https://github.com/mastra-ai/mastra)|TypeScript|框架或 SDK|
|[vercel/ai](https://github.com/vercel/ai)|TypeScript|框架或 SDK|
|[huggingface/smolagents](https://github.com/huggingface/smolagents)|Python|框架或 SDK|
|[google/adk\-python](https://github.com/google/adk-python)|Python|框架或 SDK|
|[openai/codex](https://github.com/openai/codex)|Rust|编码 Agent 宿主|
|[google\-gemini/gemini\-cli](https://github.com/google-gemini/gemini-cli)|TypeScript|编码 Agent 宿主|
|[cline/cline](https://github.com/cline/cline)|TypeScript|编码 Agent 宿主|
|[anomalyco/opencode](https://github.com/anomalyco/opencode)|TypeScript|编码 Agent 宿主|

可复核材料：语言占比表 · 逐文件清单 · 快照与规则 · 依赖清单摘录。

# 代表项目采用的架构

|项目或类型|组织方式|可借鉴的做法|
|---|---|---|
|Anthropic Skills、OpenAI Skills|一个能力一个目录；指令、参考、脚本分离|流程写成文档，确定性动作写成脚本；依赖按能力声明|
|Superpowers|Markdown 开发流程，配 Hooks 与少量 Shell/JS|SOP 与执行工具独立维护，小型流程无需服务端|
|Spec Kit|Python CLI、模板、Bash/PowerShell 脚本|平台适配显式化；双套脚本意味着双份验证|
|GSD|Markdown 工作流、Node 安装器、CJS/JS 工具、TS SDK|使用入口可以轻，复杂能力在工程模块内维护|
|BMAD METHOD|角色与流程资料，配 Python 等工具；根 pyproject 当前无运行依赖|依赖应按组件审视，不能推断整个生态都零依赖|
|OpenSpec|TS CLI 工程，构建后以 JS 入口运行|开发期类型检查，消费者使用构建产物|
|LangGraph|显式状态图、持久化、人工介入、恢复|有跨步骤状态与恢复需求时采用成熟执行底座|
|Deep Agents|在 LangGraph 上组合规划、文件、上下文与子 Agent 能力|需要完整通用 Agent 时再引入|
|Mastra|TypeScript 的 Agent、工作流、工具及应用框架|适合 Node/Web 应用；按组件评估依赖与部署成本|
|Claude Agent SDK|Python/TS 接口调用 Claude Code 执行能力|包装 SDK、宿主二进制、模型服务是不同依赖|

这些模式解决的需求不同，项目宣称 production\-ready 不能作为本报告的独立稳定性证明。来源：[LangGraph 官方架构](https://docs.langchain.com/oss/python/langgraph/overview)、[Deep Agents](https://github.com/langchain-ai/deepagents)、[Mastra](https://github.com/mastra-ai/mastra)、[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)；Skills/SOP 固定版本见上表。

# 便利程度 稳定性与依赖成本

这是按工程机制给出的判断，不是同负载性能跑分。Node 和 Python 都支持三系统；兼容问题常出现在 Shell、原生扩展、外部程序、进程管理与宿主工具。

|选项|便利程度|依赖与稳定性边界|适用|
|---|---|---|---|
|Markdown＋YAML|接入成本最低，易审查迁移|需要宿主理解并执行；文档无法强制实现程序门禁|Skill 入口、SOP、参考资料|
|\.mjs＋Node|无编译；只用内置模块可免 npm 安装|仍依赖 Node；动态类型需校验与测试；外部包增加依赖链|独立小工具、轻量 Hooks|
|TS＋Node|多人维护、重构复杂状态更方便；发布 JS 易使用|构建工具与开发依赖；ESM/CJS；外部输入仍须运行时校验|共享核心、复杂 CLI、MCP|
|Python＋uv|数据、文档、模型生态成熟，脚本简洁|Python/uv、隔离环境；wheel、系统库、GPU 和外部程序受平台限制|数据分析、PDF/Office、评估、模型|
|Bash|Linux/macOS 命令编排直接|Windows 不默认具备同套工具；GNU/BSD 参数有差异|Linux 专用运维、薄启动层|
|PowerShell 7|Windows 管理方便，可在其他系统安装|模块与系统命令未必跨平台，版本需声明|Windows 系统管理与适配|
|Go/Rust|可按平台发布二进制，接收者可免装语言运行时|构建、分发成本；CGO、系统库等仍可能额外依赖|有明确二进制分发需求时|

## mjs 与 ts 怎么选

只做一个动作、依赖少、接口简单：\.mjs 是合适默认。成为多人共享模块，出现复杂状态、多个命令、多个适配器或频繁重构：采用 TS 工程。按复杂度判断，不用生硬的代码行数门槛。TS 与构建产物由构建流程保持一致，避免手工维护两份实现。

Node 已支持原生执行部分 TS，但去类型不会做类型检查，也不会读取 tsconfig\.json；paths 和需要语法转换的能力有边界。共享发行默认构建为 JS；原生 TS 执行作为固定 Node 版本与语法子集的受控方案。来源：[Node TypeScript 官方说明](https://nodejs.org/api/typescript.html)。

## 依赖分五层登记

|层次|例子|要求|
|---|---|---|
|运行时|Node、CPython、uv|声明支持范围，开发镜像和 CI 固定实际版本|
|构建与检查|TS、测试、格式化工具|开发依赖不转嫁给使用者|
|代码包|npm/PyPI 包与间接依赖|声明直接依赖，提交锁文件，检查升级影响|
|外部程序与平台|Git、浏览器、LibreOffice、FFmpeg、CUDA|doctor 检查；缺失只影响相应能力|
|宿主与服务|Codex/Claude Hooks、MCP、认证、API|独立适配与真实调用验证|

零第三方包仍需运行时；lockfile 也不能保证每个系统都有可用二进制。共享工具不要绑定业务项目 node\_modules、全局 pip 环境或用户电脑上的偶然安装。

# 适合混合团队的参考架构

**调用关系：**Skills 与 SOP → CLI 或 MCP 适配层 → 共享核心与独立工具 → 平台与外部系统适配。

|层次|职责|
|---|---|
|Skills 与 SOP|何时用、输入、流程、交付与验收|
|CLI 或 MCP 适配层|共用工具实现；输入输出遵循版本化 JSON Schema|
|共享核心与独立工具|TS 核心 · \.mjs 轻工具 · 隔离的 Python 专业工具|
|平台与外部系统适配|文件、Git、浏览器、文档程序、API、系统管理|

Harness 管理状态、超时、日志、恢复；工具负责业务计算。已有 Codex、Claude Code 等执行宿主时，先建设 Skill、工具与薄适配层；需要自定义服务、长任务恢复或独立调度时再建设自己的 Harness。一次性小工具可由 Skill 直接调用。

本地跨语言优先通过 CLI 参数或 stdin JSON 协作；stdout 返回结构化结果，stderr 输出日志。多宿主共享或远程访问确有需要时再包 MCP。避免工具互相导入源码或组成 TS→Python→Node 连环子进程；组合由上层负责。

模型负责理解与规划；参数校验、权限、状态迁移、输出格式及外部写入条件由程序执行。宿主 Hooks 各自有适配器；日志 Hook 和关键阻断门禁区分错误策略，关键门禁不能静默放行。

```text
agent-toolkit/
  skills/                  # 一个能力一个目录，内含 SKILL.md
  packages/contracts/      # JSON Schema 与协议版本
  packages/core/           # TS 共享执行能力，按需存在
  packages/cli/            # 命令入口
  packages/host-adapters/  # 不同宿主的配置与 Hook 转换
  tools/light/             # 可独立运行的 .mjs
  tools/python/            # pyproject.toml、uv.lock、隔离 .venv
  tests/contracts/         # 黑盒输入输出检查
  tests/platform/          # 三系统运行验证
  fixtures/                # 脱敏样例
  package.json
  pnpm-lock.yaml
```

这是扩展后的布局。起步只有几个 Skill 时仅建实际需要的目录。workspaces 用于共享开发；独立分发的 Skill 应携带工具或声明工具包固定版本，不依赖 monorepo 偶然存在的相对路径。

# 可进入团队规范的条款草案

1. **分离职责。**Skill/SOP 记录流程，脚本承担确定动作，Harness 管理执行与状态。

2. **受控双栈。**新增共享核心默认 TS；轻工具允许 \.mjs；数据、文档、模型工具允许 Python。Shell/PowerShell 用于平台逻辑或薄启动层。既有稳定组件先接统一接口，不统一重写。

3. **按能力安装。**单个能力选择一个主运行时，确有必要才跨语言组合。只有 Python 能力才需要对应 Python 包；纯文档 Skill 不增加运行依赖。共享核心不预装所有模型库、浏览器和 Office 组件。工具运行时与业务项目分开管理，不为安装工具而升级业务运行时。

4. **固定版本。**Node 使用受支持 LTS，当前可从 Node 24 LTS 验证；Python 建议以 3\.13 作为候选，专业依赖不兼容时保留 3\.12 环境。具体 patch 和工具版本经三系统验证后固定，不运行时追 latest。

5. **冻结依赖。**新增共享 TS 工程建议 pnpm＋pnpm\-lock\.yaml，CI 用 pnpm install \-\-frozen\-lockfile；原有 npm 工程保留 package\-lock\.json 并用 npm ci。Python 用 uv＋pyproject\.toml＋uv\.lock，CI 用 uv sync \-\-locked。独立单文件可用 PEP 723 并生成脚本锁文件。安装环境应在运行前准备。

6. **统一接口。**共享工具有 \-\-help、\-\-version 和结构化输出方式；stdout 为数据，stderr 为日志；错误码、超时与 Schema 版本写入契约。外部输入做运行时校验，类型注解不替代校验。

7. **显式副作用。**文件覆盖、删除、远端写入说明影响范围；适用时提供 dry\-run，重试使用幂等键或去重机制。恢复执行不等于外部操作只执行一次。

8. **三系统兼容。**使用语言的路径、文件、进程 API；参数以数组传递，避免 shell 字符串拼接。固定 cwd、UTF\-8，验证中文/空格路径、大小写、换行、超时、取消与子进程清理。Windows 的 \.cmd/\.bat 使用已验证适配方式。

9. **状态集中负责。**无状态工具优先；单进程简单状态可用受控文件，多进程共享状态采用事务存储，多机协调再采用共享服务。配置、运行数据与日志分离；秘密不进入 Skill 包和日志。

10. **按实际执行验收。**共享逻辑、协议黑盒、三系统运行、实际宿主 Hook/MCP 分别记录。关键动作覆盖失败重试和中断恢复。Hooks 不现场装包，不用模型调用完成必需门禁。

11. **可追溯发布。**运行记录至少含工具版本、宿主、OS、运行时、脱敏输入摘要、结果、耗时与运行标识。第三方 Skill 固定版本，检查脚本来源及许可证；仅输出“成功”不算完整验收。

安装行为来源：[pnpm install](https://pnpm.io/cli/install)、[npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)、[uv 锁定同步](https://docs.astral.sh/uv/concepts/projects/sync/)、[uv 独立脚本](https://docs.astral.sh/uv/guides/scripts/)；Node LTS 状态来源：[Node 发布计划](https://nodejs.org/en/about/previous-releases)。Python 版本是本报告的兼容性候选建议，尚未对你们的专业依赖验证。

## 不要规定语言配额

不要求“TS 70%、Python 30%”。根据职责选语言，跟踪三系统新机首次运行成功率、依赖准备耗时、升级回归故障、能力依赖大小和真实任务成功率。

# 选型与落地顺序

|方案|适用条件|取舍|
|---|---|---|
|A 受控双栈，主推|混合技术栈、三系统，共享执行层与专业工具并存|TS 核心＋\.mjs 轻工具＋Python 专业工具；接口统一，维护两类环境|
|B Python 核心|工作重心在数据、模型、评估或 Python 服务|Python＋类型检查＋Schema；Node 仅作必要适配，Web/CLI 通过协议连接|
|C Go/Rust 二进制入口|目标机器难安装运行时，或已有成熟二进制分发能力|增加多平台构建；Python、浏览器、GPU 任务仍可能依赖外部环境|

**先用 A 试点。**选一个纯 SOP、一个 Git/文件工具、一个 Python 文档或数据工具；统一接口后分别在三系统新环境安装运行，再验证至少两种实际 Agent 宿主。通过后固化模板与版本基线，按新增或有实质修改的组件逐步推广。

按需求升级框架：已有编码 Agent → Skill 与 CLI；自建短流程 → 薄 SDK；长任务与恢复 → LangGraph 等状态执行底座；完整规划、文件与上下文能力 → Deep Agents；深度结合 TS 应用 → 比较 Mastra 与轻量 SDK。写 Skill 本身不要求完整 Agent 平台。

采集日期为 2026 年 10 月 19 日，Asia/Singapore。项目事实以采集快照为准；固定源码版本与文件清单供复核。规范条款为团队评审建议稿。

# 统计与来源附件

以下附件保留原报告的语言汇总、逐文件统计、仓库快照和依赖清单，供组内复核。统计规则及局限见正文“语言占比与统计边界”。

**language\-summary\.csv**：各统计口径的语言数量、分母与百分比

\[language\-summary\.csv\]

**script\-files\.csv**：395 个辅助脚本的路径、语言、源码链接及固定版本

\[script\-files\.csv\]

**survey\-evidence\.json**：24 个仓库的元数据、统计规则与采集快照

\[survey\-evidence\.json\]

**manifest\-evidence\.json**：相关项目依赖清单摘录与来源链接

\[manifest\-evidence\.json\]


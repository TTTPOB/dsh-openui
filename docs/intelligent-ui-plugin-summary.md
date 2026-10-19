# DSH Intelligent UI 插件 — 讨论结论精简版

> 本文是对一份约 320KB ChatGPT 讨论导出（2026-10-07 起，主题：为 DSH 增加类似 ChatGPT Intelligent UI 的能力）的**结论化整理**。
> 只保留讨论**最终收敛**的判断；被后续证据推翻的中间方案集中放在「被否决的方案」一节。
> 讨论中的审查基于 GitHub 源码、package.json、npm 数据与公开 Issue，**未完成实机安装、性能基准和发布产物安全审计**。凡未验证处文中标注「不确定」。

---

## 1. 目标与范围

### 1.1 目标

给现有 DSH（用户环境 `0.1.7-rc.2`，上游 `master` 审查时为 `0.2.1-alpha.2`）的 Web UI 增加「模型在回答中直接生成可交互界面」的能力：

- 模型可以在 **assistant 消息正文**里输出交互组件（图表、表单、滑块、参数模拟器）。
- 组件支持**浏览器本地响应式重算**，拖动滑块不需要再调一次 LLM。
- 必要时，用户操作能回传为新的一轮 Agent 请求。
- **不改变 DSH 已稳定使用的 Markdown / coding 工作流**：代码、命令、日志、diff、故障排查仍优先纯文本。

### 1.2 非目标

- 不完整复刻 ChatGPT Intelligent UI。它依赖模型训练 + 原生组件库 + 流式界面编译三者协同，只靠提示词或只靠一个渲染器都无法等价复制。
- 不为了 UI 能力升级整个 DSH 前端框架。
- 不把「UI 必须通过工具调用交付」当作硬约束。
- 不接管 DSH 的 Agent Loop、会话存储或模型 Provider。

### 1.3 成功判据

讨论中反复确认，真正要衡量的不是「哪个项目页面好看」，而是三件事：

1. **能否无侵入接入**现有 DSH fork 与既有插件。
2. **长会话里能否稳定运行**（流式、切换、重放、卸载）。
3. **以后自己要维护多少代码**（协议、组件、兼容层）。

---

## 2. 最终架构与设计决策

### 2.1 一句话结论

> **采用 OpenUI Lang（v0.5）作为 UI DSL 与渲染协议，用 `@openuidev/react-lang` 在 DSH 内以「独立 React 19 渲染岛 + Shadow DOM」挂载到 assistant 消息正文；DSH 自身保持 React 18 不动；不引入完整聊天框架、不替换 Markdown 渲染链、不修改 Agent Loop。**

理由（按最终优先级）：

1. OpenUI 是「模型直接生成紧凑文本 DSL」路线，最接近 ChatGPT 的形态：UI 是回答内容的一部分，而不是一条工具调用。
2. v0.5 提供 `$variables` + 算术/条件表达式 + 响应式更新，**支持「模型生成后界面可独立运行」**，这是 assistant-ui 默认方案缺的能力。
3. 解析、提示词生成、React 渲染被拆成独立包，只需要 `@openuidev/react-lang`，不必替换 DSH 聊天界面。
4. 能自动生成组件提示词，减少手工维护超长 UI system prompt 的负担。

### 2.2 分层结构

```text
┌────────────────────────────────────────────────────────────┐
│ DSH Web UI（React 18；现有 messages / tools / plugins 不动）│
│                                                            │
│  Assistant Message 正文                                     │
│   ├── 普通 Markdown（代码、日志、解释、diff）                │
│   └── openui-lang 围栏 → DOM 容器（消息渲染扩展点创建）      │
│                              │                             │
│                              ▼                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Shadow DOM（样式隔离边界）                            │  │
│  │  React 19 Root（独立 React / ReactDOM 实例）          │  │
│  │   @openuidev/react-lang + Component Catalog           │  │
│  │   Slider / State / Reactive Expressions               │  │
│  └──────────────────────────────────────────────────────┘  │
│                              │ onAction → conversation.send│
└──────────────────────────────┼─────────────────────────────┘
                               ▼
       DSH 原有权限、工具与 Agent 流程（只有副作用动作走这里）
```

要点：**React 19 依赖打进独立 bundle，不经过 DSH 的共享模块表**；DSH 插件只做三件事——创建容器、传 DSL 文本、转发动作。

### 2.3 数据流

```text
模型生成
  └─ Markdown 正文 + openui-lang 围栏（DSL 文本）
       └─ DSH 消息渲染扩展点识别围栏
            └─ 读取 DSL 字符串（OpenUI 支持通过 response 属性直接接收）
                 └─ 独立 bundle 的 mount(el, { response, onAction })
                      └─ react-lang 流式解析 → 渲染组件树
                           ├─ 用户拖动滑块 → $变量更新 → 表达式重算 → 局部刷新（不发请求）
                           └─ 用户点击带副作用的动作 → onAction → 包装成会话消息 → 新一轮 Agent 回合
```

### 2.4 协议与接口

**模型侧协议（UI DSL）**

- 通道：Markdown 中的 `openui-lang` 围栏，与普通文本混排；`inlineMode` 允许模型在文字与围栏之间自由切换。
- 变量：`$变量` 与滑块/输入控件双向绑定。
- 表达式：`+ - * / %`、条件表达式；变量变化后自动重新求值，**不需要再次调用 LLM**。
- 增量更新：`editMode` 支持只发变更部分，而不是每次重发整棵组件树。
- 组件注册：用 Zod 定义组件 schema，由 `@openuidev/lang-core` 自动生成模型提示词。
- 早期最小集（够用即可）：`Text`、`Stack`、`Card`、`Table`、`Slider`、`Chart`、`Button`。

**宿主侧接口（DSH 插件）**

- `mount(element, { response, onAction })` + 更新 + 卸载：渲染岛对外只暴露这组普通 DOM 接口。
- `onAction(payload)`：只回传用户动作，不直接执行任何副作用。
- 消息渲染扩展点：用于在 assistant 正文里创建 DOM 容器（具体扩展点名称需在 DSH fork 中现场确认，见第 6 节）。

**DSH 已提供的常规插件集成能力**（讨论中逐一核对过）

| DSH 接口 | 用途 |
| --- | --- |
| `systemPrompt.section` | 注入 UI DSL 使用说明 / 生成策略 |
| `tools.register` | 注册工具（本方案默认不注册 UI 工具） |
| Skills Provider | 注册完整组件语法文档 |
| `tool.call.toolview` | 工具调用结果的自定义视图 |
| `conversation.input.dock` | 常驻会话面板 |
| `conversation.send` | 把用户操作回传为新会话消息 |
| `CodeBlock` / `DiffBlock` / `JsonTree` | 复用现有基础组件 |
| `registerFenceRenderer('dsh-ui', render)` | **原生围栏渲染注册点；当前 DSH 是否提供需实测**（`dsh-genui` 检测不到时会退化为 DOM 接管） |

**React 版本隔离**

- DSH 的 `packages/client/web/src/platform.ts` 把 `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client` 注册为全站共享模块；客户端插件构建默认把它们 external 到宿主版本（React 18）。
- 因此**不能**在普通 DSH 插件里直接 `import { Renderer } from "@openuidev/react-lang"`，否则可能拿到 React 18 或出现 `Invalid hook call`。
- 正确做法：独立构建入口输出独立 ESM/IIFE（自带 React 19 + ReactDOM 19 + OpenUI），由插件在 Shadow DOM 中的普通 DOM 容器挂载。

### 2.5 关键名词

| 名词 | 含义 |
| --- | --- |
| Intelligent UI | ChatGPT 2026-10-07 发布的能力：模型用类 MDX/JSX 的组件标记组织界面，产品用编译器边生成边渲染。底层序列化格式未公开（不确定）。 |
| GenUI / Generative UI | 让模型生成交互界面的技术范式，非某家专有。 |
| UI DSL | 描述「画什么」的结构化文本/树；JSON AST 与紧凑文本 DSL 都能表达同样的组件树。 |
| `dsh-ui` | `@changfenhuang/dsh-genui` 作者自定义的私有 JSON DSL 围栏标识，非上游标准。 |
| `openui-lang` | OpenUI 的紧凑文本 DSL 围栏语言，支持变量与表达式。 |
| Catalog / Component Catalog | 预先注册、允许模型组合的组件白名单（含 schema）。 |
| React Island / 渲染岛 | 在宿主 React 18 页面中独立挂载的 React 19 Root，拥有自己的运行时与样式边界。 |
| Fence Renderer | DSH 侧把某个代码围栏语言交给自定义渲染器的注册接口。 |
| `present` | assistant-ui Generative UI 的默认交付工具；本方案不使用。 |

### 2.6 UI 生成策略（最终版提示词原则）

从「结构触发 UI」改为 **「任务收益触发 UI」**：

- 默认使用普通文本 / Markdown。
- **列表、数字、步骤、对比的出现本身不足以触发 UI。**
- 优先 UI：用户明确要求交互；调整参数需要即时重算；复杂关系可视化明显更易理解；用户需要在界面内反复筛选、比较、探索。
- 优先 Markdown：代码、命令、日志、diff、简单列表、故障排查、需要复制或精确引用的内容。
- 每个 UI 必须有独立价值，不得装饰性出现控件；交互不得暗示未经验证的计算、实时状态或外部操作结果；**UI 渲染失败时必须保留完整文本信息**。
- 插件侧配置面：`promptMode: off | explicit | auto`，默认 `explicit`（只有被明确要求才生成 UI），可选 `auto`（按任务收益判断），`off` 完全关闭注入。

### 2.7 交互与安全边界

- **本地优先**：纯计算、筛选、表单校验在浏览器内完成。
- **副作用分流**：文件修改、命令执行、外部服务调用必须经 DSH 原有权限与 Agent 流程，UI 只发动作描述。
- **组件白名单**：只渲染已注册 schema 的组件，不允许模型产出任意 HTML/JavaScript。
- 复用成熟防护：数学表达式用独立解析器（不用 `eval`）；Mermaid strict 模式 + 额外 SVG 检查；ECharts 过滤危险字符串；URL 协议与颜色值白名单；限制组件数量、嵌套深度、数组长度。
- **不要把它当秘密通道**：即使输入框不写入持久状态，只要带 `action`，用户触发后值仍会发给模型；secrets ban 是对模型生成行为的约束，不是传输层的强制安全边界。
- 涉及文件修改或外部副作用的动作，建议加显式确认与权限分层。

---

## 3. 实现步骤 / 里程碑

所有工期是基于架构的**粗略估计**，不是实装后的实测工时。

### M0 · 渲染岛 PoC（约数小时 ~ 2 天）

验收目标（应先于任何架构改动）：

- 在**原版 DSH React 18** 中，通过独立 bundle 挂载 React 19 的 OpenUI Renderer。
- 渲染一个带 3 个滑块 + 实时计算结果的组件。
- **不修改 DSH 模块表、不使用 iframe、不修改 Agent Loop。**
- 验证：React 实例隔离、消息切换时正确卸载、控制台无 `Invalid hook call`。
- 若独立 bundle 无法可靠隔离 → **才**退到 iframe（主题同步、高度自适应、事件通信成本）。

参考耗时梯度：React 18 页面里显示一个 React 19 计数器 = 数小时；单独加载 OpenUI 显示静态 DSL = 半天 ~ 2 天；接入正文 + 流式 + 滑块 = 2 ~ 5 天；主题 / 移动端 / 生命周期 / 异常恢复完善 = 1 ~ 2 周。

### M1 · 正文渲染通道（约 2 ~ 5 天）

- 通过消息渲染扩展点创建容器，识别 `openui-lang` 围栏。
- 流式响应增量喂给 `react-lang`，实现「边生成边显示」。
- 渲染失败降级：保留原始 DSL + 完整文本，不静默吞内容。

### M2 · 最小组件目录 + 响应式（约 2 ~ 5 天）

- `Text`、`Stack`、`Card`、`Table`、`Slider`、`Chart`、`Button`。
- 打通变量双向绑定与表达式重算；确认 `bindings` 显式开启（不依赖 `toolCalls`）。

### M3 · 交互回传（约 1 ~ 3 天）

- 本地动作直接处理；副作用动作经 `onAction` → 包装消息 → `conversation.send`。
- 与 DSH 权限、中断、子代理会话状态兼容。

### M4 · 移动端 / PWA 适配（约 3 ~ 7 天）

- Shadow DOM 隔离样式；确认 Tooltip / Popover / Dialog 等 Portal 挂载到岛内正确容器。
- 真机验证滑动、缩放、软键盘、长会话卸载；Chromium 手机模拟**不能**替代 iOS Safari。
- PWA 只需同源资源可加载，通常不必改 manifest / Service Worker。

### M5 · 策略与开关（与 M2 并行）

- `promptMode`（off / explicit / auto）、组件目录开关、遥测关闭（`DO_NOT_TRACK=1` 或 `OPENUI_TELEMETRY_DISABLED=1`）。
- 用 OpenUI 自动生成的组件提示词替代手写长 prompt。

### 并行轨道 · 移动端工作台工程改进（先于 M4，且不重构）

顺序（讨论中的最终建议）：

1. **补浏览器自动化验收门槛**：复用已有 `scripts/demo.mjs`、`scripts/cdp-*.mjs`；PR 跑约 1~3 分钟冒烟（启动无报错、三页导航、会话切换、输入框、工具详情、桌面无回归、重复挂载卸载），nightly 跑 5~15 分钟完整回归，升级 DSH 前跑完整契约检测。
2. **收紧易误伤的全局 CSS 与键盘事件**。
3. **建立 DSH 宿主兼容契约清单**（脆弱 DOM 选择器、依赖的宿主行为）。
4. **再引入 OpenUI 独立插件**。

硬要求：失败必须真正让 CI 失败（不得「找不到元素就 SKIP」）；失败必须留证据（截图、控制台错误、DOM 快照、Playwright Trace）。

### 验收清单（跨里程碑）

1. **React 隔离**：桌面与 PWA 均无 `Invalid hook call`，不会意外解析到宿主 React 18。
2. **移动端交互**：滑块拖动、图表 Tooltip、Popover、滚动、软键盘正常。
3. **消息生命周期**：流式中断、会话切换、历史重放、分叉后组件状态与卸载正常，无残留 React Root / 监听器。
4. **独立发布与更新**：React 19 bundle 能通过 DSH 现有 ClientModules / WebServer 交付机制加载；经 Cloudflare 代理与 PWA 启动时版本正确。
5. **不回归**：原有 Markdown、代码块、流式输出、工具视图行为不变。

---

## 4. 约束与注意事项

### 4.1 版本与依赖

- DSH 全站仍是 React 18：`dsh-client-web`、`dsh-client-ui-renderer`、`dsh-client-ui-primitives`、`apps/web` 均为 `^18.2.0`。升级到 `0.2.1-alpha.2` 也**不会**自动解决。
- `@openuidev/react-lang` 的 package.json 宽泛声明 `react: "*"`，但 README 明确要求 React 19+。**以 README 为准，不要被 peer dependency 骗过**。
- json-render React 要求 `^19.2.3`；A2UI React、assistant-ui GenUI、Streamdown 支持 React 18/19。
- 结论：**不要为了 UI 升级整个 DSH 的 React 技术栈**；隔离渲染岛是成本最低的路径。

### 4.2 打包器是真正的难点

- 难点不是 React 本身（React 官方支持同页多个独立实例，每个 Root 用自己的 React / ReactDOM），而是 DSH 的 external 映射会强行把 `react` 解析到宿主 18。
- 必须让第二份 React 运行时**不经共享模块表**打包：独立构建入口 + 独立产物 + 独立挂载接口。
- 不要改造 `dsh-mobile-workbench` 的 `scripts/build-client.mjs` 去同时承担两套 React；它当前的 CommonJS 包装器是为单 React 版本设计的。

### 4.3 OpenUI 的具体坑

- `bindings` 默认只在 `toolCalls` 开启时启用；**可以单独设为 true，不需要真的接外部工具**。否则模型倾向生成静态组件。
- 开源 DSL / 解析器 / React 渲染器可独立使用，但**商业 Gateway 提供的自动纠错不含在内**；生成错误的恢复能力要自己评估和兜底。
- 安装遥测默认开启（运行时遥测默认关闭），可禁用。
- 已知公开 Issue（截至 2026-10-09）：流式数据绑定初始值错误（#767）、Tabs 初始选中异常（#819）、复杂表达式下 DSL 语句合并不一致（#821）。这些直接关系「边生成边显示」的可靠性，必须实测。
- **Demo 好看不等于装个 react-lang 就好看**：观感还取决于 Catalog、样式、图表库和模型生成质量。

### 4.4 移动端已知冲突（`dsh-mobile-workbench` v3.1.0）

- `layout.css.ts` 中的 `[data-phase] [role="tooltip"] { display: none !important; pointer-events: none !important; }` 会连带隐藏其他插件（含 OpenUI）的 Tooltip。修法：更精确的选择器 + 回归测试；**不要直接删旧规则**（历史问题会复发）。
- `html, body { touch-action: pan-y pinch-zoom !important; }` 影响触摸手势协商；滑块横向拖动、图表缩放必须真机测，不能只用桌面响应式模拟通过。
- 移动端 DOM 观察使用边界过滤，滑块更新不会重算整套导航 —— 这一点是好的，不要动。
- 编辑器原节点不搬家（保护草稿与输入法状态）；三页底部导航、UI Slot 集成、iOS 焦点/缩放修复都应保留。

### 4.5 性能

- 长会话里不要为每条历史消息长期保留一棵复杂 React 组件树；消息离开视口或被卸载时销毁。
- 不要在同一插件里叠加全局 `MutationObserver` 与大量独立 React Root 而不做边界过滤（`dsh-genui` 的 `document.body` 监听 + 每秒 sweep 就是反面参考）。
- 已知卡顿主因曾定位到上游 Shiki 高亮，不要无证据归咎前端插件。

### 4.6 证据等级（不要混淆）

- 已核对：源码、package.json、Issue 编号、npm 下载量、Star 数、公开 Demo 可用性。
- 未完成：实机安装、性能基准、npm 产物独立安全审计、Android / iOS 真机视觉与操作验证。
- 所有工时与评分是**架构判断**，不是测量值。

---

## 5. 被否决的方案

| 方案 | 否决原因（一句话） |
| --- | --- |
| `dsh-genui`（无 scope，lhuans） | 在 0.1.7-rc.2 上有明确复现问题：`settings.register()` 被移除、图标 API 改名、缺 `volatile` 标记、`groupPart` 处理错误、提示词过度要求 JSON。 |
| `@changfenhuang/dsh-genui` 作为主方案 | 功能与安全设计不错，但强制注入「默认就该出 UI」改变所有回答、`agent.steer()` 插入修复轮次、`render_ui` 结果藏在折叠工具行、无原生围栏接口时用 DOM 接管 —— 侵入性过高。保留为**参考实现与协议对照**，不作为交付路径。 |
| 整体升级 DSH 到 React 19 | 影响 Web Shell 与全部现有插件生态，风险远大于收益。 |
| iframe 作为首选隔离方案 | 可行且最稳妥，但主题同步、高度自适应、事件通信成本高；只作为独立 bundle 隔离失败时的兜底。 |
| assistant-ui Generative UI 作为「生成任意计算器」的首选 | 曾在某一轮排第一，用户截图证实其默认方案只生成静态 UI：能组合 Slider + Text + Card，但不会自动建立跨字段计算链。降级为「模型组合**预置业务组件**」场景的候选。 |
| `render_ui` 工具通道作为必需交付路径 | UI 应属于 assistant 正文内容；工具通道只在需要「可验证交付」（宿主返回校验结果）时保留，且必须避免埋进折叠工具记录。 |
| 继续投资私有 `dsh-ui` JSON DSL | 上游 A2UI / OpenUI 已提供更通用、可独立测试与版本化的协议与渲染基础设施，自维护协议的长期成本高。 |
| A2UI 作为当前首选 | 标准化前景好，但数据模型、消息操作、多 Surface 比一棵 JSON 组件树复杂，且有 CSS Reset 影响宿主、订阅内存泄漏等公开问题；列为**跨 Agent / 跨客户端统一协议时的备选**。 |
| Tambo | 自带会话状态、模型执行、流式事件，与 DSH 职责高度重叠；且 Tambo Cloud 已关闭新注册并宣布 2026-10-31 关停云服务。 |
| Streamdown 作为核心 | 只是优秀的流式 Markdown 基础设施，不承担 GenUI 状态管理或组件协议；为加一个交互组件替换整条 Markdown 渲染链不值得。 |
| Agent Elements 作为核心 | 面向 Bash / Diff / Todo / Subagent 等工具事件视图，不是模型自由组合 UI 的引擎，且限定 React 19 + Tailwind 4。 |
| 解析 / 复刻 ChatGPT 的组件标记格式 | 底层格式未公开；且标记形式不是决定性差异，JSON AST 同样能表达组件树与交互。 |
| 完整替换 DSH 聊天前端 | 接入成本与回归风险高，且违背「不接管 Agent Loop」的边界。 |

---

## 6. 仍未解决的开放问题

1. **DSH fork 是否提供 `registerFenceRenderer`？** 决定正文 UI 走原生围栏注册还是 DOM 接管（`dsh-genui` 启动日志 `fence-channel=registry|dom` 可直接确认）。**不确定**，需实测；无论结果如何，本方案倾向不依赖 DOM 接管。
2. **DSH 打包器能否稳定提供第二份 React 运行时？** 这是 M0 的最大不确定性，也是整个方案的关键路径。未验证。
3. **OpenUI 的 Portal 组件（Tooltip / Popover / Dialog）能否在 Shadow DOM 内正确挂载？** 若不能，需要显式指定 portal 容器或退回 iframe。
4. **DSH 上游是否有 React 19 升级计划？** 未检索到相关 Issue / PR，但**不能据此断言没有内部计划**。
5. **`@assistant-ui/generative-ui` 是否已有稳定独立 npm 正式发行版？** 源码中存在该包，但发布状态**未确认**。
6. **OpenUI 在目标 Demo 中 `bindings` 是否启用？** 需按附录 B 的测试提示词实测；若得到静态界面，应先查配置而不是否定框架。
7. **OpenUI 开源版在生成错误时的恢复能力**（无商业 Gateway）能达到什么水平？未评估。
8. **iOS Safari / PWA standalone 的真实行为**（输入法、合成点击、触摸手势）无法用 Chromium 模拟替代，必须真机验证。
9. **移动端工作台的实际视觉与操作体验**：只做了源码审查，未在 Android / iOS / 桌面实机运行，界面是否拥挤、信息密度是否合理**尚无证据**。
10. **是否需要为「可验证的 UI 交付」补一个校验工具**（模型提交规格、宿主返回校验结果），还是完全依赖正文 DSL + 渲染失败降级？未收敛。

---

## 附录 A：讨论中出现的关键参考

**DSH 与插件**

- DSH 上游：`deepseek-ai/deepseek-harness`（审查时 `master` = `0.2.1-alpha.2`）
- 用户环境：DSH `0.1.7-rc.2`
- 移动端：`TTTPOB/dsh-mobile-workbench` v3.1.0（`dsh-web-mobile`，web profile，窄屏 + 触控启用）
- 移动端依赖声明：`TTTPOB/dsh-config` → `shared/dependencies.yaml`
- 参考插件（不作为交付路径）：`omdsh-dev/dsh-genui` / npm `@changfenhuang/dsh-genui` v0.11.4

**候选协议 / 渲染器**

- OpenUI（Thesys，MIT）：`@openuidev/lang-core`、`@openuidev/react-lang`、`@openuidev/react-ui`、`@openuidev/react-headless`
- json-render（Vercel Labs，Apache-2.0）：JSON 组件树 + `@json-render/directives`（`$math`），36 个 shadcn/ui 组件定义
- A2UI（Apache-2.0）：官方 React / Lit / Angular / Flutter 渲染器，React Basic Catalog 18 个基础组件；缺 ECharts / Mermaid / Diff / 3D，需要自定义 Catalog
- assistant-ui Generative UI（MIT）：29 个组件，默认 `present` 工具通道
- Streamdown（Apache-2.0）：流式 Markdown + 自定义围栏渲染器

**可体验的真实产品 / Demo**

- Oodle AI（`play.oodle.ai`，技术复盘 "how we taught our AI to draw"）：真实产品使用 OpenUI Lang，且**最初也自研 JSON 围栏 DSL 后改用 OpenUI**，与本次决策路径高度相似。
- OpenUI 三方对比（Markdown / OSS / Cloud）、json-render Chat 与 Dashboard、CopilotKit Showcase + A2UI Theater。
- 注意：assistant-ui 官方 Generative UI 在线实例曾返回 404，**演示不可用不等于库不可用**。

---

## 附录 B：最小验收测试（可直接复制）

用同一段提示词测所有候选（OpenUI / json-render / assistant-ui），判断标准是「界面能否本地重算」，而不是页面是否漂亮。

```text
请使用 OpenUI Lang v0.5 的 reactive state 和表达式，生成一个无需联网的贷款模拟器。
必须让输入控件与 $variables 双向绑定，所有指标在浏览器本地重新计算，
不得把结果写成固定字符串。

核心逻辑：
$monthly = 5
$asset = 120
$haircut = 75
dti = (8 + 3 + $monthly) / 21
coverage = ($asset * $haircut / 100) / 50
verdict = dti > 0.65 || coverage < 1.2 ? "DECLINE" : "REVIEW"

提供三个输入控件：月供 0~10、抵押估值 40~160、折扣率 40~100。
如果没有 Slider，就用支持变量绑定的输入组件。

直接把公式结果传给显示组件。修改输入后，所有相关指标必须立即更新，不得调用 LLM。

如果当前环境没有启用 reactive bindings，请明确说明，不要用静态数值假装动态计算。
```

**通过判据**

| 检查点 | 期望 |
| --- | --- |
| 默认参数 DTI | `(8 + 3 + 5) / 21 = 76.19%` |
| 默认参数抵押覆盖率 | `120 * 75% / 50 = 1.80` |
| 默认审批结果 | `DECLINE` |
| 拖动月供滑块 | DTI、覆盖率、审批结果同步刷新，且**没有新的模型请求** |
| 结果不随滑块变化 | 判定为静态渲染（先查 `bindings` 配置，再怀疑框架） |
| 渲染失败 | 原始 DSL 与文本仍完整可见 |

更复杂的场景（递归 DFS、图算法、任意业务函数）不在本方案能力范围内：需要受控计算运行时或预先注册函数，不要为了它引入任意 JavaScript 执行环境。

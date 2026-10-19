# dsh-mobile-workbench 的 mock / 测试 / 浏览器验收方案调研

> 调研对象：GitHub `TTTPOB/dsh-mobile-workbench`，npm 包 `dsh-web-mobile`，v3.3.0。
> 本机原无 checkout；已克隆到 `/home/tpob/playground/dsh/dsh-openui/.scratch/dsh-mobile-workbench`（commit `62c0837`，tag `v3.3.0`，工作树干净）。`gh` token 已失效（HTTP 401），因此用 `git clone` 走公开 https。以下路径除特别注明外均相对该 clone 根目录；调研只读，未跑 `pnpm install` / `pnpm build`。

## TL;DR

- 它**不是**假 Host、假 WebServer、假 `__DSH_BOOT__`、假 WebSocket/RPC、假会话数据。它起**真实 DSH Host**（独立 `DSH_HOME`、真实端口、真实登录 token、真实会话/工具/审批），只把 **LLM provider 层**换成确定性的本地假模型。
- 假模型是 DSH 正式插件：实现 `LlmAdapter`，在 `apply(ctx)` 里调用 `ctx.llm.registerAdapter(['mobile-audit'], ...)`；通过 overlay 把默认模型指向它。
- 浏览器验收有两条独立路径：`tests/browser/*.spec.ts` 用 **Playwright** 连已启动的隔离 demo；`scripts/cdp-*.mjs` / `scripts/probes/*.mjs` 用**裸 Chrome DevTools Protocol**（自己 spawn headless Chromium + WebSocket），不引入 Playwright。
- 能生成带 Markdown 的 assistant 消息，现有 `REPLY` 已含一个 ts 代码围栏；但**没有“运行时指定任意 Markdown”的接口**，要改 `dev/fixture/src/index.ts` 的常量或加一个读文件的小配置。对 OpenUI 最值得借鉴的是“**真 Host + 假 LLM + 真实官方 Markdown 渲染**”；移动端触控/安全区/PWA/CDP 手势探针基本不适用。React 19 岛要特别处理：本仓库的共享 React 走宿主模块表，不能直接拿来当 React 19。

## 1. 它怎么 mock：只 mock LLM provider

### 1.1 核心文件与函数

- `dev/fixture/src/index.ts:80-230`：`MobileAuditAdapter extends LlmAdapter`。
  - `listModels()` / `resolveModel()`（`:82-93`）注册 provider `mobile-audit`，模型 `Mobile Audit` 和 `Mobile Audit — Extended Reasoning Preview`。
  - `stream(options)`（`:95-205`）是主逻辑：从 `options.messages` 找最后一条 user 文本，按提示词前缀/关键字选场景（`:101-115`），然后 yield 文本块或一个 `tool-call` 块（`:119-169`）；拿到真实工具结果后再 yield 最终文本（`:171-204`）。
  - `tool()` / `text()` / `textBlocks()`（`:206-229`）手工构造 `StreamChunk` 流：`block-start`、`text-delta`（每 72 字符一片，`paceMs` 延迟）、`block-end`、`usage`、`finish`。页面看到的是正常流式回复，不是一次性注入。
- `dev/fixture/src/index.ts:232-241`：`apply(ctx, config)` 校验 `paceMs`（0–1000）和 `fixtureFile`（存在的绝对路径），然后 `ctx.llm.registerAdapter(['mobile-audit'], ...)`。这是整个 mock 的唯一注册点。
- `dev/fixture/build.mjs:8-38`：用 `stripTypeScriptTypes` 生成 `dist/index.js`；把 `@deepseek-ai/dsh-llm`、`@deepseek-ai/schemastery` 的 import 改写成宿主安装目录的 `file://` URL（`:11-15`），避免再打一份 service；生成 `overlay.yml`（`:21-38`）。
- `dev/fixture/build.mjs:21-38` 生成 `overlay.yml`：`subagent.config.maxDepth: 2`（`:21-23`）；`agent-default-model` 指向 `provider: mobile-audit` / `model: mobile-audit`（`:24-27`）；`session-title-llm` disabled（`:28-29`）；插入 `mobile-audit-fixture`，配置 `fixtureFile: dev/fixture/workspace/mobile-audit.md`、`paceMs: 35`（`:30-35`）。
- `dev/fixture/smoke.mjs:1-229`：不上浏览器的单测。用宿主包构造 Cordis `Context`、`LlmRuntime`、`SubagentRuntime`，直接驱动 adapter，断言 read 调用、同内容两会话一致、取消、daily 短回复、子代理两层、提问、审批、后台任务参数等。本次实测通过（见 §6）。

### 1.2 它“假”的边界

- **假**：模型 provider、模型列表、token 用量、回复文本、工具调用参数、场景决策；测试数据文件 `dev/fixture/workspace/mobile-audit.md`（真实 `read` 工具读它）。
- **不假**：DSH Host 进程、`webServer`、端口、认证 token、静态资源、`__DSH_BOOT__`、浏览器端模块加载器、WebSocket/RPC、会话存储、消息持久化、agent loop、工具执行（`read` / `bash` / `subagent` / `ask_user_question`）、审批 UI、子会话、客户端插件加载。
- 所以它是“**真实端到端链路 + 假模型**”，不是“纯前端假环境”。

### 1.3 怎么启动

最短路径（仓库根目录）：`node scripts/demo.mjs --port 54076`。

`scripts/demo.mjs` 的步骤：
1. `:27`：`node dev/fixture/build.mjs` 生成 fixture 的 `dist/index.js` 与 `overlay.yml`。
2. `:16-19`：创建 `.demo-home`，设 `DSH_HOME=.demo-home`，与日用 Host 完全隔离。
3. `:28-30`：`dsh --profile web --dump-config` 初始化 isolated profile；`grantDemoCompatibility(...)` 只对 `dsh-config/shared/dependencies.yaml` 中已验证的 fork 组合写精确版本豁免（`dev/fixture/compatibility.mjs:6-36`）；`dsh plugin --profile web add link:<repo> --config.auto-install-peers=false` 把当前工作树链接进去。
4. `:31-32`：写 `browser-picker.yml`，禁用原生目录选择、启用 browse 变体（仅 demo 用）。
5. `:34-42`：`startDemoProcesses()` 起真实 Host，并处理 Ctrl-C/SIGTERM，确保子进程一起退出。

`scripts/demo-processes.mjs`：
- `:15-22`：把 `url.txt`、`public-url.txt`、`demo.pid` 写成 0600。
- `:51-56`：真正启动 `dsh --profile web --patch dev/fixture/overlay.yml --patch .demo-home/browser-picker.yml --host 127.0.0.1 --port <port> --no-open`。
- `:57-74`：从 stdout 抓 `dsh web: http...` 行，提取带 token 的 Authenticated URL 写入 `.demo-home/url.txt`。
- `:78-103`：可选 `--tunnel`，先起 `cloudflared` quick tunnel，再把公网 hostname 作为 `--trusted-host` 传给 DSH；任一侧退出会停掉另一侧。

启动后打开带 token 的 URL，选打印的 workspace，新建会话，模型选 `Mobile Audit`，发送提示词。示例场景与预期标记见 `dev/fixture/README.md:47-62`。

## 2. 真 Host 还是纯前端假环境；Playwright 还是 CDP

### 2.1 结论

- `scripts/demo.mjs`：**真 Host**。只负责构建 fixture、准备隔离 profile、起 `dsh` 进程；不是浏览器自动化。
- `tests/browser/*.spec.ts`：**Playwright**，连已经运行的 demo，不自己启动服务器（`tests/browser/README.md:26`）。
- `scripts/cdp-*.mjs`、`scripts/probes/*.mjs`：**裸 CDP**，不是 Playwright。每个脚本自己 spawn headless Chromium，加 `--remote-debugging-port`，通过 `fetch(http://127.0.0.1:<port>/json)` 拿 `webSocketDebuggerUrl`，再用原生 `WebSocket` 发 `Page` / `Runtime` / `Emulation` / `Input` 命令。设计文档 `docs/specs/2026-08-18-cdp-regression-gate-design.md:29-36` 明确“不引入 Playwright/Puppeteer/jsdom，也不启动 `dsh web`”。

### 2.2 Playwright 流程

`playwright.config.ts:3-29`：`testDir: ./tests/browser`，`workers: 1`，`timeout: 90_000`；三个 project：`mobile-390`（390×844，isMobile+hasTouch）、`mobile-320`、`desktop-1440`；失败留 trace、截图。

`tests/browser/demo.ts` 的 helper 是主要流程：
- `demoUrl()`（`:16-24`）：从 `DSH_BROWSER_URL` 或 `.demo-home/url.txt` 取 URL，拒绝非 localhost 和日用端口 53083。
- `openDemo(page)`（`:27-34`）：`page.goto(url)`，等 `[data-composer-input]`，处理 Preview Notice。
- `fixtureSession(page, options)`（`:37-80`）：只用可见 UI 操作——切到会话列表、复用/新建会话、选 workspace、确认模型是 `Mobile Audit`、fill 提示词、点 Send。
- `waitForAudit(page, reused)`（`:83-105`）：等最终 assistant 文本里的 `MOBILE_AUDIT_COMPLETE`，再等 Send 按钮恢复；复用旧会话时通过原生虚拟滚动查找历史标记，不 sleep 固定时间。

测试 spec 只做 UI 断言，例如 `tests/browser/navigation.spec.ts:4-28`、`tests/browser/integration.spec.ts:34-43`。

### 2.3 CDP 流程

以 `scripts/cdp-probe.mjs` 为例：
1. `:26-60`：读 `DSH_PROBE_URL`、`DSH_PROBE_SESSION_ID`（必填）、`DSH_PROBE_TOKEN` / `DSH_PROBE_COOKIE`、`DSH_PROBE_CHROME`、timeout。
2. `:702-715`：在 `~/.cache` 下 `mkdtemp` 独立 profile，spawn `chromium --headless=new --remote-debugging-port=... --user-data-dir=... --window-size=390,844`。
3. `:719-732`：轮询 `/json` 取 page target，连 `webSocketDebuggerUrl`。
4. `:751-766`：`Page.enable`、`Runtime.enable`、`Log.enable`，收集异常/console.error/log error。
5. `:770-773`：**首次导航前**用 `Page.addScriptToEvaluateOnNewDocument` 写 `localStorage['dsh.sessions.current']={sessionId}`，避免先加载空态再 reload。
6. `:774-780`：设置 viewport、可选 cookie、`Page.navigate`；`:793-798` 跑核心断言和可选 gitgraph 断言；`:803-829` 统一关闭 WS、杀 Chromium、删临时 profile。
7. 结果用 `PASS/SKIP/FAIL/BASE` 记录；`EXPECTED_FAILURES`（`:71-74`）是已分诊旧失败，只有新 FAIL 才非零退出。

其他 CDP 脚本：`cdp-compat-contracts.mjs:30-41` 不需要 session id，扫描 DOM class / 样式表 `cssText` 里的契约字符串；`cdp-swipe-*` 用 `Input.dispatchTouchEvent` 做手势；`cdp-zoom-probe.mjs` 做 iOS UA/viewport 断言；`scripts/probes/*.mjs` 是同一套手写 CDP 样板，按单点布局问题做断言。

## 3. 能否构造“一条带指定 Markdown（含自定义代码块）的 assistant 消息”

### 3.1 当前能力

**能生成 assistant 消息，且能含代码块；但不能在不改 fixture 的情况下“指定任意 Markdown”。**

- 假模型最终走 `this.text(...)`（`textBlocks`）输出一个 text block；这个块由真实 agent loop 写入真实会话，再由官方聊天渲染器 `MarkdownText` 渲染（`dsh-client-ui-chat/lib/client.js` 的 `AssistantMarkdown` 在 `:6257` 调用 `_deepseek_ai_dsh_client_ui_primitives.MarkdownText`）。
- 现有 `REPLY`（`dev/fixture/src/index.ts:18-58`）已经包含标题、引用、任务列表、表格，以及 `:43-48` 的 `ts` 围栏代码块。所以“Markdown + 代码块”这条路已经跑通。
- 但 `REPLY` / `DAILY_REPLY` 是源码常量；配置里只有 `fixtureFile` 和 `paceMs`（`:12-16`），没有“回复文本文件”或“按请求注入内容”的字段。也没有脚本直接往会话写 assistant 消息。
- 补充：默认 `read` 场景先输出“intro 文本 + read 工具调用”的同一条 assistant 消息，再在工具结果后输出第二条最终回复。若测试要求“一条干净 assistant 消息”，需要新增一个不调用工具的文本分支。

### 3.2 最小改法（推荐按改动从小到大）

1. **只加一个场景常量（最小）**：在 `dev/fixture/src/index.ts` 顶部加 `OPENUI_REPLY`（内容含一个 openui-lang 围栏），在 `stream()` 拿到 `prompt` 后、进入 `callId` 逻辑前加：
   ```ts
   if (prompt.includes('OPENUI_DEMO')) {
     yield* this.text(OPENUI_REPLY, options)
     return
   }
   ```
   这条分支不产生 tool-call，因此只有一条 assistant 消息。之后 `node dev/fixture/build.mjs`，重启 demo 即可。
2. **加一个 `replyFile` 配置（更灵活，推荐给 OpenUI 测试）**：`Config` 增加 `replyFile: Schema.string()`（绝对路径，`apply` 里用和 `fixtureFile` 一样的 `statSync` 校验）；`build.mjs:30-35` 的 overlay 增加 `replyFile`；`stream()` 里 `readFileSync(config.replyFile, 'utf8')` 作为 text 内容。测试在发消息前写这个文件，就能做到“每个 Playwright test 指定不同 Markdown”。
3. **不改上游仓库的做法**：把 `dev/fixture/` 拷到 OpenUI 测试仓再改，或复制成独立的小 provider 插件；这样不违反“只读”。
4. **不要走“伪造 WebSocket/RPC 消息”路线**：该仓库没有这类设施；它的价值恰恰是真实会话链路。

### 3.3 自定义 `openui-lang` 围栏会不会被渲染

- 会进入官方代码块组件。静态查看本机 DSH 0.2.1-rc.1 的 `dsh-web-frontend/dist/assets/index-CN7NIWNw.js`（单行 minified，无行号）：
  - `function QF` 取 `e.lang`，用 `/^[\w-]+/` 截出语言名，再调用 `rw({ lang: n, ... })`。`openui-lang` 含连字符，能匹配。
  - `function rw` 渲染 `md-code-block`，带 banner（infostring 显示 `lang`）和 `data-code-block-content`；若无对应高亮器，回退为普通 `<pre className="plain"><code>...</code></pre>`。
- 结论：**围栏和语言名会保留，代码块会渲染**；未知语言大概率不高亮、但 DOM 仍在，OpenUI 插件可以据此定位并挂载 Shadow DOM 岛。
- 不确定点：该仓库没有针对“自定义 fence 语言”的浏览器测试；上述是静态读官方 bundle 的推断，实际挂载点/类名需要在最终 DSH 版本上实测确认。

## 4. 客户端插件怎么加载；bundle 注入与 React 共享

### 4.1 加载链路

- `package.json:59-75` 的 `dsh` 字段：`bundle.patch: ./cordis.patch.yml` 告诉 DSH 这个包在 profile 里怎么插一行；`client.platform: web`，`client.inject` 列出 8 个共享模块（locale、ui-slots、ui-primitives、ui-conversation、ui-layout、ui-settings、ui-sidebar、ui-plugin-manager）。
- `cordis.patch.yml:1-6`：只插入 `id: dsh-web-mobile`，name 是包名；注释说浏览器入口由 `package.json` 的 `dsh.client` 发现。
- `src/client/index.tsx:31-33`：客户端入口导出 Cordis `inject = ['slots','layout','locale','sessions','workspaces','inputTriggers']`。`:39-99` 的 `apply(ctx)` 注册 locale、样式、各种 effect，以及两个官方 slot（`conversation.input.model.label`、`conversation.input.left`）；它不自己造 React root，而是嵌进官方 slot/节点。
- 宿主把 `lib/client.js` 作为插件 client bundle 提供；页面里已有 `window.__ModuleLoader__`，由它按 id 注册/加载。仓库对 bundle 端点的实测记录：`docs/maintenance/pitfalls.md:583`（组合 URL、token cookie、rev 不等于 sha1、served body 是 `lib/client.js` 前缀加 sourcemap 尾巴）。

### 4.2 `scripts/build-client.mjs` 做了什么

- `:1-5` 注释直接说明目标：把 tsc 编译出的 CommonJS 客户端包成 `window.__ModuleLoader__.load({ id, factory: (require) => ... })`。
- `:19-47`：收集 `.client-build` 下的所有 `.js`，把相对模块内联；把 `@deepseek-ai/dsh-agent-preset-registry/display` 这个无 import 的公开工具也内联。
- `:49-81`：从 `index.js` 做依赖优先拓扑排序；把每个相对 `require("./x.js")` 改写成 bundle 内部 key。
- `:83-102`：外面包一层 `window.__ModuleLoader__.load` 和本地 `__localRequire`；**裸 require（`react`、`@deepseek-ai/dsh-client-ui-primitives` 等）不内联，直接交给宿主传入的 `require`**。这是“共享 React/共享官方组件”的机制。
- 输出 `lib/client.js`，并删掉自己的 sourcemap（`:104-107`）。

### 4.3 React 共享与 OpenUI 的关键差异

- 本仓库 `peerDependencies.react` 是 `^18.2.0`（`package.json:87`），devDependency 也是 `^18.2.0`（`:139`）。`require("react")` 由宿主模块表提供，移动端插件不打包 React。
- 对 OpenUI 的“独立 React 19 渲染岛”：**不能**直接照搬 `require("react")` 拿 19；宿主表里的 react 版本由 DSH 决定，不保证 19。若确实要 React 19 隔离，需要把 React 19 **内联进自己的 client bundle**（改 build 逻辑，不走宿主 require），或把岛放进独立 iframe/独立资源路由；代价是体积和重复 React。这和 `build-client.mjs` 当前“相对模块内联、裸 require 外置”的默认策略冲突，需要单独设计。
- 样式注入也要注意：`src/client/index.tsx:42-60` 把 `<style data-plugin-css="dsh-web-mobile/mobile.css">` append 到 `document.head`；Shadow DOM 内的样式不会继承这个 head style。OpenUI 若用 Shadow DOM，必须把样式注入到自己的 shadow root（或使用 adoptedStyleSheets）。
- 另外，`dsh.client.inject` 中的 `ui-primitives` 在当前安装树里未必有实体包；`docs/audits/2026-08-27-sidebar-swipe-latent-defects.md:175` 记录过“peer 声明与实际解析路径不一致，primitives 由宿主 web 资产 `assets/index-*.js` 提供注册”。OpenUI 若依赖官方 primitives，需以实际 served bundle 为准，不要只信 `node_modules`。

## 5. 哪些能复用到 OpenUI，哪些不适用

### 5.1 可直接复用

| 部分 | 具体文件 | 复用方式 |
| --- | --- | --- |
| 假 LLM provider 骨架 | `dev/fixture/src/index.ts:80-241` | 保留 `LlmAdapter` + `apply(ctx)`，把 `REPLY` 换成 OpenUI Markdown；场景判断可简化。 |
| fixture 构建/宿主包复用 | `dev/fixture/build.mjs:8-38`、`runtime.mjs:7-18` | 用 `stripTypeScriptTypes` + 宿主 `file://` 依赖，避免再装一份 service。 |
| overlay 注入 | `dev/fixture/build.mjs:21-38` | 把 `agent-default-model` 指向假 provider，插入 OpenUI 的 fixture 插件；按需保留/去掉 subagent。 |
| 隔离 Host 启动器 | `scripts/demo.mjs:16-35`、`scripts/demo-processes.mjs:15-105` | 改 `link:` 的目标包和 fixture 路径；保留独立 `DSH_HOME`、token URL 写入、进程生命周期。 |
| Playwright 壳 | `playwright.config.ts:3-29`、`tests/browser/demo.ts:16-105` | 保留 `openDemo` / `fixtureSession` 的“真实 UI 操作 + 标记轮询”思路，替换选择器和完成标记。 |
| 裸 CDP 工具函数 | `scripts/cdp-probe.mjs:237-293`（client）、`:156-235`（waitFor/viewport/input） | 如果不想用 Playwright，可复用 WebSocket 路由、`Runtime.evaluate`、`Emulation`、输入事件、错误收集。 |
| 真实 Host + 真实 Markdown 渲染 | 整体 demo 流程 | 能在最终 DSH 版本上验证插件是否真的挂进 assistant 正文，而不是 jsdom/假 DOM。 |

### 5.2 不适用或必须改

| 部分 | 原因 |
| --- | --- |
| 移动端三页导航、触控手势、安全区、PWA、iOS 键盘验收 | 是 `dsh-web-mobile` 的产品验收，不是 OpenUI 的消息正文渲染岛；`cdp-swipe-*`、`cdp-zoom-probe`、大量 `probes/*` 都针对这些。 |
| “纯前端假环境” | 它没有 fake `__DSH_BOOT__` / fake WebSocket / fake session；要真实 Host、真实会话、真实工具链。若 OpenUI 想要组件级隔离测试，仍需另做 jsdom/Storybook 层。 |
| 运行时指定任意 assistant Markdown | 当前只有硬编码 `REPLY`/`DAILY_REPLY`；需按 §3.2 加分支或 `replyFile`。 |
| 直接 `require('react')` 当 React 19 | 宿主模块表给的是 DSH 自带版本（本仓库 peer 是 18），OpenUI 必须自带 19 或走 iframe。 |
| head style / 官方 slot 注入方式 | OpenUI 是 Shadow DOM 岛；`src/client/index.tsx:42-60` 的 `document.head` 样式和官方 slot 的普通 DOM 挂载不能直接套。 |
| `dsh-config` 相邻 checkout | `dev/fixture/compatibility.mjs:6-14` 会向上找 `dsh-config/scripts/lib.mjs`，找不到就抛错；这是 mobile 的 fork 兼容逻辑，OpenUI 未必需要，但复用 demo 脚本会继承这个前置。 |
| cloudflared / 真机隧道 | OpenUI 的浏览器验收不需要公网隧道；只在小屏/触屏需要时再考虑。 |
| 移动端的 subagent `maxDepth: 2` / 子会话断言 | 与 OpenUI 的消息正文挂载无关，保留只会增加无关复杂度。 |

## 6. 依赖、命令与大概耗时

### 6.1 依赖

- Node.js **24+**（`package.json:142-144`；`engines.node >=24.0.0`）。
- pnpm **11.28.5**（`package.json:146`）。
- 本机已安装 DSH **0.2.1-rc.1**（`dev/fixture/README.md:13`；`hostRequire()` 会通过 `pnpm list -g` 找 `@deepseek-ai/dsh`，也可用 `MOBILE_AUDIT_RUNTIME` 指定包目录，`runtime.mjs:7-18`）。
- **相邻的 `dsh-config` checkout**：`scripts/demo.mjs` 的兼容豁免需要（`compatibility.mjs:6-14`）。没有它，demo 启动会在 `grantDemoCompatibility` 前失败。
- Playwright Chromium：`pnpm exec playwright install chromium`（`tests/browser/README.md:10`）。
- CDP 路径：系统 `chromium` 或 `google-chrome`（`DSH_PROBE_CHROME` 可指定）；不需要 Playwright。可选：`/usr/local/bin/cloudflared`，只在 `--tunnel` 真机验收时需要。

### 6.2 命令

```sh
# 依赖与静态检查
pnpm install --frozen-lockfile
pnpm verify                 # 两个 tsc --noEmit
pnpm test:core              # node --test tests/*.test.ts
pnpm build                  # clean-build + tsc host/client + build-client
pnpm exec playwright install chromium

# 起隔离 demo（真 Host + 假模型）
node scripts/demo.mjs --port 54076

# 另一个终端：Playwright（读 .demo-home/url.txt）
pnpm test:browser
pnpm exec playwright test --project=mobile-320
pnpm exec playwright test --project=desktop-1440

# 可选：裸 CDP
DSH_PROBE_URL=http://127.0.0.1:54076/ \
DSH_PROBE_TOKEN=<URL 里的 token> \
DSH_PROBE_SESSION_ID=<已存在会话 id> \
DSH_PROBE_CHROME=chromium \
node scripts/cdp-probe.mjs

# 契约扫描（不需要 session id）
DSH_PROBE_URL=http://127.0.0.1:54076/ node scripts/cdp-compat-contracts.mjs

# fixture 自身
node dev/fixture/build.mjs
node dev/fixture/smoke.mjs --source   # 不写 dist/overlay；本次实测 4.0s
```

### 6.3 耗时（本机实测 / 估算）

| 步骤 | 量级 | 依据 |
| --- | --- | --- |
| `node dev/fixture/smoke.mjs --source` | **4.0s（实测）** | 本次运行，exit 0，输出全部断言 true。 |
| `pnpm install --frozen-lockfile` | 1–3 分钟（估算，网络/缓存相关） | 依赖很多 DSH client 包；未在本机跑。 |
| `pnpm build` | 20–60 秒（估算） | 两次 tsc + 自定义 client 包装。 |
| `pnpm test:core` | 5–10 秒（估算） | 纯 node:test；仓库旧记录 173 个测试约 1.8s，当前文件更多。 |
| `node scripts/demo.mjs` 启动 | 10–30 秒（估算） | 3 次 `dsh` CLI + fixture build + Host 启动。 |
| `pnpm test:browser` 全量 | 5–15 分钟（估算） | 每个 test timeout 90s、`workers: 1`，12 个 spec 文件；复用会话可减少时间。 |
| `node scripts/cdp-probe.mjs` | ~60 秒（仓库设计文档基线） | `docs/specs/2026-08-18-cdp-regression-gate-design.md:15` 记录旧脚本约 60s。 |
| `cdp-compat-contracts` | 30–90 秒（估算） | 启动 Chromium + 扫描 + settle。 |

结论：如果只是验证“OpenUI 岛能否挂到真实 assistant 消息”，最短链路是 fixture smoke（秒级）→ 改回复 → demo + 一个 Playwright spec（1–2 分钟）；不需要跑全量移动端套件。

## 7. 未确认 / 风险

- **未实测**：本次没有 `pnpm install/build`，也没有起 demo；Playwright 全量耗时、demo 启动耗时是估算。
- **未实测**：`openui-lang` 围栏在最终 DSH 版本上的实际 DOM（`md-code-block` banner、`data-code-block-content`、Shiki 回退）只做了官方 bundle 的静态推断；仓库没有该自定义 fence 的测试。
- **版本绑定**：该方案强绑定 DSH 0.2.1-rc.1；`dsh-config` 的兼容豁免、`dsh.client.inject` 的模块表、官方渲染器 DOM 都可能随 Host 升级变化。
- **只读约束**：clone 位于 `.scratch/dsh-mobile-workbench`，本次未修改；source-mode smoke 后 `git status` 仍干净。

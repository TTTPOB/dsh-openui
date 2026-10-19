# DSH 0.2.1-rc.1 客户端扩展点调研

> 调研对象：`.scratch/deepseek-harness`（`TTTPOB/deepseek-harness` daily-driver，commit `19fa1b1`）。
> 以下路径均相对该 clone。结论以源码为准；标“未验证”的是还没在真实 demo DOM 里跑过的推断。
> 关联决策：产品决策 1/1a（`docs/design/product-decisions.md`）；首版只做本地计算，组件说明按需经 skill 加载。

## 0. 结论先行

| 问题 | 结论 |
|---|---|
| 官方有没有 fence/code-block 渲染器注册点？ | **没有**。`MarkdownText` 没有 components/renderers 参数，`render.tsx` 的 `case 'code'` 硬编码到 `CodeBlock`，没有 registry/slot。 |
| 有没有公开 markdown service 能拿 fence 语言？ | **没有**。代码块渲染是纯 React 内部流程；`MarkdownDelegateProvider` 只提供链接/图片导航。唯一可用的是 DOM，或 fork 加属性。 |
| 消息 DOM 有没有语言属性？ | **上游没有**。只有 `.md-code-block`、`[data-code-block-content]`；header 语言标签在未知语言时回退成 “Code block”。w-fork 正在 fork 中加 `data-code-language`（见 §1.4）。 |
| 客户端插件怎么加载？ | `package.json` 的 `dsh.client` + `exports["./client"]` + `lib/client.js`；bundle 首行调用 `window.__ModuleLoader__.load({ id, factory })`。`dsh.client.inject` 只是信息性包边，不参与服务注入/加载顺序。 |
| 宿主插件能发静态资源吗？ | 能。`ctx.webServer.register({ kind:'exact'|'prefix', path, handler })`，返回 disposer；`webServer` 本身不做鉴权。 |
| `systemPrompt.section` 怎么用？ | `ctx.systemPrompt.section({ name, order, text })`，返回 disposer；用 `ctx.effect` 包住。 |
| Skills Provider 怎么注册？ | 单条内置 skill 用 `ctx.skills.register({ name, description, content, invocation? })`；不需要实现 provider。 |
| 消息容器/流式标记？ | 有界容器 `[data-chat-flow]`；行 `[data-chat-flow-kind]`；assistant 正文行 `[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]`；流式 `[data-streaming]`（在 assistant markdown 根上）。没有 `data-message-id`。 |

## 1. assistant Markdown 渲染链

### 1.1 调用链（React）

`packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx:147-172` 为每个 Chat Node 建行，行内 `renderSlot('conversation.chat.node', ...)`；assistant 的 keyed renderer 在：

- `packages/client/ui-chat/src/client/chat/register-node-renderers.ts:50-59`：`conversation.chat.node` + `key: 'assistant-step'` -> `AssistantNodeView`。
- `packages/client/ui-chat/src/client/chat/AssistantNodeView.tsx:34-50`：把 `data.status === 'running'` 传给 `AssistantMarkdown` 的 `streaming`。
- `packages/client/ui-chat/src/client/chat/AssistantMarkdown.tsx:81-92`：每个 `text` block 调 `MarkdownText`；`:108-129` 只给 image 用 `conversation.chat.message.images` slot；没有 code slot。
- `packages/client/ui-primitives/src/markdown/MarkdownText.tsx:174-199`：`MarkdownText` 对 settled/streaming 两条路径分别调 `renderSettled` / `StreamingRenderer`。
- `packages/client/ui-primitives/src/markdown/render.tsx:336-337`：`case 'code' -> renderCode`。
- `packages/client/ui-primitives/src/markdown/render.tsx:375-411`：取 `node.lang`，用 `/^[\w-]+/.exec(language)?.[0]` 得到 `lang`；非空围栏渲染 `CodeBlock`。
- `packages/client/ui-primitives/src/markdown/CodeBlock.tsx:187-210`：根 `div` 同时带 CSS Module 类和字面量 `md-code-block`；内容区带 `data-code-block-content`；header 在 `showHeader` 时渲染 `CodeToolbar`。
- `packages/client/ui-primitives/src/CodeToolbar.tsx:42-45`：header 是 `[data-code-block-banner]`；语言 span 的文本是 `supportsHighlighting(lang) ? lang : labels.codeLabel`。

### 1.2 没有 fence 扩展点

逐项排除（都是源码，不是猜测）：

- `MarkdownText` 的公开 props 只有 `text`、`streaming`、`labels`、`fileMentions`、`pathImages`、`variant`（`MarkdownText.tsx:174-183`）。没有 `components`、`renderers`、`onFence`。
- `renderNode` 对 `code` 的分支是直接 `return renderCode(...)`（`render.tsx:336-337`），没有查表/回调。
- `MarkdownDelegate` 只有 `openExternalLink`、`openFile`、`fileImages`（`MarkdownDelegate.tsx:13-27`），没有代码块/语言回调。
- `AssistantMarkdown` 声明的 slot 只有 reasoning body 和 message images（`AssistantMarkdown.tsx:31-32, 108-129`）；没有 `conversation.chat.code` / `fence`。
- 全仓 grep `registerFence|fenceRenderer|codeRenderer` 无命中（`packages/client`、`packages/web`、`apps/web`）。
- 唯一“节点级”公开扩展是 `conversation.chat.node` 的 keyed slot。用同 key 覆盖 `assistant-step`（`register-node-renderers.ts:40-59`）等于重写整条 assistant 渲染，不是 fence 级；不建议为单个代码块采用。
- `ctx.uiConversation.events.register` 可以新增 Conversation Node 类型，但它只处理 Session 事件，不能拦截已有 assistant 文本里的 fence。

**结论：本版没有“官方 fence renderer 注册点”；不要等它，按 DOM + 内容判定/属性 fork 二选一。**

### 1.3 语言为什么在 DOM 丢失

- 非空围栏的 `CodeBlock` 不把 `lang` 写到任何 `data-*` 或 `class`；只把 `lang` 传给 `CodeToolbar`（`CodeBlock.tsx:188-209`）。
- `CodeToolbar` 只在 `supportsHighlighting(lang)` 为真时显示原始语言；否则显示本地化 `labels.codeLabel`（`CodeToolbar.tsx:44`）。`supportsHighlighting` 走 Shiki 语法表（`highlight.ts:253-255`），`openui-lang` 不在表内，所以 header 显示 “Code block” 而不是 `openui-lang`。
- 空围栏是另一条分支：`renderCode` `:377-383` 返回裸 `<pre><code className={language === undefined ? undefined : 'language-' + language} />`，连 `.md-code-block` 都没有；流式刚开始时会出现这个形态。
- 第 0 步实测（`docs/evidence/step0-fence-dom.md`）吻合：`<div data-code-block-content="true"><pre class="_plain_..."><code>root = Card(...)</code></pre></div>`，祖先有 `.md-code-block`，没有语言属性。

### 1.4 可行的检测方案（按优先级）

1. **fork 加属性（w-fork 正在做，推荐）**：`CodeBlock` 根加 `data-code-language={lang ?? undefined}`；空围栏分支也加。之后选择器可写成 `[data-code-language="openui-lang"]`，不再靠内容猜。
2. **内容判定（不依赖 fork）**：只观察 `[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]` 下的 `.md-code-block`，把 `[data-code-block-content] pre code` 的 `textContent` 交给 OpenUI parser；解析失败或没有已知组件就不挂载。必须保留原文、失败可降级。
3. **协议 marker**：如果 OpenUI Lang 允许注释/首行标记，可让宿主提示词要求首行带稳定标记（例如 `openui: 1`）。这是产品/语法决定，不在本调研里拍板。
4. **不要用 React fiber 私有属性**（`__reactFiber$...` 的 props.lang）读语言；不可移植，且和“只用公开扩展点”的约束冲突。

## 2. 客户端插件包结构与加载

### 2.1 包声明

最小结构（字段名以 `packages/client/modules/src/client/manifest.ts:173-193` 为准）：

```json
{
  "name": "dsh-openui",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": [] }
  }
}
```

- `dsh.client.platform` 必须是 `web`；声明了 `dsh.client` 却找不到 `exports["./client"]` 会在扫描时抛错（`packages/client/modules/src/index.ts:844-878`，`clientExportOf` 在 `:196-206`）。
- `dsh.client.inject` **只是信息性包边**（preflight/HMR diff），不排序 activation、不做服务注入（`packages/client/AGENTS.md:148`）。真正的 Cordis 服务依赖仍写在客户端 `export const inject = [...]`。
- `dsh.client.external` 是模块表请求，只给非 baseline 的精确 specifier；**它不是 feature plugin 的依赖机制**，且 React 属于 baseline（`packages/client/AGENTS.md:80-85`）。我们自带 React 19，不应把 react 放 external。
- 宿主侧 `exports["."]` 用普通 Cordis plugin：`export const name` / `inject` / `apply`；不要 default-export（会丢 namespace，见 `packages/AGENTS.md` 的 plugin 规则）。

### 2.2 浏览器 bundle 的形状

`packages/client/modules/src/client/manifest.ts:356-368`：

```ts
interface ClientBundleRegistration {
  id: string
  factory: (require: ClientBundleRequire) => Record<string, unknown>
}
```

插件产物应当形如：

```js
window.__ModuleLoader__.load({
  id: "dsh-openui",
  factory: (require) => {
    const module = { exports: {} }
    // bundle body; relative modules inlined; no host React require
    return module.exports
  }
})
```

宿主启动时注入的顺序：队列 facade -> application preloads -> bootstrap scripts -> `window.__DSH_BOOT__` 全局（`packages/client/modules/src/index.ts:559-593`）。`__ModuleLoader__` 的 `create()` 由 client-modules bootstrap 完成；插件 bundle 只注册 factory，模块体在 materialize 时执行（`manifest.ts:9-24`）。

### 2.3 URL、chunk 与 rev

- 每个包的 graph row 有 `id/url/rev/inject/external`（`manifest.ts:44-68`）；`__DSH_BOOT__` 是 `{ rev, release?, entries, batches }`（`manifest.ts:93-106`），并作为全局注入（`index.ts:592`）。
- 组合入口 URL：`/plugins/??<id>/client.js,...&rev=<rev>`（`index.ts:228-252`）。
- 包内懒加载 chunk：文件必须叫 `client.<name>.js`，放在 `client.js` 同目录；URL 为 `/plugins/<id>/client.<name>.js?rev=<rev>`（`index.ts:249-252, 1100-1151`）。`require.async('./client.<name>.js')` 由模块表处理；入口/chunk 不能同步 require 另一个相对 `client*.js`（`manifest.ts:348-353` 与 README 的约束）。
- 文件级缓存是 `public, max-age=31536000, immutable`（`index.ts:181-182`）；rev 不对就会 404，不能用旧 URL 读新文件。
- **若 island 不走模块表**：自己起 `webServer` exact 路由即可（见第 3 节），客户端用 `new URL('dsh-openui/island.js', document.baseURI)` 动态 `import()`，不必依赖 graph rev。二者选一，不要混用 chunk 命名和自定义路由。

### 2.4 共享 React 的现实

- `packages/client/web/src/platform.ts:8-19` 的 `PLATFORM_MODULES` 含 `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`；任何动态 bundle 的 `require('react')` 都会拿到宿主 React 18。
- 因此 OpenUI 客户端入口必须**不 require 宿主 React**；React 19 + `@openuidev/react-lang` 全部内联进 `lib/client.js`（或只内联到 island 产物再由 client 动态 import）。这也意味着 `build-client.mjs` 式“相对模块内联、bare require 外置”的包装器不能直接复用；需要把 React 19 当作相对/内部模块打进来。
- 如果 client bundle 很小、island 单独大包：client 里只做 DOM 发现和 `import(islandUrl)`；island 产物必须单文件、无裸 import，避免再落到宿主模块表。

## 3. 宿主 webServer：静态资源、路径与鉴权

### 3.1 API

`packages/host/webserver/src/index.ts:43-53`：

```ts
interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string          // 绝对 pathname，无尾斜杠
  handler: (req, res) => void | Promise<void>
}
```

- `register(route)` 返回 disposer；重复 `(kind,path)` 抛错（`:360-373`）。
- 路由匹配：先 exact，再最长 prefix；prefix `p` 匹配 `p` 和 `p/<anything>`（`:542-550`）。
- 用 `ctx.effect(() => ctx.webServer.register(...))` 绑定插件生命周期；client-modules 自己就是这么挂 `/plugins` 的（`packages/client/modules/src/index.ts:663-672`）。
- `tapIndex(transform)` 可以改 index HTML（`:405-418`），适合注入 `<meta>`/全局 URL；它和 `register` 是两件事。

### 3.2 鉴权：没有自动鉴权

- `WebServer` 本身“knows no harness concepts”，route handler 自己拥有响应（`webserver/src/index.ts:1-8, 43-53`）。它不检查 cookie/token。
- 只有 SPA index fallback 会在读 index 前调用 `ctx.connection.authorizeIndexAsync(req,res)`（`packages/host/frontend-static/src/index.ts:88-95, 134-142`）；**非 index 静态资源是公开的**（同文件 `:5-13`）。
- `client-modules` 的 `/plugins` 路由也没有鉴权（`packages/client/modules/src/index.ts:663-672`）；它靠 URL 不可猜/rev 和“代码不是秘密”来降低风险。
- 结论：`/dsh-openui/island.js` 同源可公开 GET；同源 cookie 会随请求带上，但 handler 不校验。island 是公开代码，不放 secret 即可。若确实需要鉴权，要自己在 handler 里校验 cookie；`ctx.connection.authorizeIndex` 虽存在，但它按 index 语义自行写 401/303，没有纯布尔校验的公开 helper。也可以把资源放进 authenticated index fallback 的 dist；不要假设 `webServer.register` 自动保护。
- 反向代理路径前缀：index 会注入 `<base href="./">`（`frontend-static/src/index.ts:119-123`），客户端用 `new URL('dsh-openui/island.js', document.baseURI)` 比硬编码 `/` 稳；路由注册的 path 是剥离前缀后的 pathname（prefix 反代场景需实测）。

### 3.3 推荐的最小实现

```ts
// host half
export const inject = ['webServer', 'systemPrompt', 'skills']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-openui/island.js',
    handler: (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return }
      // readFileSync at build/runtime; set content-type + cache
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' })
      res.end(req.method === 'HEAD' ? undefined : islandBytes)
    },
  }), 'openui: island route')
}
```

- 生产可加内容 hash/版本 query 做缓存；开发用 `no-cache`。
- 如果 island 需要 `import.meta.url` 相对资源，单文件产物要自带或改用绝对 URL。

## 4. `systemPrompt.section`

### 4.1 API 与语义

`packages/core/system-prompt/src/index.ts:478-487`：`section(section: PromptSection): () => void`；`PromptSection` 的 `name/order/text/interpolate?/complete?` 在 `:53-76`。

- `name` 同一 scope 内唯一；重复注册抛错（`:478-486` 与 registry 校验）。
- `order` 升序拼接；同 order 按 name 的 code-unit 排序；外部贡献可任取有限值（README `:54-64`）。
- `text` 可为字符串或 `(AssembleContext) => string`；默认做 `{{variable}}` 插值，不想插值设 `interpolate:false`。
- `complete:true` 是整段系统提示词覆盖，OpenUI 不应使用；多个 complete 会失败。
- 作用域：通过当前插件 ctx 注册；agent 级 ctx 可覆盖同名全局 section。
- `ctx.systemPrompt.section(...)` 返回 disposer；建议在 `apply` 里用 `ctx.effect(() => ctx.systemPrompt.section({...}), 'openui: prompt')`，插件卸载即移除。

### 4.2 最小例子

```ts
export const inject = ['systemPrompt']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'openui:policy',
    order: 3200, // 产品决定；现有 MCP 3100 / TOOLS_SDK 5000 之间
    text: '可用 openui-lang 代码块生成交互 UI；按任务收益判断是否使用；使用前先加载 skill openui。',
  }), 'openui: system prompt')
}
```

- 常驻提示词只放这几行（产品决策 1a）；完整语法/组件目录/示例放 skill。
- 文本尽量稳定（KV cache 从变化处失效）；不要放每请求变化的数据。
- web profile 里 `system-prompt` 行存在（`packages/bundle/base/cordis.patch.yml:497-500`，`packages/bundle/web-app/cordis.patch.yml:17-20`）；插件声明 `inject` 后即可用。

## 5. Skills Provider：注册 `openui`

### 5.1 两种注册方式

- `ctx.skills.register(skill)`：注册单条 runtime skill；适合插件内置的 `openui`。定义见 `packages/skill/skill/src/index.ts:94-100`，实现在 `:439-459`。
- `ctx.skills.registerProvider(create)`：注册一整个 provider（远程/动态目录）；这里不需要。`SkillProvider` 接口在 `:247-266`。
- `ctx.skills` 由 base 的 `skill` 行提供（`packages/bundle/base/cordis.patch.yml:308-315`）；web 默认在 standard preset 里挂 `skill-filesystem` + `tool-skill`（`packages/bundle/web-app/presets/standard.patch.yml:37-40`）。`tool-skill` 才是把 catalog 暴露给模型、并提供 `skill` 工具的消费者；若用户换到不挂它的 preset，模型看不到 catalog（产品决策 1a 的风险）。
- runtime skill 的 `provider` 默认是 `runtime`（`index.ts:24, 449-452`）；project 里的同名 skill 会优先于 runtime（README 的层级规则）。

### 5.2 最小例子

```ts
import { readFileSync } from 'node:fs'

export const inject = ['skills']
export function apply(ctx: Context): void {
  const content = readFileSync(new URL('../assets/openui-skill.md', import.meta.url), 'utf8')
  ctx.effect(() => ctx.skills.register({
    name: 'openui',
    description: 'OpenUI Lang 语法、组件目录与示例；需要生成交互 UI 时加载。',
    whenToUse: '用户要求交互式 UI、参数即时重算或复杂关系可视化时。',
    content,
    // 模型需要主动 load；不给用户 slash 入口。
    invocation: { modelInvocable: true, userInvocable: false },
  }), 'openui: skill')
}
```

- `content` 是 skill 正文（Markdown）。来源建议 `packages/dsh-openui/assets/openui-skill.md`（由 w-island 的 `dist/prompt.md` 整理后随包发布；确保 `files` 包含）。
- `description` 进 catalog；`whenToUse` 是额外路由提示；正文只在模型调 `skill` 时加载。
- `invocation` 省略默认 both true；首版建议 `userInvocable:false`，只让模型按需加载。
- 同名 runtime skill 是 first-wins（`index.ts:443-447`），重复注册会警告并拿 no-op disposer；不要重复注册。

## 6. 消息 DOM：容器、角色、流式、id

### 6.1 有界容器与行

- 会话滚动列：`ChatView.tsx:208-231` 的 `div[data-chat-flow]`（在 `[data-conversation-scroll]` 内）。对它做 MutationObserver 即可只看消息流，不监听 `document.body`。
- 每行 `ChatNodeSeat.tsx:147-160`：

```html
<div data-chat-anchor-key="..." data-chat-flow-key="..." data-chat-paging-anchor="..."
     data-chat-node-key="..." data-chat-group-part="..." data-chat-flow-kind="..."
     data-chat-turn="..." data-turn-process-member="..." data-turn-process-hidden="..."
     data-turn-process-answer="...">
```

- `data-chat-flow-kind` 是节点类型：`assistant-step`、`user`、`steering`、`context`、`turn-trigger`、`tool` 等（`register-node-renderers.ts:40-89` 的 key 列表）。
- assistant 正文用 `[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]`；reasoning 是同一 node 的另一行 `data-chat-group-part="reasoning"`（`process-groups.ts:156-162`）。不要在 reasoning 行挂 UI。
- 用户行另有 `data-pending-steering`、`data-submission-echo`（`MessageItem.tsx:197-202`）。

### 6.2 流式标记

- `AssistantMarkdown.tsx:145-146`：`<div className={css.root} data-streaming={streaming || undefined}>`；settle 后属性移除。
- 该属性在 assistant markdown 根上，不在 `ChatNodeSeat` 行上；选择时从代码块向上找行，再在行内查 `[data-streaming]`。
- 代码块本身在流式期间会经历“空围栏裸 `<pre>` -> `.md-code-block` -> shiki/plain swap”的变化（`render.tsx:377-411`，`CodeBlock.tsx:150-185`）；不要假设一次插入就稳定，监听 `[data-code-block-content]` 的文本变化并按帧节流。

### 6.3 message id / role

- **没有 `data-message-id` / `data-role`。** 角色用 `data-chat-flow-kind`；assistant 的 durable message id 在业务数据里（`assistant.ts:190-227` 的 `finalNode.messageId`），但没有渲染成 DOM 属性。
- 行的稳定身份是 `data-chat-node-key` / `data-chat-anchor-key`；它由 `conversationContextKey(kind,id)` 生成，格式是 `kind.length + ':' + kind + id`（`packages/client/ui-conversation/src/client/contract/conversation.ts:341-342`）。assistant 的 `id` 是 `turn:step`（`assistant.ts:296-305`），不是 message id；user 行的 id 才是 message UUID。
- 若测试需要 message id，不能从 DOM 取；要么用 fixture/会话 API 另取，要么接受 `data-chat-node-key` 作为稳定 row identity（同一 Step 重渲染仍稳定）。

## 7. 对 OpenUI 的最小落地选择器

在 w-fork 的 `data-code-language` 落地前（当前上游）：

```ts
const FLOW = '[data-chat-flow]'
const RESPONSE = '[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]'
const CODE = '.md-code-block'
const CONTENT = '[data-code-block-content]'
// bounded observer on FLOW; for each CODE under RESPONSE, read CONTENT pre code textContent
```

w-fork 落地后优先：

```ts
const CODE = '[data-code-language="openui-lang"]' // + .md-code-block
```

注意事项：

- 空围栏分支没有 `.md-code-block`；若 w-fork 只给 `CodeBlock` 加属性，流式刚开始仍要等内容出现。可在空围栏分支也加属性，或客户端在 `[data-chat-flow]` 内对 `pre > code.language-openui-lang` 做一次过渡处理。
- 只在 response 行挂载；reasoning 行、工具行、turn-process 折叠行不要挂。折叠/隐藏行有 `data-turn-process-hidden` 或祖先 `hidden`，可跳过。
- 代码块根是 React 管理的节点：**不要移动/删除**它；在旁边插入自己的 host（`data-dsh-openui-island`），用 CSS 隐藏原文，失败时恢复。流式更新只调 `update`，不要重建 ShadowRoot。
- 代码块可能被 React 在 plain/shiki 之间替换内部 `<pre>`；观察 `data-code-block-content` 而不是固定 `pre` 引用。

## 8. 未确认 / 风险

- **未验证**：真实 DOM 的完整上行祖先（`data-chat-flow` 是否总在代码块祖先链上）来自源码推断；第 0 步证据只到 `[data-slot="conversation.chat.node"]`。harness 补全祖先 DOM 后应收紧。
- **未验证**：`data-chat-group-part="response"` 在 turn-process 折叠模式下是否始终保留；源码显式设置，但折叠/隐藏组合需实测。
- **w-fork 属性尚未落地**：当前上游没有 `data-code-language`；插件必须先 feature-detect，否则按内容判定兜底。
- **没有 fence 扩展点是确定的**；不要期待 `registerFenceRenderer` 或 markdown components slot。
- **鉴权**：`/dsh-openui/island.js` 公开；这符合“代码不是秘密”，但若未来放用户数据，必须另做鉴权。
- **skill 可见性**：依赖 agent preset 挂 `tool-skill`；非 standard preset 需单独验证。
- **路径**：`new URL('dsh-openui/island.js', document.baseURI)` 依赖 index 的 `<base href="./">`；反向代理前缀场景未实测。

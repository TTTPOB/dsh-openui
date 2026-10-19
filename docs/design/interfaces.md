# 跨包接口（初版，由 lead 拟定，worker 可协商修改并更新本文件）

## 渲染岛 `packages/openui-island`

```ts
export interface OpenUIAction { type: string; payload?: unknown }

export interface MountOptions {
  /** Full openui-lang source (fence body). May be partial while streaming. */
  response: string;
  /** True while the assistant message is still streaming. */
  streaming?: boolean;
  /** Reserved for future actions; v1 never calls this (local computation only). */
  onAction?: (action: OpenUIAction) => void;
  theme?: 'light' | 'dark';
  /** Hydrated runtime state, read only at mount; storage keys are host-owned. */
  initialState?: Record<string, unknown>;
  /** Local reactive/form state snapshot. Never triggers an Agent request. */
  onStateChange?: (state: Record<string, unknown>) => void;
  /** Called after visible content commits; the host may now hide the source. */
  onReady?: () => void;
  /** Parse/render failure; the host must preserve or restore source text. */
  onError?: (error: unknown) => void;
}

export interface IslandHandle {
  update(options: Partial<MountOptions>): void;
  unmount(): void;
}

/** Mounts into a ShadowRoot; the island injects its own styles into that root. */
export function mount(root: ShadowRoot, options: MountOptions): IslandHandle;
```

- 构建产物：单文件、无裸 import，可被插件客户端 bundle 直接内联。
- 诊断：岛加载后设置 `globalThis.__DSH_OPENUI_ISLAND__ = { version, reactVersion }`，测试据此确认 React 为 19.x。

## 插件 `packages/dsh-openui`

- 有界容器 `[data-chat-flow]`；仅扫描 `[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]` 内 `.md-code-block` 的 `[data-code-block-content] pre code`。流式状态来自该行内部 `[data-streaming]`。不观察 document.body。
- 唯一语言发现路径：`uiSession.adapter.current` → `sessions.binding(sessionId)` → `uiConversation.binding(binding).target("chat")` 订阅 ChatSnapshot；遍历 assistant-step 的 `data.blocks` 文本解析 `openui-lang` 围栏，按 `node.key` 对齐 `data-chat-node-key`，再以 body 文本与 DOM code.textContent 完全相等匹配。重复围栏按顺序和 used 集合匹配；DOM 晚一帧时下一轮观察回调重试。无额外标记、不依赖 fork/DOM语言属性、不使用 React fiber。
- 主题来自公开 `theme.getTheme().active.colorScheme`，`theme/change` 实时调用岛 update。交互状态存 sessionStorage，键为 `[sessionId, node.key, 该行代码块序号]`；首次插件激活清理本插件状态，保证刷新恢复 DSL 默认值；切会话重挂时传 initialState，onStateChange 保存。
- 宿主常驻 `systemPrompt.section` 仅含按收益触发 UI、用前加载 skill openui、本地计算限制；完整提示词从 island dist/prompt.md 打包为 dist/openui-skill.md，经 skills.register 注册为仅模型可调用的 openui skill。
- 宿主通过 `webServer.register` 提供公开同源静态 ESM `/dsh-openui/island.js`；客户端按 `new URL("dsh-openui/island.js", document.baseURI)` 懒加载。该公开资源不得包含秘密或会话数据。
- 每个代码块在其旁/上方插入宿主元素，`attachShadow({ mode: 'open' })` 后调用 `mount`；宿主元素带 `data-dsh-openui-island` 属性，供测试定位。
- 代码块内容变化（流式）调用 `update`；代码块从 DOM 移除时调用 `unmount`。
- 原代码块默认折叠/隐藏，但岛渲染失败时恢复显示。

## 假 provider `dev/fixture`

- provider id `openui-fixture`，模型 `openui-fixture`。
- 配置 `replyFile`（绝对路径）：每次请求读取该文件全文作为回复（分片流式输出，不调用工具）。
- 每次 `stream()` 调用在 `callsFile` 追加一行 JSON，测试据此断言"拖动滑块不触发模型请求"。

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
- 校验共享产物 `packages/openui-island/dist/library.schema.json` 为 `library.toJSONSchema()` 的原样纯 JSON（含组件和函数参数/返回 schema、描述，无 React/函数实现）；插件构建复制后用纯 `@openuidev/lang-core` 的 `createParser(schema, "Card")`。root 名不在 JSON 内，固定为 Card。静态错误取 `parser.parse(source).meta.errors`；它没有原生行号，仅 statementId/component/path/message，源码定位由插件负责。
- 8 项非重复通用本地函数通过 `defineFunction({ name, params, returns, fn })` 注册：clamp/pow/sqrt/log/exp/median/fixed/thousands，以 `@clamp(...)` 等调用；其余能力使用上游大写内置函数，不额外注册金融函数或同义别名。JSON 只用于静态签名校验，数值参数域与非有限结果由岛的运行时错误回调报告。
- 视觉 token 直接穿透 ShadowRoot 继承宿主 `--dsw-alias-*` 颜色、`--dsw-font-family`、`--dsh-content-font-size`、`--dsw-radius-*`；`theme` 仅选择无宿主 token 时的亮暗 fallback 和原生控件 color-scheme。不增加颜色传参或全局样式。
- 通用目录扩充 `Metric(label, value, format?, tone?, detail?)`、`Grid(children, columns?)`、`Row(children)`、`Table(title, columns, rows)`、`Chart(title, kind, labels, values)`；tone 为 neutral/positive/warning/negative，由 DSL 决定，不按具体内容文字硬编码。
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

## DSL 校验工具与错误提示

- 注册工具 `openui_check({ source: string })`，输入为不带 Markdown 围栏的完整源码，返回 `{ ok: boolean, errors: Array<{ line: number | null, code: string, message: string, suggestion: string }> }`。可识别 statementId 时，line 是 1 起始的语句声明起始行；无法定位时明确 null，不猜测偏移。
- 使用上文共享组件/函数 schema；另报告 `meta.incomplete/unresolved`。上游 `validate` 是表单校验，不用于 DSL；校验不执行自定义函数实现，所以静态 ok 不保证运行时数值域正确。
- 客户端解析/渲染/加载失败后，在原代码块上方插入 `data-dsh-openui-error` 提示（最多展示前三项错误，样式仅在提示自身 ShadowRoot）；原文完整可见，卸载时移除提示。不触发 steer、修复回合或自动重发。
- skill 告知模型：复杂 UI 输出前可先调用 `openui_check`；无强制自动调用或固定调用方式。PTC preset 中它通过 tools:sdk 暴露，调用走 run_code 内的 `tools.openui_check(...)`；native 仅作为显式假 provider 探针验证。

## 假 provider `dev/fixture`

- provider id `openui-fixture`，模型 `openui-fixture`。
- 配置 `replyFile`（绝对路径）：每次请求读取该文件全文作为回复（分片流式输出，不调用工具）。
- 每次 `stream()` 调用在 `callsFile` 追加一行 JSON，测试据此断言"拖动滑块不触发模型请求"。

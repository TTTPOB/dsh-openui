# 跨包接口（初版，由 lead 拟定，worker 可协商修改并更新本文件）

## 渲染岛 `packages/openui-island`

```ts
export interface OpenUIAction { type: string; payload?: unknown }

export interface MountOptions {
  /** Full openui-lang source (fence body). May be partial while streaming. */
  response: string;
  /** True while the assistant message is still streaming. */
  streaming?: boolean;
  /** Side-effect actions only; local state changes never call this. */
  onAction?: (action: OpenUIAction) => void;
  theme?: 'light' | 'dark';
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

- 发现 assistant 正文中语言为 `openui-lang` 的代码块（具体 DOM 以第 0 步实测为准，见 docs/dsh-client-extension-points.md）。
- 每个代码块在其旁/上方插入宿主元素，`attachShadow({ mode: 'open' })` 后调用 `mount`；宿主元素带 `data-dsh-openui-island` 属性，供测试定位。
- 代码块内容变化（流式）调用 `update`；代码块从 DOM 移除时调用 `unmount`。
- 原代码块默认折叠/隐藏，但岛渲染失败时恢复显示。

## 假 provider `dev/fixture`

- provider id `openui-fixture`，模型 `openui-fixture`。
- 配置 `replyFile`（绝对路径）：每次请求读取该文件全文作为回复（分片流式输出，不调用工具）。
- 每次 `stream()` 调用在 `callsFile` 追加一行 JSON，测试据此断言"拖动滑块不触发模型请求"。

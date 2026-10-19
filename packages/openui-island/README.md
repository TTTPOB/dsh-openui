# OpenUI React 19 渲染岛

## 构建与验证

在仓库根目录运行（Node 24、pnpm 11）：

```sh
flock .locks/pnpm.lock pnpm install
node packages/openui-island/build.mjs
node --test packages/openui-island/test/island.test.mjs
flock .locks/demo.lock node packages/openui-island/test/browser.mjs
```

浏览器测试使用 Playwright Chromium 和随机端口静态服务器，不启动 DSH、不访问日用 Host。独立页面为 `test/index.html`；服务器根目录需设为本包目录。构建前先安装 Playwright Chromium（如未安装）。

## 产物与 API

- `dist/island.js`：单文件 ESM，内联 React 19.2.4、ReactDOM 和 OpenUI；esbuild 检查外部 import 数量必须为零。
- `dist/prompt.md`：`library.prompt()` 自动生成的 skill 正文，含 bindings、组件签名、贷款示例及 DSH 首行发现标记要求，交由插件打包到 `openui` skill。
- `mount(shadowRoot, { response, streaming?, theme?, onReady?, onError? })` 返回 `update(partialOptions)` 与幂等 `unmount()`。
- `onReady` 在 Card 内容挂载后触发；`onError` 报告完成态解析错误或 React 错误。宿主始终保留源代码块，以便降级。
- `onAction` 仅为预留字段，第一版不接线。Slider 和 Button 只修改本地绑定变量。
- `initialState` 仅在 mount 时读取；`onStateChange(state)` 返回 OpenUI 完整运行态快照。插件负责会话/代码块存储键与 sessionStorage，不在岛内做存储。亮暗主题通过 `update({ theme })` 即时切换，不重置已修改的滑块。

目标节点通过 `root.ownerDocument` 创建，样式仅注入该 ShadowRoot。不使用 Portal；后续若增加弹层必须显式传入岛内目标，不能默认挂到 body。

## 真实 OpenUI API（npm 1.0.1）

已读发布包 README、类型声明与运行时代码。不是旧讨论中的 v0.5 包：

- `defineComponent({ name, props: z.object(...), component: ({ props }) => ... })`。
- `createLibrary({ components, root: "Card" })`，子节点通过 `useRenderNode()` 处理。
- schema 用 `reactive(z.number())` 标记双向绑定；组件中 `useStateField(name, props.value)` 返回 `{ value, setValue, ... }`。
- `library.prompt({ bindings: true, preamble: ... })` 生成绑定说明；DSH 自定义 preamble 明确每个围栏都是完整程序，不采用上游 inlineMode 的跨块增量语义；Renderer 没有另一个必须开启的 bindings 属性。
- `Renderer.Root` + `Renderer.Content` 接收 `response`、`isStreaming`、`onError`。
- DSL 是位置参数，不是 JSX 或 JSON。完整示例见 `examples/loan.openui`；首行 `// openui-lang` 也经真实 parser 验证合法。

## 上游样式补丁

1.0.1 的 RendererRoot 无条件调用 `ensureLoadingStyle()`，会向全局 `document.head` 写入 spinner 样式。仓库通过 `patches/@openuidev__react-lang@1.0.1.patch` 同时修正 ESM/CJS；pnpm 11 将精确版本声明写在根 `pnpm-workspace.yaml` 的 `patchedDependencies`，lockfile 保存补丁哈希。原 `openui-spin` 动画已迁入本岛 ShadowRoot 样式。升级依赖需重新检查此补丁。

`allowBuilds` 只允许 esbuild 必要脚本，不执行 lang-core 的非运行必需 postinstall。构建固定 production，避免上游开发工具自动挂到宿主页。

## 验收范围

- 默认 DTI 76.19%、覆盖率 1.80、DECLINE。
- 月供调到 0：DTI 52.38%、REVIEW；估值调到 40：覆盖率 0.60、DECLINE。
- 本地交互 action 回调次数为零；宿主 head 不新增样式；React 为 19.x；卸载清空岛 DOM。
- 自动测试包含流式不完整片段更新、解析失败回调和本地 Button。
- 触屏滑块目标高度至少 44px，允许纵向页面滚动，窄屏布局不溢出。DSH 移动插件共存、WebKit 和最终真机验收由集成测试覆盖；不能用本包 Chromium 测试代替真机证据。

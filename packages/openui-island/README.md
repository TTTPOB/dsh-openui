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

评测期间可在命令前加 `OPENUI_OUT_DIR=.visual-out`：构建、单测与独立浏览器测试都读取该目录，不覆盖正式 `dist`。独立浏览器使用随机端口与自己的 Chromium，不依赖 demo Host；集成浏览器仍须占用 demo 锁。

## 产物与 API

- `dist/island.js`：单文件 ESM，内联 React 19.2.4、ReactDOM 和 OpenUI；esbuild 检查外部 import 数量必须为零。
- `dist/prompt.md`：`library.prompt()` 自动生成的 skill 正文，含 bindings、组件签名、贷款示例及标准 openui-lang 围栏要求，交由插件打包到 `openui` skill。
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
- DSL 是位置参数，不是 JSX 或 JSON。完整示例见 `examples/loan.openui`。发现只依赖原始 Markdown 的 openui-lang 围栏，不要求额外标记。

## 通用组件与主题

- `Metric(label, value, format?, tone?, detail?)`：标签与突出数值。tone 只接受 `neutral/positive/warning/negative`，不根据任何具体文字猜颜色；由 DSL 表达式选择。
- `Grid(children, columns?)`：1–4 等宽列，窄屏自动单列；`Row(children)`：可换行的横排。
- `Table(title, columns, rows)`：带 caption 和表头的文本/数字表格，窄屏只在自身容器滚动。
- `Chart(title, kind, labels, values)`：纯 SVG 单序列 bar/line 图，支持正负值和全零数据，绑定表达式变化后本地更新；没有新增图表依赖。
- `Text/Stack/Card/Slider/Button` 保持原签名，Button 仍只赋值本地变量。

样式通过 Shadow DOM 继承 DSH 的 `--dsw-alias-bg-layer-2`、`--dsw-alias-label-primary/secondary`、`--dsw-alias-border-l2`、`--dsw-alias-state-*`、`--dsw-font-family`、`--dsh-content-font-size` 和 `--dsw-radius-*`。宿主 token 优先于岛的亮暗中性 fallback；自定义主题变量变化立即生效，无需重挂。参考源码为 `.scratch/deepseek-harness/packages/client/ui-theme/src/styles/{base,design-platform}.css`。

range 保持原生键盘/触摸交互、44px 命中高度和 `touch-action: pan-y`；视觉上轨道 4px、拇指 16px，仅键盘焦点在拇指周围显示柔和小环，不画整个输入框矩形。无弹层或 tooltip。

独立 Chromium 截图写到 `docs/evidence/island-visual-{light,dark,mobile}.png`，使用测试页中与 DSH 同名的代表性语义 token；这不是 DSH 集成或真机验收截图。

## 上游样式补丁

1.0.1 的 RendererRoot 无条件调用 `ensureLoadingStyle()`，会向全局 `document.head` 写入 spinner 样式。仓库通过 `patches/@openuidev__react-lang@1.0.1.patch` 同时修正 ESM/CJS；pnpm 11 将精确版本声明写在根 `pnpm-workspace.yaml` 的 `patchedDependencies`，lockfile 保存补丁哈希。原 `openui-spin` 动画已迁入本岛 ShadowRoot 样式。升级依赖需重新检查此补丁。

`allowBuilds` 只允许 esbuild 必要脚本，不执行 lang-core 的非运行必需 postinstall。构建固定 production，避免上游开发工具自动挂到宿主页。

## 构建体积

组件扩充后独立 ESM 为 **614,632 bytes**，gzip **159,341 bytes**；相对首版 605,780 / 156,857 bytes，增加 8,852 / 2,484 bytes（约 1.46% / 1.58%）。Chart 为纯 SVG，没有新增依赖。esbuild metafile 验证 externalImports 为 0；构建脚本每次打印当前体积。

## 验收范围

- 默认 DTI 76.19%、覆盖率 1.80、DECLINE。
- 月供调到 0：DTI 52.38%、REVIEW；估值调到 40：覆盖率 0.60、DECLINE。
- 本地交互 action 回调次数为零；宿主 head 不新增样式；React 为 19.x；卸载清空岛 DOM。
- 自动测试包含流式不完整片段更新、解析失败回调和本地 Button。
- 触屏滑块目标高度至少 44px，允许纵向页面滚动，窄屏布局不溢出。DSH 移动插件共存、WebKit 和最终真机验收由集成测试覆盖；不能用本包 Chromium 测试代替真机证据。

# OpenUI React 19 渲染岛

## 构建与验证

在仓库根目录运行（Node 24、pnpm 11）：

```sh
flock .locks/pnpm.lock pnpm install
node packages/openui-island/build.mjs
node --test packages/openui-island/test/*.test.mjs
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

## 通用纯函数

通过真实 API `defineFunction({ name, params: z.object(...), returns, fn: ({ ...args }) => result })` 注册；参数顺序就是对象字段顺序。DSL 使用大小写敏感的小写名称，例如 `@round(1.005, 2)`、`@pmt(0.01, 12, 1200)`、`@percent(0.125, 1)`。函数签名和描述自动进入 skill，不加载 actions/query/edit/表单校验/preview/react-ui。复杂 UI 可先调用插件提供的 `openui_check` 做静态校验，不自动修复或重发。

| 类别 | 函数 | 约定 |
|---|---|---|
| 数学 | round、floor、ceil、abs、min、max、clamp、pow、sqrt、log、exp | min/max 接受非空数值列表；clamp(x, lower, upper) 要求 lower≤upper；log 为自然对数；sqrt 只接受非负数。 |
| 统计 | sum、mean、median、count | sum/count 空列表为 0；mean/median 必须非空；median 不修改输入。count 可统计任意类型列表。 |
| 金融 | pmt(rate, n, pv)、fv(rate, n, payment, pv=0)、npv(rate, cashflows) | 利率为每期比例且 >-1；n 为整数（pmt>0，fv≥0）；期末付款；正本金对应负付款。npv 第一笔发生在 t=1，t=0 初始支出需另加。支持零利率。 |
| 格式 | fixed、percent、thousands | fixed/percent 的 digits 默认为 2，范围 0–15；四舍五入中点远离 0；percent 接收比例；thousands 用固定 en-US 分组符且最多 15 位小数。 |

每个函数执行前都用 Zod 校验参数，数值输出必须有限；错误直接抛出并由 OpenUI 运行时转成 `runtime-error` 交给 `onError`，不会以 NaN/Infinity 伪装有效结果。示例见 `examples/functions.openui`（利率滑块通过函数链在本地重算付款）。

## 供宿主使用的纯数据 schema

构建同时写出 `dist/library.schema.json`，内容为 `library.toJSONSchema()` 的原样 JSON：组件、函数参数/返回 schema 与描述；没有 React、函数实现或可执行代码。宿主应从纯 `@openuidev/lang-core` 调用 `createParser(schema, "Card")`，读取 `parse(source).meta.errors`。root 名不在此 JSON 内。上游 `validate(value, rules, ...)` 是表单字段规则验证器，不是 DSL 校验器。静态检查不执行函数，不能声称已经验证所有参数域或动态数值结果；错误原生也没有行号，只有 statementId 等定位信息。

## 上游样式补丁

1.0.1 的 RendererRoot 无条件调用 `ensureLoadingStyle()`，会向全局 `document.head` 写入 spinner 样式。仓库通过 `patches/@openuidev__react-lang@1.0.1.patch` 同时修正 ESM/CJS；pnpm 11 将精确版本声明写在根 `pnpm-workspace.yaml` 的 `patchedDependencies`，lockfile 保存补丁哈希。原 `openui-spin` 动画已迁入本岛 ShadowRoot 样式。升级依赖需重新检查此补丁。

`allowBuilds` 只允许 esbuild 必要脚本，不执行 lang-core 的非运行必需 postinstall。构建固定 production，避免上游开发工具自动挂到宿主页。

## 构建体积

组件与 21 项纯函数扩充后独立 ESM 为 **618,589 bytes**，gzip **160,734 bytes**；相对函数加入前的 614,632 / 159,341 bytes，增加 3,957 / 1,393 bytes。Chart 为纯 SVG，函数使用现有 Zod 和 JavaScript 数学/Intl API，没有新增依赖。esbuild metafile 验证 externalImports 为 0；构建脚本每次打印当前体积。

## 验收范围

- 默认 DTI 76.19%、覆盖率 1.80、DECLINE。
- 月供调到 0：DTI 52.38%、REVIEW；估值调到 40：覆盖率 0.60、DECLINE。
- 本地交互 action 回调次数为零；宿主 head 不新增样式；React 为 19.x；卸载清空岛 DOM。
- 自动测试包含流式不完整片段更新、解析失败回调和本地 Button。
- 触屏滑块目标高度至少 44px，允许纵向页面滚动，窄屏布局不溢出。DSH 移动插件共存、WebKit 和最终真机验收由集成测试覆盖；不能用本包 Chromium 测试代替真机证据。

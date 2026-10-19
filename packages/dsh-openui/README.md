# DSH OpenUI 插件

将 assistant 正文中的 `openui-lang` 围栏渲染到独立 Shadow DOM。通过公开会话服务订阅 ChatSnapshot 原始 Markdown，以节点 key 对齐 assistant 正文行，再按围栏 body 与 DOM 代码文本完全相等逐块匹配。重复围栏按顺序匹配；无需修改 DSH，也不要求额外标记。宿主适配层仅使用原生 DOM；React 19 与 OpenUI 在独立 ESM 大包中按需加载，不复用宿主 React。

## 构建与检查

先在仓库根目录完成带锁的依赖安装，再按顺序构建：

```sh
(cd packages/openui-island && node build.mjs)
(cd packages/dsh-openui && node build.mjs)
node --test packages/dsh-openui/tests/*.test.mjs
```

客户端入口是 `dist/client.js`（DSH 模块加载器格式）；宿主入口 `dist/index.js` 用 `webServer.register` 提供同源 `/dsh-openui/island.js`。该资源从渲染岛产物复制而来，必须通过构建生成，不手工编辑。

渲染岛完成首次可渲染提交后隐藏原始代码块；加载、解析或 React 渲染失败则恢复原文，并在原代码块上方显示可读错误及建议。可定位时展示语句起始行，其他错误明确显示位置未知，不伪造精确偏移。提示样式也只注入自己的 ShadowRoot。会话切换移除代码块时卸载岛；插件释放时清理观察者、定时器和自有节点。静态资源 URL 固定，不包含会话数据或鉴权凭据。

静态岛脚本与 DSH 客户端插件脚本一样公开提供，不由 webServer 自动鉴权；不得在产物中包含秘密。URL 相对 document.baseURI 解析，以支持路径前缀部署。

宿主常驻提示词仅说明何时值得生成 UI、用前加载 skill `openui` 与本地计算约束；完整组件说明和示例按需通过该 skill 加载。Skill 随 tarball 的 `dist/openui-skill.md` 一起交付，注册时标注 `bundled` 来源和实际文件路径，无需另装用户目录 skill。所有交互均为本地计算，不接 Agent 动作回传。

宿主注册 `openui_check({ source })`，以与渲染岛相同的 JSON Schema 检查完整围栏正文，返回 `ok` 与结构化错误。校验器仅内联 React-free `@openuidev/lang-core`，不加载 React、不执行自定义函数实现；因此静态检查通过不代表运行时数值域或交互一定有效。不自动修复、重发或调用 Agent。

触摸或鼠标按下岛内控件时，焦点转给实际控件（不取消原生事件），避免滑块交互仍保留聊天输入框焦点。主题通过公开 theme 服务实时跟随宿主；状态通过 sessionStorage 保存，键由会话 id、ChatSnapshot node.key 与行内代码块序号组成。切回会话恢复滑块值；刷新页面清空本插件状态并恢复 DSL 默认值。

错误与校验工具验收：`flock .locks/demo.lock node scripts/browser-test.mjs tests/browser/openui-errors.spec.ts --grep "invalid OpenUI"`；工具回合须显式启用假 provider 的双输入探针：`DSH_FIXTURE_CHECK_SOURCES=dev/fixture/check-sources.json flock .locks/demo.lock node scripts/browser-test.mjs tests/browser/openui-errors.spec.ts --grep openui_check`。PTC 路径额外设置 `DSH_FIXTURE_CHECK_MODE=ptc` 并筛选 `--grep "PTC SDK"`，在 UI 中选择 PTC mode，断言 SDK 含 openui_check 且 run_code 实际执行该工具。默认假 provider 不调用工具，探针也不自动修复或追加校验回合。

隔离 demo 通过仓库 `scripts/demo.mjs --plugin --reply dev/fixture/loan-reply.md` 启动；端到端检查使用 `flock .locks/demo.lock node scripts/browser-test.mjs tests/browser/openui-plugin.spec.ts`。禁止接触日用 Host 与用户主目录配置。

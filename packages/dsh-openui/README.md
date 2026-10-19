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

渲染岛完成首次可渲染提交后隐藏原始代码块；加载、解析或 React 渲染失败则恢复原文。会话切换移除代码块时卸载岛；插件释放时清理观察者、定时器和自有节点。静态资源 URL 固定，不包含会话数据或鉴权凭据。

静态岛脚本与 DSH 客户端插件脚本一样公开提供，不由 webServer 自动鉴权；不得在产物中包含秘密。URL 相对 document.baseURI 解析，以支持路径前缀部署。

宿主常驻提示词仅说明何时值得生成 UI、用前加载 skill `openui` 与本地计算约束；完整组件说明和示例按需通过该 skill 加载。所有交互均为本地计算，不接 Agent 动作回传。

主题通过公开 theme 服务实时跟随宿主；状态通过 sessionStorage 保存，键由会话 id、ChatSnapshot node.key 与行内代码块序号组成。切回会话恢复滑块值；刷新页面清空本插件状态并恢复 DSL 默认值。

隔离 demo 通过仓库 `scripts/demo.mjs --plugin --reply dev/fixture/loan-reply.md` 启动；端到端检查使用 `flock .locks/demo.lock node scripts/browser-test.mjs tests/browser/openui-plugin.spec.ts`。禁止接触日用 Host 与用户主目录配置。

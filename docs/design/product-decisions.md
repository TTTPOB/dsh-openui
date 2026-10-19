# 产品决策（用户确认，2026-10-19）

| # | 决策 | 含义 |
|---|---|---|
| 1 | **由模型判断何时出 UI**（auto） | 插件通过 `systemPrompt.section` 常驻注入"按任务收益触发 UI"的策略与 OpenUI 组件说明；代码、命令、日志、diff、故障排查仍用纯文本。提示词要精简，因为每次请求都会带上。需要真实模型评测"该出时出、不该出时不出"和 DSL 正确率。 |
| 1a | **组件说明用 skill 按需加载** | 常驻提示词只放极短的一段（几行）：说明可以用 `openui-lang` 代码块生成交互 UI、何时值得用、用前必须先加载 skill `openui`。完整语法、组件目录、示例放进插件通过 Skills Provider 注册的 skill。代价：出 UI 时多一次 skill 加载回合；风险：模型不去加载导致少出 UI，由真实模型评测确认。 |
| 2 | **第一版只做本地计算** | 不实现 UI 动作回传 Agent（不调用 `conversation.send`）。`onAction` 接口保留但第一版不接线；组件目录里不放会让人以为能触发外部操作的按钮。 |
| 4 | **不与特定模型能力绑定** | 提示词、skill、降级逻辑面向通用能力编写，不针对某个模型调参。评测覆盖当前可用的多个模型（至少 deepseek-official 与 klaude-openai 各一个），用于发现共性问题，不作为只服务某一模型的优化目标。 |
| 5 | **主题跟随 DSH 亮色/深色** | 岛从宿主读取当前主题（以宿主根元素的主题标记/CSS 变量为准），主题切换时实时更新，不另设开关。 |
| 6 | **交互状态存 sessionStorage** | 键 = 会话 id + 消息稳定身份（如 `data-chat-node-key`）+ 代码块序号；切换会话再回来保持滑块值，刷新页面恢复默认。 |
| 7 | **OpenUI 功能范围** | 额外启用：`defineFunction` 通用函数库；DSL 校验（客户端错误提示 + 宿主工具 `openui_check`，无自动修复回合）。明确不做：actions、query/ToolProvider/MCP、editMode、表单校验、preview renderer、`@openuidev/react-ui`。 |
| 3 | **移动端纳入第一版验收，需真机** | 必须与 `dsh-web-mobile@3.3.0` 共存：tooltip 不被 `[data-phase] [role=tooltip]` 隐藏、滑块在 `touch-action` 下可横向拖动、触控目标尺寸足够、窄屏不溢出。自动化覆盖 390×844 触屏 + WebKit；最终由用户在手机上验收，手机通过 cloudflared 临时隧道访问隔离 demo。 |

# 当前状态（交付汇总）

## 已完成
- 纯树外 DSH 插件 `packages/dsh-openui`：从会话快照的原始 Markdown 识别 `openui-lang` 代码块，挂载 React 19 渲染岛（Shadow DOM），不改 DSH fork，不要求模型输出额外标记。
- 渲染岛 `packages/openui-island`：组件 Text/Stack/Card/Slider/Button/Metric/Grid/Row/Table/Chart；OpenUI 内置函数 + 8 个通用扩展（clamp/pow/sqrt/log/exp/median/fixed/thousands）；主题跟随 DSH 亮/暗；滑块值存 sessionStorage（切会话保留，刷新恢复）。
- 提示词：常驻几行说明 + skill `openui` 按需加载完整语法；由模型判断何时出 UI。
- 校验：渲染出错时在代码块上方显示错误（语句起始行、原因、建议），原文完整可见；宿主工具 `openui_check`（native 与 PTC 均可用），无自动修复回合。
- 体积：插件客户端约 7 KB；渲染岛约 617 KB（gzip 约 160 KB），首次遇到 UI 代码块时才加载。

## 验证（假 provider，隔离 Host）
| 命令 | 结果 |
|---|---|
| `node --test packages/openui-island/test/*.test.mjs` | 18/18 |
| `node --test packages/dsh-openui/tests/*.test.mjs` | 13/13 |
| `node scripts/browser-test.mjs tests/browser/openui-plugin.spec.ts` | 3/3（渲染、本地重算、无模型请求、React 19、重复代码块独立状态、主题、刷新、卸载、懒加载失败降级） |
| `node scripts/browser-test.mjs tests/browser/openui-errors.spec.ts` | 错误提示、`openui_check` native、PTC 均通过 |
| `node scripts/browser-test.mjs tests/browser/mobile-openui.spec.ts` | 与 dsh-web-mobile@3.3.0 共存，390×844，Chromium + WebKit 2/2 |

浏览器测试用 `flock .locks/demo.lock` 包裹；独立 Home 用 `DSH_DEMO_HOME=<目录>`，无需锁。连续两轮全量 16 例通过。

证据：[桌面截图](evidence/openui-plugin-local.png)、[视觉（暗）](evidence/island-visual-dark.png)、[移动端](evidence/mobile.md)、[真机检查清单](mobile-device-checklist.md)。

## 未验证 / 已知局限
- 真机手指拖动、iOS Safari、软键盘：需要用户按[检查清单](mobile-device-checklist.md)验收。
- 真实模型表现：评测已按用户决定取消；脚手架保留在 `scripts/eval/`。
- `openui_check` 只检查语法与组件用法，不保证运行时数值正确；部分错误无行号。
- 柱状图柱子上没有数值标签（小问题，未改）。
- 尚未安装到日用环境；未建 GitHub 仓库、未发 Release。

## 手动试用
```sh
flock .locks/demo.lock node scripts/demo.mjs --home .demo-home/manual --plugin --mobile           # 本机，http://127.0.0.1:54180
flock .locks/demo.lock node scripts/demo.mjs --home .demo-home/manual --plugin --mobile --tunnel  # 手机，打印公网 URL
```
默认模型是假 provider（回复 `--reply` 指定的文件，默认 `dev/fixture/reply.md`）；`--mobile` 同时安装 dsh-web-mobile。

## 下一步（需用户授权）
1. 真机验收。
2. 建 `TTTPOB/dsh-openui` 仓库并发 Release。
3. 把精确 Release URL 写入 dsh-config 依赖清单，按 dsh-config 流程预览、apply。

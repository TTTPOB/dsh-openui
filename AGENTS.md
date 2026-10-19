# dsh-openui 项目规范

本仓库为 DSH Web UI 开发 OpenUI 插件：assistant 消息正文中的 `openui-lang` 代码块被渲染为可交互组件（独立 React 19 渲染岛 + Shadow DOM）。
背景与决策见 [docs/intelligent-ui-plugin-summary.md](docs/intelligent-ui-plugin-summary.md)；**用户已确认的产品决策见 [docs/design/product-decisions.md](docs/design/product-decisions.md)，与其他文档冲突时以它为准**；测试 mock 参考见 [docs/mobile-workbench-mock-survey.md](docs/mobile-workbench-mock-survey.md)。

## 目标环境

- DSH `0.2.1-rc.1`（全局安装的 `dsh`），宿主 React 18。Node 24，pnpm（沿用本机版本）。
- DSH 源码参考：`.scratch/deepseek-harness`（`TTTPOB/deepseek-harness` 的 `daily-driver` 分支浅克隆）。用户日用环境由此部署，以它为准；不需要核对本机安装是否与源码一致，查不到时再读安装产物。
- 代码注释用英文；文档用中文。

## 目录与归属

| 路径 | 内容 |
|---|---|
| `packages/openui-island/` | 自带 React 19 + `@openuidev/react-lang` 的渲染岛：组件目录、`mount()` API、独立构建 |
| `packages/dsh-openui/` | DSH 插件包：客户端发现 `openui-lang` 代码块并挂载渲染岛；之后加入宿主侧提示词注入 |
| `dev/fixture/` | 假 LLM provider（参考 dsh-mobile-workbench `dev/fixture`），按 `replyFile` 回复，记录调用次数 |
| `scripts/` | 隔离 demo Host 启动器等 |
| `tests/browser/` | Playwright 端到端测试 |
| `docs/` | 设计与调研文档 |
| `.scratch/` | 只读参考 clone（如 `.scratch/dsh-mobile-workbench`），不修改、不提交 |

## 硬性约束

1. **不碰日用环境**：不读写 `~/.dsh`，不连接、不重启 `127.0.0.1:53083` 的日用 Host。所有 Host 都用独立 `DSH_HOME`（`.demo-home/` 或测试自建目录）和 `127.0.0.1`。
2. **客户端 bundle 不得从宿主取 React**：插件浏览器端产物不能出现对 `react`、`react-dom`、`react/jsx-runtime` 的宿主 `require`；React 19 与 OpenUI 全部内联进自己的产物。插件宿主侧（DOM 发现、挂载）只用原生 DOM API。
3. **样式隔离**：渲染岛样式只注入到自己的 ShadowRoot（`<style>` 或 `adoptedStyleSheets`），不写 `document.head`。
4. **渲染失败可降级**：岛渲染失败时，原始代码块文本仍完整可见。
5. **不用真实模型做测试**：端到端测试只用 `dev/fixture` 的假 provider。
6. 不改 `.scratch/` 下的参考仓库；需要其代码时复制到本仓库再改。

## 共享资源与锁

多个 agent 共用同一工作区。占用以下资源前用 `flock` 加锁（锁文件在 `.locks/`，已被 git 忽略）：

| 资源 | 命令前缀 |
|---|---|
| 根目录 `pnpm install` / 改根 lockfile | `flock .locks/pnpm.lock pnpm install` |
| demo Host（`.demo-home`、其端口）与依赖它的浏览器测试 | `flock .locks/demo.lock <command>` |
| git 提交 | `flock .locks/git.lock git commit ...` |

- 全局 DSH 内含 fork 包会被兼容检查禁用。隔离 Host 用官方 CLI 对**该隔离 DSH_HOME** 授予精确版本豁免：`DSH_HOME=<隔离目录> dsh plugin --profile web allow-version <name@exact-version> --dsh-version 0.2.1-rc.1 --accept-risk`。版本从启动日志提取，不用通配，不调用内部 boot API，不作用于 `~/.dsh`。
- demo Host 默认端口 `54180`；自建测试 Host 用 `port 0` 随机端口。
- 只提交自己负责路径下的文件：`git add <自己的路径>`，不要 `git add -A`。
- 提交信息用 Conventional Commits，如 `feat(island): add mount api`。

## 团队协作

- 跨包接口（如 `mount()` 签名、全局变量名、构建产物路径）变更时，直接 `send_message` 给相关 worker 协商，并把结论写进 [docs/design/interfaces.md](docs/design/interfaces.md)。
- 只在以下情况联系 lead：任务完成、需要设计决策、遇到无法内部解决的阻塞。其他协调在 worker 之间直接完成。
- 结论要带证据：命令、退出码、测试输出或截图路径。未验证的写“未验证”。

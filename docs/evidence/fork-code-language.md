# 代码块语言属性 fork：本地暂停记录

## 状态

**已按 lead 最新指示暂停，未部署、未 push、未开 PR。** 用户倾向纯树外插件方案，因此本分支仅保留为备选，不表示需要 fork 才能完成 OpenUI。

- 独立完整 clone：[deepseek-harness-openui](</home/tpob/playground/dsh/deepseek-harness-openui>)。没有修改 `.scratch/`、日用 DSH_HOME 或连接 53083。
- 基线：`daily-driver` 的 `19fa1b11ae`；本地分支：`feat/code-language-attr`。
- 本地提交：`8fa2b55947 feat(ui-primitives): expose code block language attributes`。
- tarball：[deepseek-ai-dsh-web-frontend-0.2.1-rc.1.tgz](</home/tpob/playground/dsh/deepseek-harness-openui/dist/openui/deepseek-ai-dsh-web-frontend-0.2.1-rc.1.tgz>)。仅供本地验证，不是正式 Release；版本未提升。

## Diff 摘要

仅改 `packages/client/ui-primitives`，4 文件、23 行新增、5 行删除：

1. [CodeBlock.tsx](</home/tpob/playground/dsh/deepseek-harness-openui/packages/client/ui-primitives/src/markdown/CodeBlock.tsx#L188-L191>)：根 `div.md-code-block` 加 `data-code-language={lang}`。未知语言保留，无语言省略属性；不是基于高亮器识别结果。
2. [render.tsx](</home/tpob/playground/dsh/deepseek-harness-openui/packages/client/ui-primitives/src/markdown/render.tsx#L375-L387>)：空围栏 `pre` 也带属性；采用 mdast 已拆出的 infostring 首词，去掉旧的 `^[\w-]+` 截断，避免含点/加号的未知语言丢失。
3. [markdown.client.spec.tsx](</home/tpob/playground/dsh/deepseek-harness-openui/packages/client/ui-primitives/tests/markdown.client.spec.tsx>)：添加已结束/流式 × 空/非空 × 已知/未知（含标点）语言测试；无语言块不带属性；更新一条原有空块 outerHTML 断言。
4. [README.md](</home/tpob/playground/dsh/deepseek-harness-openui/packages/client/ui-primitives/README.md>)：记录 DOM 属性语义。

## 验证命令与结果

以下命令均在独立 fork 根目录运行。构建日志保存在该 clone 的 `.locks/` 下（未提交）。

| 命令/阶段 | 退出码与结果 |
|---|---|
| `git clone https://github.com/TTTPOB/deepseek-harness.git -b daily-driver /home/tpob/playground/dsh/deepseek-harness-openui`；`git switch -c feat/code-language-attr` | 0，完整 clone 与分支建立 |
| `flock .locks/pnpm.lock pnpm --filter @deepseek-ai/dsh-web-frontend... --filter @deepseek-ai/dsh-root install --frozen-lockfile` | 0，pnpm 11.28.5 |
| `flock .locks/pnpm.lock pnpm --filter @deepseek-ai/dsh-typert-generator... install --frozen-lockfile` | 0，补齐生成器开发依赖 |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec vitest run --maxWorkers=2 packages/client/ui-primitives/tests/markdown.client.spec.tsx packages/client/ui-primitives/tests/code-block.client.spec.tsx packages/client/ui-primitives/tests/streaming-code-block.client.spec.tsx` | 最终 0，3 文件 79 测试通过（首次 1，原有 outerHTML 断言需包含新增属性，修正后通过） |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc -b packages/client/web/tsconfig.json` | 0，静态 shell 类型闭包编译 |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc -b packages/typert/generator/tsconfig.json` | 最终 0；首次缺 `@jridgewell/gen-mapping`，补安装后通过 |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsdown --config-loader native -F @deepseek-ai/dsh-client-web -F @deepseek-ai/dsh-client-ui-primitives -F @deepseek-ai/dsh-client-ui-dockkit -F @deepseek-ai/dsh-client-store -F @deepseek-ai/dsh-client-ui-slots --env.DSH_BUILD_FACE client` | 0 |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc -b packages/experimental/webworker-runtime/tsconfig.json` | 0 |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsdown --config-loader native -F @deepseek-ai/dsh-experimental-webworker-runtime -F @deepseek-ai/cordis -F @deepseek-ai/cordis-plugin-loader -F @deepseek-ai/cordis-plugin-group -F @deepseek-ai/cosmokit -F @deepseek-ai/schemastery --env.DSH_BUILD_FACE host` | 0，补齐 Vite preview 构建输入（preview 不进入发布 tarball） |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc -b packages/client/ui-theme/tsconfig.json`；`NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsdown --config-loader native -F @deepseek-ai/dsh-client-ui-theme --env.DSH_BUILD_FACE client` | 均 0，生成字体/主题样式 |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsdown --config-loader native -F @deepseek-ai/dsh-util-workspace-path -F @deepseek-ai/dsh-util-code-language --env.DSH_BUILD_FACE host` | 0，补齐静态工具库 |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @deepseek-ai/dsh-web-frontend run build` | 最终 0；前次依次缺 worker、theme、workspace-path 构建产物，补齐后成功 |
| `pnpm --dir apps/web pack --pack-destination ../../dist/openui` | 0，产出上述 tarball |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec vitest run --maxWorkers=2 packages/client/ui-primitives/tests` | **1：64 文件中 63 通过；1364 测试通过，5 条旧 DOM 快照不匹配**，见下一节 |
| `git diff --check`；路径限定 `flock .locks/git.lock git commit ... -- packages/client/ui-primitives/...` | 0；pre-commit lint 0 警告/错误，空白检查通过 |

另有两次构建试探失败：初次 `tsdown --workspace packages/client` 缺生成器产物；`-F "@deepseek-ai/dsh-util-*"` 未选到有效配置，改精确名称后成功。未运行全仓库 test:gui、build:check、浏览器 snapshot/e2e，不把局部检查等同于全仓通过。

## 未完成项和卡点

- **全量基元单测未绿**：`markdown-dom-parity.client.spec.tsx` 的 `settled/streaming: code-fences`、`settled/streaming: fence-trailing-blank-lines`、`streaming: math-edge-cases` 共 5 条快照仍是旧 DOM；新增属性导致预期差异。lead 要求暂停后未刷新这些快照。若恢复该方案，先人工审阅差异并更新 owner-local 快照，再跑测试。完整失败日志：[primitives-tests.log](</home/tpob/playground/dsh/deepseek-harness-openui/.locks/primitives-tests.log>)。
- **真实页面未验证**：没有 Host 启动、DOM 导出或截图，不能声称 demo 已带该属性。
- 实际受影响的可部署包是 `@deepseek-ai/dsh-web-frontend`，因为 ui-primitives 静态链接到 shell；`dsh-host-frontend-static` 只负责服务它，不必改服务端包。
- w-harness 已增加 `scripts/demo.mjs --frontend <index路径>`，可将 tarball 解包到隔离 home 并通过 `frontend-static.config.distIndex` 指向新 `dist/index.html`。这一集成入口仅语法检查，尚未用于此 tarball。恢复时仍必须持有 `.locks/demo.lock`，使用独立 home、`--port 0`；不修改或连接日用环境。
- 已通知 w-plugin：不得假定该属性在当前 demo 已上线。

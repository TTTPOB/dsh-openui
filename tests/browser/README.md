# 隔离浏览器测试

1. 安装依赖与浏览器：

```sh
mkdir -p .locks
flock .locks/pnpm.lock pnpm install
node node_modules/@playwright/test/cli.js install chromium
```

2. 第 0 步（全程持锁，自动起随机端口 Host、测试、停止）：

```sh
pnpm test:browser
```

3. 插件测试（先构建 island 和插件）：

```sh
pnpm test:browser tests/browser/openui-plugin.spec.ts
```

## 手动演示

```sh
flock .locks/demo.lock node scripts/demo.mjs --port 54180 --plugin --reply dev/fixture/loan-reply.md
```

浏览器打开仓库内 `.demo-home/url.txt` 中的认证 URL；URL 含 token，不要共享。Ctrl-C 清理 Host。

## 测试占用规则

- 自动 runner 全程持有 `.locks/demo.lock`，不要同时启动第二个 demo。
- 手动 Host 已持有锁时，测试直接执行 `node node_modules/@playwright/test/cli.js test <spec>`，不要嵌套加锁。
- `DSH_BROWSER_URL` 可覆盖认证 URL，helpers 强制仅接收 127.0.0.1 且拒绝 53083。
- `DSH_DEMO_HOME` 可覆盖 helpers 的 callsFile/workspace 路径，必须与 Host `--home` 一致。
- 隔离 profile 首启会探测 fork 兼容性，使用官方 CLI 授予日志中的精确版本豁免并打印风险，不读取或修改日用 Home。

## Helpers

`tests/browser/helpers/demo.ts` 导出 `openDemo`、`fixtureSession`、`sendPrompt`、`waitForReply`、`readCalls`；所有会话创建和提示词发送通过真实宿主 UI。完成标记是 `OPENUI_FIXTURE_COMPLETE`；`readCalls()` 按 JSONL 行解析本地 provider stream 调用。

第 0 步导出 `docs/evidence/step0-fence-dom.md` 和同名 PNG，使用不加载插件的最小合法 Card/Text 示例；完整贷款示例为 `dev/fixture/loan-reply.md`。

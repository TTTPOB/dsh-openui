# 本地文本 provider

`openui-fixture` provider 和同名模型通过 DSH 官方 LLM registry 注册，不访问网络；默认不执行工具。显式配置 checkSources 时才发起本地 openui_check 工具探针。

```sh
pnpm test:fixture
```

构建通过 Node 24 stripTypeScriptTypes，并从已安装 DSH 解析公开共享 peer，不需要相邻 dsh-config，也不读取日用 DSH_HOME。可用 `OPENUI_FIXTURE_RUNTIME` 显式指定已安装 DSH 包目录。

配置：

- `replyFile`：绝对路径，每次 stream 重新读取 Markdown 全文。
- `callsFile`：绝对路径，每次 stream 追加一条 JSONL，含时间、sessionId、purpose（可选字段不存在时省略）。
- `checkSources`（可选）：字符串数组。当前用户 turn 首次 stream 发出逐项 openui_check({source})；收到该 turn 的工具结果后恢复文本回复，不自动修复或重发。默认未配置，所有既有无工具测试行为不变。
- `paceMs`：每 72 字符分片的间隔，默认 20ms，smoke 设为 0。

工具探针的 demo CLI 为 `--check-sources dev/fixture/check-sources.json`（文件必须是 JSON 字符串数组）。自动 runner 可用 `DSH_FIXTURE_CHECK_SOURCES=dev/fixture/check-sources.json` 传入。每个正常校验 turn 会发生两次 provider stream：工具调用、收到结果后的文本回复；callsFile 因此增加 2，不是 1。

示例回复：`reply.md` 是第0步最小合法围栏，`loan-reply.md` 是三滑块贷款模拟器。启动器默认前者，插件测试自动 runner 使用后者。

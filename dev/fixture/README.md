# 本地文本 provider

`openui-fixture` provider 和同名模型通过 DSH 官方 LLM registry 注册，不访问网络、不执行工具。

```sh
pnpm test:fixture
```

构建通过 Node 24 stripTypeScriptTypes，并从已安装 DSH 解析公开共享 peer，不需要相邻 dsh-config，也不读取日用 DSH_HOME。可用 `OPENUI_FIXTURE_RUNTIME` 显式指定已安装 DSH 包目录。

配置：

- `replyFile`：绝对路径，每次 stream 重新读取 Markdown 全文。
- `callsFile`：绝对路径，每次 stream 追加一条 JSONL，含时间、sessionId、purpose（可选字段不存在时省略）。
- `paceMs`：每 72 字符分片的间隔，默认 20ms，smoke 设为 0。

示例回复：`reply.md` 是第0步最小合法围栏，`loan-reply.md` 是三滑块贷款模拟器。启动器默认前者，插件测试自动 runner 使用后者。

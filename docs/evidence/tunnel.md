# 隔离 quick tunnel 验证

日期：2026-10-19。使用仓库内 `.tools/cloudflared`（不提交），版本 `2026.10.1`。未访问日用 Host 或日用 Home。

## 可复现命令

```sh
mkdir -p .tools
gh release download -R cloudflare/cloudflared -p cloudflared-linux-amd64 -O .tools/cloudflared
chmod +x .tools/cloudflared
.tools/cloudflared --version
flock .locks/demo.lock node scripts/demo.mjs --home .demo-home/tunnel --port 54180 --tunnel
# In another terminal, curl the token-bearing URL from .demo-home/tunnel/public-url.txt.
curl --max-time 30 --silent --show-error --output /dev/null --write-out "public HTTP %{http_code}\n" "<authenticated public URL>"
# Stop the launcher with Ctrl-C. It owns both Host and cloudflared.
```

## 结果

- Release 下载、chmod、版本检查：退出码 0，`cloudflared version 2026.10.1`。
- 启动日志：HTTP/2 registered tunnel connection，隔离 Host 仅监听 `127.0.0.1:54180`，公网 hostname 自动加入 trusted-host。
- 公网 curl：退出码 0，`public HTTP 303`（认证 token 换 cookie 的重定向）。未把 token 写进此文档。
- 验证后停止后台 job；隔离端口探针返回 `ECONNREFUSED`，未保留运行中的公网隧道。
- `node --test scripts/tests/demo-processes.test.mjs`：退出码 0，2/2 pass；覆盖 patchFiles 传递、URL 写入、trusted origin、Host/cloudflared 联合停止。

公网 smoke 不等于移动端 UI 验收：与 dsh-web-mobile 共存、触控拖动、WebKit 及真人手机测试另行记录。

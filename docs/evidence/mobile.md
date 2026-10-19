# 移动端共存自动化证据

2026-10-19：隔离 Host 同时安装 `dsh-openui` 与 GitHub Release `dsh-web-mobile@3.3.0`，390×844、isMobile=true、hasTouch=true。仅使用 openui-fixture，没有真实模型调用。

## 结论

| 检查 | Chromium | WebKit |
|---|---|---|
| 手机三页底栏存在、3 个滑块可用 | 通过 | 通过 |
| 默认 DTI 76.19%、覆盖率 1.80、DECLINE | 通过 | 通过 |
| 月供调到 0 后 DTI 52.38%、REVIEW | 真实 CDP 触摸拖动通过 | 触摸点击 + 可信鼠标拖动通过 |
| 交互不增加 provider 请求 | +1 仅初次提示词 | +1 仅初次提示词 |
| 滑块命中框 ≥40px | 290×44px | 285×44px |
| 滑块 touch-action | pan-y | pan-y |
| 文档无横向溢出 | 390/390px | 390/390px |
| ShadowRoot tooltip 样式隔离探针 | block、visible、24px | block、visible、24px |
| Invalid hook call / React / OpenUI 异常 | 无 | 无 |

**不能把自动化通过当成真机验收完成。** Playwright WebKit 没有受信任 touch-drag API，所以 WebKit 的物理手指拖动仍须手机实测。当前组件目录没有真正的 tooltip 组件；此处在实际岛的 ShadowRoot 中注入临时 `role=tooltip` 探针，验证祖先确实位于 `[data-phase]` 内时仍不受手机插件的全局隐藏规则影响，不声称已验证真实 tooltip 的打开/关闭交互。

## 新版样式复验

本页截图与度量已更新为 task-8 的正式岛产物（614632 bytes）：自绘 4px 轨道、16px 拇指，仍保持原生 type=range 语义和 44px 命中高度、pan-y。复验仍为双引擎全通过；未把此前旧外观截图作为新外观证据。

## 命令与输出

```sh
flock .locks/demo.lock node scripts/browser-test.mjs tests/browser/mobile-openui.spec.ts
```

退出码 **0**：

```text
mobile coexistence: chromium (5.7s)
mobile coexistence: webkit (7.6s)
2 passed (13.9s)
```

runner 自动使用 `.demo-home/mobile`、port 0、安装固定 3.3.0 Release URL、复制贷款回复至隔离 Home 的可写副本；测试后联合清理 Host。日志确认安装 `dsh-web-mobile` 的 3.3.0 tgz 与 `dsh-openui` link。

## WebKit 的本机缺库处理

浏览器下载命令 `node node_modules/@playwright/test/cli.js install webkit` 退出码 0，但首次启动提示缺少 6 个共享库。未修改系统；把 Debian 包解到被忽略的 `.tools/webkit-deps`：

```sh
mkdir -p .tools/webkit-deps
(cd .tools && apt-get download libgstreamer-plugins-bad1.0-0 libharfbuzz-icu0 libmanette-0.2-0 libenchant-2-2 libhyphen0 libhidapi-hidraw0)
for package in .tools/*.deb; do dpkg-deb -x "$package" .tools/webkit-deps; done
```

Playwright 自带的 Linux MiniBrowser shell 包装器会覆盖 LD_LIBRARY_PATH。测试在本地库存在时用 `scripts/webkit-launch.mjs`，保留 bundled lib/sys/lib 加仓库本地库，并透传 inspector FD 3/4；不编辑 Playwright 安装产物。该包装器独立页面启动检查退出码 0，输出 `webkit launch PASS`。已有系统依赖的机器及非 Linux 使用默认 Playwright 启动路径。

## 截图与原始测量

- [Chromium 截图](mobile-chromium.png)、[JSON 度量](mobile-chromium.json)。
- [WebKit 截图](mobile-webkit.png)、[JSON 度量](mobile-webkit.json)。
- [quick tunnel 公网 303 与清理证据](tunnel.md)。
- [真人手机检查清单](../mobile-device-checklist.md)。

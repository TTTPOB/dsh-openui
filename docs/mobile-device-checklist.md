# 手机真机验收（尚未执行）

**先让 lead 启动并持续持有下面的隔离实例，再用手机打开其 Public demo URL。** 不用日用 Host，不把带 token 的链接贴到公开渠道。

## 启动

```sh
flock .locks/demo.lock node scripts/demo.mjs --home .demo-home/mobile --port 54180 --plugin --mobile --reply dev/fixture/loan-reply.md --tunnel
```

- 要求 Node 24、已构建 island/plugin，PATH 或 `.tools/cloudflared` 可执行。
- 公网 URL 写入 `.demo-home/mobile/public-url.txt`。每次启动均重新读取，不复用旧 token。
- 在手机 UI 新建会话、选择隔离目录 `.demo-home/mobile/workspace`，模型为 OpenUI Fixture，发送“显示本地贷款模拟器”。
- 默认值应为月供 5、抵押估值 120、折扣率 75；DTI **76.19%**、覆盖率 **1.80**、**DECLINE**。

## iPhone Safari（优先，约 3 分钟）

- [ ] 手指按住滑块圆点，左右连续拖动；月供降到 0 时立即变为 **52.38% / REVIEW**，不用发送新消息。
- [ ] 在滑块处上下滚动页面仍可用；横向拖动不应让整页横移或被滚动手势吞掉。
- [ ] 三条滑块易点到，边缘处可调到最小/最大；不要求精确点中细轨道。
- [ ] 旋转横屏再回竖屏，组件不横向溢出；底部三页切换、顶部标题、输入框无遮挡。
- [ ] 键盘弹出/收起、中文 IME 组字中回车/Escape 不误发消息；输入框仍可见。
- [ ] 刘海/底部 Home 条安全区正常；从 Sessions 返回原会话后保留刚才的本地滑块值。
- [ ] 系统浅/深色切换时岛跟随主题；刷新页面后滑块回到初始默认（当前设计）。

## Android Chrome（约 2 分钟）

- [ ] 重复横向拖动、纵向滚动与窄屏无溢出检查。
- [ ] 键盘开关、中文组字、Android 系统返回不把页面留在不可交互状态。
- [ ] 调参只本地更新；没有出现新的 assistant 回复或持续运行指示。

## 样式与失败降级

- [ ] 当前目录没有真实 tooltip 组件，自动化仅验证 ShadowRoot 的 tooltip 样式隔离探针；未来加入真实 tooltip 时补开关/定位/遮挡真机检查。
- [ ] 若加载失败，原始 openui-lang 围栏完整可读，不能留下空白消息。

## 反馈与停止

记录手机型号、系统/浏览器版本、失败步骤和截图。验收完通知 lead，lead 用 Ctrl-C 停止隔离 Host 与 cloudflared；不留下无人持有的公网链接。自动化 Chromium/WebKit 结果见 [移动端证据](evidence/mobile.md)，它不替代本清单。

# DSH OpenUI

为 DSH assistant 消息中的 `openui-lang` 代码块提供可交互 UI：React 19 独立渲染岛、Shadow DOM 样式隔离、按需加载、宿主提示词与 `openui_check` 工具。所有交互仅做本地计算，失败时保留原始代码。

目标环境：DSH 0.2.1-rc.1、Node 24、pnpm 11.28.5。宿主 React 18 与岛内 React 19 相互独立。

## 开发与验证

```sh
mkdir -p .locks
export NODE_OPTIONS=--max-old-space-size=4096
flock .locks/pnpm.lock pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm pack:release
```

`pnpm build` 先构建岛，再将岛脚本、skill 与 schema 复制进插件；`pnpm test` 运行发布门禁、岛与插件单元测试。浏览器测试需要另行准备隔离 DSH Host，见[插件说明](packages/dsh-openui/README.md)与[交付状态](docs/STATUS.md)，不在 Release CI 中启动真实模型、隧道或日用 Host。

## 版本与 Release

当前包版本为 **0.1.1**，修复随包 skill 缺少来源元数据导致加载失败的问题。维护者审查并合并到 master 后，推送与插件包版本一致的稳定 tag（如 `v0.1.1`），[Release workflow](.github/workflows/release.yml) 自动执行：

1. 严格验证 `vX.Y.Z` 格式和[插件包版本](packages/dsh-openui/package.json)，拒绝已存在的 Release。
2. 用冻结 lockfile 安装依赖，依次 build、test、pack。
3. 解包检查 manifest、运行资源与路径，禁止运行依赖留在包外；离线安装 tarball 到隔离目录，再在禁止解析仓库依赖的 Node 子进程中验证宿主注册、工具调用、正式 SkillRegistry 正文加载与 skill 工具执行、静态资源、客户端工厂与岛 ESM。
4. 创建 GitHub Release 并上传 `dsh-openui-0.1.1.tgz` 与 `SHA256SUMS`；不更新已有 Release、不覆盖资产。已发布版本的修改必须递增版本。

本地 `pnpm pack:release` 只生成并校验 `.artifacts/release/` 中的资产，不上传、不创建 tag；CI 中还会重新核对实际 tag 与打包版本。

## 部署接入

正式资产 URL 格式：

```text
https://github.com/TTTPOB/dsh-openui/releases/download/v0.1.1/dsh-openui-0.1.1.tgz
```

这是**单个自包含插件包**：含 `dist/index.js`、`dist/client.js`、`dist/island.js`、`dist/library.schema.json`、`dist/openui-skill.md` 与 `cordis.patch.yml`。不需要另装 `@dsh-openui/island`、React、OpenUI 或源码 checkout；Node 内置模块与 DSH 注入的服务仍由运行环境提供。

由部署仓库把精确版本的 Release URL 写入 profile 插件依赖，包的 `dsh.bundle.patch` 声明负责贡献配置层；patch 中的插件行为 `id: dsh-openui` / `name: dsh-openui`。维护者按部署仓库的 preview/apply 流程安装，并确认最终 profile 已启用该 bundle 或等效插件行；配置完成后按其流程重启 Host、刷新页面。私有仓库资产下载需由部署工具提供授权。

本仓库只负责构建与发布交付；真实三机安装、profile 变更和部署验收由部署流程执行。

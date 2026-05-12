# Changelog

## [2.0.1] - 2026-05-12

### Added

- **原型发布链接**: `prdkit prototype publish` 支持生成线下预览链接并与云端发布集成
- **PRD 创建集成**: PRD 创建流程中集成 release 机制，支持创建后生成发布链接

### Changed

- 重构 prototype publish 和 prd create 命令，统一 release 流程
- 移除原型创建时自动生成 checkpoint 的逻辑

### Fixed

- antd Drawer 关闭按钮位置错误
- Preview 组件在特定场景下的渲染问题

## [2.0.0] - 2026-05-10

> **Breaking changes**: 重构 CLI 命令结构、云端配置和 viewer 架构。

### Added

- **新的命令结构**: `prdkit prd` 子命令组（create/list/check/checkpoint）和 `prdkit prototype` 子命令组（create/list/publish/mark/checkpoint）
- **云端认证**: `prdkit auth login/logout`，支持 BrowserLoginSession OAuth 流程
- **云端发布**: `prdkit prototype publish --cloud` 发布原型到云端项目
- **PRD 检查点**: `prdkit prd checkpoint` 管理 PRD 文档的版本快照和差异对比
- **PRD 检测**: `prdkit prd check` 定位 PRD 并给出 AI 评审入口
- **预览服务器管理**: `prdkit serve status/stop` 子命令
- **自动更新**: `prdkit update` 检查并安装最新版本
- **设计令牌系统**: viewer 统一颜色系统和语义化 CSS 变量
- **Viewer 多主题**: 亮/暗/高对比度主题支持，antd ConfigProvider 统一主题

### Changed

- **云端配置独立**: 从 `config.json` 的 `cloud` 字段迁移到独立 `.prdkit/cloud.json`
- **Viewer 状态管理**: 引入 hooks 分层架构（data/features/layout/network/ui）和 Zustand store
- **快捷键系统**: 重构 Segmented 交互，修复模式切换冲突
- **MarkPanel**: 折叠/展开、修改绑定按钮、编辑模式清理
- **getProjectStats**: 修复 `resolveCloudInfo` 未传递 `cwd` 的 bug

### Fixed

- Segmented 上下键捕获阶段拦截，避免快捷键冲突
- iframe 内快捷键不响应问题
- WebSocket 热更新断开问题
- FileTree 拖动相关的 bug
- 删除空文件夹时的 404 错误
- 测试中 `resolveCloudHost` 未 await 的问题

### Removed

- 废弃的 `prdkit publish` 和 `prdkit cloud` 命令
- 废弃的 `command-factory`、`decorators`、`list-command`、`subcommand-group` 核心模块
- 废弃的 `cli.ts` 入口文件
- `PRDKIT_CLOUD_HOST` 环境变量支持（替换为 `cloud.json`）

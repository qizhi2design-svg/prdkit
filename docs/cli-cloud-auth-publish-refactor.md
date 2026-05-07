# CLI 云端认证与发布命令重构

## 目标

- 将云端能力收敛为 `prdkit auth` 和 `prdkit prototype publish` 两条主线。
- 删除用户侧 `cloud config/status/link/unlink` 与顶级 `publish` 工作流。
- 默认云端地址改为环境变量 `PRDKIT_CLOUD_HOST`。
- 在 `prdkit info` 和本地 viewer 中展示统一的云端状态。

## 命令迁移

| 旧命令 | 新方式 |
| --- | --- |
| `prdkit cloud login` | `prdkit auth login` |
| `prdkit cloud status` | `prdkit info` |
| `prdkit cloud config` | 设置环境变量 `PRDKIT_CLOUD_HOST` |
| `prdkit cloud link/unlink` | 在本地 viewer 的云端发布面板中选择或创建项目 |
| `prdkit publish` | `prdkit prototype publish` |

## 配置与认证

- 云端 host 不再写入 `.prdkit/config.json`，统一从 `PRDKIT_CLOUD_HOST` 读取。
- `.prdkit/config.json` 中的 `cloud` 字段仅保留发布偏好：
  - `projectId`
  - `projectSlug`
  - `projectName`
  - `lastReleaseId`
  - `lastPublishedAt`
- token 继续存放在 `~/.config/prdkit/auth.json`，按 host 维度隔离。

## 登录时序

1. `prdkit auth login` 在本机启动临时 HTTP 回调地址。
2. CLI 请求 `/api/cli/auth/start`，携带 `callbackUrl`。
3. 浏览器完成登录后，后端重定向到本地回调地址并附带 `code/state/requestId`。
4. CLI 使用 `/api/cli/auth/exchange` 换取长期 `accessToken + refreshToken`。
5. 后续请求仍通过 refresh token 自动续期。

## 发布链路

### CLI

- `prdkit prototype publish`
  - 默认导出本地 publish 产物目录。
  - `--cloud` 时发布到云端。
  - `--project <idOrSlug>` 可显式指定云端项目。

### Viewer

- 云端发布不再依赖 `link`。
- 发布抽屉参考 Axure Cloud 的交互布局：
  - 左侧主表单区先选择发布目标项目。
  - 通过搜索树弹层选择已有项目，或直接新建项目。
  - 下方填写发布说明。
  - 右侧页面区继续勾选要发布的页面。
- 发布成功后将所选项目回写到 `.prdkit/config.json`，作为默认项目。

## 本地 API 约定

- `GET /api/cloud/projects`：读取项目列表。
- `POST /api/cloud/projects`：创建项目。
- `POST /api/publish-cloud`：接收 `projectId/message/entryFiles` 并执行云端发布。
- `GET /api/config`：返回云端登录状态和默认项目。

## 验收点

- `prdkit auth login/logout` 使用新认证链路工作。
- `prdkit info` 输出云端登录状态。
- `prdkit prototype publish` 覆盖本地与云端发布。
- 顶级 `publish` 与 `cloud config/status/login/link/unlink` 仅输出迁移错误。
- viewer 可选择/创建云端项目并完成发布。

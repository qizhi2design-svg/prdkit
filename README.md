<div align="center">

# PRDKit

**AI 时代产品工作新方式 · 为产品人而生**

<img src="./assets/banner.png" alt="PRDKit Banner" width="100%">

<p align="center">
  <a href="https://www.npmjs.com/package/@huangqz/prdkit-cli"><img src="https://img.shields.io/npm/v/@huangqz/prdkit-cli.svg" alt="npm version"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-blue.svg" alt="TypeScript"></a>
  <a href="https://claude.ai"><img src="https://img.shields.io/badge/Claude-CLI-5A67D8.svg" alt="Claude CLI"></a>
</p>

一个专为产品经理设计的 CLI 工具套件，通过 **技能驱动**、**需求闭环**、**开源可用** 三大核心理念，帮助产品团队在 AI 时代实现高效的产品文档管理和原型协作。

[快速开始](#快速开始) · [功能特性](#功能特性) · [命令文档](#命令文档)

</div>

---

## ✨ 功能特性

### 🎯 核心能力

- **⚡ 技能驱动** — 通过 CLI 与 AI Skill 协同，快速完成文档创建、原型管理和需求评审
- **🔄 需求闭环** — 从 PRD 编写、原型设计到标注与版本管理，形成完整的需求管理闭环
- **🌐 开源可用** — 完全开源，支持自定义模板和工作流

### 🚀 五大功能模块

| 功能 | 描述 |
|------|------|
| **PRD 文档管理** | 基于模板快速创建 PRD，支持方案预研、版本检查点和差异对比 |
| **原型管理** | 创建 Web/Mobile/Admin 三类原型，支持标注、版本快照与恢复 |
| **智能标注** | 在原型元素上创建标记，支持选择器定位和描述补充 |
| **版本检查点** | 对 PRD 和原型创建版本快照，支持差异对比、恢复和历史预览 |
| **发布上线** | 发布原型到本地目录或云端项目，支持版本管理和归档 |

## 📦 安装

### 全局安装(推荐)

```bash
npm install -g @huangqz/prdkit-cli
```

或通过 pnpm：

```bash
pnpm add -g @huangqz/prdkit-cli
```

### 本地安装

```bash
npm install @huangqz/prdkit-cli
```

### 系统要求

- Node.js >= 20.0.0

### 验证安装

```bash
prdkit --version
```

## 🚀 快速开始

### 1. 初始化项目

```bash
# 在当前目录初始化产品项目
prdkit init

# 在指定目录初始化
prdkit init my-product

# 非交互式初始化
prdkit init --name "我的产品" --author "张三" --non-interactive
```

初始化后会创建标准化的项目结构：

```
my-product/
├── context/          # 稳定的项目背景信息
│   ├── 01_产品架构/
│   ├── 02_功能模块/
│   ├── 03_上线功能/
│   ├── 04_运营材料/
│   └── 05_会议纪要/
├── draft/           # 临时性内容和探索过程
│   ├── 临时目录/
│   └── 方案探索/
├── workspace/       # 当前正在推进的工作
│   ├── bugs/
│   ├── discussions/
│   ├── prds/
│   └── prototypes/
└── .prdkit/
    └── config.json  # 项目配置文件
```

### 2. 创建 PRD 文档

```bash
# 创建 PRD 文档
prdkit prd create "用户认证功能"

# 从方案预研文档生成正式 PRD
prdkit prd create --from-plan ./draft/方案预研.md

# 指定输出目录
prdkit prd create "用户认证功能" --dir workspace/prds
```

### 3. 创建原型

```bash
# 创建 Web 原型
prdkit prototype create "登录页面"

# 使用指定模板
prdkit prototype create "个人中心" --template mobile

# 创建后台原型
prdkit prototype create "运营后台" --template admin
```

### 4. 启动预览服务器

```bash
# 启动原型预览服务器
prdkit serve

# 指定端口
prdkit serve start -p 8080

# 开发模式(支持热更新)
prdkit serve start --dev
```

## 📖 命令文档

### `prdkit init [target-dir]`

初始化产品项目脚手架。

**选项：**
- `-n, --name <name>` — 项目名称
- `-a, --author <author>` — 作者名称
- `-d, --description <description>` — 项目描述
- `-p, --product-positioning <positioning>` — 产品定位
- `-t, --team-size <size>` — 团队规模
- `-s, --project-stage <stage>` — 项目阶段
- `--non-interactive` — 非交互模式
- `-r, --scaffold-repo <url>` — 自定义 scaffold 仓库
- `-T, --template-repo <url>` — 自定义模板仓库
- `-b, --branch <branch>` — scaffold 仓库分支（默认 main）
- `--cloud-host <url>` — 云服务器地址

**示例：**
```bash
prdkit init my-product --name "我的产品" --author "张三"
prdkit init --name "电商平台" --team-size medium --project-stage early
```

---

### `prdkit prd`

PRD 文档管理命令组。

#### `prdkit prd create [title]`

创建 PRD 文档。

**选项：**
- `-o, --output <file-or-dir>` — 输出文件路径或目录
- `-d, --dir <dir>` — 输出目录
- `-n, --name <project-name>` — 项目名称
- `-a, --author <author>` — 作者
- `-D, --date <yyyy-mm-dd>` — 文档日期
- `-f, --from-plan <file>` — 从方案预研文档生成正式 PRD
- `--non-interactive` — 禁用交互输入

**示例：**
```bash
prdkit prd create "用户认证功能"
prdkit prd create "结算改版" --dir ./workspace/prds
prdkit prd create --from-plan ./draft/支付流程优化-prd-plan.md
```

#### `prdkit prd list`

列出当前项目中的所有 PRD。

**选项：**
- `-j, --json` — JSON 格式输出

```bash
prdkit prd list
prdkit prd list --json
```

#### `prdkit prd check [target]`

定位 PRD 并给出 AI 评审 Skill 的使用入口。

**参数：**
- `[target]` — PRD 标题、文件名或路径（默认选择最近修改的 PRD）

**选项：**
- `-j, --json` — JSON 格式输出

**示例：**
```bash
prdkit prd check
prdkit prd check "支付流程优化"
```

#### `prdkit prd checkpoint`

管理 PRD 文档的版本检查点。

| 子命令 | 描述 |
|--------|------|
| `create [target]` | 创建 PRD 检查点（支持 `-m, --message`） |
| `list [target]` | 列出 PRD 检查点时间线 |
| `show <checkpoint-id>` | 查看单个检查点详情 |
| `diff <from-id> <to-id>` | 对比两个检查点的文本差异 |
| `status [target]` | 查看当前 PRD 与最近检查点的差异状态 |
| `restore <checkpoint-id>` | 恢复到指定检查点（支持 `-f, --force`） |

**示例：**
```bash
prdkit prd checkpoint create "支付流程优化" -m "补充验收标准"
prdkit prd checkpoint list
prdkit prd checkpoint diff checkpoint-a checkpoint-b
```

---

### `prdkit prototype`

原型管理命令组。

#### `prdkit prototype create [title]`

创建原型文档。

**选项：**
- `-t, --template <type>` — 原型模板类型：`web` | `mobile` | `admin`
- `-o, --output <file-or-dir>` — 输出文件路径或目录
- `-d, --dir <dir>` — 输出目录
- `-n, --name <project-name>` — 项目名称
- `-a, --author <author>` — 作者
- `-D, --date <yyyy-mm-dd>` — 文档日期
- `--non-interactive` — 禁用交互输入

**示例：**
```bash
prdkit prototype create "首页原型"
prdkit prototype create "移动首页" --template mobile
prdkit prototype create "运营后台" --template admin
```

#### `prdkit prototype list`

列出当前项目中的所有原型。

**选项：**
- `-j, --json` — JSON 格式输出

```bash
prdkit prototype list
```

#### `prdkit prototype publish`

发布原型到本地目录或云端。

**选项：**
- `-o, --output <dir>` — 输出目录（默认自动生成到 `dist/publish`）
- `-c, --cloud` — 发布到云端
- `-p, --project <idOrSlug>` — 指定云端项目 ID 或 Slug
- `-m, --message <text>` — 版本描述（云端发布）
- `--dry-run` — 云端预检，不实际发布
- `--no-open` — 发布后不自动打开结果页
- `-j, --json` — JSON 格式输出

**示例：**
```bash
prdkit prototype publish
prdkit prototype publish --output ./dist/publish/demo
prdkit prototype publish --cloud --project demo-workspace -m "v1.2 首页改版"
```

#### `prdkit prototype mark`

原型标注管理。

| 子命令 | 描述 |
|--------|------|
| `create` | 创建标注（需 `--prototype`、`--title`，可选 `--desc`、`--selector`） |
| `list` | 列出原型的所有标注 |
| `get <mark-id>` | 查看指定标注详情 |
| `edit <mark-id>` | 编辑标注标题或描述 |
| `delete <mark-id>` | 删除标注 |

**选项（通用）：**
- `-p, --prototype <path>` — 原型路径（必需）

**示例：**
```bash
prdkit prototype mark list --prototype dashboard
prdkit prototype mark create --prototype login --title "密码框提示不清晰" --desc "建议补充错误态文案"
prdkit prototype mark get mark-1777349007244 --prototype dashboard --json
prdkit prototype mark delete mark-1777349007244 --prototype dashboard
```

#### `prdkit prototype checkpoint`

原型版本检查点管理。

| 子命令 | 描述 |
|--------|------|
| `create <prototype-path>` | 创建检查点（支持 `-m, --message`） |
| `list [prototype-path]` | 列出检查点时间线 |
| `show <checkpoint-id>` | 查看单个检查点详情 |
| `diff <from-id> <to-id>` | 对比两个检查点的结构化差异 |
| `status [prototype-path]` | 查看工作区与最近检查点的差异状态 |
| `restore <checkpoint-id>` | 恢复到指定检查点（支持 `-f, --force`） |
| `preview <checkpoint-id>` | 生成检查点的可浏览预览目录（支持 `--open`） |
| `prune [prototype-path]` | 清理超出保留上限的自动检查点 |
| `session start` | 启动手动检查点 session（支持 `-n, --name`） |
| `session status` | 查看当前 session 状态 |
| `session end` | 结束当前 session |

**示例：**
```bash
prdkit prototype checkpoint create dashboard -m "首页导航改版"
prdkit prototype checkpoint list dashboard --json
prdkit prototype checkpoint diff checkpoint-a checkpoint-b
prdkit prototype checkpoint preview checkpoint-a --open
prdkit prototype checkpoint prune
```

---

### `prdkit serve`

原型预览服务器管理。

| 子命令 | 描述 |
|--------|------|
| `start` （默认） | 启动预览服务器 |
| `status` | 查看服务运行状态 |
| `stop` | 停止预览服务 |

#### `prdkit serve start`

启动本地预览服务器。

**选项：**
- `-p, --port <port>` — 端口号（默认自动查找 7788-7888 范围内可用端口）
- `--no-open` — 不自动打开浏览器
- `--dev` — 开发模式（启用 Vite 热更新）

**示例：**
```bash
prdkit serve
prdkit serve start -p 8080 --dev
```

#### `prdkit serve status`

```bash
prdkit serve status
```

显示 PID、端口、模式、运行时长等信息。

#### `prdkit serve stop`

```bash
prdkit serve stop
```

优先优雅退出，超时 3 秒后强制结束进程。

---

### `prdkit doctor`

检查并修复项目问题。

**选项：**
- `-f, --fix` — 自动修复发现的问题

**示例：**
```bash
prdkit doctor
prdkit doctor --fix
```

检查项目：目录结构完整性、配置标准化、标注文件命名规范与 frontmatter 一致性。

---

### `prdkit info`

查看项目信息和内容统计。

**选项：**
- `-j, --json` — JSON 格式输出

```bash
prdkit info
```

显示：项目名称、作者、描述、产品定位、团队规模、PRD 统计（总数 + 按状态）、原型数、讨论数、Bug 数、云端登录状态。

---

### `prdkit auth`

云端认证管理。

#### `prdkit auth login`

```bash
prdkit auth login
```

通过浏览器登录云端服务，登录地址来自项目 `.prdkit/cloud.json` 中的 `host` 配置。

#### `prdkit auth logout`

```bash
prdkit auth logout
```

清除当前云端登录状态。

---

### `prdkit update`

检查并更新 prdkit 到最新版本。

```bash
prdkit update
```

检查 npm 上的最新版本，如果有更新则自动安装。

---

## ⚙️ 配置

项目配置文件位于 `.prdkit/config.json`：

```json
{
  "version": 1,
  "projectName": "我的产品",
  "author": "张三",
  "scaffoldRepo": "git@github.com:qizhi2design-svg/scaffold.git",
  "templateRepo": "git@github.com:qizhi2design-svg/prdkit-tempaltes.git",
  "defaultCreateDirs": {
    "prd": "workspace/prds",
    "prototype": "workspace/prototypes"
  }
}
```

### 配置项说明

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `version` | number | 配置文件版本 |
| `projectName` | string | 项目名称 |
| `author` | string | 作者名称 |
| `scaffoldRepo` | string | Scaffold 仓库地址 |
| `templateRepo` | string | 模板仓库地址 |
| `defaultCreateDirs` | object | 默认创建目录配置 |

## 🎨 模板系统

PRDKit 支持自定义模板，模板文件支持变量替换：

### 可用变量

- `{{title}}` — 文档标题
- `{{projectName}}` — 项目名称
- `{{author}}` — 作者
- `{{date}}` — 文档日期

### 模板结构

模板仓库的 `templates.json` 定义可用模板：

```json
{
  "templates": [
    {
      "id": "prd",
      "name": "PRD 文档",
      "description": "产品需求文档模板",
      "file": "prd.md",
      "output_suggestion": "workspace/prds"
    }
  ]
}
```

## 🤝 贡献指南

我们欢迎所有形式的贡献！

### 贡献方式

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 开发规范

- 遵循 TypeScript 最佳实践
- 编写单元测试
- 更新相关文档
- 保持代码风格一致

### 报告问题

如果发现 bug 或有功能建议，请[创建 Issue](https://github.com/qizhi2design-svg/prdkit/issues)。

## 📄 许可证

本项目采用 MIT 许可证 — 详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- 感谢所有贡献者的付出
- 灵感来源于现代产品管理实践
- 使用了优秀的开源项目：Commander.js, Inquirer, Vite, React
- 特别感谢 [@pmYangKun](https://github.com/pmYangKun) 的 [check-prd-skill](https://github.com/pmYangKun/check-prd-skill) 和 [create-prd-skill](https://github.com/pmYangKun/create-prd-skill) 项目提供的灵感和参考

---

<div align="center">

**PRDKit** — AI 时代产品工作新方式

Made with ❤️ by [purity3](https://github.com/purity3)

</div>

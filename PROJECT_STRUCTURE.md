# PRDKit CLI 项目结构规范

## 目标结构

```
cli/
├── src/
│   ├── cli.ts                    # CLI 入口点（原 index.ts）
│   ├── commands/                 # 命令实现
│   │   ├── checkpoint.ts
│   │   ├── doctor.ts
│   │   ├── info.ts
│   │   ├── init.ts
│   │   ├── mark.ts
│   │   ├── prd.ts
│   │   ├── prototype.ts
│   │   ├── publish.ts
│   │   ├── serve.ts
│   │   └── update.ts
│   ├── core/                     # 核心框架
│   │   ├── command-base.ts
│   │   ├── command-factory.ts
│   │   ├── create-command.ts
│   │   ├── decorators.ts
│   │   ├── list-command.ts
│   │   ├── middleware.ts
│   │   └── subcommand-group.ts
│   ├── lib/                      # 业务逻辑库（原 prototype/）
│   │   ├── checkpoint/           # 检查点功能
│   │   ├── publisher.ts          # 发布功能
│   │   └── server/               # 开发服务器
│   ├── utils/                    # 工具函数
│   │   ├── config.ts             # 配置管理（原 config.ts）
│   │   ├── errors.ts             # 错误定义（原 errors.ts）
│   │   ├── error-handler.ts      # 错误处理（原 error-handler.ts）
│   │   ├── files.ts              # 文件操作（原 files.ts）
│   │   ├── logger.ts             # 日志系统（原 logger.ts）
│   │   ├── port.ts               # 端口工具（原 utils/port.ts）
│   │   ├── scaffold.ts           # 脚手架（原 scaffold.ts）
│   │   ├── system-dialog.ts      # 系统对话框（原 system-dialog.ts）
│   │   ├── templates.ts          # 模板管理（原 templates.ts）
│   │   └── ui.ts                 # UI 工具（原 ui.ts）
│   ├── constants/                # 常量定义
│   │   ├── command-text.ts       # 命令文本（原 command-text.ts）
│   │   └── defaults.ts           # 默认值（原 defaults.ts）
│   └── types/                    # 类型定义
│       └── index.ts              # 类型导出（原 types.ts）
├── test/                         # 测试文件
├── docs/                         # 文档
├── examples/                     # 示例代码
└── templates/                    # 项目模板

## 迁移计划

### 阶段 1：清理未使用的文件
- [ ] 删除 `src/commands-v2/`
- [ ] 删除 `src/commands/prd/`
- [ ] 删除 `src/commands/prototype/`
- [ ] 删除 `src/commands/create-template.ts`（未被使用）

### 阶段 2：重组目录结构
- [ ] 创建 `src/lib/` 目录
- [ ] 移动 `src/prototype/` → `src/lib/`
- [ ] 创建 `src/utils/` 目录
- [ ] 移动工具文件到 `src/utils/`
- [ ] 创建 `src/constants/` 目录
- [ ] 移动常量文件到 `src/constants/`
- [ ] 创建 `src/types/` 目录
- [ ] 移动类型文件到 `src/types/`
- [ ] 重命名 `src/index.ts` → `src/cli.ts`

### 阶段 3：更新导入路径
- [ ] 更新所有文件的 import 语句
- [ ] 更新 package.json 的 bin 入口
- [ ] 更新 tsconfig.json 的路径映射

### 阶段 4：验证
- [ ] 运行类型检查：`pnpm typecheck`
- [ ] 运行构建：`pnpm build`
- [ ] 运行测试：`pnpm test`
- [ ] 手动测试所有命令

## 命名规范

### 文件命名
- 使用 kebab-case：`command-base.ts`、`error-handler.ts`
- 测试文件：`*.test.ts`
- 类型定义：`types.ts` 或 `index.ts`（在 types/ 目录下）

### 目录命名
- 使用 kebab-case：`checkpoint/`、`command-base/`
- 功能模块目录：`commands/`、`core/`、`lib/`、`utils/`

### 导出规范
- 每个目录提供 `index.ts` 统一导出
- 避免深层嵌套导入：`from '@/utils'` 而非 `from '@/utils/logger'`

## 参考项目
- [npm CLI](https://github.com/npm/cli)
- [pnpm](https://github.com/pnpm/pnpm)
- [turbo](https://github.com/vercel/turbo)
- [oclif](https://github.com/oclif/oclif)

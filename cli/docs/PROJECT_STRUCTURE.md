# PRDKit CLI 项目结构规范

## 目录结构

```
cli/
├── src/                      # 源代码
│   ├── commands/            # 命令实现
│   │   ├── init.ts
│   │   ├── prd.ts
│   │   ├── prototype.ts
│   │   ├── mark.ts
│   │   ├── doctor.ts
│   │   ├── serve.ts
│   │   ├── update.ts
│   │   ├── publish.ts
│   │   ├── checkpoint.ts
│   │   ├── info.ts
│   │   └── create-template.ts
│   ├── core/                # 核心架构
│   │   ├── command-base.ts
│   │   ├── command-factory.ts
│   │   ├── list-command.ts
│   │   ├── create-command.ts
│   │   ├── subcommand-group.ts
│   │   ├── middleware.ts
│   │   └── decorators.ts
│   ├── lib/                 # 工具库
│   │   ├── config.ts
│   │   ├── git.ts
│   │   ├── template.ts
│   │   ├── server.ts
│   │   └── ...
│   ├── errors.ts            # 错误定义
│   ├── error-handler.ts     # 错误处理
│   ├── logger.ts            # 日志系统
│   ├── ui.ts                # UI 工具
│   ├── index.ts             # 主入口
│   └── types.ts             # 类型定义
├── test/                    # 测试
│   ├── unit/               # 单元测试
│   ├── integration/        # 集成测试
│   └── e2e/                # 端到端测试
├── docs/                    # 文档
│   ├── error-handling-guide.md
│   ├── logger-usage.md
│   └── PROJECT_STRUCTURE.md
├── examples/                # 示例代码
│   ├── error-handling.ts
│   ├── logging.ts
│   └── logger-demo.ts
├── templates/               # 模板文件
│   ├── prd/
│   └── prototype/
├── dist/                    # 构建输出
├── package.json
├── tsconfig.json
└── README.md
```

## 命名规范

### 文件命名
- **命令文件**: kebab-case，如 `create-template.ts`
- **类文件**: PascalCase，如 `CommandBase.ts`（但当前使用 kebab-case 也可接受）
- **工具文件**: kebab-case，如 `error-handler.ts`
- **测试文件**: 与源文件同名 + `.test.ts`，如 `errors.test.ts`

### 目录命名
- 全部使用 kebab-case
- 复数形式用于集合：`commands/`, `examples/`, `templates/`
- 单数形式用于单一概念：`core/`, `lib/`

## 模块组织原则

### 1. 命令层 (commands/)
- 每个命令一个文件
- 命令文件只负责 CLI 接口和参数解析
- 业务逻辑委托给 lib/ 中的模块

### 2. 核心层 (core/)
- 命令基类和抽象
- 中间件和装饰器
- 框架级别的工具

### 3. 工具层 (lib/)
- 可复用的业务逻辑
- 与 CLI 无关的纯函数
- 可以被命令层和其他工具调用

### 4. 基础设施层 (根目录)
- `errors.ts`: 错误定义
- `error-handler.ts`: 错误处理
- `logger.ts`: 日志系统
- `ui.ts`: UI 工具
- `types.ts`: 全局类型

## 依赖关系

```
commands/ → core/ → lib/ → 基础设施层
   ↓         ↓       ↓         ↓
   └─────────┴───────┴─────────┘
              基础设施层
```

- 命令层可以使用所有层
- 核心层不应依赖命令层
- 工具层不应依赖命令层和核心层
- 基础设施层被所有层使用

## 测试组织

### 单元测试 (test/unit/)
- 测试单个函数或类
- 不依赖外部系统
- 快速执行

### 集成测试 (test/integration/)
- 测试多个模块协作
- 可能涉及文件系统、进程等
- 中等执行时间

### E2E 测试 (test/e2e/)
- 测试完整的用户场景
- 模拟真实使用
- 较慢执行

## 文档组织

### 用户文档
- `README.md`: 项目介绍和快速开始
- `docs/`: 详细文档

### 开发者文档
- `docs/error-handling-guide.md`: 错误处理指南
- `docs/logger-usage.md`: 日志系统使用
- `docs/PROJECT_STRUCTURE.md`: 项目结构说明
- `CLAUDE.md`: AI 开发规范

### 示例代码
- `examples/`: 可运行的示例
- 用于演示和学习

## 参考项目

本结构参考了以下成熟 CLI 项目：
- **npm**: 经典的包管理器
- **pnpm**: 高性能包管理器
- **turbo**: Monorepo 构建工具
- **vite**: 现代构建工具
- **commander.js**: CLI 框架

## 当前状态

### 已完成
- ✅ 错误处理系统
- ✅ 日志系统
- ✅ 命令架构抽象
- ✅ 测试覆盖
- ✅ 文档完善

### 待优化
- 🔄 将分散的工具函数整理到 `lib/` 目录
- 🔄 统一测试文件组织（按类型分目录）
- 🔄 补充缺失的单元测试
- 🔄 优化模块依赖关系

## 迁移计划

### 阶段 1: 创建 lib/ 目录
将当前 src/ 根目录下的工具模块移动到 lib/：
- `config.ts` → `lib/config.ts`
- `git.ts` → `lib/git.ts`
- `template.ts` → `lib/template.ts`
- `server.ts` → `lib/server.ts`
- 等等...

### 阶段 2: 重组测试目录
```
test/
├── unit/
│   ├── errors.test.ts
│   ├── error-handler.test.ts
│   ├── logger.test.ts
│   └── ...
├── integration/
│   ├── error-handling.test.ts
│   ├── logging.test.ts
│   └── ...
└── e2e/
    ├── error-scenarios.test.ts
    └── ...
```

### 阶段 3: 更新导入路径
- 更新所有 import 语句
- 运行测试确保无破坏
- 更新文档

### 阶段 4: 补充测试
- 为 lib/ 中的模块补充单元测试
- 提高整体测试覆盖率
- 添加更多集成测试

## 维护指南

### 添加新命令
1. 在 `src/commands/` 创建命令文件
2. 继承 `CommandBase` 或使用工厂函数
3. 在 `src/index.ts` 注册命令
4. 添加测试到 `test/unit/commands/`
5. 更新文档

### 添加新工具
1. 在 `src/lib/` 创建工具文件
2. 导出纯函数或类
3. 添加单元测试到 `test/unit/lib/`
4. 在需要的地方导入使用

### 添加新错误类型
1. 在 `src/errors.ts` 定义错误类
2. 添加错误代码到枚举
3. 添加工厂方法
4. 更新测试
5. 更新文档

### 修改核心架构
1. 在 `src/core/` 修改
2. 确保向后兼容
3. 更新所有使用的命令
4. 运行完整测试套件
5. 更新文档和示例

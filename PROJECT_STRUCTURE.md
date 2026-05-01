# PRDKit CLI 项目结构进度

## 当前评估

本轮已完成一批核心结构迁移，并通过了类型检查、构建和测试验证。

已确认通过：
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

当前最接近目标结构的部分：
- `src/cli.ts` 已替代原入口文件
- `src/core/` 已存在并可用
- `src/utils/`、`src/constants/`、`src/types/` 已建立并接管主要职责
- `build` / `dev` 已把 `viewer` 一起纳入流程

仍未完全收口的部分：
- `src/lib/` 主体结构已经展平，但 `viewer/` 仍作为独立前端子应用存在
- 少量同目录内部模块仍保留相对导入，这是可接受的局部实现细节

## 当前结构

```text
cli/
├── src/
│   ├── cli.ts
│   ├── commands/
│   ├── constants/
│   ├── core/
│   ├── lib/
│   │   ├── checkpoint/
│   │   ├── publisher.ts
│   │   ├── server/
│   │   └── viewer/
│   ├── types/
│   └── utils/
├── test/
├── docs/
├── examples/
└── scripts/
```

## 迁移进度

### 阶段 1：清理未使用的文件
- [x] `src/commands-v2/` 不存在
- [x] `src/commands/prd/` 不存在
- [x] `src/commands/prototype/` 不存在
- [x] 删除 `src/commands/create-template.ts`
说明：
创建逻辑已并入 [create-command.ts](/Users/purity3/Documents/Projects/prdkit/cli/src/core/create-command.ts:1)，`prd` / `prototype` 直接复用 `core` 导出的 `runCreateTemplate(...)`。

### 阶段 2：重组目录结构
- [x] 创建 `src/lib/` 目录
- [x] 迁移原 `prototype/` 代码到 `src/lib/`
- [x] 创建 `src/utils/` 目录
- [x] 主要工具文件迁移到 `src/utils/`
- [x] 创建 `src/constants/` 目录
- [x] 常量文件迁移到 `src/constants/`
- [x] 创建 `src/types/` 目录
- [x] 类型入口迁移到 `src/types/index.ts`
- [x] 重命名 `src/index.ts` → `src/cli.ts`
- [x] 将 `src/lib/` 进一步展平到目标结构
说明：
`checkpoint/`、`server/`、`publisher.ts`、`viewer/` 已经直接位于 `src/lib/` 下。

### 阶段 3：更新导入路径
- [x] 更新主要源码 import 语句
- [x] 更新测试 import 语句
- [x] 更新 `package.json` 的 bin / start / dev 入口
- [x] 更新 `tsconfig.json` 的路径映射
说明：
已建立 `#commands`、`#constants`、`#core`、`#lib`、`#types`、`#utils` 别名，并同步 `package.json#imports` 与 `vitest` 解析配置。

### 阶段 4：验证
- [x] 运行类型检查：`pnpm typecheck`
- [x] 运行构建：`pnpm build`
- [x] 运行测试：`pnpm test`
- [ ] 手动测试所有命令
说明：
`serve --dev`、`build`、`viewer` 联动已做过手工冒烟验证，但还不能算“所有命令全部人工回归”。

## 本轮已处理内容

- 新增 [cli.ts](/Users/purity3/Documents/Projects/prdkit/cli/src/cli.ts:1)，并把 CLI 入口切换到它
- 建立 [utils](/Users/purity3/Documents/Projects/prdkit/cli/src/utils/index.ts:1)、[constants](/Users/purity3/Documents/Projects/prdkit/cli/src/constants/index.ts:1)、[types](/Users/purity3/Documents/Projects/prdkit/cli/src/types/index.ts:1) 目录入口
- 将 `config`、`errors`、`error-handler`、`files`、`logger`、`ui`、`scaffold`、`system-dialog`、`templates` 收敛到 `src/utils/`
- 将 `command-text`、`defaults` 收敛到 `src/constants/`
- 将 `src/lib/prototype/` 展平为 `src/lib/checkpoint/`、`src/lib/server/`、[publisher.ts](/Users/purity3/Documents/Projects/prdkit/cli/src/lib/publisher.ts:1)、`src/lib/viewer/`
- 将原 `commands/create-template.ts` 能力并入 [core/create-command.ts](/Users/purity3/Documents/Projects/prdkit/cli/src/core/create-command.ts:1)
- 建立 `tsconfig paths`、`package.json#imports` 和 `vitest` alias 三层一致的模块别名体系
- 更新源码、测试、脚本和 bin 入口的导入路径
- 保持 `viewer` 在 `build` / `dev` 流程中一并处理

## 剩余建议

1. 为关键命令补一轮真正的手工回归清单，尤其是 `init`、`publish`、`checkpoint`、`doctor`。
2. 如果后续继续收敛风格，可以把同目录内部的少量相对导入也统一到别名或目录入口导出。

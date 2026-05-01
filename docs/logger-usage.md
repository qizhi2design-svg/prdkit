# Logger 使用指南

## 概述

prdkit CLI 提供了结构化日志系统，支持不同日志级别和格式化输出。

## 基本使用

### 导入 Logger

```typescript
import { logger } from "./logger.js";
// 或从 ui.ts 重新导出
import { logger } from "./ui.js";
```

### 日志级别

Logger 支持 5 种日志级别：

```typescript
logger.debug("调试信息", { userId: 123 });
logger.info("一般信息");
logger.warn("警告信息");
logger.error("错误信息");
logger.success("成功消息");
```

### 使用 Spinner

```typescript
const spinner = logger.spinner("正在处理...");
spinner.start();

try {
  // 执行任务
  await someTask();
  spinner.succeed("处理完成");
} catch (error) {
  spinner.fail("处理失败");
}
```

## 配置

### 环境变量

通过环境变量配置日志行为：

```bash
# 设置日志级别 (debug | info | warn | error | success)
export PRDKIT_LOG_LEVEL=debug

# 设置输出格式 (pretty | json)
export PRDKIT_LOG_FORMAT=json

# 设置日志文件路径
export PRDKIT_LOG_FILE=/path/to/logfile.log
```

### 代码配置

```typescript
import { Logger } from "./logger.js";

const logger = new Logger({
  level: "debug",
  format: "json",
  logFile: "./logs/app.log"
});
```

### 动态配置

```typescript
// 动态设置日志级别
logger.setLevel("debug");

// 动态设置输出格式
logger.setFormat("json");

// 获取当前配置
const config = logger.getConfig();
console.log(config.level, config.format);
```

## 日志格式

### Pretty 格式（默认）

适合终端查看，使用彩色输出：

```
◆ 调试信息 {"userId":123}
ℹ 一般信息
⚠ 警告信息
✖ 错误信息
✓ 成功消息
```

颜色说明：
- `debug`: 灰色
- `info`: 蓝色
- `warn`: 黄色
- `error`: 红色
- `success`: 绿色

### JSON 格式

适合日志收集和分析：

```json
{"timestamp":"2026-05-01T02:30:00.000Z","level":"info","message":"一般信息","meta":{"key":"value"}}
```

## 日志级别过滤

日志级别优先级（从低到高）：

```
debug (0) < info (1) = success (1) < warn (2) < error (3)
```

设置日志级别后，只会输出该级别及以上的日志：

```typescript
logger.setLevel("warn");

logger.debug("不会输出");
logger.info("不会输出");
logger.warn("会输出");
logger.error("会输出");
```

## 文件日志

启用文件日志后，所有日志会以 JSON 格式追加到文件：

```typescript
const logger = new Logger({
  level: "info",
  logFile: "./logs/prdkit.log"
});

logger.info("这条日志会同时输出到终端和文件");
```

文件日志特性：
- 始终使用 JSON 格式
- 自动创建日志目录
- 追加模式写入
- 异步写入，不阻塞主流程
- 写入失败不影响程序运行

## 向后兼容

原有的 `ui.ts` 函数仍然可用，内部已迁移到新的 logger：

```typescript
import { success, info, warn, fail } from "./ui.js";

success("操作成功");
info("提示信息");
warn("警告信息");
fail("错误信息");
```

## 最佳实践

### 1. 使用合适的日志级别

```typescript
// ✓ 好的做法
logger.debug("函数参数", { params });
logger.info("开始处理任务");
logger.warn("配置文件不存在，使用默认值");
logger.error("文件读取失败", { path, error });
logger.success("任务完成");

// ✗ 不好的做法
logger.info("x=123, y=456"); // 应该用 debug
logger.error("任务完成"); // 应该用 success
```

### 2. 提供有用的元数据

```typescript
// ✓ 好的做法
logger.error("文件读取失败", {
  path: "/path/to/file",
  error: error.message,
  code: error.code
});

// ✗ 不好的做法
logger.error("文件读取失败");
```

### 3. 在生产环境使用合适的配置

```typescript
// 开发环境
const logger = new Logger({
  level: "debug",
  format: "pretty"
});

// 生产环境
const logger = new Logger({
  level: "info",
  format: "json",
  logFile: "/var/log/prdkit/app.log"
});
```

### 4. 避免敏感信息

```typescript
// ✗ 不好的做法
logger.info("用户登录", {
  username: "alice",
  password: "secret123" // 不要记录密码
});

// ✓ 好的做法
logger.info("用户登录", {
  username: "alice",
  timestamp: Date.now()
});
```

## 示例：在命令中使用

```typescript
import { logger } from "../logger.js";

export async function initCommand(options: InitOptions) {
  logger.info("开始初始化项目", { targetDir: options.targetDir });

  const spinner = logger.spinner("正在克隆脚手架...");
  spinner.start();

  try {
    await cloneScaffold(options.targetDir);
    spinner.succeed("脚手架克隆完成");

    logger.success("项目初始化完成", {
      projectName: options.projectName,
      author: options.author
    });
  } catch (error) {
    spinner.fail("初始化失败");
    logger.error("项目初始化失败", {
      error: error.message,
      targetDir: options.targetDir
    });
    throw error;
  }
}
```

## 测试

Logger 包含完整的测试覆盖，参见 `test/logger.test.ts`：

```bash
# 运行 logger 测试
pnpm test logger.test.ts

# 运行所有测试
pnpm test
```

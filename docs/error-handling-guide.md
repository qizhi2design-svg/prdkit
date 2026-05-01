# 错误处理系统使用指南

本文档展示如何在命令文件中使用新的统一错误处理系统。

## 基本用法

### 1. 导入错误类和处理器

```typescript
import {
  ConfigError,
  FileSystemError,
  GitError,
  NetworkError,
  ValidationError,
  TemplateError,
  PrototypeError,
  ServerError,
  UserCancelledError,
} from "../errors.js";
import { handleError, wrapError, assert } from "../error-handler.js";
```

### 2. 在命令中使用错误类

#### 示例 1: 配置文件不存在

**之前的写法：**
```typescript
const config = await loadConfig();
if (!config) {
  fail('未找到 prdkit 项目，请先运行 prdkit init');
  process.exit(1);
}
```

**新的写法：**
```typescript
const config = await loadConfig();
if (!config) {
  throw ConfigError.projectNotInitialized();
}
```

#### 示例 2: 文件已存在

**之前的写法：**
```typescript
if (existsSync(outputPath)) {
  throw new Error(`输出文件已存在：${outputPath}`);
}
```

**新的写法：**
```typescript
if (existsSync(outputPath)) {
  throw FileSystemError.fileAlreadyExists(outputPath);
}
```

#### 示例 3: Git 克隆失败

**之前的写法：**
```typescript
try {
  await execFileAsync("git", ["clone", repoUrl, targetDir]);
} catch (error) {
  throw new Error(`克隆 scaffold 仓库失败：${error.message}`);
}
```

**新的写法：**
```typescript
try {
  await execFileAsync("git", ["clone", repoUrl, targetDir]);
} catch (error) {
  throw GitError.cloneFailed(repoUrl, error instanceof Error ? error : undefined);
}
```

#### 示例 4: 端口无效

**之前的写法：**
```typescript
const port = parseInt(options.port);
if (isNaN(port) || port < 1 || port > 65535) {
  fail('无效的端口号');
  process.exit(1);
}
```

**新的写法：**
```typescript
const port = parseInt(options.port);
if (isNaN(port) || port < 1 || port > 65535) {
  throw ValidationError.invalidPort(options.port);
}
```

#### 示例 5: 模板不存在

**之前的写法：**
```typescript
const item = manifest.templates.find((template) => template.id === id);
if (!item) throw new Error(`模板不存在：${id}`);
```

**新的写法：**
```typescript
const item = manifest.templates.find((template) => template.id === id);
if (!item) throw TemplateError.notFound(id);
```

### 3. 使用 wrapError 包装可能失败的操作

```typescript
// 包装文件读取操作
const content = await wrapError(
  () => readFile(filePath, "utf8"),
  (cause) => FileSystemError.readFailed(filePath, cause)
);

// 包装 Git 操作
await wrapError(
  () => execFileAsync("git", ["clone", repoUrl, targetDir]),
  (cause) => GitError.cloneFailed(repoUrl, cause)
);

// 包装配置解析
const config = await wrapError(
  () => JSON.parse(raw),
  (cause) => ConfigError.invalid("JSON 格式错误", cause)
);
```

### 4. 使用 assert 进行断言

```typescript
// 断言配置存在
assert(config !== undefined, ConfigError.projectNotInitialized());

// 断言文件不存在
assert(!existsSync(outputPath), FileSystemError.fileAlreadyExists(outputPath));

// 使用工厂函数（延迟创建错误对象）
assert(
  port >= 1 && port <= 65535,
  () => ValidationError.invalidPort(port)
);
```

### 5. 在命令 action 中统一处理错误

**方式 1: 使用 try-catch + handleError**
```typescript
.action(async (options) => {
  try {
    // 命令逻辑
    const config = await loadConfig();
    if (!config) {
      throw ConfigError.projectNotInitialized();
    }
    
    // ... 其他逻辑
  } catch (error) {
    handleError(error);
  }
});
```

**方式 2: 使用 withErrorHandling 包装器**
```typescript
import { withErrorHandling } from "../error-handler.js";

const initAction = withErrorHandling(async (targetDir: string | undefined, options: InitOptions) => {
  // 命令逻辑
  const config = await loadConfig();
  if (!config) {
    throw ConfigError.projectNotInitialized();
  }
  
  // ... 其他逻辑
});

program
  .command("init")
  .action(initAction);
```

## 完整示例：重构 init 命令

```typescript
import { Command } from "commander";
import { input } from "@inquirer/prompts";
import { existsSync } from "node:fs";
import path from "node:path";
import ora from "ora";
import { COPY } from "../command-text.js";
import { saveConfig } from "../config.js";
import { createDefaultConfig, DEFAULT_SCAFFOLD_REPO, DEFAULT_TEMPLATE_REPO } from "../defaults.js";
import { copyScaffoldInto, personalizeReadme } from "../scaffold.js";
import { ensureTemplateRepo } from "../templates.js";
import { success, info, withSpinner } from "../ui.js";
import { 
  ConfigError, 
  FileSystemError, 
  ValidationError,
  GitError 
} from "../errors.js";
import { handleError, wrapError, assert } from "../error-handler.js";

type InitOptions = {
  name?: string;
  author?: string;
  scaffoldRepo?: string;
  templateRepo?: string;
  branch?: string;
  nonInteractive?: boolean;
};

async function resolveRequiredValue(
  value: string | undefined, 
  message: string, 
  nonInteractive?: boolean
): Promise<string> {
  if (value?.trim()) return value.trim();
  if (nonInteractive) {
    throw ValidationError.missingRequired(message);
  }
  return (await input({ message, required: true })).trim();
}

async function ensureSafeInitTarget(targetDir: string): Promise<void> {
  if (!existsSync(targetDir)) return;
  
  const entries = await wrapError(
    () => readdir(targetDir),
    (cause) => FileSystemError.readFailed(targetDir, cause)
  );
  
  const nonIgnored = entries.filter((entry) => entry !== ".DS_Store");
  if (nonIgnored.length > 0) {
    throw FileSystemError.directoryNotEmpty(targetDir);
  }
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .argument("[target-dir]", "目标目录，默认当前目录")
    .description(COPY.initDescription)
    .option("--name <project-name>", "项目名称")
    .option("--author <author>", "作者")
    .option("--scaffold-repo <git-url>", "scaffold 仓库地址", DEFAULT_SCAFFOLD_REPO)
    .option("--template-repo <git-url>", "template 仓库地址", DEFAULT_TEMPLATE_REPO)
    .option("--branch <branch>", "scaffold 仓库分支", "main")
    .option("--non-interactive", "禁用交互式输入")
    .addHelpText("after", `\n${COPY.initHelpAfter}`)
    .action(async (targetDir: string | undefined, options: InitOptions) => {
      try {
        const cwd = process.cwd();
        const targetPath = path.resolve(cwd, targetDir ?? ".");
        
        if (!existsSync(targetPath)) {
          await wrapError(
            () => mkdir(targetPath, { recursive: true }),
            (cause) => FileSystemError.writeFailed(targetPath, cause)
          );
        }

        const projectName = await resolveRequiredValue(
          options.name, 
          COPY.initProjectNameMessage, 
          options.nonInteractive
        );
        
        const author = await resolveRequiredValue(
          options.author, 
          COPY.initAuthorMessage, 
          options.nonInteractive
        );
        
        await ensureSafeInitTarget(targetPath);

        const spinner = ora("拉取 scaffold 并初始化项目").start();
        
        await withSpinner(spinner, async () => {
          // 克隆 scaffold
          await wrapError(
            () => copyScaffoldInto(
              targetPath, 
              options.scaffoldRepo ?? DEFAULT_SCAFFOLD_REPO, 
              options.branch ?? "main"
            ),
            (cause) => GitError.cloneFailed(
              options.scaffoldRepo ?? DEFAULT_SCAFFOLD_REPO, 
              cause
            )
          );
          
          // 个性化 README
          await personalizeReadme(targetPath, projectName, author, currentDate());
          
          // 保存配置
          const config = createDefaultConfig(
            projectName,
            author,
            options.scaffoldRepo ?? DEFAULT_SCAFFOLD_REPO,
            options.templateRepo ?? DEFAULT_TEMPLATE_REPO
          );
          
          await wrapError(
            () => saveConfig(config, targetPath),
            (cause) => ConfigError.writeFailed(
              path.join(targetPath, ".prdkit", "config.json"),
              cause
            )
          );

          // 拉取模板仓库
          spinner.text = "拉取模板仓库";
          await wrapError(
            () => ensureTemplateRepo(config.templateRepo, targetPath),
            (cause) => GitError.cloneFailed(config.templateRepo, cause)
          );
        }, {
          successText: "项目初始化完成",
          failText: "项目初始化失败"
        });

        success(`项目目录：${targetPath}`);
        info(COPY.createNextStep);
      } catch (error) {
        handleError(error);
      }
    });
}
```

## 错误类型速查表

| 场景 | 错误类 | 工厂方法 |
|------|--------|----------|
| 配置文件不存在 | `ConfigError` | `ConfigError.notFound(path?)` |
| 配置文件格式无效 | `ConfigError` | `ConfigError.invalid(reason, cause?)` |
| 配置文件写入失败 | `ConfigError` | `ConfigError.writeFailed(path, cause?)` |
| 项目未初始化 | `ConfigError` | `ConfigError.projectNotInitialized()` |
| 文件不存在 | `FileSystemError` | `FileSystemError.fileNotFound(path)` |
| 文件已存在 | `FileSystemError` | `FileSystemError.fileAlreadyExists(path)` |
| 目录不为空 | `FileSystemError` | `FileSystemError.directoryNotEmpty(path)` |
| 目录不存在 | `FileSystemError` | `FileSystemError.directoryNotFound(path)` |
| 文件读取失败 | `FileSystemError` | `FileSystemError.readFailed(path, cause?)` |
| 文件写入失败 | `FileSystemError` | `FileSystemError.writeFailed(path, cause?)` |
| 权限不足 | `FileSystemError` | `FileSystemError.permissionDenied(path, operation)` |
| Git 克隆失败 | `GitError` | `GitError.cloneFailed(repoUrl, cause?)` |
| Git 命令失败 | `GitError` | `GitError.commandFailed(command, cause?)` |
| 仓库不存在 | `GitError` | `GitError.repositoryNotFound(repoUrl)` |
| 网络连接失败 | `NetworkError` | `NetworkError.connectionFailed(url, cause?)` |
| 连接超时 | `NetworkError` | `NetworkError.timeout(url)` |
| 仓库无法访问 | `NetworkError` | `NetworkError.repositoryUnreachable(repoUrl)` |
| 输入无效 | `ValidationError` | `ValidationError.invalidInput(field, reason)` |
| 缺少必填字段 | `ValidationError` | `ValidationError.missingRequired(field)` |
| 端口号无效 | `ValidationError` | `ValidationError.invalidPort(port)` |
| 验证失败 | `ValidationError` | `ValidationError.validationFailed(reason, cause?)` |
| 模板不存在 | `TemplateError` | `TemplateError.notFound(templateId)` |
| 模板格式无效 | `TemplateError` | `TemplateError.invalid(templateId, reason)` |
| 模板渲染失败 | `TemplateError` | `TemplateError.renderFailed(templateId, cause?)` |
| 模板清单不存在 | `TemplateError` | `TemplateError.manifestNotFound(path)` |
| 模板清单无效 | `TemplateError` | `TemplateError.manifestInvalid(reason, cause?)` |
| 原型不存在 | `PrototypeError` | `PrototypeError.notFound(prototypePath)` |
| Mark 文件无效 | `PrototypeError` | `PrototypeError.markFileInvalid(filePath, reason)` |
| Checkpoint 失败 | `PrototypeError` | `PrototypeError.checkpointFailed(reason, cause?)` |
| 服务器启动失败 | `ServerError` | `ServerError.startFailed(reason, cause?)` |
| 端口被占用 | `ServerError` | `ServerError.portInUse(port)` |
| 没有可用端口 | `ServerError` | `ServerError.portNotAvailable(rangeStart, rangeEnd)` |
| 用户取消操作 | `UserCancelledError` | `new UserCancelledError(operation?)` |

## 最佳实践

1. **优先使用具体的错误类**：不要使用通用的 `Error`，使用最具体的错误类型
2. **提供有用的建议**：错误类的工厂方法已经包含了建议，但可以根据具体情况添加更多
3. **保留原始错误**：使用 `cause` 参数保留原始错误，便于调试
4. **使用 wrapError**：对于可能抛出原生错误的操作，使用 `wrapError` 转换为 PrdkitError
5. **统一错误处理**：在命令的 action 中使用 `handleError` 统一处理所有错误
6. **避免 process.exit**：让 `handleError` 负责退出进程，不要手动调用 `process.exit`

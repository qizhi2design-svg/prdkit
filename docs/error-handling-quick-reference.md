# 错误处理系统快速参考

## 导入

```typescript
// 错误类
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

// 处理器和工具
import {
  handleError,
  wrapError,
  assert,
  tryOr,
  tryOrUndefined,
} from "../error-handler.js";
```

## 常用模式

### 1. 检查并抛出错误
```typescript
if (!config) {
  throw ConfigError.projectNotInitialized();
}

if (existsSync(path)) {
  throw FileSystemError.fileAlreadyExists(path);
}

if (port < 1 || port > 65535) {
  throw ValidationError.invalidPort(port);
}
```

### 2. 包装可能失败的操作
```typescript
const content = await wrapError(
  () => readFile(path, "utf8"),
  (cause) => FileSystemError.readFailed(path, cause)
);
```

### 3. 断言
```typescript
assert(config !== undefined, ConfigError.projectNotInitialized());
assert(!existsSync(path), FileSystemError.fileAlreadyExists(path));
```

### 4. 尝试执行，失败返回默认值
```typescript
const port = await tryOr(() => findPort(), 8080);
const config = await tryOrUndefined(() => loadConfig());
```

### 5. 命令中统一处理错误
```typescript
.action(async (options) => {
  try {
    // 命令逻辑
  } catch (error) {
    handleError(error);
  }
});
```

## 错误类速查

| 错误类型 | 工厂方法 |
|---------|---------|
| **ConfigError** | |
| 配置不存在 | `ConfigError.notFound(path?)` |
| 配置无效 | `ConfigError.invalid(reason, cause?)` |
| 写入失败 | `ConfigError.writeFailed(path, cause?)` |
| 未初始化 | `ConfigError.projectNotInitialized()` |
| **FileSystemError** | |
| 文件不存在 | `FileSystemError.fileNotFound(path)` |
| 文件已存在 | `FileSystemError.fileAlreadyExists(path)` |
| 目录不为空 | `FileSystemError.directoryNotEmpty(path)` |
| 目录不存在 | `FileSystemError.directoryNotFound(path)` |
| 读取失败 | `FileSystemError.readFailed(path, cause?)` |
| 写入失败 | `FileSystemError.writeFailed(path, cause?)` |
| 权限不足 | `FileSystemError.permissionDenied(path, op)` |
| **GitError** | |
| 克隆失败 | `GitError.cloneFailed(repoUrl, cause?)` |
| 命令失败 | `GitError.commandFailed(command, cause?)` |
| 仓库不存在 | `GitError.repositoryNotFound(repoUrl)` |
| **ValidationError** | |
| 输入无效 | `ValidationError.invalidInput(field, reason)` |
| 缺少必填 | `ValidationError.missingRequired(field)` |
| 端口无效 | `ValidationError.invalidPort(port)` |
| **TemplateError** | |
| 模板不存在 | `TemplateError.notFound(templateId)` |
| 模板无效 | `TemplateError.invalid(templateId, reason)` |
| 渲染失败 | `TemplateError.renderFailed(templateId, cause?)` |
| **ServerError** | |
| 启动失败 | `ServerError.startFailed(reason, cause?)` |
| 端口被占用 | `ServerError.portInUse(port)` |
| 无可用端口 | `ServerError.portNotAvailable(start, end)` |

## 退出码

- `0` - 用户取消
- `1` - 可恢复错误
- `2` - 不可恢复错误

## 调试

设置环境变量 `DEBUG=true` 查看详细错误信息：

```bash
DEBUG=true prdkit init
```

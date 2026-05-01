/**
 * 统一错误处理系统
 *
 * 提供类型化的错误类和错误处理机制
 */

/**
 * 错误代码枚举
 */
export enum ErrorCode {
  // 配置相关错误
  CONFIG_NOT_FOUND = "CONFIG_NOT_FOUND",
  CONFIG_INVALID = "CONFIG_INVALID",
  CONFIG_WRITE_FAILED = "CONFIG_WRITE_FAILED",
  PROJECT_NOT_INITIALIZED = "PROJECT_NOT_INITIALIZED",

  // 文件系统错误
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  FILE_ALREADY_EXISTS = "FILE_ALREADY_EXISTS",
  DIRECTORY_NOT_EMPTY = "DIRECTORY_NOT_EMPTY",
  DIRECTORY_NOT_FOUND = "DIRECTORY_NOT_FOUND",
  FILE_READ_FAILED = "FILE_READ_FAILED",
  FILE_WRITE_FAILED = "FILE_WRITE_FAILED",
  PERMISSION_DENIED = "PERMISSION_DENIED",

  // Git 操作错误
  GIT_CLONE_FAILED = "GIT_CLONE_FAILED",
  GIT_COMMAND_FAILED = "GIT_COMMAND_FAILED",
  REPOSITORY_NOT_FOUND = "REPOSITORY_NOT_FOUND",

  // 网络错误
  NETWORK_ERROR = "NETWORK_ERROR",
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
  REPOSITORY_UNREACHABLE = "REPOSITORY_UNREACHABLE",

  // 验证错误
  VALIDATION_FAILED = "VALIDATION_FAILED",
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  INVALID_PORT = "INVALID_PORT",

  // 模板错误
  TEMPLATE_NOT_FOUND = "TEMPLATE_NOT_FOUND",
  TEMPLATE_INVALID = "TEMPLATE_INVALID",
  TEMPLATE_RENDER_FAILED = "TEMPLATE_RENDER_FAILED",
  MANIFEST_NOT_FOUND = "MANIFEST_NOT_FOUND",
  MANIFEST_INVALID = "MANIFEST_INVALID",

  // 原型相关错误
  PROTOTYPE_NOT_FOUND = "PROTOTYPE_NOT_FOUND",
  MARK_FILE_INVALID = "MARK_FILE_INVALID",
  CHECKPOINT_FAILED = "CHECKPOINT_FAILED",

  // 服务器错误
  SERVER_START_FAILED = "SERVER_START_FAILED",
  PORT_IN_USE = "PORT_IN_USE",
  PORT_NOT_AVAILABLE = "PORT_NOT_AVAILABLE",

  // 用户中断
  USER_CANCELLED = "USER_CANCELLED",

  // 未知错误
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * prdkit 基础错误类
 */
export class PrdkitError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: string;
  public readonly suggestions: string[];
  public readonly cause?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: string;
      suggestions?: string[];
      cause?: Error;
    }
  ) {
    super(message);
    this.name = "PrdkitError";
    this.code = code;
    this.details = options?.details;
    this.suggestions = options?.suggestions ?? [];
    this.cause = options?.cause;

    // 保持正确的原型链
    Object.setPrototypeOf(this, PrdkitError.prototype);
  }
}

/**
 * 配置相关错误
 */
export class ConfigError extends PrdkitError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: string;
      suggestions?: string[];
      cause?: Error;
    }
  ) {
    super(code, message, options);
    this.name = "ConfigError";
    Object.setPrototypeOf(this, ConfigError.prototype);
  }

  static notFound(path?: string): ConfigError {
    return new ConfigError(
      ErrorCode.CONFIG_NOT_FOUND,
      "未找到配置文件",
      {
        details: path ? `配置文件路径：${path}` : undefined,
        suggestions: ["运行 prdkit init 初始化项目", "检查当前目录是否为 prdkit 项目目录"],
      }
    );
  }

  static invalid(reason: string, cause?: Error): ConfigError {
    return new ConfigError(
      ErrorCode.CONFIG_INVALID,
      "配置文件格式无效",
      {
        details: reason,
        suggestions: ["检查配置文件格式是否正确", "运行 prdkit doctor --fix 修复配置"],
        cause,
      }
    );
  }

  static writeFailed(path: string, cause?: Error): ConfigError {
    return new ConfigError(
      ErrorCode.CONFIG_WRITE_FAILED,
      "写入配置文件失败",
      {
        details: `配置文件路径：${path}`,
        suggestions: ["检查文件权限", "确保磁盘空间充足"],
        cause,
      }
    );
  }

  static projectNotInitialized(): ConfigError {
    return new ConfigError(
      ErrorCode.PROJECT_NOT_INITIALIZED,
      "项目未初始化",
      {
        suggestions: ["运行 prdkit init 初始化项目"],
      }
    );
  }
}

/**
 * 文件系统错误
 */
export class FileSystemError extends PrdkitError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: string;
      suggestions?: string[];
      cause?: Error;
    }
  ) {
    super(code, message, options);
    this.name = "FileSystemError";
    Object.setPrototypeOf(this, FileSystemError.prototype);
  }

  static fileNotFound(path: string): FileSystemError {
    return new FileSystemError(
      ErrorCode.FILE_NOT_FOUND,
      "文件不存在",
      {
        details: `文件路径：${path}`,
        suggestions: ["检查文件路径是否正确", "确认文件是否已被删除"],
      }
    );
  }

  static fileAlreadyExists(path: string): FileSystemError {
    return new FileSystemError(
      ErrorCode.FILE_ALREADY_EXISTS,
      "文件已存在",
      {
        details: `文件路径：${path}`,
        suggestions: ["使用不同的文件名", "删除或移动现有文件", "使用 --output 指定其他路径"],
      }
    );
  }

  static directoryNotEmpty(path: string): FileSystemError {
    return new FileSystemError(
      ErrorCode.DIRECTORY_NOT_EMPTY,
      "目标目录不为空",
      {
        details: `目录路径：${path}`,
        suggestions: ["选择空目录", "清空目标目录", "使用其他目录"],
      }
    );
  }

  static directoryNotFound(path: string): FileSystemError {
    return new FileSystemError(
      ErrorCode.DIRECTORY_NOT_FOUND,
      "目录不存在",
      {
        details: `目录路径：${path}`,
        suggestions: ["检查目录路径是否正确", "运行 prdkit doctor --fix 修复项目结构"],
      }
    );
  }

  static readFailed(path: string, cause?: Error): FileSystemError {
    return new FileSystemError(
      ErrorCode.FILE_READ_FAILED,
      "读取文件失败",
      {
        details: `文件路径：${path}`,
        suggestions: ["检查文件权限", "确认文件未被其他程序占用"],
        cause,
      }
    );
  }

  static writeFailed(path: string, cause?: Error): FileSystemError {
    return new FileSystemError(
      ErrorCode.FILE_WRITE_FAILED,
      "写入文件失败",
      {
        details: `文件路径：${path}`,
        suggestions: ["检查文件权限", "确保磁盘空间充足", "确认目录存在"],
        cause,
      }
    );
  }

  static permissionDenied(path: string, operation: string): FileSystemError {
    return new FileSystemError(
      ErrorCode.PERMISSION_DENIED,
      "权限不足",
      {
        details: `操作：${operation}，路径：${path}`,
        suggestions: ["检查文件/目录权限", "使用 sudo 运行（谨慎使用）"],
      }
    );
  }
}

/**
 * Git 操作错误
 */
export class GitError extends PrdkitError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: string;
      suggestions?: string[];
      cause?: Error;
    }
  ) {
    super(code, message, options);
    this.name = "GitError";
    Object.setPrototypeOf(this, GitError.prototype);
  }

  static cloneFailed(repoUrl: string, cause?: Error): GitError {
    return new GitError(
      ErrorCode.GIT_CLONE_FAILED,
      "克隆仓库失败",
      {
        details: `仓库地址：${repoUrl}`,
        suggestions: [
          "检查网络连接",
          "确认仓库地址是否正确",
          "检查 SSH 密钥配置（如果使用 SSH）",
          "尝试使用 HTTPS 地址",
        ],
        cause,
      }
    );
  }

  static commandFailed(command: string, cause?: Error): GitError {
    return new GitError(
      ErrorCode.GIT_COMMAND_FAILED,
      "Git 命令执行失败",
      {
        details: `命令：${command}`,
        suggestions: ["检查 Git 是否已安装", "确认 Git 版本是否支持该命令"],
        cause,
      }
    );
  }

  static repositoryNotFound(repoUrl: string): GitError {
    return new GitError(
      ErrorCode.REPOSITORY_NOT_FOUND,
      "仓库不存在或无权访问",
      {
        details: `仓库地址：${repoUrl}`,
        suggestions: ["确认仓库地址是否正确", "检查访问权限", "确认仓库是否为私有"],
      }
    );
  }
}

/**
 * 网络错误
 */
export class NetworkError extends PrdkitError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: string;
      suggestions?: string[];
      cause?: Error;
    }
  ) {
    super(code, message, options);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }

  static connectionFailed(url: string, cause?: Error): NetworkError {
    return new NetworkError(
      ErrorCode.NETWORK_ERROR,
      "网络连接失败",
      {
        details: `目标地址：${url}`,
        suggestions: ["检查网络连接", "检查防火墙设置", "尝试使用代理"],
        cause,
      }
    );
  }

  static timeout(url: string): NetworkError {
    return new NetworkError(
      ErrorCode.CONNECTION_TIMEOUT,
      "连接超时",
      {
        details: `目标地址：${url}`,
        suggestions: ["检查网络连接", "稍后重试", "检查目标服务器状态"],
      }
    );
  }

  static repositoryUnreachable(repoUrl: string): NetworkError {
    return new NetworkError(
      ErrorCode.REPOSITORY_UNREACHABLE,
      "无法访问仓库",
      {
        details: `仓库地址：${repoUrl}`,
        suggestions: ["检查网络连接", "确认仓库地址是否正确", "检查 VPN 或代理设置"],
      }
    );
  }
}

/**
 * 验证错误
 */
export class ValidationError extends PrdkitError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: string;
      suggestions?: string[];
      cause?: Error;
    }
  ) {
    super(code, message, options);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  static invalidInput(field: string, reason: string): ValidationError {
    return new ValidationError(
      ErrorCode.INVALID_INPUT,
      "输入无效",
      {
        details: `字段：${field}，原因：${reason}`,
        suggestions: ["检查输入格式", "参考命令帮助文档"],
      }
    );
  }

  static missingRequired(field: string): ValidationError {
    return new ValidationError(
      ErrorCode.MISSING_REQUIRED_FIELD,
      "缺少必填字段",
      {
        details: `字段：${field}`,
        suggestions: ["提供必填字段", "使用交互模式", "参考命令帮助文档"],
      }
    );
  }

  static invalidPort(port: string | number): ValidationError {
    return new ValidationError(
      ErrorCode.INVALID_PORT,
      "端口号无效",
      {
        details: `端口号：${port}`,
        suggestions: ["使用 1-65535 之间的端口号", "省略端口号以自动选择"],
      }
    );
  }

  static validationFailed(reason: string, cause?: Error): ValidationError {
    return new ValidationError(
      ErrorCode.VALIDATION_FAILED,
      "验证失败",
      {
        details: reason,
        cause,
      }
    );
  }
}

/**
 * 模板错误
 */
export class TemplateError extends PrdkitError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: string;
      suggestions?: string[];
      cause?: Error;
    }
  ) {
    super(code, message, options);
    this.name = "TemplateError";
    Object.setPrototypeOf(this, TemplateError.prototype);
  }

  static notFound(templateId: string): TemplateError {
    return new TemplateError(
      ErrorCode.TEMPLATE_NOT_FOUND,
      "模板不存在",
      {
        details: `模板 ID：${templateId}`,
        suggestions: ["检查模板 ID 是否正确", "运行命令查看可用模板列表"],
      }
    );
  }

  static invalid(templateId: string, reason: string): TemplateError {
    return new TemplateError(
      ErrorCode.TEMPLATE_INVALID,
      "模板格式无效",
      {
        details: `模板 ID：${templateId}，原因：${reason}`,
        suggestions: ["检查模板文件格式", "更新模板仓库"],
      }
    );
  }

  static renderFailed(templateId: string, cause?: Error): TemplateError {
    return new TemplateError(
      ErrorCode.TEMPLATE_RENDER_FAILED,
      "模板渲染失败",
      {
        details: `模板 ID：${templateId}`,
        suggestions: ["检查模板变量是否正确", "查看错误详情"],
        cause,
      }
    );
  }

  static manifestNotFound(path: string): TemplateError {
    return new TemplateError(
      ErrorCode.MANIFEST_NOT_FOUND,
      "模板清单文件不存在",
      {
        details: `路径：${path}`,
        suggestions: ["运行 prdkit doctor --fix 修复", "重新初始化项目"],
      }
    );
  }

  static manifestInvalid(reason: string, cause?: Error): TemplateError {
    return new TemplateError(
      ErrorCode.MANIFEST_INVALID,
      "模板清单格式无效",
      {
        details: reason,
        suggestions: ["更新模板仓库", "检查 templates.json 格式"],
        cause,
      }
    );
  }
}

/**
 * 原型相关错误
 */
export class PrototypeError extends PrdkitError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: string;
      suggestions?: string[];
      cause?: Error;
    }
  ) {
    super(code, message, options);
    this.name = "PrototypeError";
    Object.setPrototypeOf(this, PrototypeError.prototype);
  }

  static notFound(prototypePath: string): PrototypeError {
    return new PrototypeError(
      ErrorCode.PROTOTYPE_NOT_FOUND,
      "原型不存在",
      {
        details: `原型路径：${prototypePath}`,
        suggestions: ["检查原型路径是否正确", "确认原型是否已被删除"],
      }
    );
  }

  static markFileInvalid(filePath: string, reason: string): PrototypeError {
    return new PrototypeError(
      ErrorCode.MARK_FILE_INVALID,
      "Mark 文件格式无效",
      {
        details: `文件：${filePath}，原因：${reason}`,
        suggestions: ["运行 prdkit doctor --fix 修复", "手动修正文件格式"],
      }
    );
  }

  static checkpointFailed(reason: string, cause?: Error): PrototypeError {
    return new PrototypeError(
      ErrorCode.CHECKPOINT_FAILED,
      "创建 checkpoint 失败",
      {
        details: reason,
        suggestions: ["检查原型目录结构", "确认文件权限"],
        cause,
      }
    );
  }
}

/**
 * 服务器错误
 */
export class ServerError extends PrdkitError {
  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: string;
      suggestions?: string[];
      cause?: Error;
    }
  ) {
    super(code, message, options);
    this.name = "ServerError";
    Object.setPrototypeOf(this, ServerError.prototype);
  }

  static startFailed(reason: string, cause?: Error): ServerError {
    return new ServerError(
      ErrorCode.SERVER_START_FAILED,
      "启动服务器失败",
      {
        details: reason,
        suggestions: ["检查端口是否被占用", "确认项目结构完整"],
        cause,
      }
    );
  }

  static portInUse(port: number): ServerError {
    return new ServerError(
      ErrorCode.PORT_IN_USE,
      "端口已被占用",
      {
        details: `端口：${port}`,
        suggestions: ["使用其他端口", "关闭占用端口的程序", "省略端口号以自动选择"],
      }
    );
  }

  static portNotAvailable(rangeStart: number, rangeEnd: number): ServerError {
    return new ServerError(
      ErrorCode.PORT_NOT_AVAILABLE,
      "没有可用端口",
      {
        details: `范围：${rangeStart}-${rangeEnd}`,
        suggestions: ["手动指定端口", "关闭一些占用端口的程序"],
      }
    );
  }
}

/**
 * 用户中断错误
 */
export class UserCancelledError extends PrdkitError {
  constructor(operation?: string) {
    super(
      ErrorCode.USER_CANCELLED,
      "操作已取消",
      {
        details: operation ? `操作：${operation}` : undefined,
      }
    );
    this.name = "UserCancelledError";
    Object.setPrototypeOf(this, UserCancelledError.prototype);
  }
}

/**
 * 判断错误是否为 PrdkitError
 */
export function isPrdkitError(error: unknown): error is PrdkitError {
  return error instanceof PrdkitError;
}

/**
 * 判断错误是否可恢复
 */
export function isRecoverableError(error: unknown): boolean {
  if (!isPrdkitError(error)) return false;

  const recoverableCodes = new Set([
    ErrorCode.USER_CANCELLED,
    ErrorCode.FILE_ALREADY_EXISTS,
    ErrorCode.DIRECTORY_NOT_EMPTY,
    ErrorCode.INVALID_INPUT,
    ErrorCode.INVALID_PORT,
    ErrorCode.PORT_IN_USE,
  ]);

  return recoverableCodes.has(error.code);
}

/**
 * 从原生错误转换为 PrdkitError
 */
export function fromNativeError(error: unknown, context?: string): PrdkitError {
  if (isPrdkitError(error)) {
    return error;
  }

  const nativeError = error instanceof Error ? error : new Error(String(error));
  const message = context ? `${context}: ${nativeError.message}` : nativeError.message;

  // 尝试根据错误消息推断错误类型
  const errorMessage = nativeError.message.toLowerCase();

  if (errorMessage.includes("enoent") || errorMessage.includes("no such file")) {
    return new FileSystemError(
      ErrorCode.FILE_NOT_FOUND,
      "文件或目录不存在",
      {
        details: message,
        cause: nativeError,
      }
    );
  }

  if (errorMessage.includes("eacces") || errorMessage.includes("permission denied")) {
    return new FileSystemError(
      ErrorCode.PERMISSION_DENIED,
      "权限不足",
      {
        details: message,
        cause: nativeError,
      }
    );
  }

  if (errorMessage.includes("eexist") || errorMessage.includes("already exists")) {
    return new FileSystemError(
      ErrorCode.FILE_ALREADY_EXISTS,
      "文件已存在",
      {
        details: message,
        cause: nativeError,
      }
    );
  }

  if (errorMessage.includes("eaddrinuse") || errorMessage.includes("address already in use")) {
    const portMatch = errorMessage.match(/\d+/);
    const port = portMatch ? parseInt(portMatch[0]) : 0;
    return new ServerError(
      ErrorCode.PORT_IN_USE,
      "端口已被占用",
      {
        details: port ? `端口：${port}` : message,
        cause: nativeError,
      }
    );
  }

  if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
    return new NetworkError(
      ErrorCode.CONNECTION_TIMEOUT,
      "连接超时",
      {
        details: message,
        cause: nativeError,
      }
    );
  }

  if (errorMessage.includes("network") || errorMessage.includes("enotfound")) {
    return new NetworkError(
      ErrorCode.NETWORK_ERROR,
      "网络错误",
      {
        details: message,
        cause: nativeError,
      }
    );
  }

  // 默认返回未知错误
  return new PrdkitError(
    ErrorCode.UNKNOWN_ERROR,
    "未知错误",
    {
      details: message,
      cause: nativeError,
    }
  );
}

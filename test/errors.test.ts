import { describe, it, expect } from "vitest";
import {
  PrdkitError,
  ConfigError,
  FileSystemError,
  GitError,
  NetworkError,
  ValidationError,
  TemplateError,
  PrototypeError,
  ServerError,
  UserCancelledError,
  ErrorCode,
  isPrdkitError,
  isRecoverableError,
  fromNativeError,
} from "../src/utils/errors.js";

describe("PrdkitError", () => {
  it("should create a basic error", () => {
    const error = new PrdkitError(ErrorCode.UNKNOWN_ERROR, "测试错误");
    expect(error.name).toBe("PrdkitError");
    expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(error.message).toBe("测试错误");
    expect(error.suggestions).toEqual([]);
  });

  it("should create an error with details and suggestions", () => {
    const error = new PrdkitError(ErrorCode.UNKNOWN_ERROR, "测试错误", {
      details: "详细信息",
      suggestions: ["建议1", "建议2"],
    });
    expect(error.details).toBe("详细信息");
    expect(error.suggestions).toEqual(["建议1", "建议2"]);
  });

  it("should create an error with cause", () => {
    const cause = new Error("原始错误");
    const error = new PrdkitError(ErrorCode.UNKNOWN_ERROR, "测试错误", {
      cause,
    });
    expect(error.cause).toBe(cause);
  });
});

describe("ConfigError", () => {
  it("should create a config not found error", () => {
    const error = ConfigError.notFound("/path/to/config.json");
    expect(error.name).toBe("ConfigError");
    expect(error.code).toBe(ErrorCode.CONFIG_NOT_FOUND);
    expect(error.message).toBe("未找到配置文件");
    expect(error.details).toContain("/path/to/config.json");
    expect(error.suggestions.length).toBeGreaterThan(0);
  });

  it("should create an invalid config error", () => {
    const error = ConfigError.invalid("格式错误");
    expect(error.code).toBe(ErrorCode.CONFIG_INVALID);
    expect(error.message).toBe("配置文件格式无效");
    expect(error.details).toBe("格式错误");
  });

  it("should create a write failed error", () => {
    const error = ConfigError.writeFailed("/path/to/config.json");
    expect(error.code).toBe(ErrorCode.CONFIG_WRITE_FAILED);
    expect(error.message).toBe("写入配置文件失败");
  });

  it("should create a project not initialized error", () => {
    const error = ConfigError.projectNotInitialized();
    expect(error.code).toBe(ErrorCode.PROJECT_NOT_INITIALIZED);
    expect(error.message).toBe("项目未初始化");
  });
});

describe("FileSystemError", () => {
  it("should create a file not found error", () => {
    const error = FileSystemError.fileNotFound("/path/to/file.txt");
    expect(error.name).toBe("FileSystemError");
    expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
    expect(error.message).toBe("文件不存在");
    expect(error.details).toContain("/path/to/file.txt");
  });

  it("should create a file already exists error", () => {
    const error = FileSystemError.fileAlreadyExists("/path/to/file.txt");
    expect(error.code).toBe(ErrorCode.FILE_ALREADY_EXISTS);
    expect(error.message).toBe("文件已存在");
  });

  it("should create a directory not empty error", () => {
    const error = FileSystemError.directoryNotEmpty("/path/to/dir");
    expect(error.code).toBe(ErrorCode.DIRECTORY_NOT_EMPTY);
    expect(error.message).toBe("目标目录不为空");
  });

  it("should create a directory not found error", () => {
    const error = FileSystemError.directoryNotFound("/path/to/dir");
    expect(error.code).toBe(ErrorCode.DIRECTORY_NOT_FOUND);
    expect(error.message).toBe("目录不存在");
  });

  it("should create a read failed error", () => {
    const cause = new Error("读取失败");
    const error = FileSystemError.readFailed("/path/to/file.txt", cause);
    expect(error.code).toBe(ErrorCode.FILE_READ_FAILED);
    expect(error.cause).toBe(cause);
  });

  it("should create a write failed error", () => {
    const error = FileSystemError.writeFailed("/path/to/file.txt");
    expect(error.code).toBe(ErrorCode.FILE_WRITE_FAILED);
  });

  it("should create a permission denied error", () => {
    const error = FileSystemError.permissionDenied("/path/to/file.txt", "读取");
    expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
    expect(error.details).toContain("读取");
  });
});

describe("GitError", () => {
  it("should create a clone failed error", () => {
    const error = GitError.cloneFailed("git@github.com:user/repo.git");
    expect(error.name).toBe("GitError");
    expect(error.code).toBe(ErrorCode.GIT_CLONE_FAILED);
    expect(error.message).toBe("克隆仓库失败");
    expect(error.details).toContain("git@github.com:user/repo.git");
  });

  it("should create a command failed error", () => {
    const error = GitError.commandFailed("git pull");
    expect(error.code).toBe(ErrorCode.GIT_COMMAND_FAILED);
    expect(error.details).toContain("git pull");
  });

  it("should create a repository not found error", () => {
    const error = GitError.repositoryNotFound("git@github.com:user/repo.git");
    expect(error.code).toBe(ErrorCode.REPOSITORY_NOT_FOUND);
  });
});

describe("NetworkError", () => {
  it("should create a connection failed error", () => {
    const error = NetworkError.connectionFailed("https://example.com");
    expect(error.name).toBe("NetworkError");
    expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
    expect(error.message).toBe("网络连接失败");
  });

  it("should create a timeout error", () => {
    const error = NetworkError.timeout("https://example.com");
    expect(error.code).toBe(ErrorCode.CONNECTION_TIMEOUT);
    expect(error.message).toBe("连接超时");
  });

  it("should create a repository unreachable error", () => {
    const error = NetworkError.repositoryUnreachable("git@github.com:user/repo.git");
    expect(error.code).toBe(ErrorCode.REPOSITORY_UNREACHABLE);
  });
});

describe("ValidationError", () => {
  it("should create an invalid input error", () => {
    const error = ValidationError.invalidInput("port", "必须是数字");
    expect(error.name).toBe("ValidationError");
    expect(error.code).toBe(ErrorCode.INVALID_INPUT);
    expect(error.message).toBe("输入无效");
    expect(error.details).toContain("port");
    expect(error.details).toContain("必须是数字");
  });

  it("should create a missing required field error", () => {
    const error = ValidationError.missingRequired("projectName");
    expect(error.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    expect(error.details).toContain("projectName");
  });

  it("should create an invalid port error", () => {
    const error = ValidationError.invalidPort(99999);
    expect(error.code).toBe(ErrorCode.INVALID_PORT);
    expect(error.details).toContain("99999");
  });

  it("should create a validation failed error", () => {
    const error = ValidationError.validationFailed("格式不正确");
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.details).toBe("格式不正确");
  });
});

describe("TemplateError", () => {
  it("should create a template not found error", () => {
    const error = TemplateError.notFound("prd");
    expect(error.name).toBe("TemplateError");
    expect(error.code).toBe(ErrorCode.TEMPLATE_NOT_FOUND);
    expect(error.message).toBe("模板不存在");
    expect(error.details).toContain("prd");
  });

  it("should create an invalid template error", () => {
    const error = TemplateError.invalid("prd", "缺少必填字段");
    expect(error.code).toBe(ErrorCode.TEMPLATE_INVALID);
    expect(error.details).toContain("prd");
    expect(error.details).toContain("缺少必填字段");
  });

  it("should create a render failed error", () => {
    const error = TemplateError.renderFailed("prd");
    expect(error.code).toBe(ErrorCode.TEMPLATE_RENDER_FAILED);
  });

  it("should create a manifest not found error", () => {
    const error = TemplateError.manifestNotFound("/path/to/templates.json");
    expect(error.code).toBe(ErrorCode.MANIFEST_NOT_FOUND);
  });

  it("should create a manifest invalid error", () => {
    const error = TemplateError.manifestInvalid("JSON 格式错误");
    expect(error.code).toBe(ErrorCode.MANIFEST_INVALID);
    expect(error.details).toBe("JSON 格式错误");
  });
});

describe("PrototypeError", () => {
  it("should create a prototype not found error", () => {
    const error = PrototypeError.notFound("/path/to/prototype");
    expect(error.name).toBe("PrototypeError");
    expect(error.code).toBe(ErrorCode.PROTOTYPE_NOT_FOUND);
    expect(error.message).toBe("原型不存在");
  });

  it("should create a mark file invalid error", () => {
    const error = PrototypeError.markFileInvalid("/path/to/mark.md", "文件名格式错误");
    expect(error.code).toBe(ErrorCode.MARK_FILE_INVALID);
    expect(error.details).toContain("文件名格式错误");
  });

  it("should create a checkpoint failed error", () => {
    const error = PrototypeError.checkpointFailed("无法创建快照");
    expect(error.code).toBe(ErrorCode.CHECKPOINT_FAILED);
  });
});

describe("ServerError", () => {
  it("should create a start failed error", () => {
    const error = ServerError.startFailed("端口被占用");
    expect(error.name).toBe("ServerError");
    expect(error.code).toBe(ErrorCode.SERVER_START_FAILED);
    expect(error.message).toBe("启动服务器失败");
  });

  it("should create a port in use error", () => {
    const error = ServerError.portInUse(8080);
    expect(error.code).toBe(ErrorCode.PORT_IN_USE);
    expect(error.details).toContain("8080");
  });

  it("should create a port not available error", () => {
    const error = ServerError.portNotAvailable(7788, 7888);
    expect(error.code).toBe(ErrorCode.PORT_NOT_AVAILABLE);
    expect(error.details).toContain("7788-7888");
  });
});

describe("UserCancelledError", () => {
  it("should create a user cancelled error", () => {
    const error = new UserCancelledError();
    expect(error.name).toBe("UserCancelledError");
    expect(error.code).toBe(ErrorCode.USER_CANCELLED);
    expect(error.message).toBe("操作已取消");
  });

  it("should create a user cancelled error with operation", () => {
    const error = new UserCancelledError("初始化项目");
    expect(error.details).toContain("初始化项目");
  });
});

describe("isPrdkitError", () => {
  it("should return true for PrdkitError instances", () => {
    const error = new PrdkitError(ErrorCode.UNKNOWN_ERROR, "测试");
    expect(isPrdkitError(error)).toBe(true);
  });

  it("should return true for ConfigError instances", () => {
    const error = ConfigError.notFound();
    expect(isPrdkitError(error)).toBe(true);
  });

  it("should return false for standard Error", () => {
    const error = new Error("测试");
    expect(isPrdkitError(error)).toBe(false);
  });

  it("should return false for non-error values", () => {
    expect(isPrdkitError("string")).toBe(false);
    expect(isPrdkitError(null)).toBe(false);
    expect(isPrdkitError(undefined)).toBe(false);
  });
});

describe("isRecoverableError", () => {
  it("should return true for user cancelled errors", () => {
    const error = new UserCancelledError();
    expect(isRecoverableError(error)).toBe(true);
  });

  it("should return true for file already exists errors", () => {
    const error = FileSystemError.fileAlreadyExists("/path/to/file");
    expect(isRecoverableError(error)).toBe(true);
  });

  it("should return true for directory not empty errors", () => {
    const error = FileSystemError.directoryNotEmpty("/path/to/dir");
    expect(isRecoverableError(error)).toBe(true);
  });

  it("should return true for invalid input errors", () => {
    const error = ValidationError.invalidInput("field", "reason");
    expect(isRecoverableError(error)).toBe(true);
  });

  it("should return true for port in use errors", () => {
    const error = ServerError.portInUse(8080);
    expect(isRecoverableError(error)).toBe(true);
  });

  it("should return false for config not found errors", () => {
    const error = ConfigError.notFound();
    expect(isRecoverableError(error)).toBe(false);
  });

  it("should return false for git clone failed errors", () => {
    const error = GitError.cloneFailed("repo");
    expect(isRecoverableError(error)).toBe(false);
  });

  it("should return false for non-PrdkitError", () => {
    const error = new Error("测试");
    expect(isRecoverableError(error)).toBe(false);
  });
});

describe("fromNativeError", () => {
  it("should return PrdkitError as-is", () => {
    const error = ConfigError.notFound();
    const result = fromNativeError(error);
    expect(result).toBe(error);
  });

  it("should convert ENOENT error to FileSystemError", () => {
    const error = new Error("ENOENT: no such file or directory");
    const result = fromNativeError(error);
    expect(result).toBeInstanceOf(FileSystemError);
    expect(result.code).toBe(ErrorCode.FILE_NOT_FOUND);
  });

  it("should convert EACCES error to FileSystemError", () => {
    const error = new Error("EACCES: permission denied");
    const result = fromNativeError(error);
    expect(result).toBeInstanceOf(FileSystemError);
    expect(result.code).toBe(ErrorCode.PERMISSION_DENIED);
  });

  it("should convert EEXIST error to FileSystemError", () => {
    const error = new Error("EEXIST: file already exists");
    const result = fromNativeError(error);
    expect(result).toBeInstanceOf(FileSystemError);
    expect(result.code).toBe(ErrorCode.FILE_ALREADY_EXISTS);
  });

  it("should convert EADDRINUSE error to ServerError", () => {
    const error = new Error("EADDRINUSE: address already in use 8080");
    const result = fromNativeError(error);
    expect(result).toBeInstanceOf(ServerError);
    expect(result.code).toBe(ErrorCode.PORT_IN_USE);
  });

  it("should convert timeout error to NetworkError", () => {
    const error = new Error("Connection timed out");
    const result = fromNativeError(error);
    expect(result).toBeInstanceOf(NetworkError);
    expect(result.code).toBe(ErrorCode.CONNECTION_TIMEOUT);
  });

  it("should convert network error to NetworkError", () => {
    const error = new Error("Network error: ENOTFOUND");
    const result = fromNativeError(error);
    expect(result).toBeInstanceOf(NetworkError);
    expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
  });

  it("should convert unknown error to PrdkitError", () => {
    const error = new Error("Unknown error");
    const result = fromNativeError(error);
    expect(result).toBeInstanceOf(PrdkitError);
    expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
  });

  it("should handle non-Error values", () => {
    const result = fromNativeError("string error");
    expect(result).toBeInstanceOf(PrdkitError);
    expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
  });

  it("should include context in error message", () => {
    const error = new Error("原始错误");
    const result = fromNativeError(error, "读取配置文件");
    expect(result.details).toContain("读取配置文件");
    expect(result.details).toContain("原始错误");
  });

  it("should preserve cause", () => {
    const error = new Error("原始错误");
    const result = fromNativeError(error);
    expect(result.cause).toBe(error);
  });
});

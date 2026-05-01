import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatError,
  handleError,
  withErrorHandling,
  assert,
  tryOr,
  tryOrUndefined,
  wrapError,
  isErrorCode,
  isErrorType,
} from "../src/error-handler.js";
import {
  PrdkitError,
  ConfigError,
  FileSystemError,
  UserCancelledError,
  ErrorCode,
} from "../src/errors.js";

describe("formatError", () => {
  it("should format a basic error", () => {
    const error = new PrdkitError(ErrorCode.UNKNOWN_ERROR, "测试错误");
    const formatted = formatError(error);
    expect(formatted).toContain("测试错误");
    expect(formatted).toContain("UNKNOWN_ERROR");
  });

  it("should include details", () => {
    const error = new PrdkitError(ErrorCode.UNKNOWN_ERROR, "测试错误", {
      details: "详细信息",
    });
    const formatted = formatError(error);
    expect(formatted).toContain("详细信息");
  });

  it("should include suggestions", () => {
    const error = new PrdkitError(ErrorCode.UNKNOWN_ERROR, "测试错误", {
      suggestions: ["建议1", "建议2"],
    });
    const formatted = formatError(error);
    expect(formatted).toContain("建议1");
    expect(formatted).toContain("建议2");
  });

  it("should include cause in debug mode", () => {
    const originalDebug = process.env.DEBUG;
    process.env.DEBUG = "true";

    const cause = new Error("原始错误");
    const error = new PrdkitError(ErrorCode.UNKNOWN_ERROR, "测试错误", {
      cause,
    });
    const formatted = formatError(error);
    expect(formatted).toContain("原始错误");

    process.env.DEBUG = originalDebug;
  });

  it("should not include cause when not in debug mode", () => {
    const originalDebug = process.env.DEBUG;
    delete process.env.DEBUG;

    const cause = new Error("原始错误");
    const error = new PrdkitError(ErrorCode.UNKNOWN_ERROR, "测试错误", {
      cause,
    });
    const formatted = formatError(error);
    expect(formatted).not.toContain("原始错误");

    if (originalDebug) process.env.DEBUG = originalDebug;
  });
});

describe("handleError", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it("should handle UserCancelledError with exit code 0", () => {
    const error = new UserCancelledError();
    handleError(error);
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("should handle recoverable PrdkitError with exit code 1", () => {
    const error = FileSystemError.fileAlreadyExists("/path/to/file");
    handleError(error);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should handle non-recoverable PrdkitError with exit code 2", () => {
    const error = ConfigError.notFound();
    handleError(error);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("should handle standard Error with exit code 2", () => {
    const error = new Error("标准错误");
    handleError(error);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("should handle non-error values with exit code 2", () => {
    handleError("字符串错误");
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe("withErrorHandling", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("should return result on success", async () => {
    const fn = async (x: number) => x * 2;
    const wrapped = withErrorHandling(fn);
    const result = await wrapped(5);
    expect(result).toBe(10);
  });

  it("should handle errors", async () => {
    const fn = async () => {
      throw new Error("测试错误");
    };
    const wrapped = withErrorHandling(fn);
    await wrapped();
    expect(exitSpy).toHaveBeenCalled();
  });
});

describe("assert", () => {
  it("should not throw when condition is true", () => {
    expect(() => {
      assert(true, ConfigError.notFound());
    }).not.toThrow();
  });

  it("should throw when condition is false", () => {
    expect(() => {
      assert(false, ConfigError.notFound());
    }).toThrow(ConfigError);
  });

  it("should support error factory function", () => {
    expect(() => {
      assert(false, () => ConfigError.notFound());
    }).toThrow(ConfigError);
  });
});

describe("tryOr", () => {
  it("should return result on success", async () => {
    const result = await tryOr(async () => 42, 0);
    expect(result).toBe(42);
  });

  it("should return default value on error", async () => {
    const result = await tryOr(
      async () => {
        throw new Error("错误");
      },
      0
    );
    expect(result).toBe(0);
  });
});

describe("tryOrUndefined", () => {
  it("should return result on success", async () => {
    const result = await tryOrUndefined(async () => 42);
    expect(result).toBe(42);
  });

  it("should return undefined on error", async () => {
    const result = await tryOrUndefined(async () => {
      throw new Error("错误");
    });
    expect(result).toBeUndefined();
  });
});

describe("wrapError", () => {
  it("should return result on success", async () => {
    const result = await wrapError(
      async () => 42,
      () => ConfigError.notFound()
    );
    expect(result).toBe(42);
  });

  it("should wrap native error", async () => {
    await expect(
      wrapError(
        async () => {
          throw new Error("原始错误");
        },
        (cause) => ConfigError.invalid("包装错误", cause)
      )
    ).rejects.toThrow(ConfigError);
  });

  it("should not wrap PrdkitError", async () => {
    const originalError = ConfigError.notFound();
    await expect(
      wrapError(
        async () => {
          throw originalError;
        },
        () => ConfigError.invalid("不应该被调用")
      )
    ).rejects.toBe(originalError);
  });

  it("should handle non-Error values", async () => {
    await expect(
      wrapError(
        async () => {
          throw "字符串错误";
        },
        (cause) => ConfigError.invalid("包装错误", cause)
      )
    ).rejects.toThrow(ConfigError);
  });
});

describe("isErrorCode", () => {
  it("should return true for matching error code", () => {
    const error = ConfigError.notFound();
    expect(isErrorCode(error, ErrorCode.CONFIG_NOT_FOUND)).toBe(true);
  });

  it("should return false for non-matching error code", () => {
    const error = ConfigError.notFound();
    expect(isErrorCode(error, ErrorCode.FILE_NOT_FOUND)).toBe(false);
  });

  it("should return false for non-PrdkitError", () => {
    const error = new Error("标准错误");
    expect(isErrorCode(error, ErrorCode.CONFIG_NOT_FOUND)).toBe(false);
  });
});

describe("isErrorType", () => {
  it("should return true for matching error type", () => {
    const error = ConfigError.notFound();
    expect(isErrorType(error, ConfigError)).toBe(true);
  });

  it("should return false for non-matching error type", () => {
    const error = ConfigError.notFound();
    expect(isErrorType(error, FileSystemError)).toBe(false);
  });

  it("should return false for non-PrdkitError", () => {
    const error = new Error("标准错误");
    expect(isErrorType(error, ConfigError)).toBe(false);
  });

  it("should work with base PrdkitError class", () => {
    const error = ConfigError.notFound();
    expect(isErrorType(error, PrdkitError)).toBe(true);
  });
});

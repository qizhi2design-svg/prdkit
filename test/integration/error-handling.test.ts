import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  ErrorCode,
} from "../../src/errors.js";
import {
  handleError,
  withErrorHandling,
  assert,
  tryOr,
  wrapError,
  isErrorCode,
} from "../../src/error-handler.js";

describe("Error Handling Integration", () => {
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

  describe("命令执行中的错误处理", () => {
    it("应该处理配置文件不存在的错误", async () => {
      const command = withErrorHandling(async () => {
        throw ConfigError.notFound("/path/to/config.json");
      });

      await command();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(2);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("未找到配置文件");
      expect(output).toContain("prdkit init");
    });

    it("应该处理文件已存在的错误", async () => {
      const command = withErrorHandling(async () => {
        throw FileSystemError.fileAlreadyExists("/path/to/file.md");
      });

      await command();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1); // 可恢复错误
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("文件已存在");
      expect(output).toContain("使用不同的文件名");
    });

    it("应该处理 Git 克隆失败的错误", async () => {
      const command = withErrorHandling(async () => {
        throw GitError.cloneFailed("git@github.com:user/repo.git");
      });

      await command();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(2);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("克隆仓库失败");
      expect(output).toContain("检查网络连接");
    });

    it("应该处理网络超时错误", async () => {
      const command = withErrorHandling(async () => {
        throw NetworkError.timeout("https://api.example.com");
      });

      await command();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(2);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("连接超时");
    });

    it("应该处理验证错误", async () => {
      const command = withErrorHandling(async () => {
        throw ValidationError.invalidPort(99999);
      });

      await command();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1); // 可恢复错误
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("端口号无效");
    });

    it("应该处理模板不存在的错误", async () => {
      const command = withErrorHandling(async () => {
        throw TemplateError.notFound("custom-template");
      });

      await command();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(2);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("模板不存在");
    });

    it("应该处理原型相关错误", async () => {
      const command = withErrorHandling(async () => {
        throw PrototypeError.markFileInvalid("/path/to/mark.md", "文件名格式错误");
      });

      await command();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(2);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("Mark 文件格式无效");
    });

    it("应该处理服务器启动失败的错误", async () => {
      const command = withErrorHandling(async () => {
        throw ServerError.portInUse(8080);
      });

      await command();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1); // 可恢复错误
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("端口已被占用");
    });

    it("应该处理用户取消操作", async () => {
      const command = withErrorHandling(async () => {
        throw new UserCancelledError("初始化项目");
      });

      await command();

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain("操作已取消");
    });
  });

  describe("错误恢复机制", () => {
    it("应该使用 tryOr 提供默认值", async () => {
      const result = await tryOr(
        async () => {
          throw new Error("操作失败");
        },
        "默认值"
      );

      expect(result).toBe("默认值");
    });

    it("应该使用 assert 进行条件检查", () => {
      expect(() => {
        const port = 99999;
        assert(port >= 1 && port <= 65535, ValidationError.invalidPort(port));
      }).toThrow(ValidationError);
    });

    it("应该使用 wrapError 转换错误类型", async () => {
      await expect(
        wrapError(
          async () => {
            throw new Error("ENOENT: no such file");
          },
          (cause) => FileSystemError.readFailed("/path/to/file", cause)
        )
      ).rejects.toThrow(FileSystemError);
    });

    it("应该使用 isErrorCode 检查特定错误", async () => {
      try {
        throw ConfigError.notFound();
      } catch (error) {
        expect(isErrorCode(error, ErrorCode.CONFIG_NOT_FOUND)).toBe(true);
        expect(isErrorCode(error, ErrorCode.FILE_NOT_FOUND)).toBe(false);
      }
    });
  });

  describe("错误链和上下文", () => {
    it("应该保留原始错误作为 cause", async () => {
      const originalError = new Error("原始错误");
      const wrappedError = ConfigError.invalid("配置格式错误", originalError);

      expect(wrappedError.cause).toBe(originalError);
      expect(wrappedError.message).toBe("配置文件格式无效");
    });

    it("应该在 DEBUG 模式下显示原始错误", async () => {
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = "true";

      const command = withErrorHandling(async () => {
        const cause = new Error("原始错误信息");
        throw ConfigError.invalid("配置格式错误", cause);
      });

      await command();

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("原始错误");

      process.env.DEBUG = originalDebug;
    });

    it("应该支持多层错误包装", async () => {
      const level1 = new Error("底层错误");
      const level2 = FileSystemError.readFailed("/path/to/file", level1);
      const level3 = ConfigError.invalid("无法读取配置", level2);

      expect(level3.cause).toBe(level2);
      expect(level2.cause).toBe(level1);
    });
  });

  describe("用户友好的错误提示", () => {
    it("应该为配置错误提供清晰的建议", async () => {
      const command = withErrorHandling(async () => {
        throw ConfigError.projectNotInitialized();
      });

      await command();

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("项目未初始化");
      expect(output).toContain("prdkit init");
    });

    it("应该为文件系统错误提供操作建议", async () => {
      const command = withErrorHandling(async () => {
        throw FileSystemError.permissionDenied("/path/to/file", "写入");
      });

      await command();

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("权限不足");
      expect(output).toContain("检查文件/目录权限");
    });

    it("应该为 Git 错误提供多个解决方案", async () => {
      const command = withErrorHandling(async () => {
        throw GitError.cloneFailed("git@github.com:user/repo.git");
      });

      await command();

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("检查网络连接");
      expect(output).toContain("SSH 密钥");
      expect(output).toContain("HTTPS");
    });

    it("应该为端口错误提供替代方案", async () => {
      const command = withErrorHandling(async () => {
        throw ServerError.portInUse(8080);
      });

      await command();

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("使用其他端口");
      expect(output).toContain("自动选择");
    });
  });

  describe("错误处理的边界情况", () => {
    it("应该处理未知类型的错误", async () => {
      const command = withErrorHandling(async () => {
        throw "字符串错误";
      });

      await command();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it("应该处理 null 和 undefined", async () => {
      const command1 = withErrorHandling(async () => {
        throw null;
      });

      await command1();
      expect(exitSpy).toHaveBeenCalledWith(2);

      exitSpy.mockClear();

      const command2 = withErrorHandling(async () => {
        throw undefined;
      });

      await command2();
      expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it("应该处理没有 message 的错误对象", async () => {
      const command = withErrorHandling(async () => {
        throw {};
      });

      await command();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(2);
    });
  });
});

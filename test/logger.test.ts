import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Logger, type LogLevel, type LogFormat } from "../src/utils/logger.js";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

describe("Logger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe("日志级别", () => {
    it("应该根据日志级别过滤输出", () => {
      const logger = new Logger({ level: "warn" });

      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining("debug message"));
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining("info message"));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("warn message"));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("error message"));
    });

    it("应该支持 debug 级别", () => {
      const logger = new Logger({ level: "debug" });

      logger.debug("debug message");

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("debug message"));
    });

    it("应该支持 success 级别", () => {
      const logger = new Logger({ level: "info" });

      logger.success("success message");

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("success message"));
    });

    it("应该支持动态设置日志级别", () => {
      const logger = new Logger({ level: "error" });

      logger.info("info message 1");
      expect(consoleLogSpy).not.toHaveBeenCalled();

      logger.setLevel("info");
      logger.info("info message 2");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("info message 2"));
    });
  });

  describe("日志格式化", () => {
    it("应该使用 pretty 格式输出", () => {
      const logger = new Logger({ level: "info", format: "pretty" });

      logger.info("test message");

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("test message"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("ℹ"));
    });

    it("应该使用 JSON 格式输出", () => {
      const logger = new Logger({ level: "info", format: "json" });

      logger.info("test message", { key: "value" });

      const call = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(call);

      expect(parsed).toMatchObject({
        level: "info",
        message: "test message",
        meta: { key: "value" }
      });
      expect(parsed.timestamp).toBeDefined();
    });

    it("应该支持动态切换格式", () => {
      const logger = new Logger({ level: "info", format: "pretty" });

      logger.info("pretty message");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("ℹ"));

      consoleLogSpy.mockClear();
      logger.setFormat("json");
      logger.info("json message");

      const call = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(call)).not.toThrow();
    });

    it("应该在 pretty 格式中包含 meta 信息", () => {
      const logger = new Logger({ level: "info", format: "pretty" });

      logger.info("test message", { userId: 123, action: "login" });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("test message")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("userId")
      );
    });
  });

  describe("不同日志级别的输出", () => {
    it("debug 应该输出到 console.log", () => {
      const logger = new Logger({ level: "debug" });

      logger.debug("debug message");

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("info 应该输出到 console.log", () => {
      const logger = new Logger({ level: "info" });

      logger.info("info message");

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("warn 应该输出到 console.warn", () => {
      const logger = new Logger({ level: "warn" });

      logger.warn("warn message");

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("error 应该输出到 console.error", () => {
      const logger = new Logger({ level: "error" });

      logger.error("error message");

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("success 应该输出到 console.log", () => {
      const logger = new Logger({ level: "info" });

      logger.success("success message");

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe("环境变量配置", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("应该从 PRDKIT_LOG_LEVEL 读取日志级别", () => {
      process.env.PRDKIT_LOG_LEVEL = "error";
      const logger = new Logger();

      logger.info("info message");
      logger.error("error message");

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("error message"));
    });

    it("应该从 PRDKIT_LOG_FORMAT 读取日志格式", () => {
      process.env.PRDKIT_LOG_FORMAT = "json";
      const logger = new Logger();

      logger.info("test message");

      const call = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(call)).not.toThrow();
    });

    it("应该忽略无效的环境变量值", () => {
      process.env.PRDKIT_LOG_LEVEL = "invalid";
      process.env.PRDKIT_LOG_FORMAT = "invalid";

      const logger = new Logger();
      const config = logger.getConfig();

      expect(config.level).toBe("info"); // 默认值
      expect(config.format).toBe("pretty"); // 默认值
    });
  });

  describe("文件日志", () => {
    const testLogFile = path.join(process.cwd(), "test-logs", "test.log");

    afterEach(async () => {
      if (existsSync(testLogFile)) {
        await rm(path.dirname(testLogFile), { recursive: true, force: true });
      }
    });

    it("应该写入日志到文件", async () => {
      const logger = new Logger({ level: "info", logFile: testLogFile });

      logger.info("test message", { key: "value" });

      // 等待异步写入完成
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(existsSync(testLogFile)).toBe(true);

      const content = await readFile(testLogFile, "utf8");
      const lines = content.trim().split("\n");
      const parsed = JSON.parse(lines[0]);

      expect(parsed).toMatchObject({
        level: "info",
        message: "test message",
        meta: { key: "value" }
      });
    });

    it("应该追加日志到现有文件", async () => {
      const logger = new Logger({ level: "info", logFile: testLogFile });

      logger.info("message 1");
      // 等待第一次写入完成
      await new Promise(resolve => setTimeout(resolve, 50));

      logger.info("message 2");
      // 等待第二次写入完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const content = await readFile(testLogFile, "utf8");
      const lines = content.trim().split("\n");

      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).message).toBe("message 1");
      expect(JSON.parse(lines[1]).message).toBe("message 2");
    });

    it("应该从 PRDKIT_LOG_FILE 读取日志文件路径", async () => {
      process.env.PRDKIT_LOG_FILE = testLogFile;
      const logger = new Logger();

      logger.info("test message");

      // 等待异步写入完成
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(existsSync(testLogFile)).toBe(true);
    });
  });

  describe("spinner", () => {
    it("应该返回 ora spinner 实例", () => {
      const logger = new Logger();

      const spinner = logger.spinner("loading...");

      expect(spinner).toBeDefined();
      expect(typeof spinner.start).toBe("function");
      expect(typeof spinner.stop).toBe("function");
      expect(typeof spinner.succeed).toBe("function");
      expect(typeof spinner.fail).toBe("function");
    });
  });

  describe("getConfig", () => {
    it("应该返回当前配置", () => {
      const logger = new Logger({ level: "debug", format: "json" });

      const config = logger.getConfig();

      expect(config.level).toBe("debug");
      expect(config.format).toBe("json");
    });

    it("返回的配置应该是只读的", () => {
      const logger = new Logger({ level: "info" });

      const config = logger.getConfig();
      (config as any).level = "debug";

      // 原始配置不应该被修改
      expect(logger.getConfig().level).toBe("info");
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../src/logger.js";
import { ConfigError, FileSystemError } from "../../src/errors.js";
import { withErrorHandling } from "../../src/error-handler.js";

describe("Logging Integration", () => {
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
    delete process.env.PRDKIT_LOG_LEVEL;
    delete process.env.PRDKIT_LOG_FORMAT;
  });

  describe("命令执行中的日志输出", () => {
    it("应该记录命令开始和结束", () => {
      const logger = new Logger({ level: "info" });

      logger.info("开始执行命令", { command: "init" });
      logger.success("命令执行成功", { duration: "2.5s" });

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy.mock.calls[0][0]).toContain("开始执行命令");
      expect(consoleLogSpy.mock.calls[1][0]).toContain("命令执行成功");
    });

    it("应该记录命令执行过程中的步骤", () => {
      const logger = new Logger({ level: "info" });

      logger.info("检查项目配置");
      logger.info("克隆模板仓库");
      logger.info("复制文件");
      logger.success("项目初始化完成");

      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
    });

    it("应该记录警告信息", () => {
      const logger = new Logger({ level: "warn" });

      logger.warn("配置文件使用默认值", { field: "author" });

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain("配置文件使用默认值");
    });

    it("应该记录错误信息", () => {
      const logger = new Logger({ level: "error" });

      logger.error("命令执行失败", { error: "配置文件不存在" });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("命令执行失败");
    });

    it("应该在 debug 模式下记录详细信息", () => {
      const logger = new Logger({ level: "debug" });

      logger.debug("读取配置文件", { path: "/path/to/config.json" });
      logger.debug("解析配置内容", { size: "1024 bytes" });

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy.mock.calls[0][0]).toContain("读取配置文件");
      expect(consoleLogSpy.mock.calls[1][0]).toContain("解析配置内容");
    });
  });

  describe("不同日志级别的实际效果", () => {
    it("生产环境应该只显示 info 及以上级别", () => {
      const logger = new Logger({ level: "info" });

      logger.debug("调试信息");
      logger.info("普通信息");
      logger.warn("警告信息");
      logger.error("错误信息");

      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // 只有 info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("开发环境应该显示所有日志", () => {
      const logger = new Logger({ level: "debug" });

      logger.debug("调试信息");
      logger.info("普通信息");
      logger.warn("警告信息");
      logger.error("错误信息");

      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug + info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("静默模式应该只显示错误", () => {
      const logger = new Logger({ level: "error" });

      logger.debug("调试信息");
      logger.info("普通信息");
      logger.warn("警告信息");
      logger.error("错误信息");

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("日志与错误处理的协同", () => {
    it("应该在错误发生前记录操作日志", async () => {
      const logger = new Logger({ level: "info" });
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

      const command = withErrorHandling(async () => {
        logger.info("开始读取配置文件");
        throw ConfigError.notFound("/path/to/config.json");
      });

      await command();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("开始读取配置文件")
      );
      expect(consoleErrorSpy).toHaveBeenCalled();

      exitSpy.mockRestore();
    });

    it("应该记录错误恢复过程", () => {
      const logger = new Logger({ level: "info" });

      logger.warn("端口 8080 已被占用");
      logger.info("尝试使用端口 8081");
      logger.success("服务器启动成功", { port: 8081 });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });

    it("应该记录重试操作", () => {
      const logger = new Logger({ level: "info" });

      logger.warn("网络请求失败，准备重试", { attempt: 1 });
      logger.warn("网络请求失败，准备重试", { attempt: 2 });
      logger.success("网络请求成功", { attempt: 3 });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("结构化日志", () => {
    it("应该支持 JSON 格式的结构化日志", () => {
      const logger = new Logger({ level: "info", format: "json" });

      logger.info("命令执行", {
        command: "init",
        args: { targetDir: "./my-project" },
        timestamp: Date.now(),
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("命令执行");
      expect(parsed.meta.command).toBe("init");
      expect(parsed.meta.args.targetDir).toBe("./my-project");
    });

    it("应该在 JSON 格式中包含时间戳", () => {
      const logger = new Logger({ level: "info", format: "json" });

      logger.info("测试消息");

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp).getTime()).toBeGreaterThan(0);
    });

    it("应该支持嵌套的元数据", () => {
      const logger = new Logger({ level: "info", format: "json" });

      logger.info("复杂操作", {
        operation: "clone",
        repository: {
          url: "git@github.com:user/repo.git",
          branch: "main",
        },
        options: {
          depth: 1,
          recursive: false,
        },
      });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.meta.repository.url).toBe("git@github.com:user/repo.git");
      expect(parsed.meta.options.depth).toBe(1);
    });
  });

  describe("性能监控", () => {
    it("应该记录操作耗时", () => {
      const logger = new Logger({ level: "info" });

      const startTime = Date.now();
      // 模拟操作
      const endTime = Date.now();
      const duration = endTime - startTime;

      logger.info("操作完成", { duration: `${duration}ms` });

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain("操作完成");
    });

    it("应该记录资源使用情况", () => {
      const logger = new Logger({ level: "debug" });

      logger.debug("内存使用", {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
      });

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe("环境变量配置", () => {
    it("应该通过环境变量控制日志级别", () => {
      process.env.PRDKIT_LOG_LEVEL = "warn";
      const logger = new Logger();

      logger.info("info message");
      logger.warn("warn message");

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("应该通过环境变量控制日志格式", () => {
      process.env.PRDKIT_LOG_FORMAT = "json";
      const logger = new Logger();

      logger.info("test message");

      const output = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
    });
  });

  describe("Spinner 集成", () => {
    it("应该创建并使用 spinner", () => {
      const logger = new Logger();
      const spinner = logger.spinner("正在克隆仓库...");

      expect(spinner).toBeDefined();
      expect(typeof spinner.start).toBe("function");
      expect(typeof spinner.succeed).toBe("function");
      expect(typeof spinner.fail).toBe("function");
    });

    it("应该在长时间操作中使用 spinner", async () => {
      const logger = new Logger();
      const spinner = logger.spinner("正在处理...");

      spinner.start();
      // 模拟异步操作
      await new Promise((resolve) => setTimeout(resolve, 10));
      spinner.succeed("处理完成");

      expect(spinner.isSpinning).toBe(false);
    });
  });
});

/**
 * 命令基类
 *
 * 提供所有命令的通用功能和生命周期管理
 */

import type { Command } from "commander";
import type { PrdkitConfig } from "../types.js";
import { loadConfig, resolveProjectRoot } from "../config.js";
import { logger } from "../logger.js";
import { ConfigError, PrdkitError } from "../errors.js";
import type { Ora } from "ora";

/**
 * 命令元数据
 */
export interface CommandMetadata {
  name: string;
  description: string;
  aliases?: string[];
  arguments?: ArgumentMetadata[];
  options?: OptionMetadata[];
  helpText?: string;
}

/**
 * 参数元数据
 */
export interface ArgumentMetadata {
  name: string;
  description?: string;
  required?: boolean;
  variadic?: boolean;
}

/**
 * 选项元数据
 */
export interface OptionMetadata {
  flags: string;
  description?: string;
  defaultValue?: any;
  required?: boolean;
  hidden?: boolean;
}

/**
 * 命令执行上下文
 */
export interface CommandContext {
  projectRoot?: string;
  config?: PrdkitConfig;
  cwd: string;
}

/**
 * 命令基类
 *
 * 所有命令都应继承此类，提供统一的生命周期和通用功能
 */
export abstract class CommandBase<TArgs = any, TOptions = any> {
  /**
   * 命令元数据
   */
  abstract readonly metadata: CommandMetadata;

  /**
   * 是否需要项目已初始化
   */
  protected requiresProject = false;

  /**
   * 命令执行上下文
   */
  protected context: CommandContext = {
    cwd: process.cwd()
  };

  /**
   * 生命周期：执行前钩子
   *
   * 在命令执行前调用，可用于验证、准备环境等
   */
  protected async beforeExecute?(): Promise<void>;

  /**
   * 生命周期：执行命令
   *
   * 子类必须实现此方法
   */
  abstract execute(args: TArgs, options: TOptions): Promise<void>;

  /**
   * 生命周期：执行后钩子
   *
   * 在命令执行后调用，可用于清理、日志等
   */
  protected async afterExecute?(): Promise<void>;

  /**
   * 运行命令（内部方法）
   *
   * 管理完整的命令生命周期
   */
  async run(args: TArgs, options: TOptions): Promise<void> {
    try {
      // 初始化上下文
      await this.initializeContext();

      // 执行前钩子
      if (this.beforeExecute) {
        await this.beforeExecute();
      }

      // 执行命令
      await this.execute(args, options);

      // 执行后钩子
      if (this.afterExecute) {
        await this.afterExecute();
      }
    } catch (error) {
      // 错误会被 error-handler 捕获和处理
      throw error;
    }
  }

  /**
   * 初始化命令上下文
   */
  protected async initializeContext(): Promise<void> {
    this.context.cwd = process.cwd();

    if (this.requiresProject) {
      const projectRoot = await resolveProjectRoot(this.context.cwd);
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }
      this.context.projectRoot = projectRoot;
      this.context.config = await loadConfig(projectRoot);
    } else {
      // 尝试加载配置，但不强制要求
      const projectRoot = await resolveProjectRoot(this.context.cwd);
      if (projectRoot) {
        this.context.projectRoot = projectRoot;
        this.context.config = await loadConfig(projectRoot);
      }
    }
  }

  /**
   * 获取项目根目录（必须已初始化）
   */
  protected getProjectRoot(): string {
    if (!this.context.projectRoot) {
      throw ConfigError.projectNotInitialized();
    }
    return this.context.projectRoot;
  }

  /**
   * 获取项目配置（必须已初始化）
   */
  protected getConfig(): PrdkitConfig {
    if (!this.context.config) {
      throw ConfigError.projectNotInitialized();
    }
    return this.context.config;
  }

  /**
   * 创建 spinner
   */
  protected spinner(message: string): Ora {
    return logger.spinner(message);
  }

  /**
   * 包装异步操作，显示 spinner
   */
  protected async withSpinner<T>(
    message: string,
    fn: () => Promise<T>,
    options?: {
      successMessage?: string;
      failMessage?: string;
    }
  ): Promise<T> {
    const spinner = this.spinner(message).start();
    try {
      const result = await fn();
      if (options?.successMessage) {
        spinner.succeed(options.successMessage);
      } else {
        spinner.stop();
      }
      return result;
    } catch (error) {
      if (options?.failMessage) {
        spinner.fail(options.failMessage);
      } else {
        spinner.fail(message + " 失败");
      }
      throw error;
    }
  }

  /**
   * 日志方法
   */
  protected log = {
    debug: (message: string, meta?: Record<string, unknown>) => logger.debug(message, meta),
    info: (message: string, meta?: Record<string, unknown>) => logger.info(message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => logger.warn(message, meta),
    error: (message: string, meta?: Record<string, unknown>) => logger.error(message, meta),
    success: (message: string, meta?: Record<string, unknown>) => logger.success(message, meta)
  };

  /**
   * 验证输入
   */
  protected validateInput(condition: boolean, message: string): void {
    if (!condition) {
      throw new PrdkitError(
        "VALIDATION_FAILED" as any,
        message
      );
    }
  }

  /**
   * 确保值存在
   */
  protected ensureValue<T>(value: T | undefined | null, errorMessage: string): T {
    if (value === undefined || value === null) {
      throw new PrdkitError(
        "MISSING_REQUIRED_FIELD" as any,
        errorMessage
      );
    }
    return value;
  }
}

/**
 * 注册命令到 Commander 程序
 */
export function registerCommand(
  program: Command,
  commandInstance: CommandBase
): void {
  const { metadata } = commandInstance;
  const cmd = program.command(metadata.name);

  // 设置描述
  cmd.description(metadata.description);

  // 设置别名
  if (metadata.aliases && metadata.aliases.length > 0) {
    cmd.aliases(metadata.aliases);
  }

  // 添加参数
  if (metadata.arguments) {
    for (const arg of metadata.arguments) {
      const argSyntax = arg.required
        ? `<${arg.name}${arg.variadic ? "..." : ""}>`
        : `[${arg.name}${arg.variadic ? "..." : ""}]`;
      cmd.argument(argSyntax, arg.description || "");
    }
  }

  // 添加选项
  if (metadata.options) {
    for (const opt of metadata.options) {
      if (opt.hidden) {
        cmd.addOption(
          new (require("commander").Option)(opt.flags, opt.description)
            .default(opt.defaultValue)
            .hideHelp()
        );
      } else if (opt.required) {
        cmd.requiredOption(opt.flags, opt.description, opt.defaultValue);
      } else {
        cmd.option(opt.flags, opt.description, opt.defaultValue);
      }
    }
  }

  // 添加帮助文本
  if (metadata.helpText) {
    cmd.addHelpText("after", `\n${metadata.helpText}`);
  }

  // 设置 action
  cmd.action(async (...actionArgs: any[]) => {
    // Commander 将参数和选项分开传递
    // 最后一个参数是 Command 实例，倒数第二个是 options
    const cmdInstance = actionArgs[actionArgs.length - 1];
    const options = actionArgs[actionArgs.length - 2];
    const args = actionArgs.slice(0, -2);

    // 构造参数对象
    const argsObj = metadata.arguments
      ? metadata.arguments.reduce((acc, arg, index) => {
          acc[arg.name] = args[index];
          return acc;
        }, {} as any)
      : {};

    await commandInstance.run(argsObj, options);
  });
}

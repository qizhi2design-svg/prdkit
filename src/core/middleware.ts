/**
 * 命令中间件
 *
 * 提供可复用的命令增强功能
 */

import type { CommandBase } from "./command-base.js";
import { z, type ZodSchema } from "zod";
import { ValidationError } from "../errors.js";

/**
 * 中间件函数类型
 */
export type Middleware<TArgs = any, TOptions = any> = (
  command: CommandBase<TArgs, TOptions>,
  args: TArgs,
  options: TOptions
) => Promise<void> | void;

/**
 * 中间件组合器
 */
export class MiddlewareComposer {
  private middlewares: Middleware[] = [];

  /**
   * 添加中间件
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * 执行所有中间件
   */
  async execute(command: CommandBase, args: any, options: any): Promise<void> {
    for (const middleware of this.middlewares) {
      await middleware(command, args, options);
    }
  }
}

/**
 * 验证输入中间件
 *
 * 使用 Zod schema 验证命令参数和选项
 *
 * @example
 * ```typescript
 * const argsSchema = z.object({
 *   target: z.string().optional()
 * });
 *
 * const optionsSchema = z.object({
 *   force: z.boolean().optional()
 * });
 *
 * const middleware = validateInput(argsSchema, optionsSchema);
 * ```
 */
export function validateInput<TArgs = any, TOptions = any>(
  argsSchema?: ZodSchema<TArgs>,
  optionsSchema?: ZodSchema<TOptions>
): Middleware<TArgs, TOptions> {
  return async (command, args, options) => {
    try {
      if (argsSchema) {
        argsSchema.parse(args);
      }
      if (optionsSchema) {
        optionsSchema.parse(options);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ");
        throw ValidationError.validationFailed(messages, error);
      }
      throw error;
    }
  };
}

/**
 * 要求项目已初始化中间件
 *
 * 确保命令在已初始化的项目中运行
 */
export function requireProject(): Middleware {
  return async (command) => {
    // CommandBase 的 initializeContext 已经处理了这个逻辑
    // 这个中间件主要用于显式声明依赖
    if (!(command as any).requiresProject) {
      (command as any).requiresProject = true;
    }
  };
}

/**
 * 错误处理中间件
 *
 * 包装命令执行，提供统一的错误处理
 */
export function withErrorHandling(
  errorHandler?: (error: unknown, command: CommandBase) => Promise<void> | void
): Middleware {
  return async (command, args, options) => {
    const originalExecute = command.execute.bind(command);
    command.execute = async (execArgs: any, execOptions: any) => {
      try {
        await originalExecute(execArgs, execOptions);
      } catch (error) {
        if (errorHandler) {
          await errorHandler(error, command);
        } else {
          throw error;
        }
      }
    };
  };
}

/**
 * 日志中间件
 *
 * 记录命令执行的开始和结束
 */
export function withLogging(options?: {
  logStart?: boolean;
  logEnd?: boolean;
  logDuration?: boolean;
}): Middleware {
  const { logStart = true, logEnd = true, logDuration = true } = options || {};

  return async (command, args, options) => {
    const startTime = Date.now();
    const commandName = (command as any).metadata?.name || "unknown";

    if (logStart) {
      (command as any).log.debug(`开始执行命令: ${commandName}`);
    }

    const originalExecute = command.execute.bind(command);
    command.execute = async (execArgs: any, execOptions: any) => {
      await originalExecute(execArgs, execOptions);

      if (logEnd || logDuration) {
        const duration = Date.now() - startTime;
        if (logEnd) {
          (command as any).log.debug(`命令执行完成: ${commandName}`);
        }
        if (logDuration) {
          (command as any).log.debug(`执行耗时: ${duration}ms`);
        }
      }
    };
  };
}

/**
 * 性能监控中间件
 *
 * 监控命令执行性能
 */
export function withPerformanceMonitoring(
  threshold?: number,
  onSlowCommand?: (commandName: string, duration: number) => void
): Middleware {
  const slowThreshold = threshold || 5000; // 默认 5 秒

  return async (command, args, options) => {
    const startTime = Date.now();
    const commandName = (command as any).metadata?.name || "unknown";

    const originalExecute = command.execute.bind(command);
    command.execute = async (execArgs: any, execOptions: any) => {
      await originalExecute(execArgs, execOptions);

      const duration = Date.now() - startTime;
      if (duration > slowThreshold) {
        if (onSlowCommand) {
          onSlowCommand(commandName, duration);
        } else {
          (command as any).log.warn(`命令执行较慢: ${commandName} (${duration}ms)`);
        }
      }
    };
  };
}

/**
 * 确认中间件
 *
 * 在执行危险操作前要求用户确认
 */
export function requireConfirmation(
  message: string,
  options?: {
    skipOnFlag?: string; // 如果存在此选项标志，跳过确认
  }
): Middleware {
  return async (command, args, cmdOptions) => {
    // 检查是否有跳过标志
    if (options?.skipOnFlag && (cmdOptions as any)[options.skipOnFlag]) {
      return;
    }

    const { confirm } = await import("@inquirer/prompts");
    const shouldContinue = await confirm({
      message,
      default: false
    });

    if (!shouldContinue) {
      throw new Error("操作已取消");
    }
  };
}

/**
 * 条件中间件
 *
 * 根据条件决定是否执行中间件
 */
export function conditional(
  condition: (command: CommandBase, args: any, options: any) => boolean | Promise<boolean>,
  middleware: Middleware
): Middleware {
  return async (command, args, options) => {
    const shouldExecute = await condition(command, args, options);
    if (shouldExecute) {
      await middleware(command, args, options);
    }
  };
}

/**
 * 组合多个中间件
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return async (command, args, options) => {
    for (const middleware of middlewares) {
      await middleware(command, args, options);
    }
  };
}

/**
 * 应用中间件到命令
 */
export function applyMiddleware(
  command: CommandBase,
  ...middlewares: Middleware[]
): CommandBase {
  const originalRun = command.run.bind(command);

  command.run = async (args: any, options: any) => {
    // 执行所有中间件
    for (const middleware of middlewares) {
      await middleware(command, args, options);
    }

    // 执行原始命令
    await originalRun(args, options);
  };

  return command;
}

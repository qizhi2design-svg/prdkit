/**
 * 错误处理器
 *
 * 提供统一的错误处理和格式化输出
 */

import chalk from "chalk";
import {
  PrdkitError,
  isPrdkitError,
  isRecoverableError,
  UserCancelledError,
  ErrorCode,
} from "./errors.js";

/**
 * 格式化错误输出
 */
export function formatError(error: PrdkitError): string {
  const lines: string[] = [];

  // 错误标题
  lines.push(`${chalk.red("✖")} ${chalk.bold(error.message)}`);

  // 错误代码
  lines.push(`${chalk.gray("错误代码：")} ${chalk.yellow(error.code)}`);

  // 详细信息
  if (error.details) {
    lines.push(`${chalk.gray("详细信息：")} ${error.details}`);
  }

  // 解决建议
  if (error.suggestions.length > 0) {
    lines.push("");
    lines.push(chalk.cyan("建议："));
    for (const suggestion of error.suggestions) {
      lines.push(`  ${chalk.cyan("•")} ${suggestion}`);
    }
  }

  // 原始错误（仅在开发模式下显示）
  if (error.cause && process.env.DEBUG) {
    lines.push("");
    lines.push(chalk.gray("原始错误："));
    lines.push(chalk.gray(error.cause.stack || error.cause.message));
  }

  return lines.join("\n");
}

/**
 * 格式化简单错误消息（用于非 PrdkitError）
 */
function formatSimpleError(error: Error): string {
  const lines: string[] = [];

  lines.push(`${chalk.red("✖")} ${chalk.bold(error.message)}`);

  if (process.env.DEBUG && error.stack) {
    lines.push("");
    lines.push(chalk.gray("堆栈跟踪："));
    lines.push(chalk.gray(error.stack));
  }

  return lines.join("\n");
}

/**
 * 统一错误处理入口
 *
 * 处理所有类型的错误并格式化输出，然后退出进程
 */
export function handleError(error: unknown): never {
  // 用户取消操作，静默退出
  if (error instanceof UserCancelledError) {
    console.log(chalk.yellow("\n操作已取消"));
    process.exit(0);
  }

  // PrdkitError - 使用格式化输出
  if (isPrdkitError(error)) {
    console.error("\n" + formatError(error));

    // 可恢复错误使用退出码 1，不可恢复错误使用退出码 2
    const exitCode = isRecoverableError(error) ? 1 : 2;
    process.exit(exitCode);
  }

  // 标准 Error 对象
  if (error instanceof Error) {
    console.error("\n" + formatSimpleError(error));
    process.exit(2);
  }

  // 其他类型的错误
  console.error(`\n${chalk.red("✖")} ${chalk.bold("未知错误")}`);
  console.error(String(error));
  process.exit(2);
}

/**
 * 包装异步函数，自动处理错误
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error);
    }
  }) as T;
}

/**
 * 断言条件为真，否则抛出错误
 */
export function assert(
  condition: boolean,
  error: PrdkitError | (() => PrdkitError)
): asserts condition {
  if (!condition) {
    throw typeof error === "function" ? error() : error;
  }
}

/**
 * 尝试执行操作，失败时返回默认值
 */
export async function tryOr<T>(
  fn: () => Promise<T>,
  defaultValue: T
): Promise<T> {
  try {
    return await fn();
  } catch {
    return defaultValue;
  }
}

/**
 * 尝试执行操作，失败时返回 undefined
 */
export async function tryOrUndefined<T>(
  fn: () => Promise<T>
): Promise<T | undefined> {
  return tryOr(fn, undefined);
}

/**
 * 包装可能抛出错误的操作，转换为 PrdkitError
 */
export async function wrapError<T>(
  fn: () => Promise<T>,
  errorFactory: (cause: Error) => PrdkitError
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isPrdkitError(error)) {
      throw error;
    }
    const cause = error instanceof Error ? error : new Error(String(error));
    throw errorFactory(cause);
  }
}

/**
 * 检查错误是否为特定错误代码
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  return isPrdkitError(error) && error.code === code;
}

/**
 * 检查错误是否为特定错误类型
 */
export function isErrorType<T extends PrdkitError>(
  error: unknown,
  errorClass: new (...args: any[]) => T
): error is T {
  return error instanceof errorClass;
}

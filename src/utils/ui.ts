import type { Ora } from "ora";
import { logger } from "./logger.js";

/**
 * 向后兼容层：保留原有的 UI 函数，内部使用新的 logger
 */

export function success(message: string): void {
  logger.success(message);
}

export function info(message: string): void {
  logger.info(message);
}

export function warn(message: string): void {
  logger.warn(message);
}

export function fail(message: string): void {
  logger.error(message);
}

/**
 * 输出错误并退出进程
 * @deprecated 使用 error-handler.ts 中的 handleError 替代
 */
export function failAndExit(message: string, exitCode = 1): never {
  fail(message);
  process.exit(exitCode);
}

export async function withSpinner<T>(
  spinner: Ora,
  task: () => Promise<T>,
  options: { successText?: string; failText?: string; stopOnSuccess?: boolean } = {}
): Promise<T> {
  try {
    const result = await task();
    if (options.stopOnSuccess) {
      spinner.stop();
    } else if (options.successText) {
      spinner.succeed(options.successText);
    }
    return result;
  } catch (error) {
    if (spinner.isSpinning) {
      if (options.failText) spinner.fail(options.failText);
      else spinner.stop();
    }
    throw error;
  }
}

// Re-export logger for direct access
export { logger } from "./logger.js";

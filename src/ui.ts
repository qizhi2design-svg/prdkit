import chalk from "chalk";
import type { Ora } from "ora";

export function success(message: string): void {
  console.log(`${chalk.green("✓")} ${message}`);
}

export function info(message: string): void {
  console.log(`${chalk.cyan("i")} ${message}`);
}

export function warn(message: string): void {
  console.warn(`${chalk.yellow("!")} ${message}`);
}

export function fail(message: string): void {
  console.error(`${chalk.red("✖")} ${message}`);
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

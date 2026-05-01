import chalk from "chalk";
import ora, { type Ora } from "ora";
import { writeFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error" | "success";

export type LogFormat = "pretty" | "json";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

export interface LoggerConfig {
  level: LogLevel;
  format: LogFormat;
  logFile?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  success: 1,
  warn: 2,
  error: 3
};

export class Logger {
  private config: LoggerConfig;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: this.getEnvLogLevel() || config?.level || "info",
      format: this.getEnvLogFormat() || config?.format || "pretty",
      logFile: this.getEnvLogFile() || config?.logFile
    };
  }

  private getEnvLogLevel(): LogLevel | undefined {
    const level = process.env.PRDKIT_LOG_LEVEL?.toLowerCase();
    if (level && level in LOG_LEVELS) {
      return level as LogLevel;
    }
    return undefined;
  }

  private getEnvLogFormat(): LogFormat | undefined {
    const format = process.env.PRDKIT_LOG_FORMAT?.toLowerCase();
    if (format === "pretty" || format === "json") {
      return format;
    }
    return undefined;
  }

  private getEnvLogFile(): string | undefined {
    return process.env.PRDKIT_LOG_FILE;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  private createLogEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta
    };
  }

  private formatPretty(entry: LogEntry): string {
    const { level, message, meta } = entry;

    let icon: string;
    let colorFn: (text: string) => string;

    switch (level) {
      case "debug":
        icon = "◆";
        colorFn = chalk.gray;
        break;
      case "info":
        icon = "ℹ";
        colorFn = chalk.blue;
        break;
      case "warn":
        icon = "⚠";
        colorFn = chalk.yellow;
        break;
      case "error":
        icon = "✖";
        colorFn = chalk.red;
        break;
      case "success":
        icon = "✓";
        colorFn = chalk.green;
        break;
    }

    let output = `${colorFn(icon)} ${message}`;

    if (meta && Object.keys(meta).length > 0) {
      output += chalk.gray(` ${JSON.stringify(meta)}`);
    }

    return output;
  }

  private formatJson(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    if (!this.config.logFile) return;

    try {
      const logDir = path.dirname(this.config.logFile);
      if (!existsSync(logDir)) {
        await mkdir(logDir, { recursive: true });
      }

      const line = this.formatJson(entry) + "\n";

      if (existsSync(this.config.logFile)) {
        await appendFile(this.config.logFile, line, "utf8");
      } else {
        await writeFile(this.config.logFile, line, "utf8");
      }
    } catch (error) {
      // Silently fail to avoid infinite loop
      console.error("Failed to write to log file:", error);
    }
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createLogEntry(level, message, meta);

    // Console output
    const output = this.config.format === "json"
      ? this.formatJson(entry)
      : this.formatPretty(entry);

    if (level === "error") {
      console.error(output);
    } else if (level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }

    // File output (async, non-blocking)
    if (this.config.logFile) {
      this.writeToFile(entry).catch(() => {
        // Ignore file write errors
      });
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }

  success(message: string, meta?: Record<string, unknown>): void {
    this.log("success", message, meta);
  }

  spinner(message: string): Ora {
    return ora(message);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  setFormat(format: LogFormat): void {
    this.config.format = format;
  }

  getConfig(): Readonly<LoggerConfig> {
    return { ...this.config };
  }
}

// Export singleton instance
export const logger = new Logger();

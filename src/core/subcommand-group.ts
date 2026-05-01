/**
 * 子命令组管理器
 *
 * 简化子命令的注册和管理
 */

import type { Command } from "commander";
import type { CommandBase } from "./command-base.js";
import { registerCommand } from "./command-base.js";
import type { CommandConstructor } from "./command-factory.js";

/**
 * 子命令组配置
 */
export interface SubCommandGroupConfig {
  name: string;
  description: string;
  aliases?: string[];
  helpText?: string;
}

/**
 * 子命令组
 *
 * 管理一组相关的子命令（如 prd create, prd list）
 *
 * @example
 * ```typescript
 * const prdGroup = new SubCommandGroup({
 *   name: "prd",
 *   description: "PRD 相关命令"
 * });
 *
 * prdGroup.addCommand(PrdCreateCommand);
 * prdGroup.addCommand(PrdListCommand);
 * prdGroup.register(program);
 * ```
 */
export class SubCommandGroup {
  private config: SubCommandGroupConfig;
  private commands: CommandConstructor[] = [];

  constructor(config: SubCommandGroupConfig) {
    this.config = config;
  }

  /**
   * 添加子命令
   *
   * @param commandClass - 命令类构造函数
   * @returns this，支持链式调用
   */
  addCommand(commandClass: CommandConstructor): this {
    this.commands.push(commandClass);
    return this;
  }

  /**
   * 批量添加子命令
   *
   * @param commandClasses - 命令类构造函数数组
   * @returns this，支持链式调用
   */
  addCommands(commandClasses: CommandConstructor[]): this {
    this.commands.push(...commandClasses);
    return this;
  }

  /**
   * 注册到 Commander 程序
   *
   * @param program - Commander 程序实例
   */
  register(program: Command): void {
    // 创建子命令组
    const group = program.command(this.config.name);
    group.description(this.config.description);

    // 设置别名
    if (this.config.aliases && this.config.aliases.length > 0) {
      group.aliases(this.config.aliases);
    }

    // 添加帮助文本
    if (this.config.helpText) {
      group.addHelpText("after", `\n${this.config.helpText}`);
    }

    // 注册所有子命令
    for (const CommandClass of this.commands) {
      const commandInstance = new CommandClass();
      registerCommand(group, commandInstance);
    }
  }

  /**
   * 获取配置
   */
  getConfig(): SubCommandGroupConfig {
    return { ...this.config };
  }

  /**
   * 获取子命令数量
   */
  getCommandCount(): number {
    return this.commands.length;
  }
}

/**
 * 创建子命令组的便捷函数
 *
 * @example
 * ```typescript
 * const prdGroup = createSubCommandGroup(
 *   { name: "prd", description: "PRD 相关命令" },
 *   [PrdCreateCommand, PrdListCommand]
 * );
 * prdGroup.register(program);
 * ```
 */
export function createSubCommandGroup(
  config: SubCommandGroupConfig,
  commands?: CommandConstructor[]
): SubCommandGroup {
  const group = new SubCommandGroup(config);
  if (commands && commands.length > 0) {
    group.addCommands(commands);
  }
  return group;
}

/**
 * 命令工厂
 *
 * 提供命令的创建、注册和批量管理功能
 */

import type { Command } from "commander";
import { CommandBase, registerCommand } from "./command-base.js";

/**
 * 命令构造函数类型
 */
export type CommandConstructor = new () => CommandBase;

/**
 * 命令工厂类
 */
export class CommandFactory {
  /**
   * 创建命令实例
   */
  static create(CommandClass: CommandConstructor): CommandBase {
    return new CommandClass();
  }

  /**
   * 注册单个命令到 Commander 程序
   */
  static register(program: Command, CommandClass: CommandConstructor): void {
    const commandInstance = this.create(CommandClass);
    registerCommand(program, commandInstance);
  }

  /**
   * 批量注册多个命令
   */
  static registerAll(program: Command, commands: CommandConstructor[]): void {
    for (const CommandClass of commands) {
      this.register(program, CommandClass);
    }
  }

  /**
   * 注册命令组（带子命令）
   */
  static registerGroup(
    program: Command,
    groupName: string,
    groupDescription: string,
    commands: CommandConstructor[]
  ): void {
    const group = program.command(groupName).description(groupDescription);

    for (const CommandClass of commands) {
      const commandInstance = this.create(CommandClass);
      registerCommand(group, commandInstance);
    }
  }
}

/**
 * 命令注册器装饰器
 *
 * 用于自动收集和注册命令
 */
export class CommandRegistry {
  private static commands: Map<string, CommandConstructor> = new Map();
  private static groups: Map<string, { description: string; commands: CommandConstructor[] }> = new Map();

  /**
   * 注册命令类
   */
  static registerCommand(name: string, CommandClass: CommandConstructor): void {
    this.commands.set(name, CommandClass);
  }

  /**
   * 注册命令组
   */
  static registerGroup(name: string, description: string, commands: CommandConstructor[]): void {
    this.groups.set(name, { description, commands });
  }

  /**
   * 获取所有已注册的命令
   */
  static getCommands(): Map<string, CommandConstructor> {
    return new Map(this.commands);
  }

  /**
   * 获取所有已注册的命令组
   */
  static getGroups(): Map<string, { description: string; commands: CommandConstructor[] }> {
    return new Map(this.groups);
  }

  /**
   * 将所有已注册的命令注册到 Commander 程序
   */
  static registerAllToProgram(program: Command): void {
    // 注册独立命令
    for (const CommandClass of this.commands.values()) {
      CommandFactory.register(program, CommandClass);
    }

    // 注册命令组
    for (const [groupName, { description, commands }] of this.groups.entries()) {
      CommandFactory.registerGroup(program, groupName, description, commands);
    }
  }

  /**
   * 清空注册表（主要用于测试）
   */
  static clear(): void {
    this.commands.clear();
    this.groups.clear();
  }
}

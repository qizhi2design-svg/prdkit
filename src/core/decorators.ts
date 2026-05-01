/**
 * 命令装饰器
 *
 * 提供声明式的命令定义方式（可选功能）
 *
 * 注意：装饰器是可选的高级功能，推荐直接使用 CommandBase 类
 */

import type { CommandMetadata, ArgumentMetadata, OptionMetadata } from "./command-base.js";
import type { CommandConstructor } from "./command-factory.js";
import { CommandRegistry } from "./command-factory.js";

/**
 * 命令装饰器配置
 */
export interface CommandDecoratorConfig {
  name: string;
  description: string;
  aliases?: string[];
  helpText?: string;
  requiresProject?: boolean;
}

/**
 * 参数装饰器配置
 */
export interface ArgumentDecoratorConfig {
  name: string;
  description?: string;
  required?: boolean;
  variadic?: boolean;
}

/**
 * 选项装饰器配置
 */
export interface OptionDecoratorConfig {
  flags: string;
  description?: string;
  defaultValue?: any;
  required?: boolean;
  hidden?: boolean;
}

/**
 * 元数据存储（使用 WeakMap 避免内存泄漏）
 */
const metadataStore = new WeakMap<any, CommandMetadata>();
const requiresProjectStore = new WeakMap<any, boolean>();

/**
 * @Command 装饰器
 *
 * 用于定义命令的基本信息
 *
 * @example
 * ```typescript
 * @Command({
 *   name: 'init',
 *   description: '初始化项目',
 *   aliases: ['i'],
 *   requiresProject: false
 * })
 * class InitCommand extends CommandBase {
 *   async execute(args: any, options: any) {
 *     // 实现
 *   }
 * }
 * ```
 */
export function Command(config: CommandDecoratorConfig) {
  return function <T extends CommandConstructor>(target: T): T {
    // 存储元数据
    const metadata: CommandMetadata = {
      name: config.name,
      description: config.description,
      aliases: config.aliases,
      helpText: config.helpText
    };
    metadataStore.set(target.prototype, metadata);

    // 存储 requiresProject 标志
    if (config.requiresProject !== undefined) {
      requiresProjectStore.set(target.prototype, config.requiresProject);
    }

    // 自动注册到命令注册表
    CommandRegistry.registerCommand(config.name, target);

    return target;
  };
}

/**
 * @Argument 装饰器
 *
 * 用于定义命令参数
 *
 * 注意：目前装饰器功能有限，推荐在 metadata 中直接定义
 */
export function Argument(config: ArgumentDecoratorConfig) {
  return function (target: any, propertyKey: string | symbol) {
    // 装饰器实现（可选）
    // 推荐直接在 metadata 中定义参数
  };
}

/**
 * @Option 装饰器
 *
 * 用于定义命令选项
 *
 * 注意：目前装饰器功能有限，推荐在 metadata 中直接定义
 */
export function Option(config: OptionDecoratorConfig) {
  return function (target: any, propertyKey: string | symbol) {
    // 装饰器实现（可选）
    // 推荐直接在 metadata 中定义选项
  };
}

/**
 * @RequiresProject 装饰器
 *
 * 标记命令需要在已初始化的项目中运行
 *
 * @example
 * ```typescript
 * @RequiresProject()
 * class CreateCommand extends CommandBase {
 *   // ...
 * }
 * ```
 */
export function RequiresProject() {
  return function <T extends CommandConstructor>(target: T): T {
    requiresProjectStore.set(target.prototype, true);
    return target;
  };
}

/**
 * 获取命令元数据
 */
export function getCommandMetadata(target: any): CommandMetadata | undefined {
  return metadataStore.get(target);
}

/**
 * 获取 requiresProject 标志
 */
export function getRequiresProject(target: any): boolean {
  return requiresProjectStore.get(target) ?? false;
}

/**
 * 辅助函数：应用装饰器元数据到命令实例
 */
export function applyDecoratorMetadata(commandInstance: any): void {
  const metadata = getCommandMetadata(commandInstance);
  if (metadata) {
    (commandInstance as any).metadata = metadata;
  }

  const requiresProject = getRequiresProject(commandInstance);
  if (requiresProject) {
    (commandInstance as any).requiresProject = requiresProject;
  }
}

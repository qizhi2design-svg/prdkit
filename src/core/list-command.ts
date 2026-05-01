/**
 * List 命令基类
 *
 * 为所有 list 子命令提供统一的结构和行为
 */

import type { CommandMetadata } from "./command-base.js";
import { CommandBase } from "./command-base.js";
import chalk from "chalk";

/**
 * List 命令选项
 */
export interface ListOptions {
  json?: boolean;
}

/**
 * List 命令基类
 *
 * 提供通用的列表扫描、格式化和输出功能
 *
 * @example
 * ```typescript
 * export class PrdListCommand extends ListCommand<PrdInfo> {
 *   readonly metadata = {
 *     name: "list",
 *     description: "列出所有 PRD 文档"
 *   };
 *
 *   protected getItemsDir(): string {
 *     return path.join(this.getProjectRoot(), "workspace", "prds");
 *   }
 *
 *   protected async scanItems(dir: string): Promise<PrdInfo[]> {
 *     return scanPrdFiles(dir);
 *   }
 *
 *   protected formatItem(item: PrdInfo, index: number): string {
 *     return `${index + 1}. ${item.title}`;
 *   }
 * }
 * ```
 */
export abstract class ListCommand<TItem = any> extends CommandBase<{}, ListOptions> {
  /**
   * 命令元数据
   */
  abstract readonly metadata: CommandMetadata;

  /**
   * 需要项目已初始化
   */
  protected requiresProject = true;

  /**
   * 获取列表项所在目录
   *
   * 子类必须实现此方法，返回要扫描的目录路径
   */
  protected abstract getItemsDir(): string;

  /**
   * 扫描列表项
   *
   * 子类必须实现此方法，从目录中扫描并返回列表项
   *
   * @param dir - 要扫描的目录路径
   * @returns 列表项数组
   */
  protected abstract scanItems(dir: string): Promise<TItem[]> | TItem[];

  /**
   * 格式化单个列表项（用于终端输出）
   *
   * 子类必须实现此方法，将列表项格式化为可读的字符串
   *
   * @param item - 列表项
   * @param index - 列表项索引（从 0 开始）
   * @returns 格式化后的字符串
   */
  protected abstract formatItem(item: TItem, index: number): string;

  /**
   * 获取列表项的 JSON 表示
   *
   * 默认返回原始对象，子类可以覆盖此方法来自定义 JSON 输出
   *
   * @param item - 列表项
   * @returns JSON 对象
   */
  protected getItemJson(item: TItem): any {
    return item;
  }

  /**
   * 获取列表的 JSON 包装键名
   *
   * 默认为 "items"，子类可以覆盖
   *
   * @example
   * ```typescript
   * protected getJsonWrapperKey(): string {
   *   return "prds"; // 输出 { "prds": [...] }
   * }
   * ```
   */
  protected getJsonWrapperKey(): string {
    return "items";
  }

  /**
   * 获取空列表提示消息
   *
   * 默认为通用消息，子类可以覆盖
   */
  protected getEmptyMessage(): string {
    return "未找到任何项目";
  }

  /**
   * 获取列表统计消息
   *
   * 默认显示总数，子类可以覆盖来添加更多统计信息
   *
   * @param items - 列表项数组
   * @returns 统计消息
   */
  protected getStatsMessage(items: TItem[]): string {
    return `共找到 ${items.length} 个项目`;
  }

  /**
   * 格式化整个列表（用于终端输出）
   *
   * 默认实现将所有项目用双换行符连接，子类可以覆盖来自定义布局
   *
   * @param items - 列表项数组
   * @returns 格式化后的字符串
   */
  protected formatList(items: TItem[]): string {
    if (items.length === 0) {
      return chalk.yellow(this.getEmptyMessage());
    }

    return items.map((item, index) => this.formatItem(item, index)).join("\n\n");
  }

  /**
   * 输出 JSON 格式
   *
   * @param items - 列表项数组
   */
  protected outputJson(items: TItem[]): void {
    const jsonItems = items.map((item) => this.getItemJson(item));
    const wrapperKey = this.getJsonWrapperKey();
    const output = { [wrapperKey]: jsonItems };
    console.log(`${JSON.stringify(output, null, 2)}\n`);
  }

  /**
   * 输出终端格式
   *
   * @param items - 列表项数组
   */
  protected outputTerminal(items: TItem[]): void {
    console.log(this.formatList(items));
    console.log(chalk.dim(`\n${this.getStatsMessage(items)}`));
  }

  /**
   * 执行命令
   */
  async execute(_args: {}, options: ListOptions): Promise<void> {
    const dir = this.getItemsDir();
    const items = await this.scanItems(dir);

    if (options.json) {
      this.outputJson(items);
    } else {
      this.outputTerminal(items);
    }
  }
}

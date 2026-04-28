import { Command } from "commander";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { COPY } from "../command-text.js";
import { resolveProjectRoot } from "../config.js";
import { fail } from "../ui.js";
import chalk from "chalk";
import { scanPrototypes, flattenPrototypes, type PrototypeNode } from "../prototype/server/scanner.js";

interface MarkInfo {
  id: string;
  title: string;
  selector?: string;
  elementInfo?: string;
  domPath?: string;
  description: string;
  position?: any;
  rect?: any;
  timestamp: number;
  fileName: string;
}

type ListMarksOptions = {
  format?: "table" | "json" | "simple" | "detailed" | "tree";
  prototypes?: boolean;
};

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * 读取原型的所有 marks
 */
async function readMarks(marksDir: string): Promise<MarkInfo[]> {
  if (!existsSync(marksDir)) {
    return [];
  }

  const files = await readdir(marksDir);
  const markFiles = files.filter(f => f.endsWith(".md"));

  const marks: MarkInfo[] = [];

  for (const file of markFiles) {
    try {
      const filePath = path.join(marksDir, file);
      const content = await readFile(filePath, "utf-8");
      const { data, content: description } = matter(content);

      marks.push({
        id: data.id || path.basename(file, ".md"),
        title: data.title || "标记",
        selector: data.selector,
        elementInfo: data.elementInfo,
        domPath: data.domPath,
        description: description.trim(),
        position: data.position,
        rect: data.rect,
        timestamp: data.timestamp || 0,
        fileName: file
      });
    } catch (err) {
      // 跳过无法读取的文件
      continue;
    }
  }

  // 按时间戳排序
  marks.sort((a, b) => a.timestamp - b.timestamp);

  return marks;
}

/**
 * 格式化输出为表格
 */
function formatAsTable(marks: MarkInfo[]): string {
  if (marks.length === 0) {
    return chalk.yellow("未找到任何标记");
  }

  // 计算列宽
  const maxIdLen = Math.max(6, ...marks.map(m => m.id.length));
  const maxTitleLen = Math.max(10, ...marks.map(m => m.title.length));
  const maxSelectorLen = Math.max(10, ...marks.map(m => (m.selector || "").length));

  // 表头
  const header = [
    chalk.bold("ID".padEnd(maxIdLen)),
    chalk.bold("标题".padEnd(maxTitleLen)),
    chalk.bold("选择器".padEnd(maxSelectorLen)),
    chalk.bold("创建时间")
  ].join("  ");

  const separator = chalk.dim("-".repeat(maxIdLen + maxTitleLen + maxSelectorLen + 30));

  // 数据行
  const rows = marks.map((mark, index) => [
    chalk.cyan((index + 1).toString().padStart(2) + "."),
    mark.id.padEnd(maxIdLen),
    mark.title.padEnd(maxTitleLen),
    (mark.selector || "-").padEnd(maxSelectorLen),
    chalk.dim(formatTimestamp(mark.timestamp))
  ].join("  "));

  return [header, separator, ...rows].join("\n");
}

/**
 * 格式化输出为简单列表
 */
function formatAsSimple(marks: MarkInfo[]): string {
  if (marks.length === 0) {
    return chalk.yellow("未找到任何标记");
  }

  return marks.map((mark, index) => {
    const parts = [
      chalk.cyan(`${index + 1}.`),
      chalk.bold(mark.title),
      chalk.dim(`(${mark.id})`)
    ];
    if (mark.selector) {
      parts.push(chalk.gray(`- ${mark.selector}`));
    }
    return parts.join(" ");
  }).join("\n");
}

/**
 * 格式化输出为详细列表
 */
function formatAsDetailed(marks: MarkInfo[]): string {
  if (marks.length === 0) {
    return chalk.yellow("未找到任何标记");
  }

  return marks.map((mark, index) => {
    const lines = [
      chalk.cyan(`${index + 1}. `) + chalk.bold(mark.title),
      `   ${chalk.dim("ID:")} ${mark.id}`,
      `   ${chalk.dim("选择器:")} ${mark.selector || "-"}`,
      `   ${chalk.dim("时间:")} ${formatTimestamp(mark.timestamp)}`
    ];

    if (mark.description) {
      const desc = mark.description.split("\n")[0]; // 只显示第一行
      if (desc.trim()) {
        lines.push(`   ${chalk.dim("描述:")} ${desc.substring(0, 60)}${desc.length > 60 ? "..." : ""}`);
      }
    }

    return lines.join("\n");
  }).join("\n\n");
}

/**
 * 格式化原型列表为表格
 */
function formatPrototypesAsTable(prototypes: string[]): string {
  if (prototypes.length === 0) {
    return chalk.yellow("未找到任何原型");
  }

  const header = [
    chalk.bold("#".padEnd(4)),
    chalk.bold("原型名称")
  ].join("  ");

  const separator = chalk.dim("-".repeat(50));

  const rows = prototypes.map((name, index) => [
    chalk.cyan((index + 1).toString().padStart(3) + "."),
    name
  ].join("  "));

  return [header, separator, ...rows].join("\n");
}

/**
 * 格式化原型列表为简单列表
 */
function formatPrototypesAsSimple(prototypes: string[]): string {
  if (prototypes.length === 0) {
    return chalk.yellow("未找到任何原型");
  }

  return prototypes.map((name, index) =>
    `${chalk.cyan((index + 1) + ".")} ${name}`
  ).join("\n");
}

/**
 * 格式化原型树形结构
 */
function formatPrototypesTree(node: PrototypeNode, prefix: string = "", isLast: boolean = true): string[] {
  const lines: string[] = [];

  if (node.id !== 'root') {
    const connector = isLast ? "└── " : "├── ";
    const icon = node.type === 'folder' ? chalk.blue("📁") : chalk.green("📄");
    lines.push(prefix + connector + icon + " " + node.name);
  }

  if (node.children && node.children.length > 0) {
    const childPrefix = node.id === 'root' ? "" : prefix + (isLast ? "    " : "│   ");
    node.children.forEach((child, index) => {
      const childIsLast = index === node.children!.length - 1;
      lines.push(...formatPrototypesTree(child, childPrefix, childIsLast));
    });
  }

  return lines;
}

export function registerList(program: Command): void {
  program
    .command("list")
    .argument("[prototype-name]", "原型名称（可选，如果使用 --prototypes 则不需要）")
    .description(COPY.listMarksDescription)
    .option("--format <format>", "输出格式 (table, json, simple, tree)", "table")
    .option("--prototypes", "列出所有原型")
    .addHelpText("after", `\n${COPY.listMarksHelpAfter}`)
    .action(async (prototypeName: string | undefined, options: ListMarksOptions) => {
      try {
        const projectRoot = await resolveProjectRoot(process.cwd());
        if (!projectRoot) {
          throw new Error("未找到 .prdkit/config.json，请先运行 prdkit init 初始化项目");
        }

        const prototypesDir = path.join(projectRoot, "workspace", "prototypes");

        // 如果指定了 --prototypes，列出所有原型
        if (options.prototypes) {
          const tree = scanPrototypes(prototypesDir);
          const prototypeList = flattenPrototypes(tree);

          let output: string;
          switch (options.format) {
            case "json":
              output = JSON.stringify(prototypeList, null, 2);
              break;
            case "simple":
              output = formatPrototypesAsSimple(prototypeList);
              break;
            case "tree":
              output = formatPrototypesTree(tree).join("\n");
              break;
            case "table":
            default:
              output = formatPrototypesAsTable(prototypeList);
              break;
          }

          console.log(output);
          console.log(chalk.dim(`\n共找到 ${prototypeList.length} 个原型`));
          return;
        }

        // 否则列出指定原型的 marks
        if (!prototypeName) {
          throw new Error("请指定原型名称，或使用 --prototypes 列出所有原型");
        }

        const marksDir = path.join(prototypesDir, prototypeName, "marks");

        // 检查原型是否存在
        const prototypeDir = path.join(prototypesDir, prototypeName);
        if (!existsSync(prototypeDir)) {
          throw new Error(`原型 "${prototypeName}" 不存在`);
        }

        // 读取所有 marks
        const marks = await readMarks(marksDir);

        // 格式化输出
        let output: string;
        switch (options.format) {
          case "json":
            output = JSON.stringify(marks, null, 2);
            break;
          case "simple":
            output = formatAsSimple(marks);
            break;
          case "detailed":
            output = formatAsDetailed(marks);
            break;
          case "table":
          default:
            output = formatAsTable(marks);
            break;
        }

        console.log(output);
        console.log(chalk.dim(`\n共找到 ${marks.length} 个标记`));
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

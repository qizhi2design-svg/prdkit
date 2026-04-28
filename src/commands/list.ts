import { Command } from "commander";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { COPY } from "../command-text.js";
import { resolveProjectRoot } from "../config.js";
import { fail } from "../ui.js";
import chalk from "chalk";
import { scanPrototypes, flattenPrototypes } from "../prototype/server/scanner.js";

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
  prototypes?: boolean;
};

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
 * 格式化输出为简单列表
 */
function formatAsSimple(marks: MarkInfo[]): string {
  if (marks.length === 0) {
    return chalk.yellow("未找到任何标记");
  }

  return marks.map((mark, index) => {
    const lines = [
      `${chalk.cyan((index + 1) + ".")} ${chalk.bold(mark.title)}`
    ];

    // 添加 ID
    lines.push(`   ${chalk.dim("id:")} ${mark.id}`);

    // 添加 selector
    if (mark.selector) {
      lines.push(`   ${chalk.dim("selector:")} ${mark.selector}`);
    }

    // 添加 elementInfo
    if (mark.elementInfo) {
      lines.push(`   ${chalk.dim("element:")} ${mark.elementInfo}`);
    }

    // 添加 domPath
    if (mark.domPath) {
      lines.push(`   ${chalk.dim("domPath:")} ${mark.domPath}`);
    }

    return lines.join("\n");
  }).join("\n\n");
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

export function registerList(program: Command): void {
  program
    .command("list")
    .argument("[prototype-name]", "原型名称（可选，如果使用 --prototypes 则不需要）")
    .description(COPY.listMarksDescription)
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
          const output = formatPrototypesAsSimple(prototypeList);
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
        const output = formatAsSimple(marks);
        console.log(output);
        console.log(chalk.dim(`\n共找到 ${marks.length} 个标记`));
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

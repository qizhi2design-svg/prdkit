import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { COPY } from "../command-text.js";
import { resolveProjectRoot } from "../config.js";
import { fail } from "../ui.js";
import { runCreateTemplate, type CreateTemplateOptions } from "./create-template.js";

interface PrdListOptions {
  json?: boolean;
}

interface PrdInfo {
  fileName: string;
  title: string;
  path: string;
  modifiedAt: string;
  size: number;
}

function extractTitle(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
  }
  return '(无标题)';
}

function scanPrdFiles(prdsDir: string): PrdInfo[] {
  if (!fs.existsSync(prdsDir)) {
    return [];
  }

  const files = fs.readdirSync(prdsDir, { withFileTypes: true });
  const prdFiles: PrdInfo[] = [];

  for (const file of files) {
    if (file.isFile() && file.name.endsWith('.md')) {
      const filePath = path.join(prdsDir, file.name);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const title = extractTitle(content);

      prdFiles.push({
        fileName: file.name,
        title,
        path: path.relative(process.cwd(), filePath),
        modifiedAt: stats.mtime.toISOString(),
        size: stats.size
      });
    }
  }

  return prdFiles.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function formatPrdList(prds: PrdInfo[]): string {
  if (prds.length === 0) {
    return chalk.yellow("未找到任何 PRD 文档");
  }

  return prds.map((prd, index) => {
    const date = new Date(prd.modifiedAt).toLocaleDateString('zh-CN');
    return `${chalk.cyan(`${index + 1}.`)} ${prd.title}\n   ${chalk.dim(`文件: ${prd.fileName} | 修改: ${date}`)}`;
  }).join("\n\n");
}

export function registerPrd(program: Command): void {
  const prd = program.command("prd").description(COPY.prdDescription);

  prd
    .command("create")
    .argument("[title]", "PRD 标题")
    .description(COPY.prdCreateDescription)
    .option("--output <file-or-dir>", "输出文件路径或目录")
    .option("--dir <dir>", "输出目录")
    .option("--name <project-name>", "项目名称")
    .option("--author <author>", "作者")
    .option("--date <yyyy-mm-dd>", "文档日期")
    .option("--non-interactive", "禁用交互式输入")
    .addHelpText("after", `\n${COPY.prdCreateHelpAfter}`)
    .action(async (titleArg: string | undefined, options: CreateTemplateOptions) => {
      await runCreateTemplate(titleArg, options, "prd");
    });

  prd
    .command("list")
    .description(COPY.prdListDescription)
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdListHelpAfter}`)
    .action(async (options: PrdListOptions) => {
      try {
        const projectRoot = await resolveProjectRoot(process.cwd());
        if (!projectRoot) {
          throw new Error("未找到 .prdkit/config.json，请先运行 prdkit init 初始化项目");
        }

        const prdsDir = path.join(projectRoot, "workspace", "prds");
        const prdList = scanPrdFiles(prdsDir);

        if (options.json) {
          console.log(`${JSON.stringify({ prds: prdList }, null, 2)}\n`);
          return;
        }

        console.log(formatPrdList(prdList));
        console.log(chalk.dim(`\n共找到 ${prdList.length} 个 PRD 文档`));
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import matter from "gray-matter";
import { COPY } from "../lib/command-text.js";
import { resolveProjectRoot } from "../config.js";
import { logger } from "../logger.js";
import { ConfigError } from "../errors.js";
import { runCreateTemplate, type CreateTemplateOptions } from "./create-template.js";

interface PrdListOptions {
  json?: boolean;
}

interface PrdFrontmatter {
  title?: string;
  author?: string;
  projectName?: string;
  date?: string;
  status?: string;
  version?: string;
}

interface PrdInfo {
  fileName: string;
  title: string;
  author?: string;
  status?: string;
  version?: string;
  path: string;
  modifiedAt: string;
  createdAt: string;
  size: number;
}

function extractPrdInfo(filePath: string, fileName: string): PrdInfo {
  const content = fs.readFileSync(filePath, 'utf-8');
  const stats = fs.statSync(filePath);

  // 解析 frontmatter
  const parsed = matter(content);
  const frontmatter = parsed.data as PrdFrontmatter;

  // 优先使用 frontmatter 中的标题，否则从内容中提取
  let title = frontmatter.title || '(无标题)';
  if (!frontmatter.title) {
    const lines = parsed.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        title = trimmed.slice(2).trim();
        break;
      }
    }
  }

  return {
    fileName,
    title,
    author: frontmatter.author,
    status: frontmatter.status,
    version: frontmatter.version,
    path: path.relative(process.cwd(), filePath),
    modifiedAt: stats.mtime.toISOString(),
    createdAt: stats.birthtime.toISOString(),
    size: stats.size
  };
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
      try {
        prdFiles.push(extractPrdInfo(filePath, file.name));
      } catch (error) {
        console.warn(chalk.yellow(`警告: 无法解析文件 ${file.name}`));
      }
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
    const statusBadge = prd.status ? ` ${chalk.cyan(`[${prd.status}]`)}` : '';
    const versionBadge = prd.version ? ` ${chalk.dim(`v${prd.version}`)}` : '';
    const authorInfo = prd.author ? ` | 作者: ${prd.author}` : '';

    return `${chalk.cyan(`${index + 1}.`)} ${prd.title}${statusBadge}${versionBadge}\n   ${chalk.dim(`文件: ${prd.fileName} | 修改: ${date}${authorInfo}`)}`;
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
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const prdsDir = path.join(projectRoot, "workspace", "prds");
      const prdList = scanPrdFiles(prdsDir);

      if (options.json) {
        console.log(`${JSON.stringify({ prds: prdList }, null, 2)}\n`);
        return;
      }

      console.log(formatPrdList(prdList));
      console.log(chalk.dim(`\n共找到 ${prdList.length} 个 PRD 文档`));
    });
}

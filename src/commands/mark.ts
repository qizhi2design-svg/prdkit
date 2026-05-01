import { Command, Option } from "commander";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { COPY } from "../lib/command-text.js";
import { resolveProjectRoot } from "../config.js";
import {
  createMarkSync,
  deleteMarkSync,
  readPrototypeMarksSync,
  type MarkPatch,
  updateMarkSync
} from "../lib/prototype/server/marks.js";
import { logger } from "../logger.js";
import { ConfigError, PrototypeError, ValidationError } from "../errors.js";
import { createCheckpoint } from "../lib/prototype/checkpoint/store.js";

interface MarkCommonOptions {
  prototype: string;
  json?: boolean;
}

interface MarkCreateOptions extends MarkCommonOptions {
  title: string;
  desc?: string;
  descFile?: string;
  selector: string;
  domPath?: string;
  x?: string;
  y?: string;
  top?: string;
  left?: string;
  width?: string;
  height?: string;
}

interface MarkEditOptions extends MarkCommonOptions {
  title?: string;
  desc?: string;
  descFile?: string;
}

function resolveDescription(desc?: string, descFile?: string): string | undefined {
  if (desc && descFile) {
    throw ValidationError.invalidInput("desc", "--desc 与 --desc-file 不能同时使用");
  }

  if (descFile) {
    return readFileSync(path.resolve(process.cwd(), descFile), "utf8").trim();
  }

  return desc;
}

function parseOptionalNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw ValidationError.invalidInput(name, "必须是有效数字");
  }
  return parsed;
}

function buildPosition(options: {
  x?: string;
  y?: string;
}): { x: number; y: number } | undefined {
  const x = parseOptionalNumber(options.x, "x");
  const y = parseOptionalNumber(options.y, "y");
  if (x === undefined && y === undefined) return undefined;
  if (x === undefined || y === undefined) {
    throw ValidationError.invalidInput("position", "--x 与 --y 需要同时提供");
  }
  return { x, y };
}

function buildRect(options: {
  top?: string;
  left?: string;
  width?: string;
  height?: string;
}): { top: number; left: number; width: number; height: number } | undefined {
  const top = parseOptionalNumber(options.top, "top");
  const left = parseOptionalNumber(options.left, "left");
  const width = parseOptionalNumber(options.width, "width");
  const height = parseOptionalNumber(options.height, "height");
  const values = [top, left, width, height];
  if (values.every((value) => value === undefined)) return undefined;
  if (values.some((value) => value === undefined)) {
    throw ValidationError.invalidInput("rect", "--top、--left、--width、--height 需要同时提供");
  }
  return {
    top: top as number,
    left: left as number,
    width: width as number,
    height: height as number
  };
}

function formatMarks(marks: ReturnType<typeof readPrototypeMarksSync>): string {
  if (marks.length === 0) {
    return chalk.yellow("未找到任何标记");
  }

  return marks
    .map((mark, index) => {
      const lines = [`${chalk.cyan(`${index + 1}.`)} ${chalk.bold(mark.title)}`];
      lines.push(`   ${chalk.dim("id:")} ${mark.id}`);
      if (mark.selector) lines.push(`   ${chalk.dim("selector:")} ${mark.selector}`);
      if (mark.domPath) lines.push(`   ${chalk.dim("domPath:")} ${mark.domPath}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

async function resolvePrototypesDir(prototypePath: string): Promise<{ projectRoot: string; prototypesDir: string }> {
  const projectRoot = await resolveProjectRoot(process.cwd());
  if (!projectRoot) {
    throw ConfigError.projectNotInitialized();
  }

  const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
  const targetPrototypeDir = path.join(prototypesDir, prototypePath);
  if (!existsSync(targetPrototypeDir)) {
    throw PrototypeError.notFound(prototypePath);
  }

  return { projectRoot, prototypesDir };
}

async function autoCreateCheckpoint(
  projectRoot: string,
  prototypesDir: string,
  prototypePath: string,
  message: string
): Promise<void> {
  try {
    const result = await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath,
      kind: "auto",
      message
    });

    if (result.created) {
      logger.info(`已创建 checkpoint：${result.record.id}`);
    }
  } catch (error) {
    // 静默失败，不影响 mark 操作
    logger.debug(`创建 checkpoint 失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function outputJson(value: unknown): void {
  console.log(`${JSON.stringify(value, null, 2)}\n`);
}

export function registerMark(program: Command): void {
  const mark = program.command("mark").description(COPY.markDescription);

  mark
    .command("list")
    .description(COPY.markListDescription)
    .requiredOption("--prototype <path>", "原型路径，例如 dashboard 或 foo/bar")
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.markListHelpAfter}`)
    .action(async (options: MarkCommonOptions) => {
      const { prototypesDir } = await resolvePrototypesDir(options.prototype);
      const marks = readPrototypeMarksSync(prototypesDir, options.prototype).map(({ fileName, ...markItem }) => markItem);

      if (options.json) {
        outputJson({ prototype: options.prototype, marks });
        return;
      }

      console.log(formatMarks(readPrototypeMarksSync(prototypesDir, options.prototype)));
      console.log(chalk.dim(`\n共找到 ${marks.length} 个标记`));
    });

  mark
    .command("create")
    .description(COPY.markCreateDescription)
    .requiredOption("--prototype <path>", "原型路径，例如 dashboard 或 foo/bar")
    .requiredOption("--title <text>", "标记标题")
    .requiredOption("--selector <css>", "元素 CSS 选择器")
    .option("--desc <markdown>", "标记描述（Markdown）")
    .option("--desc-file <file>", "从 Markdown 文件读取标记描述")
    .option("--json", "以 JSON 输出")
    .addOption(new Option("--dom-path <path>", "DOM 路径").hideHelp())
    .addOption(new Option("--x <number>", "标记点 x 坐标").hideHelp())
    .addOption(new Option("--y <number>", "标记点 y 坐标").hideHelp())
    .addOption(new Option("--top <number>", "元素矩形 top").hideHelp())
    .addOption(new Option("--left <number>", "元素矩形 left").hideHelp())
    .addOption(new Option("--width <number>", "元素矩形宽度").hideHelp())
    .addOption(new Option("--height <number>", "元素矩形高度").hideHelp())
    .addHelpText("after", `\n${COPY.markCreateHelpAfter}`)
    .action(async (options: MarkCreateOptions) => {
      const { projectRoot, prototypesDir } = await resolvePrototypesDir(options.prototype);
      const created = createMarkSync(prototypesDir, options.prototype, {
        title: options.title.trim(),
        description: resolveDescription(options.desc, options.descFile) ?? "",
        selector: options.selector.trim(),
        domPath: options.domPath?.trim(),
        position: buildPosition(options),
        rect: buildRect(options)
      });

      if (options.json) {
        outputJson({ success: true, prototype: options.prototype, mark: created });
        return;
      }

      logger.success(`已创建标记：${created.id}`);
      logger.info(`原型：${options.prototype}`);
      logger.info(`文件：${path.join("workspace", "prototypes", options.prototype, "marks", created.fileName)}`);

      // 自动创建 checkpoint
      await autoCreateCheckpoint(projectRoot, prototypesDir, options.prototype, `创建标记：${created.title}`);
    });

  mark
    .command("edit")
    .argument("<mark-id>", "标记 ID")
    .description(COPY.markEditDescription)
    .requiredOption("--prototype <path>", "原型路径，例如 dashboard 或 foo/bar")
    .option("--title <text>", "更新标记标题")
    .option("--desc <markdown>", "更新标记描述（Markdown）")
    .option("--desc-file <file>", "从 Markdown 文件读取新的标记描述")
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.markEditHelpAfter}`)
    .action(async (markId: string, options: MarkEditOptions) => {
      const { projectRoot, prototypesDir } = await resolvePrototypesDir(options.prototype);
      const description = resolveDescription(options.desc, options.descFile);
      const patch: MarkPatch = {
        title: options.title?.trim(),
        description
      };

      const hasUpdates = Object.values(patch).some((value) => value !== undefined);
      if (!hasUpdates) {
        throw ValidationError.invalidInput("patch", "请至少提供一个需要更新的字段");
      }

      const updated = updateMarkSync(prototypesDir, options.prototype, markId, patch);

      if (options.json) {
        outputJson({ success: true, prototype: options.prototype, mark: updated });
        return;
      }

      logger.success(`已更新标记：${markId}`);
      logger.info(`原型：${options.prototype}`);

      // 自动创建 checkpoint
      await autoCreateCheckpoint(projectRoot, prototypesDir, options.prototype, `更新标记：${updated.title}`);
    });

  mark
    .command("delete")
    .argument("<mark-id>", "标记 ID")
    .description(COPY.markDeleteDescription)
    .requiredOption("--prototype <path>", "原型路径，例如 dashboard 或 foo/bar")
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.markDeleteHelpAfter}`)
    .action(async (markId: string, options: MarkCommonOptions) => {
      const { projectRoot, prototypesDir } = await resolvePrototypesDir(options.prototype);
      deleteMarkSync(prototypesDir, options.prototype, markId);

      if (options.json) {
        outputJson({ success: true, prototype: options.prototype, markId });
        return;
      }

      logger.success(`已删除标记：${markId}`);
      logger.info(`原型：${options.prototype}`);

      // 自动创建 checkpoint
      await autoCreateCheckpoint(projectRoot, prototypesDir, options.prototype, `删除标记：${markId}`);
    });
}

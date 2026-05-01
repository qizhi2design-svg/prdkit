import { input } from "@inquirer/prompts";
import { existsSync } from "node:fs";
import path from "node:path";
import { COPY } from "../lib/command-text.js";
import { saveConfig } from "../config.js";
import { createDefaultConfig, DEFAULT_SCAFFOLD_REPO, DEFAULT_TEMPLATE_REPO } from "../defaults.js";
import { ensureSafeInitTarget } from "../files.js";
import { copyScaffoldInto, personalizeReadme } from "../lib/scaffold.js";
import { ensureTemplateRepo } from "../lib/templates.js";
import type { PrdkitConfig } from "../types.js";
import { logger } from "../logger.js";
import { ValidationError } from "../errors.js";

type InitOptions = {
  name?: string;
  author?: string;
  scaffoldRepo?: string;
  templateRepo?: string;
  branch?: string;
  nonInteractive?: boolean;
};

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function resolveRequiredValue(value: string | undefined, message: string, nonInteractive?: boolean): Promise<string> {
  if (value?.trim()) return value.trim();
  if (nonInteractive) {
    throw ValidationError.missingRequired(message);
  }
  return (await input({ message, required: true })).trim();
}

export function registerInit(program: import("commander").Command): void {
  program
    .command("init")
    .argument("[target-dir]", "目标目录，默认当前目录")
    .description(COPY.initDescription)
    .option("--name <project-name>", "项目名称")
    .option("--author <author>", "作者")
    .option("--scaffold-repo <git-url>", "scaffold 仓库地址", DEFAULT_SCAFFOLD_REPO)
    .option("--template-repo <git-url>", "template 仓库地址", DEFAULT_TEMPLATE_REPO)
    .option("--branch <branch>", "scaffold 仓库分支", "main")
    .option("--non-interactive", "禁用交互式输入")
    .addHelpText("after", `\n${COPY.initHelpAfter}`)
    .action(async (targetDir: string | undefined, options: InitOptions) => {
      const cwd = process.cwd();
      const targetPath = path.resolve(cwd, targetDir ?? ".");
      if (!existsSync(targetPath)) {
        await import("node:fs/promises").then(({ mkdir }) => mkdir(targetPath, { recursive: true }));
      }

      const projectName = await resolveRequiredValue(options.name, COPY.initProjectNameMessage, options.nonInteractive);
      const author = await resolveRequiredValue(options.author, COPY.initAuthorMessage, options.nonInteractive);
      await ensureSafeInitTarget(targetPath);

      const spinner = logger.spinner("拉取 scaffold 并初始化项目").start();
      try {
        await copyScaffoldInto(targetPath, options.scaffoldRepo ?? DEFAULT_SCAFFOLD_REPO, options.branch ?? "main");
        await personalizeReadme(targetPath, projectName, author, currentDate());
        const config = createDefaultConfig(
          projectName,
          author,
          options.scaffoldRepo ?? DEFAULT_SCAFFOLD_REPO,
          options.templateRepo ?? DEFAULT_TEMPLATE_REPO
        );
        await saveConfig(config, targetPath);

        // 拉取模板仓库
        spinner.text = "拉取模板仓库";
        await ensureTemplateRepo(config.templateRepo, targetPath);

        spinner.succeed("项目初始化完成");
      } catch (error) {
        spinner.fail("项目初始化失败");
        throw error;
      }

      logger.success(`项目目录：${targetPath}`);
      logger.info(COPY.createNextStep);
    });
}

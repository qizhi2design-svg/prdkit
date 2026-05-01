/**
 * Init 命令 - 新架构版本
 *
 * 使用新的命令基类重构的 init 命令
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { input } from "@inquirer/prompts";
import { CommandBase } from "../core/command-base.js";
import { COPY } from "../command-text.js";
import { saveConfig } from "../config.js";
import { createDefaultConfig, DEFAULT_SCAFFOLD_REPO, DEFAULT_TEMPLATE_REPO } from "../defaults.js";
import { ensureSafeInitTarget } from "../files.js";
import { copyScaffoldInto, personalizeReadme } from "../scaffold.js";
import { ensureTemplateRepo } from "../templates.js";
import { ValidationError } from "../errors.js";

interface InitArgs {
  targetDir?: string;
}

interface InitOptions {
  name?: string;
  author?: string;
  scaffoldRepo?: string;
  templateRepo?: string;
  branch?: string;
  nonInteractive?: boolean;
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function resolveRequiredValue(
  value: string | undefined,
  message: string,
  nonInteractive?: boolean
): Promise<string> {
  if (value?.trim()) return value.trim();
  if (nonInteractive) {
    throw ValidationError.missingRequired(message);
  }
  return (await input({ message, required: true })).trim();
}

/**
 * Init 命令
 */
export class InitCommand extends CommandBase<InitArgs, InitOptions> {
  readonly metadata = {
    name: "init",
    description: COPY.initDescription,
    arguments: [
      {
        name: "targetDir",
        description: "目标目录，默认当前目录",
        required: false
      }
    ],
    options: [
      {
        flags: "--name <project-name>",
        description: "项目名称"
      },
      {
        flags: "--author <author>",
        description: "作者"
      },
      {
        flags: "--scaffold-repo <git-url>",
        description: "scaffold 仓库地址",
        defaultValue: DEFAULT_SCAFFOLD_REPO
      },
      {
        flags: "--template-repo <git-url>",
        description: "template 仓库地址",
        defaultValue: DEFAULT_TEMPLATE_REPO
      },
      {
        flags: "--branch <branch>",
        description: "scaffold 仓库分支",
        defaultValue: "main"
      },
      {
        flags: "--non-interactive",
        description: "禁用交互式输入"
      }
    ],
    helpText: `\n${COPY.initHelpAfter}`
  };

  // init 命令不需要项目已初始化
  protected requiresProject = false;

  async execute(args: InitArgs, options: InitOptions): Promise<void> {
    const cwd = process.cwd();
    const targetPath = path.resolve(cwd, args.targetDir ?? ".");

    // 确保目标目录存在
    if (!existsSync(targetPath)) {
      await import("node:fs/promises").then(({ mkdir }) =>
        mkdir(targetPath, { recursive: true })
      );
    }

    // 获取项目名称和作者
    const projectName = await resolveRequiredValue(
      options.name,
      COPY.initProjectNameMessage,
      options.nonInteractive
    );
    const author = await resolveRequiredValue(
      options.author,
      COPY.initAuthorMessage,
      options.nonInteractive
    );

    // 确保目标目录安全
    await ensureSafeInitTarget(targetPath);

    // 执行初始化
    await this.withSpinner(
      "拉取 scaffold 并初始化项目",
      async () => {
        // 拉取 scaffold
        await copyScaffoldInto(
          targetPath,
          options.scaffoldRepo ?? DEFAULT_SCAFFOLD_REPO,
          options.branch ?? "main"
        );

        // 个性化 README
        await personalizeReadme(targetPath, projectName, author, currentDate());

        // 保存配置
        const config = createDefaultConfig(
          projectName,
          author,
          options.scaffoldRepo ?? DEFAULT_SCAFFOLD_REPO,
          options.templateRepo ?? DEFAULT_TEMPLATE_REPO
        );
        await saveConfig(config, targetPath);

        // 拉取模板仓库
        await ensureTemplateRepo(config.templateRepo, targetPath);
      },
      {
        successMessage: "项目初始化完成",
        failMessage: "项目初始化失败"
      }
    );

    this.log.success(`项目目录：${targetPath}`);
    this.log.info(COPY.createNextStep);
  }
}

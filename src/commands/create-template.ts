import { input, select } from "@inquirer/prompts";
import path from "node:path";
import { COPY } from "../lib/command-text.js";
import { loadConfig, resolveProjectRoot } from "../config.js";
import { assertFileDoesNotExist, resolveOutputPath, writeTextFile } from "../files.js";
import {
  copyTemplateDirectory,
  ensureTemplateRepo,
  isTemplateDirectory,
  readTemplateContent,
  readTemplateManifest,
  renderTemplate,
  resolveTemplate
} from "../lib/templates.js";
import { logger } from "../logger.js";
import { ConfigError, ValidationError, TemplateError } from "../errors.js";
import { createCheckpoint } from "../lib/prototype/checkpoint/store.js";

export type CreateTemplateOptions = {
  template?: string;
  output?: string;
  dir?: string;
  name?: string;
  creator?: string;
  label?: string;
  status?: string;
  nonInteractive?: boolean;
};

async function requiredTitle(title: string | undefined, nonInteractive?: boolean): Promise<string> {
  if (title?.trim()) return title.trim();
  if (nonInteractive) {
    throw ValidationError.missingRequired(COPY.nonInteractiveTitleRequired);
  }
  return (await input({ message: COPY.createTitleMessage, required: true })).trim();
}

async function requiredValue(value: string | undefined, message: string, nonInteractive?: boolean): Promise<string> {
  if (value?.trim()) return value.trim();
  if (nonInteractive) {
    throw ValidationError.missingRequired(message);
  }
  return (await input({ message, required: true })).trim();
}

export async function runCreateTemplate(
  titleArg: string | undefined,
  options: CreateTemplateOptions,
  preferredTemplateId?: string
): Promise<void> {
  const projectRoot = await resolveProjectRoot(process.cwd());
  if (!projectRoot) {
    throw ConfigError.projectNotInitialized();
  }

  const config = await loadConfig(process.cwd());
  const templateRepo = config?.templateRepo ?? "git@github.com:qizhi2design-svg/prdkit-tempaltes.git";

  const spinner = logger.spinner("读取模板清单").start();
  let repoDir: string;
  let manifest: any;

  try {
    const ensuredRepoDir = await ensureTemplateRepo(templateRepo, projectRoot);
    manifest = await readTemplateManifest(ensuredRepoDir);
    repoDir = ensuredRepoDir;
    spinner.succeed("模板清单读取成功");
  } catch (error) {
    spinner.fail("读取模板清单失败");
    throw error;
  }

  let templateId = preferredTemplateId ?? options.template?.trim();
  if (!templateId) {
    if (options.nonInteractive) {
      throw ValidationError.missingRequired(COPY.nonInteractiveTemplateRequired);
    }
    templateId = await select({
      message: COPY.createTemplateMessage,
      choices: manifest.templates.map((item: any) => ({
        name: `${item.name}${item.description ? ` - ${item.description}` : ""}`,
        value: item.id
      }))
    });
  }

  // TypeScript 类型断言：此时 templateId 一定有值
  const template = resolveTemplate(manifest, templateId!);
  const title = await requiredTitle(titleArg, options.nonInteractive);
  const creator = await requiredValue(options.creator ?? config?.author, COPY.initAuthorMessage, options.nonInteractive);
  const label = options.label ?? "local-md|cli";
  const status = options.status ?? "planning";

  let selectedDir = options.dir;
  if (!selectedDir && !options.output && !options.nonInteractive) {
    const defaultDir = config?.defaultCreateDirs?.[template.id] ?? ".";
    selectedDir = await input({
      message: COPY.createOutputDirMessage,
      default: defaultDir
    });
  }

  const isDirectory = await isTemplateDirectory(repoDir, template);
  const outputPath = await resolveOutputPath({
    cwd: projectRoot,
    output: options.output,
    dir: selectedDir,
    defaultDir: config?.defaultCreateDirs?.[template.id] ?? ".",
    title,
    templateId: template.id,
    outputSuggestion: template.output_suggestion,
    isDirectoryTemplate: isDirectory
  });

  await assertFileDoesNotExist(outputPath);

  if (isDirectory) {
    await copyTemplateDirectory(repoDir, template, outputPath, {
      title,
      creator,
      label,
      status,
      templateId: template.id
    });
  } else {
    const templateContent = await readTemplateContent(repoDir, template);
    const finalContent = renderTemplate(templateContent, {
      title,
      creator,
      label,
      status,
      templateId: template.id
    });
    await writeTextFile(outputPath, finalContent);
  }

  logger.success(`已创建：${outputPath}`);
  logger.info(`模板：${template.id} (${template.name})`);
  logger.info(`项目根目录：${projectRoot}`);

  // 如果是原型模板（目录类型），自动创建初始 checkpoint
  const isPrototypeTemplate = template.id.startsWith("prototype");
  if (isDirectory && isPrototypeTemplate) {
    try {
      const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
      const prototypePath = path.relative(prototypesDir, outputPath);

      const result = await createCheckpoint({
        projectRoot,
        prototypesDir,
        prototypePath,
        kind: "auto",
        message: "初始版本"
      });

      if (result.created) {
        logger.info(`已创建初始 checkpoint：${result.record.id}`);
      }
    } catch (error) {
      // 静默失败，不影响原型创建
      logger.debug(`创建初始 checkpoint 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

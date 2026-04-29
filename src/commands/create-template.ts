import { input, select } from "@inquirer/prompts";
import ora from "ora";
import { COPY } from "../command-text.js";
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
} from "../templates.js";
import { info, success, withSpinner } from "../ui.js";

export type CreateTemplateOptions = {
  template?: string;
  output?: string;
  dir?: string;
  name?: string;
  author?: string;
  date?: string;
  nonInteractive?: boolean;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function requiredTitle(title: string | undefined, nonInteractive?: boolean): Promise<string> {
  if (title?.trim()) return title.trim();
  if (nonInteractive) throw new Error(COPY.nonInteractiveTitleRequired);
  return (await input({ message: COPY.createTitleMessage, required: true })).trim();
}

async function requiredValue(value: string | undefined, message: string, nonInteractive?: boolean): Promise<string> {
  if (value?.trim()) return value.trim();
  if (nonInteractive) throw new Error(`${message}：请通过命令参数提供`);
  return (await input({ message, required: true })).trim();
}

export async function runCreateTemplate(
  titleArg: string | undefined,
  options: CreateTemplateOptions,
  preferredTemplateId?: string
): Promise<void> {
  const projectRoot = await resolveProjectRoot(process.cwd());
  if (!projectRoot) {
    throw new Error("未找到 .prdkit/config.json，请先运行 prdkit init 初始化项目");
  }

  const config = await loadConfig(process.cwd());
  const templateRepo = config?.templateRepo ?? "git@github.com:qizhi2design-svg/prdkit-tempaltes.git";

  const spinner = ora("读取模板清单").start();
  const { repoDir, manifest } = await withSpinner(
    spinner,
    async () => {
      const ensuredRepoDir = await ensureTemplateRepo(templateRepo, projectRoot);
      return {
        repoDir: ensuredRepoDir,
        manifest: await readTemplateManifest(ensuredRepoDir)
      };
    },
    {
      successText: "模板清单读取成功",
      failText: "读取模板清单失败"
    }
  );

  let templateId = preferredTemplateId ?? options.template?.trim();
  if (!templateId) {
    if (options.nonInteractive) throw new Error(COPY.nonInteractiveTemplateRequired);
    templateId = await select({
      message: COPY.createTemplateMessage,
      choices: manifest.templates.map((item) => ({
        name: `${item.name}${item.description ? ` - ${item.description}` : ""}`,
        value: item.id
      }))
    });
  }

  const template = resolveTemplate(manifest, templateId);
  const title = await requiredTitle(titleArg, options.nonInteractive);
  const projectName = await requiredValue(
    options.name ?? config?.projectName,
    COPY.initProjectNameMessage,
    options.nonInteractive
  );
  const author = await requiredValue(options.author ?? config?.author, COPY.initAuthorMessage, options.nonInteractive);
  const date = options.date?.trim() || today();

  let selectedDir = options.dir;
  if (!selectedDir && !options.output && !options.nonInteractive) {
    const defaultDir = config?.defaultCreateDirs?.[template.id] ?? ".";
    selectedDir = await input({
      message: COPY.createOutputDirMessage,
      default: defaultDir
    });
  }

  const outputPath = await resolveOutputPath({
    cwd: projectRoot,
    output: options.output,
    dir: selectedDir,
    defaultDir: config?.defaultCreateDirs?.[template.id] ?? ".",
    title,
    templateId: template.id,
    outputSuggestion: template.output_suggestion
  });

  await assertFileDoesNotExist(outputPath);

  const isDirectory = await isTemplateDirectory(repoDir, template);
  if (isDirectory) {
    await copyTemplateDirectory(repoDir, template, outputPath, {
      title,
      projectName,
      author,
      date,
      templateId: template.id
    });
  } else {
    const templateContent = await readTemplateContent(repoDir, template);
    const finalContent = renderTemplate(templateContent, {
      title,
      projectName,
      author,
      date,
      templateId: template.id
    });
    await writeTextFile(outputPath, finalContent);
  }

  success(`已创建：${outputPath}`);
  info(`模板：${template.id} (${template.name})`);
  info(`项目根目录：${projectRoot}`);
}

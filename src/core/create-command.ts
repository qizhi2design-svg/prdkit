/**
 * Create 命令基类
 *
 * 为所有 create 子命令提供统一的结构和行为
 */

import type { CommandMetadata } from "./command-base.js";
import { CommandBase } from "./command-base.js";
import { input, select } from "@inquirer/prompts";
import { ValidationError } from "#utils/errors.js";
import { COPY } from "#constants/command-text.js";
import {
  ensureTemplateRepo,
  readTemplateManifest,
  resolveTemplate,
  isTemplateDirectory,
  readTemplateContent,
  renderTemplate,
  copyTemplateDirectory
} from "#utils/templates.js";
import { resolveOutputPath, assertFileDoesNotExist, writeTextFile } from "#utils/files.js";
import path from "node:path";
import { createCheckpoint } from "#lib/checkpoint/store.js";

/**
 * Create 命令选项
 */
export interface CreateOptions {
  template?: string;
  output?: string;
  dir?: string;
  name?: string;
  creator?: string;
  label?: string;
  status?: string;
  nonInteractive?: boolean;
  extraVariables?: Record<string, string>;
}

export type CreateTemplateOptions = CreateOptions;

/**
 * Create 命令参数
 */
export interface CreateArgs {
  title?: string;
}

/**
 * 模板变量
 */
export interface TemplateVariables {
  title: string;
  creator: string;
  label: string;
  status: string;
  templateId: string;
  [key: string]: any;
}

/**
 * Create 命令基类
 *
 * 提供通用的模板创建功能
 *
 * @example
 * ```typescript
 * export class PrdCreateCommand extends CreateCommand {
 *   readonly metadata = {
 *     name: "create",
 *     description: "创建 PRD 文档"
 *   };
 *
 *   protected getDefaultTemplateId(): string {
 *     return "prd";
 *   }
 *
 *   protected getDefaultOutputDir(): string {
 *     return "workspace/prds";
 *   }
 * }
 * ```
 */
export abstract class CreateCommand extends CommandBase<CreateArgs, CreateOptions> {
  /**
   * 命令元数据
   */
  abstract readonly metadata: CommandMetadata;

  /**
   * 需要项目已初始化
   */
  protected requiresProject = true;

  /**
   * 获取默认模板 ID
   *
   * 子类可以覆盖此方法来指定默认模板
   */
  protected getDefaultTemplateId(): string | undefined {
    return undefined;
  }

  /**
   * 获取默认输出目录
   *
   * 子类可以覆盖此方法来指定默认输出目录
   */
  protected getDefaultOutputDir(): string | undefined {
    return undefined;
  }

  /**
   * 获取模板仓库 URL
   *
   * 默认从配置读取，子类可以覆盖
   */
  protected getTemplateRepo(): string {
    const config = this.getConfig();
    return config.templateRepo ?? "git@github.com:qizhi2design-svg/prdkit-tempaltes.git";
  }

  /**
   * 解析模板 ID
   *
   * 子类可以覆盖此方法来实现模板别名或验证逻辑
   *
   * @param templateId - 用户提供的模板 ID
   * @returns 解析后的模板 ID
   */
  protected resolveTemplateId(templateId: string): string {
    return templateId;
  }

  /**
   * 获取模板变量的默认值
   *
   * 子类可以覆盖此方法来提供额外的默认值
   */
  protected getDefaultVariables(): Partial<TemplateVariables> {
    return {
      label: "local-md|cli",
      status: "planning"
    };
  }

  /**
   * 构建模板变量
   *
   * 子类可以覆盖此方法来添加自定义变量
   *
   * @param title - 文档标题
   * @param creator - 创建者
   * @param templateId - 模板 ID
   * @param options - 命令选项
   * @returns 模板变量对象
   */
  protected buildTemplateVariables(
    title: string,
    creator: string,
    templateId: string,
    options: CreateOptions
  ): TemplateVariables {
    const defaults = this.getDefaultVariables();
    return {
      title,
      creator,
      label: options.label ?? defaults.label ?? "local-md|cli",
      status: options.status ?? defaults.status ?? "planning",
      templateId,
      ...(options.extraVariables ?? {})
    };
  }

  /**
   * 创建后的钩子
   *
   * 子类可以覆盖此方法来执行创建后的操作（如创建 checkpoint）
   *
   * @param outputPath - 输出路径
   * @param templateId - 模板 ID
   * @param isDirectory - 是否为目录模板
   * @param variables - 模板变量
   */
  protected async afterCreate?(
    outputPath: string,
    templateId: string,
    isDirectory: boolean,
    variables: TemplateVariables
  ): Promise<void>;

  /**
   * 获取必需的标题
   */
  private async getRequiredTitle(titleArg: string | undefined, nonInteractive?: boolean): Promise<string> {
    if (titleArg?.trim()) return titleArg.trim();
    if (nonInteractive) {
      throw ValidationError.missingRequired(COPY.nonInteractiveTitleRequired);
    }
    return (await input({ message: COPY.createTitleMessage, required: true })).trim();
  }

  /**
   * 获取必需的值
   */
  private async getRequiredValue(
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
   * 选择模板
   */
  private async selectTemplate(
    manifest: any,
    preferredTemplateId: string | undefined,
    nonInteractive?: boolean
  ): Promise<string> {
    if (preferredTemplateId) {
      return this.resolveTemplateId(preferredTemplateId);
    }

    if (nonInteractive) {
      throw ValidationError.missingRequired(COPY.nonInteractiveTemplateRequired);
    }

    return await select({
      message: COPY.createTemplateMessage,
      choices: manifest.templates.map((item: any) => ({
        name: `${item.name}${item.description ? ` - ${item.description}` : ""}`,
        value: item.id
      }))
    });
  }

  /**
   * 选择输出目录
   */
  private async selectOutputDir(
    options: CreateOptions,
    defaultDir: string | undefined
  ): Promise<string | undefined> {
    if (options.dir) {
      return options.dir;
    }

    if (options.output || options.nonInteractive) {
      return undefined;
    }

    return await input({
      message: COPY.createOutputDirMessage,
      default: defaultDir ?? "."
    });
  }

  /**
   * 执行命令
   */
  async execute(args: CreateArgs, options: CreateOptions): Promise<void> {
    const projectRoot = this.getProjectRoot();
    const config = this.getConfig();
    const templateRepo = this.getTemplateRepo();

    // 读取模板清单
    const { repoDir, manifest } = await this.withSpinner(
      "读取模板清单",
      async () => {
        const repoDir = await ensureTemplateRepo(templateRepo, projectRoot);
        const manifest = await readTemplateManifest(repoDir);
        return { repoDir, manifest };
      },
      { successMessage: "模板清单读取成功" }
    );

    // 选择模板
    const preferredTemplateId = this.getDefaultTemplateId() ?? options.template?.trim();
    const templateId = await this.selectTemplate(manifest, preferredTemplateId, options.nonInteractive);
    const template = resolveTemplate(manifest, templateId);

    // 获取标题和创建者
    const title = await this.getRequiredTitle(args.title, options.nonInteractive);
    const creator = await this.getRequiredValue(
      options.creator ?? config.author,
      COPY.initAuthorMessage,
      options.nonInteractive
    );

    // 选择输出目录
    const configDefaultDir = config.defaultCreateDirs?.[template.id];
    const defaultDir = this.getDefaultOutputDir() ?? configDefaultDir;
    const selectedDir = await this.selectOutputDir(options, defaultDir);

    // 解析输出路径
    const isDirectory = await isTemplateDirectory(repoDir, template);
    const outputPath = await resolveOutputPath({
      cwd: projectRoot,
      output: options.output,
      dir: selectedDir,
      defaultDir: defaultDir ?? ".",
      title,
      templateId: template.id,
      outputSuggestion: template.output_suggestion,
      isDirectoryTemplate: isDirectory
    });

    // 检查文件是否已存在
    await assertFileDoesNotExist(outputPath);

    // 构建模板变量
    const variables = this.buildTemplateVariables(title, creator, template.id, options);

    // 创建文档
    if (isDirectory) {
      await copyTemplateDirectory(repoDir, template, outputPath, variables);
    } else {
      const templateContent = await readTemplateContent(repoDir, template);
      const finalContent = renderTemplate(templateContent, variables);
      await writeTextFile(outputPath, finalContent);
    }

    // 输出成功消息
    this.log.success(`已创建：${outputPath}`);
    this.log.info(`模板：${template.id} (${template.name})`);
    this.log.info(`项目根目录：${projectRoot}`);

    // 执行创建后的钩子
    if (this.afterCreate) {
      await this.afterCreate(outputPath, template.id, isDirectory, variables);
    }
  }
}

class CreateTemplateRunner extends CreateCommand {
  readonly metadata: CommandMetadata = {
    name: "create-template",
    description: COPY.createDescription
  };

  constructor(private readonly preferredTemplateId?: string) {
    super();
  }

  protected getDefaultTemplateId(): string | undefined {
    return this.preferredTemplateId;
  }

  protected async afterCreate(
    outputPath: string,
    templateId: string,
    isDirectory: boolean
  ): Promise<void> {
    if (!isDirectory || !templateId.startsWith("prototype")) {
      return;
    }

    try {
      const projectRoot = this.getProjectRoot();
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
        this.log.info(`已创建初始 checkpoint：${result.record.id}`);
      }
    } catch (error) {
      this.log.debug(`创建初始 checkpoint 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function runCreateTemplate(
  titleArg: string | undefined,
  options: CreateTemplateOptions,
  preferredTemplateId?: string
): Promise<void> {
  const runner = new CreateTemplateRunner(preferredTemplateId);
  await runner.run({ title: titleArg }, options);
}

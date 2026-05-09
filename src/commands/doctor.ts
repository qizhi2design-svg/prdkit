import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";
import { confirm, input } from "@inquirer/prompts";
import { COPY } from "#constants/command-text.js";
import { DEFAULT_CLOUD_HOST, ensureCloudConfig, loadCloudConfig, loadConfig, readGlobalConfigSync, resolveCloudHost, saveCloudConfig, saveConfig } from "#utils/config.js";
import { createDefaultConfig } from "#constants/defaults.js";
import { ensureTemplateRepo } from "#utils/templates.js";
import { logger } from "#utils/logger.js";
import { ConfigError, FileSystemError } from "#utils/errors.js";
import type { PrdkitCloudConfig, PrdkitConfig } from "#types/index.js";

type DoctorOptions = {
  fix?: boolean;
};

type CheckResult = {
  path: string;
  exists: boolean;
  type: "file" | "directory";
  required: boolean;
};

type MarkFileIssue = {
  filePath: string;
  fileName: string;
  issue: "invalid_filename" | "frontmatter_mismatch";
  currentId?: string;
  expectedId?: string;
};

type ConfigNormalizationResult = {
  needsUpdate: boolean;
  normalizedConfig?: PrdkitConfig;
};

type CloudConfigNormalizationResult = {
  needsUpdate: boolean;
  reason?: string;
};

async function checkProjectStructure(projectRoot: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // 检查 .prdkit 目录和配置文件
  const prdkitDir = join(projectRoot, ".prdkit");
  const configFile = join(prdkitDir, "config.json");
  const cloudFile = join(prdkitDir, "cloud.json");
  const templatesDir = join(prdkitDir, "templates");

  checks.push({
    path: prdkitDir,
    exists: existsSync(prdkitDir),
    type: "directory",
    required: true,
  });

  checks.push({
    path: configFile,
    exists: existsSync(configFile),
    type: "file",
    required: true,
  });

  checks.push({
    path: cloudFile,
    exists: existsSync(cloudFile),
    type: "file",
    required: true,
  });

  checks.push({
    path: templatesDir,
    exists: existsSync(templatesDir),
    type: "directory",
    required: true,
  });

  // 检查 workspace 目录结构
  const workspaceDir = join(projectRoot, "workspace");
  const workspaceSubdirs = ["prds", "prototypes", "bugs", "discussions"];

  checks.push({
    path: workspaceDir,
    exists: existsSync(workspaceDir),
    type: "directory",
    required: true,
  });

  for (const subdir of workspaceSubdirs) {
    const subdirPath = join(workspaceDir, subdir);
    checks.push({
      path: subdirPath,
      exists: existsSync(subdirPath),
      type: "directory",
      required: true,
    });
  }

  return checks;
}

async function fixProjectStructure(
  projectRoot: string,
  results: CheckResult[],
  autoFix: boolean
): Promise<void> {
  const missingItems = results.filter((r) => !r.exists && r.required);

  if (missingItems.length === 0) {
    logger.success("项目结构完整，无需修复");
    return;
  }

  logger.info(`开始修复 ${missingItems.length} 个缺失项...`);

  const configFileMissing = missingItems.some(item => item.path.endsWith("config.json"));
  const cloudFileMissing = missingItems.some(item => item.path.endsWith("cloud.json"));
  const templatesDirMissing = missingItems.some(item => item.path.endsWith("templates"));

  // 先创建所有目录（除了 templates 目录，它需要从 git 克隆）
  for (const item of missingItems) {
    try {
      const isTemplatesDir = item.path.includes(".prdkit/templates") || item.path.includes(".prdkit\\templates");
      if (item.type === "directory" && !isTemplatesDir) {
        mkdirSync(item.path, { recursive: true });
        const relativePath = relative(process.cwd(), item.path);
        logger.success(`创建目录: ${relativePath}`);
      }
    } catch (error) {
      const relativePath = relative(process.cwd(), item.path);
      logger.error(`修复失败 ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let config: PrdkitConfig | undefined = undefined;

  // 如果配置文件缺失，创建配置文件
  if (configFileMissing) {
    try {
      logger.info("\n配置文件缺失，需要创建配置文件...");

      let projectName = "";
      let author = "";

      if (autoFix) {
        // 自动模式：使用默认值
        projectName = "My Project";
        author = "Unknown";
        logger.info("使用默认配置创建配置文件");
      } else {
        // 交互模式：询问用户
        projectName = await input({
          message: "输入项目名称",
          default: "My Project"
        });

        author = await input({
          message: "输入作者名称",
          default: "Unknown"
        });
      }

      config = createDefaultConfig(projectName, author);

      const configPath = join(projectRoot, ".prdkit", "config.json");
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      const relativeConfigPath = relative(process.cwd(), configPath);
      logger.success(`创建配置文件: ${relativeConfigPath}`);
    } catch (error) {
      throw ConfigError.writeFailed(
        join(projectRoot, ".prdkit", "config.json"),
        error instanceof Error ? error : undefined
      );
    }
  }

  if (cloudFileMissing) {
    await ensureCloudConfig(projectRoot, {
      nonInteractive: autoFix,
      promptMessage: "输入默认云端服务器地址",
    });
    const relativeCloudPath = relative(process.cwd(), join(projectRoot, ".prdkit", "cloud.json"));
    logger.success(`创建云端配置: ${relativeCloudPath}`);
  }

  // 如果模板目录缺失，拉取模板仓库
  if (templatesDirMissing) {
    try {
      // 如果配置文件刚创建，使用刚创建的 config；否则从文件读取
      if (!config) {
        config = await loadConfig(projectRoot);
        if (!config) {
          throw ConfigError.notFound(join(projectRoot, ".prdkit", "config.json"));
        }
      }

      logger.info("\n正在拉取模板仓库...");
      await ensureTemplateRepo(config.templateRepo, projectRoot);
      logger.success("模板仓库拉取完成");
    } catch (error) {
      throw error;
    }
  }

  logger.success("\n修复完成");
}

async function checkConfigNormalization(projectRoot: string): Promise<ConfigNormalizationResult> {
  const configFile = join(projectRoot, ".prdkit", "config.json");
  if (!existsSync(configFile)) {
    return { needsUpdate: false };
  }

  const rawText = readFileSync(configFile, "utf8");
  const rawConfig = JSON.parse(rawText);
  const normalizedConfig = await loadConfig(projectRoot);

  if (!normalizedConfig) {
    return { needsUpdate: false };
  }

  const needsUpdate = JSON.stringify(rawConfig) !== JSON.stringify(normalizedConfig);
  return {
    needsUpdate,
    normalizedConfig,
  };
}

async function checkCloudConfigNormalization(projectRoot: string): Promise<CloudConfigNormalizationResult> {
  const cloudFile = join(projectRoot, ".prdkit", "cloud.json");
  if (!existsSync(cloudFile)) {
    return { needsUpdate: false };
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(readFileSync(cloudFile, "utf8"));
  } catch {
    return {
      needsUpdate: true,
      reason: "cloud.json 不是合法的 JSON",
    };
  }

  try {
    const normalizedConfig = await loadCloudConfig(projectRoot);
    if (!normalizedConfig) {
      return {
        needsUpdate: true,
        reason: "cloud.json 缺少有效配置",
      };
    }

    const needsUpdate = JSON.stringify(rawConfig) !== JSON.stringify(normalizedConfig);
    return {
      needsUpdate,
      reason: needsUpdate ? "cloud.json 缺少标准字段或 host 未规范化" : undefined,
    };
  } catch (error) {
    return {
      needsUpdate: true,
      reason: error instanceof Error ? error.message : "cloud.json 格式无效",
    };
  }
}

async function normalizeConfigFile(projectRoot: string, normalizedConfig: PrdkitConfig): Promise<void> {
  await saveConfig(normalizedConfig, projectRoot);
  const relativeConfigPath = relative(process.cwd(), join(projectRoot, ".prdkit", "config.json"));
  logger.success(`更新配置文件: ${relativeConfigPath}`);
}

function pickStringField(raw: Record<string, unknown>, key: keyof Omit<PrdkitCloudConfig, "version" | "host">): string | undefined {
  const value = raw[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function normalizeCloudConfigFile(projectRoot: string, autoFix: boolean): Promise<void> {
  const cloudFile = join(projectRoot, ".prdkit", "cloud.json");
  let rawConfig: Record<string, unknown> = {};

  if (existsSync(cloudFile)) {
    try {
      const parsed = JSON.parse(readFileSync(cloudFile, "utf8"));
      if (parsed && typeof parsed === "object") {
        rawConfig = parsed as Record<string, unknown>;
      }
    } catch {
      rawConfig = {};
    }
  }

  const globalDefaultHost = readGlobalConfigSync().cloud?.defaultHost || DEFAULT_CLOUD_HOST;
  const promptDefault = await resolveCloudHost(projectRoot, typeof rawConfig.host === "string" && rawConfig.host.trim()
    ? rawConfig.host
    : globalDefaultHost);

  let host = promptDefault;
  if (!autoFix) {
    host = await resolveCloudHost(projectRoot, (await input({
      message: "输入默认云端服务器地址",
      default: promptDefault,
      required: true,
      validate: async (value) => {
        try {
          await resolveCloudHost(projectRoot, value);
          return true;
        } catch (error) {
          return error instanceof Error ? error.message : "请输入有效的 http/https 地址";
        }
      },
    })).trim());
  }

  const nextConfig: PrdkitCloudConfig = {
    version: 1,
    host,
    ...(pickStringField(rawConfig, "projectId") ? { projectId: pickStringField(rawConfig, "projectId") } : {}),
    ...(pickStringField(rawConfig, "projectSlug") ? { projectSlug: pickStringField(rawConfig, "projectSlug") } : {}),
    ...(pickStringField(rawConfig, "projectName") ? { projectName: pickStringField(rawConfig, "projectName") } : {}),
    ...(pickStringField(rawConfig, "lastReleaseId") ? { lastReleaseId: pickStringField(rawConfig, "lastReleaseId") } : {}),
    ...(pickStringField(rawConfig, "lastPublishedAt") ? { lastPublishedAt: pickStringField(rawConfig, "lastPublishedAt") } : {}),
  };

  await saveCloudConfig(nextConfig, projectRoot);
  const relativeCloudPath = relative(process.cwd(), cloudFile);
  logger.success(`更新云端配置: ${relativeCloudPath}`);
}

/**
 * 解析 markdown frontmatter
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];
  const frontmatter: Record<string, any> = {};

  // 简单的 YAML 解析（仅支持基本的键值对和嵌套对象）
  const lines = frontmatterText.split('\n');
  let currentKey = '';
  let currentIndent = 0;
  let nestedObj: Record<string, any> | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    if (indent === 0 && trimmed.includes(':')) {
      // 顶层键值对
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      if (value) {
        // 有值的情况
        frontmatter[key] = value.replace(/^['"]|['"]$/g, ''); // 移除引号
      } else {
        // 嵌套对象的开始
        currentKey = key;
        nestedObj = {};
        frontmatter[key] = nestedObj;
      }
    } else if (indent > 0 && nestedObj && trimmed.includes(':')) {
      // 嵌套对象的键值对
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      nestedObj[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }

  return { frontmatter, body };
}

/**
 * 序列化 frontmatter 为 YAML 格式
 */
function serializeFrontmatter(frontmatter: Record<string, any>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // 嵌套对象
      lines.push(`${key}:`);
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        lines.push(`  ${nestedKey}: ${nestedValue}`);
      }
    } else {
      // 简单值
      const needsQuotes = typeof value === 'string' && (value.includes(':') || value.includes('\n'));
      lines.push(`${key}: ${needsQuotes ? `'${value}'` : value}`);
    }
  }

  return lines.join('\n');
}

/**
 * 检查 mark 文件名是否符合格式
 */
function isValidMarkFileName(fileName: string): boolean {
  return /^mark-\d+\.md$/.test(fileName);
}

/**
 * 扫描所有 prototype 的 marks 目录
 */
async function checkPrototypeMarks(projectRoot: string): Promise<MarkFileIssue[]> {
  const issues: MarkFileIssue[] = [];
  const prototypesDir = join(projectRoot, "workspace", "prototypes");

  if (!existsSync(prototypesDir)) {
    return issues;
  }

  // 遍历所有原型目录
  const prototypes = readdirSync(prototypesDir);

  for (const prototype of prototypes) {
    const prototypeDir = join(prototypesDir, prototype);
    const stat = statSync(prototypeDir);

    if (!stat.isDirectory()) continue;

    const marksDir = join(prototypeDir, "marks");
    if (!existsSync(marksDir)) continue;

    // 检查 marks 目录下的所有 .md 文件
    const markFiles = readdirSync(marksDir).filter(f => f.endsWith('.md'));

    for (const fileName of markFiles) {
      const filePath = join(marksDir, fileName);
      const fileNameWithoutExt = basename(fileName, '.md');

      // 检查文件名格式
      if (!isValidMarkFileName(fileName)) {
        issues.push({
          filePath,
          fileName,
          issue: "invalid_filename"
        });
        continue;
      }

      // 检查 frontmatter 中的 id 是否与文件名匹配
      try {
        const content = readFileSync(filePath, 'utf-8');
        const { frontmatter } = parseFrontmatter(content);

        if (frontmatter.id !== fileNameWithoutExt) {
          issues.push({
            filePath,
            fileName,
            issue: "frontmatter_mismatch",
            currentId: frontmatter.id,
            expectedId: fileNameWithoutExt
          });
        }
      } catch (error) {
        // 忽略读取错误
      }
    }
  }

  return issues;
}

/**
 * 修复 prototype marks 文件
 */
async function fixPrototypeMarks(issues: MarkFileIssue[], autoFix: boolean): Promise<void> {
  if (issues.length === 0) {
    logger.success("所有 prototype marks 文件格式正确");
    return;
  }

  logger.info(`开始修复 ${issues.length} 个 marks 文件问题...`);

  for (const issue of issues) {
    try {
      if (issue.issue === "invalid_filename") {
        // 生成新的时间戳文件名
        const timestamp = Date.now();
        const newFileName = `mark-${timestamp}.md`;
        const newFilePath = join(issue.filePath, '..', newFileName);

        // 读取文件内容
        const content = readFileSync(issue.filePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(content);

        // 更新 frontmatter
        frontmatter.id = `mark-${timestamp}`;
        frontmatter.timestamp = timestamp;

        // 写入新文件
        const newContent = `---\n${serializeFrontmatter(frontmatter)}\n---\n${body}`;
        writeFileSync(newFilePath, newContent, 'utf-8');

        // 删除旧文件（通过重命名实现）
        renameSync(issue.filePath, issue.filePath + '.bak');
        renameSync(newFilePath, issue.filePath.replace(issue.fileName, newFileName));

        // 删除备份
        const fs = await import('node:fs/promises');
        await fs.unlink(issue.filePath + '.bak');

        const relativePath = relative(process.cwd(), issue.filePath);
        logger.success(`重命名: ${relativePath} → ${newFileName}`);
      } else if (issue.issue === "frontmatter_mismatch") {
        // 更新 frontmatter 中的 id
        const content = readFileSync(issue.filePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(content);

        frontmatter.id = issue.expectedId;

        // 如果文件名是时间戳格式，也更新 timestamp 字段
        const timestampMatch = issue.expectedId?.match(/^mark-(\d+)$/);
        if (timestampMatch) {
          frontmatter.timestamp = parseInt(timestampMatch[1]);
        }

        const newContent = `---\n${serializeFrontmatter(frontmatter)}\n---\n${body}`;
        writeFileSync(issue.filePath, newContent, 'utf-8');

        const relativePath = relative(process.cwd(), issue.filePath);
        logger.success(`更新 frontmatter: ${relativePath}`);
      }
    } catch (error) {
      const relativePath = relative(process.cwd(), issue.filePath);
      logger.error(`修复失败 ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  logger.success("\nmarks 文件修复完成");
}

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description(COPY.doctorDescription)
    .option("-f, --fix", "自动修复发现的问题")
    .addHelpText("after", COPY.doctorHelpAfter)
    .action(async (options: DoctorOptions) => {
      const projectRoot = process.cwd();

      // 检查项目结构
      logger.info("正在检查项目结构...");
      const results = await checkProjectStructure(projectRoot);

      const missingItems = results.filter((r) => !r.exists && r.required);
      const existingItems = results.filter((r) => r.exists);

      console.log("\n项目结构检查结果:");
      console.log(`✓ 完整: ${existingItems.length} 项`);
      console.log(`✗ 缺失: ${missingItems.length} 项\n`);

      let hasStructureIssues = false;

      if (missingItems.length > 0) {
        hasStructureIssues = true;
        logger.warn("发现以下缺失项:");
        for (const item of missingItems) {
          const relativePath = relative(process.cwd(), item.path);
          console.log(`  - ${relativePath} (${item.type})`);
        }
        console.log();
      }

      logger.info("正在检查配置文件...");
      const configNormalization = await checkConfigNormalization(projectRoot);
      const cloudConfigNormalization = await checkCloudConfigNormalization(projectRoot);

      console.log("\n配置文件检查结果:");
      if (configNormalization.needsUpdate) {
        console.log("✗ 配置文件缺少标准字段，将补齐默认配置项\n");
      } else {
        console.log("✓ 配置文件格式完整\n");
      }

      console.log("云端配置检查结果:");
      if (cloudConfigNormalization.needsUpdate) {
        console.log(`✗ ${cloudConfigNormalization.reason || "cloud.json 需要规范化"}\n`);
      } else {
        console.log("✓ 云端配置格式完整\n");
      }

      // 检查 prototype marks 文件
      logger.info("正在检查 prototype marks 文件...");
      const markIssues = await checkPrototypeMarks(projectRoot);

      console.log("\nPrototype marks 检查结果:");
      if (markIssues.length === 0) {
        console.log("✓ 所有 marks 文件格式正确\n");
      } else {
        console.log(`✗ 发现 ${markIssues.length} 个问题\n`);
        logger.warn("发现以下问题:");
        for (const issue of markIssues) {
          const relativePath = relative(process.cwd(), issue.filePath);
          if (issue.issue === "invalid_filename") {
            console.log(`  - ${relativePath}: 文件名格式不正确（应为 mark-{timestamp}.md）`);
          } else if (issue.issue === "frontmatter_mismatch") {
            console.log(`  - ${relativePath}: frontmatter id 不匹配（当前: ${issue.currentId}, 应为: ${issue.expectedId}）`);
          }
        }
        console.log();
      }

      // 修复问题
      if (missingItems.length > 0 || markIssues.length > 0 || configNormalization.needsUpdate || cloudConfigNormalization.needsUpdate) {
        if (options.fix) {
          if (hasStructureIssues) {
            await fixProjectStructure(projectRoot, results, true);
          }
          if (configNormalization.needsUpdate && configNormalization.normalizedConfig) {
            await normalizeConfigFile(projectRoot, configNormalization.normalizedConfig);
          }
          if (cloudConfigNormalization.needsUpdate) {
            await normalizeCloudConfigFile(projectRoot, true);
          }
          if (markIssues.length > 0) {
            await fixPrototypeMarks(markIssues, true);
          }
        } else {
          const shouldFix = await confirm({
            message: "是否修复这些问题?",
            default: true,
          });

          if (shouldFix) {
            if (hasStructureIssues) {
              await fixProjectStructure(projectRoot, results, false);
            }
            if (configNormalization.needsUpdate && configNormalization.normalizedConfig) {
              await normalizeConfigFile(projectRoot, configNormalization.normalizedConfig);
            }
            if (cloudConfigNormalization.needsUpdate) {
              await normalizeCloudConfigFile(projectRoot, false);
            }
            if (markIssues.length > 0) {
              await fixPrototypeMarks(markIssues, false);
            }
          } else {
            logger.info("已取消修复");
          }
        }
      } else {
        logger.success("\n所有检查通过 ✓");
      }
    });
}

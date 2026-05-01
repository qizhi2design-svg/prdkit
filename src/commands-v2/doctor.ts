/**
 * Doctor 命令 - 新架构版本
 *
 * 使用新的命令基类重构的 doctor 命令
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { confirm, input } from "@inquirer/prompts";
import { CommandBase } from "../core/command-base.js";
import { COPY } from "../command-text.js";
import { loadConfig } from "../config.js";
import { createDefaultConfig } from "../defaults.js";
import { ensureTemplateRepo } from "../templates.js";
import { ConfigError, FileSystemError } from "../errors.js";
import type { PrdkitConfig } from "../types.js";

interface DoctorArgs {}

interface DoctorOptions {
  fix?: boolean;
}

interface CheckResult {
  path: string;
  exists: boolean;
  type: "file" | "directory";
  required: boolean;
}

interface MarkFileIssue {
  filePath: string;
  fileName: string;
  issue: "invalid_filename" | "frontmatter_mismatch";
  currentId?: string;
  expectedId?: string;
}

/**
 * Doctor 命令
 */
export class DoctorCommand extends CommandBase<DoctorArgs, DoctorOptions> {
  readonly metadata = {
    name: "doctor",
    description: COPY.doctorDescription,
    options: [
      {
        flags: "--fix",
        description: "自动修复发现的问题"
      }
    ],
    helpText: COPY.doctorHelpAfter
  };

  // doctor 命令不强制要求项目已初始化（它可以修复未初始化的项目）
  protected requiresProject = false;

  async execute(args: DoctorArgs, options: DoctorOptions): Promise<void> {
    const projectRoot = process.cwd();

    // 检查项目结构
    this.log.info("正在检查项目结构...");
    const results = await this.checkProjectStructure(projectRoot);

    const missingItems = results.filter((r) => !r.exists && r.required);
    const existingItems = results.filter((r) => r.exists);

    console.log("\n项目结构检查结果:");
    console.log(`✓ 完整: ${existingItems.length} 项`);
    console.log(`✗ 缺失: ${missingItems.length} 项\n`);

    let hasStructureIssues = false;

    if (missingItems.length > 0) {
      hasStructureIssues = true;
      this.log.warn("发现以下缺失项:");
      for (const item of missingItems) {
        const relativePath = relative(process.cwd(), item.path);
        console.log(`  - ${relativePath} (${item.type})`);
      }
      console.log();
    }

    // 检查 prototype marks 文件
    this.log.info("正在检查 prototype marks 文件...");
    const markIssues = await this.checkPrototypeMarks(projectRoot);

    console.log("\nPrototype marks 检查结果:");
    if (markIssues.length === 0) {
      console.log("✓ 所有 marks 文件格式正确\n");
    } else {
      console.log(`✗ 发现 ${markIssues.length} 个问题\n`);
      this.log.warn("发现以下问题:");
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
    if (missingItems.length > 0 || markIssues.length > 0) {
      if (options.fix) {
        if (hasStructureIssues) {
          await this.fixProjectStructure(projectRoot, results, true);
        }
        if (markIssues.length > 0) {
          await this.fixPrototypeMarks(markIssues, true);
        }
      } else {
        const shouldFix = await confirm({
          message: "是否修复这些问题?",
          default: true,
        });

        if (shouldFix) {
          if (hasStructureIssues) {
            await this.fixProjectStructure(projectRoot, results, false);
          }
          if (markIssues.length > 0) {
            await this.fixPrototypeMarks(markIssues, false);
          }
        } else {
          this.log.info("已取消修复");
        }
      }
    } else {
      this.log.success("\n所有检查通过 ✓");
    }
  }

  /**
   * 检查项目结构
   */
  private async checkProjectStructure(projectRoot: string): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];

    // 检查 .prdkit 目录和配置文件
    const prdkitDir = join(projectRoot, ".prdkit");
    const configFile = join(prdkitDir, "config.json");
    const templatesDir = join(prdkitDir, "templates");

    checks.push(
      { path: prdkitDir, exists: existsSync(prdkitDir), type: "directory", required: true },
      { path: configFile, exists: existsSync(configFile), type: "file", required: true },
      { path: templatesDir, exists: existsSync(templatesDir), type: "directory", required: true }
    );

    // 检查 workspace 目录结构
    const workspaceDir = join(projectRoot, "workspace");
    const workspaceSubdirs = ["prds", "prototypes", "bugs", "discussions"];

    checks.push({ path: workspaceDir, exists: existsSync(workspaceDir), type: "directory", required: true });

    for (const subdir of workspaceSubdirs) {
      const subdirPath = join(workspaceDir, subdir);
      checks.push({ path: subdirPath, exists: existsSync(subdirPath), type: "directory", required: true });
    }

    return checks;
  }

  /**
   * 修复项目结构
   */
  private async fixProjectStructure(
    projectRoot: string,
    results: CheckResult[],
    autoFix: boolean
  ): Promise<void> {
    const missingItems = results.filter((r) => !r.exists && r.required);

    if (missingItems.length === 0) {
      this.log.success("项目结构完整，无需修复");
      return;
    }

    this.log.info(`开始修复 ${missingItems.length} 个缺失项...`);

    const configFileMissing = missingItems.some(item => item.path.endsWith("config.json"));
    const templatesDirMissing = missingItems.some(item => item.path.includes(".prdkit/templates") || item.path.includes(".prdkit\\templates"));

    // 创建所有目录（除了 templates 目录）
    for (const item of missingItems) {
      try {
        const isTemplatesDir = item.path.includes(".prdkit/templates") || item.path.includes(".prdkit\\templates");
        if (item.type === "directory" && !isTemplatesDir) {
          mkdirSync(item.path, { recursive: true });
          const relativePath = relative(process.cwd(), item.path);
          this.log.success(`创建目录: ${relativePath}`);
        }
      } catch (error) {
        const relativePath = relative(process.cwd(), item.path);
        this.log.error(`修复失败 ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let config: PrdkitConfig | undefined = undefined;

    // 如果配置文件缺失，创建配置文件
    if (configFileMissing) {
      try {
        this.log.info("\n配置文件缺失，需要创建配置文件...");

        let projectName = "";
        let author = "";

        if (autoFix) {
          projectName = "My Project";
          author = "Unknown";
          this.log.info("使用默认配置创建配置文件");
        } else {
          projectName = await input({ message: "输入项目名称", default: "My Project" });
          author = await input({ message: "输入作者名称", default: "Unknown" });
        }

        config = createDefaultConfig(projectName, author);

        const configPath = join(projectRoot, ".prdkit", "config.json");
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        const relativeConfigPath = relative(process.cwd(), configPath);
        this.log.success(`创建配置文件: ${relativeConfigPath}`);
      } catch (error) {
        throw ConfigError.writeFailed(
          join(projectRoot, ".prdkit", "config.json"),
          error instanceof Error ? error : undefined
        );
      }
    }

    // 如果模板目录缺失，拉取模板仓库
    if (templatesDirMissing) {
      try {
        if (!config) {
          config = await loadConfig(projectRoot);
          if (!config) {
            throw ConfigError.notFound(join(projectRoot, ".prdkit", "config.json"));
          }
        }

        this.log.info("\n正在拉取模板仓库...");
        await ensureTemplateRepo(config.templateRepo, projectRoot);
        this.log.success("模板仓库拉取完成");
      } catch (error) {
        throw error;
      }
    }

    this.log.success("\n修复完成");
  }

  /**
   * 检查 prototype marks 文件
   */
  private async checkPrototypeMarks(projectRoot: string): Promise<MarkFileIssue[]> {
    const issues: MarkFileIssue[] = [];
    const prototypesDir = join(projectRoot, "workspace", "prototypes");

    if (!existsSync(prototypesDir)) {
      return issues;
    }

    const prototypes = readdirSync(prototypesDir);

    for (const prototype of prototypes) {
      const prototypeDir = join(prototypesDir, prototype);
      const stat = statSync(prototypeDir);

      if (!stat.isDirectory()) continue;

      const marksDir = join(prototypeDir, "marks");
      if (!existsSync(marksDir)) continue;

      const markFiles = readdirSync(marksDir).filter(f => f.endsWith('.md'));

      for (const fileName of markFiles) {
        const filePath = join(marksDir, fileName);
        const fileNameWithoutExt = basename(fileName, '.md');

        if (!this.isValidMarkFileName(fileName)) {
          issues.push({ filePath, fileName, issue: "invalid_filename" });
          continue;
        }

        try {
          const content = readFileSync(filePath, 'utf-8');
          const { frontmatter } = this.parseFrontmatter(content);

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
  private async fixPrototypeMarks(issues: MarkFileIssue[], autoFix: boolean): Promise<void> {
    if (issues.length === 0) {
      this.log.success("所有 prototype marks 文件格式正确");
      return;
    }

    this.log.info(`开始修复 ${issues.length} 个 marks 文件问题...`);

    for (const issue of issues) {
      try {
        if (issue.issue === "invalid_filename") {
          const timestamp = Date.now();
          const newFileName = `mark-${timestamp}.md`;
          const newFilePath = join(issue.filePath, '..', newFileName);

          const content = readFileSync(issue.filePath, 'utf-8');
          const { frontmatter, body } = this.parseFrontmatter(content);

          frontmatter.id = `mark-${timestamp}`;
          frontmatter.timestamp = timestamp;

          const newContent = `---\n${this.serializeFrontmatter(frontmatter)}\n---\n${body}`;
          writeFileSync(newFilePath, newContent, 'utf-8');

          renameSync(issue.filePath, issue.filePath + '.bak');
          renameSync(newFilePath, issue.filePath.replace(issue.fileName, newFileName));

          const fs = await import('node:fs/promises');
          await fs.unlink(issue.filePath + '.bak');

          const relativePath = relative(process.cwd(), issue.filePath);
          this.log.success(`重命名: ${relativePath} → ${newFileName}`);
        } else if (issue.issue === "frontmatter_mismatch") {
          const content = readFileSync(issue.filePath, 'utf-8');
          const { frontmatter, body } = this.parseFrontmatter(content);

          frontmatter.id = issue.expectedId;

          const timestampMatch = issue.expectedId?.match(/^mark-(\d+)$/);
          if (timestampMatch) {
            frontmatter.timestamp = parseInt(timestampMatch[1]);
          }

          const newContent = `---\n${this.serializeFrontmatter(frontmatter)}\n---\n${body}`;
          writeFileSync(issue.filePath, newContent, 'utf-8');

          const relativePath = relative(process.cwd(), issue.filePath);
          this.log.success(`更新 frontmatter: ${relativePath}`);
        }
      } catch (error) {
        const relativePath = relative(process.cwd(), issue.filePath);
        this.log.error(`修复失败 ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.log.success("\nmarks 文件修复完成");
  }

  /**
   * 辅助方法
   */
  private isValidMarkFileName(fileName: string): boolean {
    return /^mark-\d+\.md$/.test(fileName);
  }

  private parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const frontmatterText = match[1];
    const body = match[2];
    const frontmatter: Record<string, any> = {};

    const lines = frontmatterText.split('\n');
    let nestedObj: Record<string, any> | null = null;

    for (const line of lines) {
      if (!line.trim()) continue;

      const indent = line.search(/\S/);
      const trimmed = line.trim();

      if (indent === 0 && trimmed.includes(':')) {
        const colonIndex = trimmed.indexOf(':');
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        if (value) {
          frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
        } else {
          nestedObj = {};
          frontmatter[key] = nestedObj;
        }
      } else if (indent > 0 && nestedObj && trimmed.includes(':')) {
        const colonIndex = trimmed.indexOf(':');
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();
        nestedObj[key] = value.replace(/^['"]|['"]$/g, '');
      }
    }

    return { frontmatter, body };
  }

  private serializeFrontmatter(frontmatter: Record<string, any>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(frontmatter)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        lines.push(`${key}:`);
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          lines.push(`  ${nestedKey}: ${nestedValue}`);
        }
      } else {
        const needsQuotes = typeof value === 'string' && (value.includes(':') || value.includes('\n'));
        lines.push(`${key}: ${needsQuotes ? `'${value}'` : value}`);
      }
    }

    return lines.join('\n');
  }
}

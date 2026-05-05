import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import matter from "gray-matter";
import { COPY } from "#constants/command-text.js";
import { diffCurrentPrdAgainstLatest, diffPrdCheckpoints } from "#lib/checkpoints/prd/diff.js";
import { restorePrdCheckpoint } from "#lib/checkpoints/prd/restore.js";
import { createPrdCheckpoint, findPrdCheckpointRecord, listPrdCheckpointRecords, readPrdCheckpointData } from "#lib/checkpoints/prd/store.js";
import type { PrdCheckpointDiffSummary, PrdCheckpointRecord } from "#lib/checkpoints/prd/types.js";
import { resolveProjectRoot } from "#utils/config.js";
import { logger } from "#utils/logger.js";
import { ConfigError, FileSystemError, ValidationError } from "#utils/errors.js";
import { runCreateTemplate, type CreateTemplateOptions } from "#core/create-command.js";

interface PrdListOptions {
  json?: boolean;
}

interface PrdCheckOptions {
  json?: boolean;
}

interface PrdCheckpointBaseOptions {
  json?: boolean;
}

interface PrdCheckpointCreateOptions extends PrdCheckpointBaseOptions {
  message?: string;
}

interface PrdCheckpointRestoreOptions extends PrdCheckpointBaseOptions {
  force?: boolean;
}

interface PrdCreateOptions extends CreateTemplateOptions {
  fromPlan?: string;
  author?: string;
  date?: string;
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

interface PrdPlanFrontmatter {
  title?: string;
  creator?: string;
  project_name?: string;
  product_mode?: string;
  product_type?: string;
  product_type_reasoning?: string;
  complexity_level?: string;
  complexity_reasoning?: string;
  recommended_sections?: string[];
  chapter_strategy?: string[];
  plan_assumptions?: string[];
  high_complexity_selfcheck?: string[];
  confirmed_info?: {
    background?: string;
    problem?: string;
    users?: string[];
    scenarios?: string[];
    goals?: string[];
    success_metrics?: string[];
    in_scope?: string[];
    out_of_scope?: string[];
    functional_requirements?: string[];
    business_rules?: string[];
    interaction_requirements?: string[];
    data_requirements?: string[];
    risks?: string[];
    dependencies?: string[];
    acceptance_criteria?: string[];
    milestones?: string[];
    open_questions?: string[];
  };
}

interface LoadedPrdPlan {
  title: string;
  creator?: string;
  extraVariables: Record<string, string>;
}

interface ResolvedPrdCheckTarget {
  title: string;
  fileName: string;
  absolutePath: string;
  projectRelativePath: string;
  selectionReason: "explicit" | "latest";
}

function outputJson(value: unknown): void {
  console.log(`${JSON.stringify(value, null, 2)}\n`);
}

const DEFAULT_PRD_TEMPLATE_VARIABLES: Record<string, string> = {
  projectName: "待补充",
  documentDate: "",
  complexityLevel: "L2",
  complexityReasoning: "待补充",
  productPositioning: "企业自研系统 × 业务型管理软件",
  productPositioningReasoning: "待补充",
  recommendedSections: "- 背景与问题\n- 目标与成功标准\n- 用户/角色与场景\n- 范围\n- 功能需求\n- 风险与依赖\n- 验收标准",
  chapterStrategy: "- 背景与问题：必选\n- 目标与成功标准：必选\n- 功能需求：必选",
  backgroundAndProblem: "待补充",
  targetUsersAndScenarios: "- 目标用户待补充\n\n### 关键场景\n- 待补充",
  goalsAndSuccess: "- 核心目标待补充\n\n### 成功标准\n- 待补充",
  inScope: "- 待补充",
  outOfScope: "- 待补充",
  functionalRequirements: "- 待补充",
  businessRulesAndFlow: "- 待补充",
  interactionAndContent: "- 待补充",
  dataAndMetrics: "- 待补充",
  risksAndDependencies: "- 风险待补充\n\n### 外部依赖\n- 待补充",
  acceptanceCriteria: "- 待补充",
  milestones: "- 待补充",
  openQuestions: "- 待补充",
  planAssumptions: "- 待补充",
  selfcheckFocus: "- 如为 L3/L4，请补充边界条件、外部依赖、异常流与验收标准",
};

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

function scanPrdEntries(prdsDir: string, projectRoot: string): Array<{ info: PrdInfo; absolutePath: string; projectRelativePath: string }> {
  if (!fs.existsSync(prdsDir)) {
    return [];
  }

  const files = fs.readdirSync(prdsDir, { withFileTypes: true });
  const entries: Array<{ info: PrdInfo; absolutePath: string; projectRelativePath: string }> = [];

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".md")) {
      continue;
    }

    const absolutePath = path.join(prdsDir, file.name);
    const info = extractPrdInfo(absolutePath, file.name);
    entries.push({
      info,
      absolutePath,
      projectRelativePath: path.relative(projectRoot, absolutePath),
    });
  }

  return entries.sort((a, b) => b.info.modifiedAt.localeCompare(a.info.modifiedAt));
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

function formatPrdCheckpointRecord(record: PrdCheckpointRecord, index?: number): string {
  const prefix = index === undefined ? "" : `${chalk.cyan(`${index + 1}.`)} `;
  const message = record.message ? ` ${chalk.gray(`- ${record.message}`)}` : "";
  return `${prefix}${chalk.bold(record.id)} ${chalk.yellow(`[${record.kind}]`)} ${chalk.dim(record.prdPath)}${message}`;
}

function formatPrdCheckpointSummary(summary: PrdCheckpointDiffSummary): string {
  return [
    `${chalk.dim("from:")} ${summary.fromCheckpointId}`,
    `${chalk.dim("to:")} ${summary.toCheckpointId}`,
    `${chalk.dim("changed:")} ${summary.changed ? chalk.red("yes") : chalk.green("no")}`,
    `${chalk.dim("line +")} ${summary.lineAdded}`,
    `${chalk.dim("line -")} ${summary.lineDeleted}`,
    `${chalk.dim("size:")} ${summary.beforeSize} -> ${summary.afterSize}`,
    `${chalk.dim("lines:")} ${summary.beforeLineCount} -> ${summary.afterLineCount}`,
  ].join("\n");
}

function extractMarkdownTitle(content: string): string | undefined {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
  }
  return undefined;
}

function toBulletList(values: string[] | undefined, emptyValue = "- 待补充"): string {
  if (!values || values.length === 0) {
    return emptyValue;
  }
  return values.map((value) => `- ${value}`).join("\n");
}

function toParagraph(parts: Array<string | undefined>, emptyValue = "待补充"): string {
  const normalized = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  if (normalized.length === 0) {
    return emptyValue;
  }

  return normalized.join("\n\n");
}

function resolveProductPositioning(frontmatter: PrdPlanFrontmatter): string {
  const mode = frontmatter.product_mode?.trim();
  const type = frontmatter.product_type?.trim();

  if (mode && type) {
    return `${mode} × ${type}`;
  }

  if (mode) {
    return mode;
  }

  if (type) {
    return type;
  }

  return DEFAULT_PRD_TEMPLATE_VARIABLES.productPositioning;
}

export function loadPrdPlan(planPath: string, cwd = process.cwd()): LoadedPrdPlan {
  const resolvedPath = path.resolve(cwd, planPath);
  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const parsed = matter(raw);
  const frontmatter = parsed.data as PrdPlanFrontmatter;
  const confirmed = frontmatter.confirmed_info || {};

  const title = frontmatter.title?.trim() || extractMarkdownTitle(parsed.content);
  if (!title) {
    throw new Error(`方案稿缺少标题：${resolvedPath}`);
  }

  return {
    title,
    creator: frontmatter.creator?.trim() || undefined,
    extraVariables: {
      projectName: frontmatter.project_name?.trim() || "待补充",
      productPositioning: resolveProductPositioning(frontmatter),
      productPositioningReasoning: frontmatter.product_type_reasoning?.trim() || "待补充",
      complexityLevel: frontmatter.complexity_level?.trim() || "L2",
      complexityReasoning: frontmatter.complexity_reasoning?.trim() || "待补充",
      recommendedSections: toBulletList(frontmatter.recommended_sections),
      chapterStrategy: toBulletList(frontmatter.chapter_strategy),
      backgroundAndProblem: toParagraph([confirmed.background, confirmed.problem]),
      targetUsersAndScenarios: `${toBulletList(confirmed.users)}\n\n### 关键场景\n${toBulletList(confirmed.scenarios)}`,
      goalsAndSuccess: `${toBulletList(confirmed.goals)}\n\n### 成功标准\n${toBulletList(confirmed.success_metrics)}`,
      inScope: toBulletList(confirmed.in_scope),
      outOfScope: toBulletList(confirmed.out_of_scope),
      functionalRequirements: toBulletList(confirmed.functional_requirements),
      businessRulesAndFlow: toBulletList(confirmed.business_rules),
      interactionAndContent: toBulletList(confirmed.interaction_requirements),
      dataAndMetrics: toBulletList(confirmed.data_requirements),
      risksAndDependencies: `${toBulletList(confirmed.risks)}\n\n### 外部依赖\n${toBulletList(confirmed.dependencies)}`,
      acceptanceCriteria: toBulletList(confirmed.acceptance_criteria),
      milestones: toBulletList(confirmed.milestones),
      openQuestions: toBulletList(confirmed.open_questions),
      planAssumptions: toBulletList(frontmatter.plan_assumptions),
      selfcheckFocus: toBulletList(frontmatter.high_complexity_selfcheck),
    }
  };
}

export async function resolvePrdCheckTarget(projectRoot: string, target?: string): Promise<ResolvedPrdCheckTarget> {
  const prdsDir = path.join(projectRoot, "workspace", "prds");
  if (!fs.existsSync(prdsDir)) {
    throw FileSystemError.directoryNotFound(prdsDir);
  }

  const entries = scanPrdEntries(prdsDir, projectRoot);
  if (entries.length === 0) {
    throw ValidationError.invalidInput("target", "当前项目下没有可供审查的 PRD");
  }

  if (!target?.trim()) {
    const latest = entries[0];
    return {
      title: latest.info.title,
      fileName: latest.info.fileName,
      absolutePath: latest.absolutePath,
      projectRelativePath: latest.projectRelativePath,
      selectionReason: "latest",
    };
  }

  const rawTarget = target.trim();
  const absoluteCandidates = [
    path.resolve(process.cwd(), rawTarget),
    path.resolve(prdsDir, rawTarget),
    rawTarget.endsWith(".md") ? "" : path.resolve(prdsDir, `${rawTarget}.md`)
  ].filter(Boolean) as string[];

  for (const candidate of absoluteCandidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const fileName = path.basename(candidate);
      const info = extractPrdInfo(candidate, fileName);
      return {
        title: info.title,
        fileName,
        absolutePath: candidate,
        projectRelativePath: path.relative(projectRoot, candidate),
        selectionReason: "explicit",
      };
    }
  }

  const normalizedFileName = rawTarget.endsWith(".md") ? rawTarget : `${rawTarget}.md`;
  const fileNameMatch = entries.find((entry) => entry.info.fileName === rawTarget || entry.info.fileName === normalizedFileName);
  if (fileNameMatch) {
    return {
      title: fileNameMatch.info.title,
      fileName: fileNameMatch.info.fileName,
      absolutePath: fileNameMatch.absolutePath,
      projectRelativePath: fileNameMatch.projectRelativePath,
      selectionReason: "explicit",
    };
  }

  const exactTitleMatch = entries.find((entry) => entry.info.title === rawTarget);
  if (exactTitleMatch) {
    return {
      title: exactTitleMatch.info.title,
      fileName: exactTitleMatch.info.fileName,
      absolutePath: exactTitleMatch.absolutePath,
      projectRelativePath: exactTitleMatch.projectRelativePath,
      selectionReason: "explicit",
    };
  }

  const fuzzyTitleMatches = entries.filter((entry) => entry.info.title.includes(rawTarget));
  if (fuzzyTitleMatches.length === 1) {
    const match = fuzzyTitleMatches[0];
    return {
      title: match.info.title,
      fileName: match.info.fileName,
      absolutePath: match.absolutePath,
      projectRelativePath: match.projectRelativePath,
      selectionReason: "explicit",
    };
  }

  if (fuzzyTitleMatches.length > 1) {
    throw ValidationError.invalidInput("target", `匹配到多个 PRD：${fuzzyTitleMatches.map((item) => item.info.title).join("、")}`);
  }

  throw FileSystemError.fileNotFound(rawTarget);
}

export function registerPrd(program: Command): void {
  const prd = program.command("prd").description(COPY.prdDescription);

  prd
    .command("create")
    .argument("[title]", "PRD 标题")
    .description(COPY.prdCreateDescription)
    .option("-o, --output <file-or-dir>", "输出文件路径或目录")
    .option("-d, --dir <dir>", "输出目录")
    .option("-n, --name <project-name>", "项目名称")
    .option("-a, --author <author>", "作者")
    .option("-D, --date <yyyy-mm-dd>", "文档日期")
    .option("-f, --from-plan <file>", "从第一阶段方案稿生成正式 PRD")
    .option("--non-interactive", "禁用交互式输入")
    .addHelpText("after", `\n${COPY.prdCreateHelpAfter}`)
    .action(async (titleArg: string | undefined, options: PrdCreateOptions) => {
      let resolvedTitle = titleArg;
      let resolvedOptions: CreateTemplateOptions = { ...options };

      resolvedOptions = {
        ...resolvedOptions,
        creator: resolvedOptions.creator ?? options.author,
        extraVariables: {
          ...DEFAULT_PRD_TEMPLATE_VARIABLES,
          ...(options.name ? { projectName: options.name } : {}),
          ...(options.date ? { documentDate: options.date } : {}),
          ...(resolvedOptions.extraVariables ?? {}),
        }
      };

      if (options.fromPlan) {
        const loadedPlan = loadPrdPlan(options.fromPlan);
        resolvedTitle = resolvedTitle ?? loadedPlan.title;
        resolvedOptions = {
          ...resolvedOptions,
          creator: resolvedOptions.creator ?? loadedPlan.creator,
          extraVariables: {
            ...DEFAULT_PRD_TEMPLATE_VARIABLES,
            ...(resolvedOptions.extraVariables ?? {}),
            ...loadedPlan.extraVariables,
          }
        };
      }

      await runCreateTemplate(resolvedTitle, resolvedOptions, "prd");
    });

  prd
    .command("check")
    .argument("[target]", "PRD 标题、文件名或路径")
    .description(COPY.prdCheckDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckHelpAfter}`)
    .action(async (target: string | undefined, options: PrdCheckOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const resolved = await resolvePrdCheckTarget(projectRoot, target);
      const suggestedSkillCommand = `/skill prdkit-prd-check ${resolved.absolutePath}`;
      const promptHint = `请审查这份 PRD：${resolved.absolutePath}`;

      if (options.json) {
        console.log(`${JSON.stringify({
          prd: resolved,
          suggestedSkillCommand,
          promptHint,
        }, null, 2)}\n`);
        return;
      }

      logger.success(`已定位 PRD：${resolved.title}`);
      logger.info(`文件：${resolved.projectRelativePath}`);
      logger.info(`绝对路径：${resolved.absolutePath}`);
      if (resolved.selectionReason === "latest") {
        logger.info("未指定目标，已默认选择最近修改的一份 PRD");
      }
      console.log("");
      console.log(chalk.bold("推荐下一步"));
      console.log(`  ${suggestedSkillCommand}`);
      console.log(chalk.dim(`  或直接告诉支持 skill 的终端：${promptHint}`));
    });

  prd
    .command("list")
    .description(COPY.prdListDescription)
    .option("-j, --json", "以 JSON 输出")
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

  const prdCheckpoint = prd.command("checkpoint").description(COPY.prdCheckpointDescription);

  prdCheckpoint
    .command("create")
    .argument("[target]", "PRD 标题、文件名或路径，默认为最近修改的一份")
    .description(COPY.prdCheckpointCreateDescription)
    .option("-m, --message <text>", "checkpoint 说明")
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointCreateHelpAfter}`)
    .action(async (target: string | undefined, options: PrdCheckpointCreateOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const resolved = await resolvePrdCheckTarget(projectRoot, target);
      const result = await createPrdCheckpoint({
        projectRoot,
        prdPath: resolved.projectRelativePath,
        kind: "manual",
        message: options.message,
      });

      if (options.json) {
        outputJson(result);
        return;
      }

      if (!result.created) {
        logger.warn(`没有检测到新变更，最近 checkpoint：${result.record.id}`);
        return;
      }

      logger.success(`已创建 PRD checkpoint：${result.record.id}`);
      logger.info(`文档：${resolved.projectRelativePath}`);
    });

  prdCheckpoint
    .command("list")
    .argument("[target]", "PRD 标题、文件名或路径")
    .description(COPY.prdCheckpointListDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointListHelpAfter}`)
    .action(async (target: string | undefined, options: PrdCheckpointBaseOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      let prdPath: string | undefined;
      if (target?.trim()) {
        prdPath = (await resolvePrdCheckTarget(projectRoot, target)).projectRelativePath;
      }

      const records = listPrdCheckpointRecords(projectRoot, prdPath);
      if (options.json) {
        outputJson({ checkpoints: records });
        return;
      }

      if (records.length === 0) {
        logger.warn("未找到任何 PRD checkpoint");
        return;
      }

      console.log(records.map((record, index) => formatPrdCheckpointRecord(record, index)).join("\n"));
      console.log(chalk.dim(`\n共找到 ${records.length} 个 PRD checkpoint`));
    });

  prdCheckpoint
    .command("show")
    .argument("<checkpoint-id>", "checkpoint ID")
    .description(COPY.prdCheckpointShowDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointShowHelpAfter}`)
    .action(async (checkpointId: string, options: PrdCheckpointBaseOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const data = readPrdCheckpointData(projectRoot, checkpointId);
      if (options.json) {
        outputJson(data);
        return;
      }

      console.log(formatPrdCheckpointRecord(data.manifest));
      console.log(`${chalk.dim("title:")} ${data.manifest.title}`);
      console.log(`${chalk.dim("size:")} ${data.document.size} bytes`);
      console.log(`${chalk.dim("lines:")} ${data.document.lineCount}`);
    });

  prdCheckpoint
    .command("diff")
    .argument("<from-id>", "起始 checkpoint ID")
    .argument("<to-id>", "目标 checkpoint ID")
    .description(COPY.prdCheckpointDiffDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointDiffHelpAfter}`)
    .action(async (fromId: string, toId: string, options: PrdCheckpointBaseOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const summary = await diffPrdCheckpoints(projectRoot, fromId, toId);
      if (options.json) {
        outputJson(summary);
        return;
      }

      console.log(formatPrdCheckpointSummary(summary));
    });

  prdCheckpoint
    .command("status")
    .argument("[target]", "PRD 标题、文件名或路径，默认为最近修改的一份")
    .description(COPY.prdCheckpointStatusDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointStatusHelpAfter}`)
    .action(async (target: string | undefined, options: PrdCheckpointBaseOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const resolved = await resolvePrdCheckTarget(projectRoot, target);
      const status = await diffCurrentPrdAgainstLatest(projectRoot, resolved.projectRelativePath);
      if (options.json) {
        outputJson(status);
        return;
      }

      logger.info(`文档：${resolved.projectRelativePath}`);
      if (status.latestCheckpointId) {
        logger.info(`最近 checkpoint：${status.latestCheckpointId}`);
      }
      console.log(formatPrdCheckpointSummary(status.summary));
    });

  prdCheckpoint
    .command("restore")
    .argument("<checkpoint-id>", "checkpoint ID")
    .description(COPY.prdCheckpointRestoreDescription)
    .option("-f, --force", "存在未归档变更时先创建 pre-restore checkpoint 再恢复")
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointRestoreHelpAfter}`)
    .action(async (checkpointId: string, options: PrdCheckpointRestoreOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const record = findPrdCheckpointRecord(projectRoot, checkpointId);
      if (!record) {
        throw new Error(`未找到 PRD checkpoint：${checkpointId}`);
      }

      const result = await restorePrdCheckpoint({
        projectRoot,
        checkpointId,
        force: options.force,
      });

      if (options.json) {
        outputJson(result);
        return;
      }

      logger.success(`已恢复到 PRD checkpoint：${checkpointId}`);
      logger.info(`文档：${record.prdPath}`);
      if (result.preRestore) {
        logger.info(`已创建 pre-restore checkpoint：${result.preRestore.id}`);
      }
    });
}

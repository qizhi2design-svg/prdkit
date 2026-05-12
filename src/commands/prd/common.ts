import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import matter from "gray-matter";
import type { CreateTemplateOptions } from "#core/create-command.js";
import type { PrdCheckpointDiffSummary, PrdCheckpointRecord } from "#lib/checkpoints/prd/types.js";
import { FileSystemError, ValidationError } from "#utils/errors.js";

export interface PrdListOptions {
  json?: boolean;
}

export interface PrdCheckOptions {
  json?: boolean;
}

export interface PrdCheckpointBaseOptions {
  json?: boolean;
}

export interface PrdCheckpointCreateOptions extends PrdCheckpointBaseOptions {
  message?: string;
}

export interface PrdCheckpointRestoreOptions extends PrdCheckpointBaseOptions {
  force?: boolean;
}

export interface PrdCreateOptions extends CreateTemplateOptions {
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
  // 以下字段可能来自 TAPD story 的 front matter，与 PRD 共存
  tapd_id?: string;
  workspace_id?: string;
  iteration_id?: string;
  owner?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PrdInfo {
  fileName: string;
  title: string;
  author?: string;
  status?: string;
  version?: string;
  path: string;
  modifiedAt: string;
  createdAt: string;
  size: number;
  tapdId?: string;
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
  extraFrontmatter: Record<string, string>;
}

export interface ResolvedPrdCheckTarget {
  title: string;
  fileName: string;
  absolutePath: string;
  projectRelativePath: string;
  selectionReason: "explicit" | "latest";
}

export function outputJson(value: unknown): void {
  console.log(`${JSON.stringify(value, null, 2)}\n`);
}

export const DEFAULT_PRD_TEMPLATE_VARIABLES: Record<string, string> = {
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

  const parsed = matter(content);
  const frontmatter = parsed.data as PrdFrontmatter;

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
    size: stats.size,
    tapdId: frontmatter.tapd_id,
  };
}

export function scanPrdFiles(prdsDir: string): PrdInfo[] {
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

export function formatPrdList(prds: PrdInfo[]): string {
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

export function formatPrdCheckpointRecord(record: PrdCheckpointRecord, index?: number): string {
  const prefix = index === undefined ? "" : `${chalk.cyan(`${index + 1}.`)} `;
  const message = record.message ? ` ${chalk.gray(`- ${record.message}`)}` : "";
  return `${prefix}${chalk.bold(record.id)} ${chalk.yellow(`[${record.kind}]`)} ${chalk.dim(record.prdPath)}${message}`;
}

export function formatPrdCheckpointSummary(summary: PrdCheckpointDiffSummary): string {
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

  // 收集不属于 PrdPlanFrontmatter 的额外 front matter 字段
  // （如 TAPD 的 tapd_id / workspace_id 等），以便在创建 PRD 时保留
  const knownPlanKeys = new Set<string>([
    'title', 'creator', 'project_name', 'product_mode', 'product_type',
    'product_type_reasoning', 'complexity_level', 'complexity_reasoning',
    'recommended_sections', 'chapter_strategy', 'plan_assumptions',
    'high_complexity_selfcheck', 'confirmed_info',
    // PRD 模板已处理的字段（与 TAPD 语义不同，不应被覆盖）
    'label', 'status',
  ]);
  const extraFrontmatter: Record<string, string> = {};
  const rawData = parsed.data as Record<string, unknown>;
  for (const [key, value] of Object.entries(rawData)) {
    if (!knownPlanKeys.has(key) && typeof value === 'string' && value.trim()) {
      extraFrontmatter[key] = value.trim();
    }
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
    },
    extraFrontmatter,
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
    rawTarget.endsWith(".md") ? "" : path.resolve(prdsDir, `${rawTarget}.md`),
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

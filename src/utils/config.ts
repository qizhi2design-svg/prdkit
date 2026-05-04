import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { PrdkitConfig } from "#types/index.js";
import { DEFAULT_PAGE_CREATE_SKILL_COMMAND, DEFAULT_INSPECT_COPY_SKILL_COMMAND, DEFAULT_VIEWER_SKILLS } from "#lib/shared/index.js";

const viewerSkillsSchema = z.object({
  pageCreateSkillCommand: z.string().min(1).default(DEFAULT_VIEWER_SKILLS.pageCreateSkillCommand),
  inspectCopySkillCommand: z.string().min(1).default(DEFAULT_VIEWER_SKILLS.inspectCopySkillCommand),
  markCreateSkillCommand: z.string().min(1).default(DEFAULT_VIEWER_SKILLS.markCreateSkillCommand),
  markUpdateSkillCommand: z.string().min(1).default(DEFAULT_VIEWER_SKILLS.markUpdateSkillCommand),
  copyTerminalGuide: z.string().min(1).default(DEFAULT_VIEWER_SKILLS.copyTerminalGuide),
});

const configSchema = z.object({
  version: z.literal(1),
  projectName: z.string().min(1),
  author: z.string().min(1),
  description: z.string().optional(),
  productPositioning: z.string().optional(),
  teamSize: z.string().optional(),
  projectStage: z.string().optional(),
  scaffoldRepo: z.string().min(1),
  templateRepo: z.string().min(1),
  defaultCreateDirs: z.record(z.string(), z.string()).optional(),
  viewerSkills: viewerSkillsSchema.optional().default(DEFAULT_VIEWER_SKILLS),
});

function normalizeViewerSkills(config: PrdkitConfig, hasExplicitPageCreateSkillCommand: boolean): PrdkitConfig {
  const viewerSkills = config.viewerSkills ?? DEFAULT_VIEWER_SKILLS;

  // 兼容旧配置：历史上 inspectCopySkillCommand 同时承担了“新建页面”和“编辑页面”的复制命令。
  // 当旧项目仍保存为 /prdkit-page-create 且没有显式 pageCreateSkillCommand 时，自动迁移为：
  // - 新建页面使用 create
  // - 编辑模式使用 update
  if (
    viewerSkills.inspectCopySkillCommand === DEFAULT_PAGE_CREATE_SKILL_COMMAND &&
    !hasExplicitPageCreateSkillCommand
  ) {
    return {
      ...config,
      viewerSkills: {
        ...viewerSkills,
        pageCreateSkillCommand: DEFAULT_PAGE_CREATE_SKILL_COMMAND,
        inspectCopySkillCommand: DEFAULT_INSPECT_COPY_SKILL_COMMAND,
      },
    };
  }

  return {
    ...config,
    viewerSkills,
  };
}

export function prdkitDir(cwd = process.cwd()): string {
  return path.join(cwd, ".prdkit");
}

export function configPath(cwd = process.cwd()): string {
  return path.join(prdkitDir(cwd), "config.json");
}

export async function loadConfig(cwd = process.cwd()): Promise<PrdkitConfig | undefined> {
  const projectRoot = await resolveProjectRoot(cwd);
  if (!projectRoot) return undefined;
  const file = configPath(projectRoot);
  if (!existsSync(file)) return undefined;
  const raw = await readFile(file, "utf8");
  const parsedRaw = JSON.parse(raw) as { viewerSkills?: { pageCreateSkillCommand?: string } };
  const hasExplicitPageCreateSkillCommand = Boolean(
    parsedRaw.viewerSkills && Object.prototype.hasOwnProperty.call(parsedRaw.viewerSkills, "pageCreateSkillCommand")
  );
  return normalizeViewerSkills(configSchema.parse(parsedRaw), hasExplicitPageCreateSkillCommand);
}

export async function saveConfig(config: PrdkitConfig, cwd = process.cwd()): Promise<void> {
  const file = configPath(cwd);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function resolveProjectRoot(cwd = process.cwd()): Promise<string | undefined> {
  let current = path.resolve(cwd);
  while (true) {
    if (existsSync(configPath(current))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

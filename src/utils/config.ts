import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { PrdkitConfig } from "#types/index.js";
import { DEFAULT_VIEWER_SKILLS } from "#lib/shared/index.js";

const viewerSkillsSchema = z.object({
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
  return configSchema.parse(JSON.parse(raw));
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

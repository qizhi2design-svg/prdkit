import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type {
  AuthHostRecord,
  AuthStore,
  PrdkitConfig,
  ProjectCloudConfig
} from "#types/index.js";
import { DEFAULT_PAGE_CREATE_SKILL_COMMAND, DEFAULT_INSPECT_COPY_SKILL_COMMAND, DEFAULT_VIEWER_SKILLS } from "#lib/shared/index.js";
import { needsMigration, migrateCheckpointStorage } from "#lib/checkpoints/migration.js";
import { logger } from "./logger.js";

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
  cloud: z.object({
    host: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    projectSlug: z.string().min(1).optional(),
    projectName: z.string().min(1).optional(),
    lastReleaseId: z.string().min(1).optional(),
    lastPublishedAt: z.string().min(1).optional(),
  }).optional(),
});

const authHostRecordSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string().min(1),
  user: z.object({
    id: z.number(),
    email: z.string().email(),
    name: z.string().nullable().optional(),
  }),
  scopes: z.array(z.string()).default([]),
  lastValidatedAt: z.string().optional(),
});

const authStoreSchema = z.object({
  hosts: z.record(z.string(), authHostRecordSchema).default({}),
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

function resolveProjectRootSync(cwd = process.cwd()): string | undefined {
  let current = path.resolve(cwd);
  while (true) {
    if (existsSync(configPath(current))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function authStoreDir(): string {
  return path.join(os.homedir(), ".config", "prdkit");
}

export function authStorePath(): string {
  return path.join(authStoreDir(), "auth.json");
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

export async function loadAuthStore(): Promise<AuthStore> {
  const file = authStorePath();
  if (!existsSync(file)) {
    return { hosts: {} };
  }

  const raw = await readFile(file, "utf8");
  return authStoreSchema.parse(JSON.parse(raw));
}

export async function saveAuthStore(store: AuthStore): Promise<void> {
  const file = authStorePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function getAuthRecord(host: string): Promise<AuthHostRecord | undefined> {
  const store = await loadAuthStore();
  return store.hosts[normalizeHost(host)];
}

export async function setAuthRecord(host: string, record: AuthHostRecord): Promise<void> {
  const store = await loadAuthStore();
  store.hosts[normalizeHost(host)] = record;
  await saveAuthStore(store);
}

export async function clearAuthRecord(host: string): Promise<void> {
  const store = await loadAuthStore();
  delete store.hosts[normalizeHost(host)];
  if (Object.keys(store.hosts).length === 0) {
    if (existsSync(authStorePath())) {
      await rm(authStorePath(), { force: true });
    }
    return;
  }
  await saveAuthStore(store);
}

export function normalizeHost(host: string): string {
  return host.trim().replace(/\/+$/, "");
}

function loadProjectCloudHostFromConfig(cwd = process.cwd()): string | undefined {
  const projectRoot = resolveProjectRootSync(cwd);
  if (!projectRoot) return undefined;

  const file = configPath(projectRoot);
  if (!existsSync(file)) return undefined;

  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as { cloud?: { host?: string } };
    const host = parsed.cloud?.host?.trim();
    return host ? normalizeHost(host) : undefined;
  } catch {
    return undefined;
  }
}

export function resolveCloudHost(cwd = process.cwd()): string | undefined {
  return loadProjectCloudHostFromConfig(cwd);
}

export function requireCloudHost(cwd = process.cwd()): string {
  const host = resolveCloudHost(cwd);
  if (!host) {
    throw new Error("未配置云端服务器地址，请先在当前项目的 .prdkit/config.json 中设置 cloud.host");
  }
  return host;
}

export function updateProjectCloudConfig(
  config: PrdkitConfig,
  patch: Partial<ProjectCloudConfig> | undefined
): PrdkitConfig {
  if (!patch) {
    return config;
  }

  return {
    ...config,
    cloud: {
      ...(config.cloud ?? {}),
      ...patch,
    },
  };
}

export async function resolveProjectRoot(cwd = process.cwd()): Promise<string | undefined> {
  let current = path.resolve(cwd);
  while (true) {
    if (existsSync(configPath(current))) {
      // 自动检测并执行 checkpoint 迁移
      if (needsMigration(current)) {
        try {
          migrateCheckpointStorage(current);
          logger.info("Checkpoint 存储结构已自动升级");
        } catch (error) {
          logger.warn("Checkpoint 存储迁移失败，将继续使用旧格式");
        }
      }
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

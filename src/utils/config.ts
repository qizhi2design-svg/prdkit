import { input } from "@inquirer/prompts";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type {
  AuthHostRecord,
  AuthStore,
  PerHostProjectMeta,
  PrdkitCloudConfig,
  PrdkitConfig,
  PrdkitGlobalConfig,
} from "#types/index.js";
import { DEFAULT_PAGE_CREATE_SKILL_COMMAND, DEFAULT_INSPECT_COPY_SKILL_COMMAND, DEFAULT_VIEWER_SKILLS } from "#lib/constants/index.js";
import { needsMigration, migrateCheckpointStorage } from "#lib/checkpoints/migration.js";
import { logger } from "./logger.js";

const DEFAULT_CLOUD_HOST = "http://localhost:3000";

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

const cloudConfigSchema = z.object({
  version: z.literal(1).default(1),
  host: z.string().min(1),
  projectId: z.string().min(1).optional(),
  projectSlug: z.string().min(1).optional(),
  projectName: z.string().min(1).optional(),
  lastReleaseId: z.string().min(1).optional(),
  lastPublishedAt: z.string().min(1).optional(),
});

const globalConfigSchema = z.object({
  cloud: z.object({
    defaultHost: z.string().min(1).optional(),
    perHost: z.record(z.string(), z.object({
      projectId: z.string().min(1).optional(),
      projectSlug: z.string().min(1).optional(),
      projectName: z.string().min(1).optional(),
      lastReleaseId: z.string().min(1).optional(),
      lastPublishedAt: z.string().min(1).optional(),
    })).optional(),
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

type EnsureCloudConfigOptions = {
  hostOverride?: string;
  nonInteractive?: boolean;
  prompt?: boolean;
  promptMessage?: string;
};

function normalizeViewerSkills(config: PrdkitConfig, hasExplicitPageCreateSkillCommand: boolean): PrdkitConfig {
  const viewerSkills = config.viewerSkills ?? DEFAULT_VIEWER_SKILLS;

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

function normalizeUrlHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("云端服务器地址不能为空");
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("云端服务器地址仅支持 http 或 https");
  }
  return normalizeHost(parsed.toString());
}

function isNonInteractiveEnv(): boolean {
  return process.env.CI === "true" || process.env.CI === "1";
}

function normalizeLegacyCloudConfig(raw: unknown): Partial<PrdkitCloudConfig> | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const cloud = raw as Record<string, unknown>;
  const hostValue = typeof cloud.host === "string" ? cloud.host.trim() : "";
  const host = hostValue ? normalizeUrlHost(hostValue) : undefined;

  return {
    ...(host ? { host } : {}),
    ...(typeof cloud.projectId === "string" && cloud.projectId.trim() ? { projectId: cloud.projectId.trim() } : {}),
    ...(typeof cloud.projectSlug === "string" && cloud.projectSlug.trim() ? { projectSlug: cloud.projectSlug.trim() } : {}),
    ...(typeof cloud.projectName === "string" && cloud.projectName.trim() ? { projectName: cloud.projectName.trim() } : {}),
    ...(typeof cloud.lastReleaseId === "string" && cloud.lastReleaseId.trim() ? { lastReleaseId: cloud.lastReleaseId.trim() } : {}),
    ...(typeof cloud.lastPublishedAt === "string" && cloud.lastPublishedAt.trim() ? { lastPublishedAt: cloud.lastPublishedAt.trim() } : {}),
  };
}

async function readJsonFile<T>(file: string): Promise<T | undefined> {
  if (!existsSync(file)) {
    return undefined;
  }
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

function readJsonFileSync<T>(file: string): T | undefined {
  if (!existsSync(file)) {
    return undefined;
  }
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function projectCloudConfigPath(projectRoot: string): string {
  return path.join(prdkitDir(projectRoot), "cloud.json");
}

export function prdkitDir(cwd = process.cwd()): string {
  return path.join(cwd, ".prdkit");
}

export function configPath(cwd = process.cwd()): string {
  return path.join(prdkitDir(cwd), "config.json");
}

export function cloudConfigPath(cwd = process.cwd()): string {
  return path.join(prdkitDir(cwd), "cloud.json");
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

export function globalConfigPath(): string {
  return path.join(authStoreDir(), "config.json");
}

export async function loadGlobalConfig(): Promise<PrdkitGlobalConfig> {
  const raw = await readJsonFile<PrdkitGlobalConfig>(globalConfigPath());
  if (!raw) {
    return {};
  }
  return globalConfigSchema.parse(raw);
}

export async function saveGlobalConfig(config: PrdkitGlobalConfig): Promise<void> {
  const file = globalConfigPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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

async function readLegacyProjectCloudConfig(projectRoot: string): Promise<Partial<PrdkitCloudConfig> | undefined> {
  const file = configPath(projectRoot);
  const raw = await readJsonFile<{ cloud?: unknown }>(file);
  return normalizeLegacyCloudConfig(raw?.cloud);
}

async function removeLegacyCloudFromProjectConfig(projectRoot: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  if (config) {
    await saveConfig(config, projectRoot);
  }
}

async function migrateLegacyProjectCloudConfig(projectRoot: string): Promise<void> {
  const file = projectCloudConfigPath(projectRoot);
  if (existsSync(file)) {
    return;
  }

  const legacyCloud = await readLegacyProjectCloudConfig(projectRoot);
  if (!legacyCloud?.host) {
    return;
  }

  const nextConfig = cloudConfigSchema.parse({
    version: 1,
    ...legacyCloud,
  });
  await saveCloudConfig(nextConfig, projectRoot);
  await removeLegacyCloudFromProjectConfig(projectRoot);
}

export async function loadCloudConfig(cwd = process.cwd()): Promise<PrdkitCloudConfig | undefined> {
  const projectRoot = await resolveProjectRoot(cwd);
  if (!projectRoot) return undefined;
  await migrateLegacyProjectCloudConfig(projectRoot);
  const file = projectCloudConfigPath(projectRoot);
  const raw = await readJsonFile<Partial<PrdkitCloudConfig>>(file);
  if (!raw) {
    return undefined;
  }

  const parsed = cloudConfigSchema.parse({
    ...raw,
    host: raw.host ? normalizeUrlHost(raw.host) : raw.host,
  });
  return parsed;
}

export async function saveCloudConfig(config: PrdkitCloudConfig, cwd = process.cwd()): Promise<void> {
  const file = projectCloudConfigPath(cwd);
  await mkdir(path.dirname(file), { recursive: true });
  const normalized = cloudConfigSchema.parse({
    ...config,
    host: normalizeUrlHost(config.host),
  });
  await writeFile(file, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export async function updateCloudConfig(
  cwd: string,
  patch: Partial<Omit<PrdkitCloudConfig, "version" | "host">> & { host?: string }
): Promise<PrdkitCloudConfig> {
  const current = await loadCloudConfig(cwd);
  if (!current) {
    throw new Error("未找到项目云端配置，请先初始化 cloud.json");
  }

  const nextConfig = cloudConfigSchema.parse({
    ...current,
    ...patch,
    host: patch.host ? normalizeUrlHost(patch.host) : current.host,
  });
  await saveCloudConfig(nextConfig, cwd);
  return nextConfig;
}

async function resolveConfiguredDefaultCloudHost(): Promise<string> {
  const globalConfig = await loadGlobalConfig();
  const configured = globalConfig.cloud?.defaultHost?.trim();
  if (!configured) {
    return DEFAULT_CLOUD_HOST;
  }
  return normalizeUrlHost(configured);
}

async function resolvePromptDefaultHost(cwd = process.cwd(), hostOverride?: string): Promise<string> {
  if (hostOverride?.trim()) {
    return normalizeUrlHost(hostOverride);
  }

  const currentCloud = await loadCloudConfig(cwd);
  if (currentCloud?.host) {
    return normalizeUrlHost(currentCloud.host);
  }

  return resolveConfiguredDefaultCloudHost();
}

export async function ensureCloudConfig(cwd = process.cwd(), options: EnsureCloudConfigOptions = {}): Promise<PrdkitCloudConfig> {
  const projectRoot = await resolveProjectRoot(cwd) ?? path.resolve(cwd);
  await migrateLegacyProjectCloudConfig(projectRoot);

  const file = projectCloudConfigPath(projectRoot);
  const existing = await loadCloudConfig(projectRoot);
  const defaultHost = await resolvePromptDefaultHost(projectRoot, options.hostOverride);
  const shouldPrompt = options.prompt !== false && !options.nonInteractive && !isNonInteractiveEnv();

  if (!existing) {
    let host = defaultHost;
    if (shouldPrompt) {
      host = normalizeUrlHost((await input({
        message: options.promptMessage ?? "输入云端服务器地址",
        default: defaultHost,
        required: true,
        validate: (value) => {
          try {
            normalizeUrlHost(value);
            return true;
          } catch (error) {
            return error instanceof Error ? error.message : "请输入有效的 http/https 地址";
          }
        },
      })).trim());
    }

    const nextConfig = cloudConfigSchema.parse({
      version: 1,
      host,
    });
    await saveCloudConfig(nextConfig, projectRoot);
    return nextConfig;
  }

  const nextHost = options.hostOverride?.trim()
    ? normalizeUrlHost(options.hostOverride)
    : normalizeUrlHost(existing.host);

  const nextConfig = cloudConfigSchema.parse({
    ...existing,
    host: nextHost,
  });

  if (!existsSync(file) || JSON.stringify(existing) !== JSON.stringify(nextConfig)) {
    await saveCloudConfig(nextConfig, projectRoot);
  }

  await removeLegacyCloudFromProjectConfig(projectRoot);
  return nextConfig;
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

export type HostWithAuthStatus = {
  host: string;
  status: "active" | "expired";
  user?: { id: number; email: string; name?: string | null };
};

export async function resolveHostProjectMeta(host: string): Promise<PerHostProjectMeta | undefined> {
  const globalConfig = await loadGlobalConfig();
  return globalConfig.cloud?.perHost?.[normalizeHost(host)];
}

export async function saveHostProjectMeta(host: string, meta: PerHostProjectMeta): Promise<void> {
  const globalConfig = await loadGlobalConfig();
  const normalized = normalizeHost(host);
  const perHost = { ...globalConfig.cloud?.perHost };
  const cleaned: PerHostProjectMeta = {};
  if (meta.projectId) cleaned.projectId = meta.projectId;
  if (meta.projectSlug) cleaned.projectSlug = meta.projectSlug;
  if (meta.projectName) cleaned.projectName = meta.projectName;
  if (meta.lastReleaseId) cleaned.lastReleaseId = meta.lastReleaseId;
  if (meta.lastPublishedAt) cleaned.lastPublishedAt = meta.lastPublishedAt;
  perHost[normalized] = cleaned;
  await saveGlobalConfig({
    ...globalConfig,
    cloud: { ...globalConfig.cloud, perHost },
  });
}

export async function listAuthenticatedHosts(): Promise<HostWithAuthStatus[]> {
  const store = await loadAuthStore();
  const hosts: HostWithAuthStatus[] = [];
  for (const [host, record] of Object.entries(store.hosts)) {
    const isExpired = new Date(record.expiresAt).getTime() <= Date.now();
    hosts.push({
      host,
      status: isExpired ? "expired" : "active",
      user: record.user,
    });
  }
  return hosts;
}

export async function switchCloudHost(newHost: string, cwd?: string): Promise<PrdkitCloudConfig> {
  const projectRoot = await resolveProjectRoot(cwd) ?? path.resolve(cwd ?? process.cwd());
  const normalizedNew = normalizeUrlHost(newHost);

  const current = await loadCloudConfig(projectRoot);
  if (current?.host) {
    await saveHostProjectMeta(current.host, {
      projectId: current.projectId,
      projectSlug: current.projectSlug,
      projectName: current.projectName,
      lastReleaseId: current.lastReleaseId,
      lastPublishedAt: current.lastPublishedAt,
    });
  }

  const previousMeta = await resolveHostProjectMeta(normalizedNew);

  const nextConfig = cloudConfigSchema.parse({
    version: 1,
    host: normalizedNew,
    projectId: previousMeta?.projectId,
    projectSlug: previousMeta?.projectSlug,
    projectName: previousMeta?.projectName,
    lastReleaseId: previousMeta?.lastReleaseId,
    lastPublishedAt: previousMeta?.lastPublishedAt,
  });
  await saveCloudConfig(nextConfig, projectRoot);
  return nextConfig;
}

export async function resolveCloudHost(cwd = process.cwd(), overrideHost?: string): Promise<string> {
  if (overrideHost?.trim()) {
    return normalizeUrlHost(overrideHost);
  }

  const projectRoot = await resolveProjectRoot(cwd);
  if (projectRoot) {
    const cloudConfig = await loadCloudConfig(projectRoot);
    if (cloudConfig?.host) {
      return normalizeUrlHost(cloudConfig.host);
    }
  }

  return resolveConfiguredDefaultCloudHost();
}

export async function requireCloudHost(cwd = process.cwd(), overrideHost?: string): Promise<string> {
  return resolveCloudHost(cwd, overrideHost);
}

export async function resolveProjectRoot(cwd = process.cwd()): Promise<string | undefined> {
  let current = path.resolve(cwd);
  while (true) {
    if (existsSync(configPath(current))) {
      if (needsMigration(current)) {
        try {
          migrateCheckpointStorage(current);
          logger.info("Checkpoint 存储结构已自动升级");
        } catch {
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

export function resolveProjectRootLegacySync(cwd = process.cwd()): string | undefined {
  return resolveProjectRootSync(cwd);
}

export function readGlobalConfigSync(): PrdkitGlobalConfig {
  const raw = readJsonFileSync<PrdkitGlobalConfig>(globalConfigPath());
  if (!raw) {
    return {};
  }
  return globalConfigSchema.parse(raw);
}

export { DEFAULT_CLOUD_HOST };

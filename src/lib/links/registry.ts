import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ReleaseLink, ReleaseLinksRegistry } from "./types.js";
import { prdkitDir } from "#utils/config.js";

const linkSourceSchema = z.enum(["cli-publish", "viewer-publish", "manual", "fetched"]);

const releaseLinkSchema = z.object({
  releaseId: z.string().min(1),
  projectId: z.string().min(1),
  url: z.string().min(1),
  prototypePaths: z.array(z.string().min(1)),
  source: linkSourceSchema,
  publishedAt: z.string().min(1),
});

const registrySchema = z.object({
  version: z.literal(1),
  releases: z.array(releaseLinkSchema),
});

export interface RegisterLinkInput {
  releaseId: string;
  projectId: string;
  url: string;
  prototypePaths: string[];
  source: ReleaseLink["source"];
  publishedAt: string;
}

function registryPath(projectRoot: string): string {
  return path.join(prdkitDir(projectRoot), "release-links.json");
}

export async function loadRegistry(projectRoot: string): Promise<ReleaseLinksRegistry> {
  const file = registryPath(projectRoot);
  if (!existsSync(file)) {
    return { version: 1, releases: [] };
  }

  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return registrySchema.parse(parsed);
  } catch {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as ReleaseLinksRegistry;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.releases)) {
      return parsed as ReleaseLinksRegistry;
    }
    return { version: 1, releases: [] };
  }
}

export async function saveRegistry(
  projectRoot: string,
  registry: ReleaseLinksRegistry
): Promise<void> {
  const file = registryPath(projectRoot);
  await writeFile(file, JSON.stringify(registry, null, 2), "utf8");
}

/** 注册一条链接。同一 releaseId 重复注册时更新 prototypePaths 和 publishedAt。 */
export async function registerReleaseLink(
  projectRoot: string,
  input: RegisterLinkInput
): Promise<ReleaseLink> {
  const registry = await loadRegistry(projectRoot);

  const existing = registry.releases.find((r) => r.releaseId === input.releaseId);
  if (existing) {
    existing.prototypePaths = input.prototypePaths;
    existing.publishedAt = input.publishedAt;
    existing.source = input.source;
    existing.url = input.url;
    existing.projectId = input.projectId;
  } else {
    const link: ReleaseLink = {
      releaseId: input.releaseId,
      projectId: input.projectId,
      url: input.url,
      prototypePaths: input.prototypePaths,
      source: input.source,
      publishedAt: input.publishedAt,
    };
    registry.releases.unshift(link);
  }

  await saveRegistry(projectRoot, registry);

  return existing ?? registry.releases[0];
}

/** 按 releaseId 查找链接。 */
export function findLinkByReleaseId(
  registry: ReleaseLinksRegistry,
  releaseId: string
): ReleaseLink | undefined {
  return registry.releases.find((r) => r.releaseId === releaseId);
}

/** 按项目 ID 和 releaseId 查找链接。 */
export function findLinkByProjectAndRelease(
  registry: ReleaseLinksRegistry,
  projectId: string,
  releaseId: string
): ReleaseLink | undefined {
  return registry.releases.find(
    (r) => r.projectId === projectId && r.releaseId === releaseId
  );
}

/** 按原型路径查找所有关联的链接。 */
export function findLinksByPrototypePath(
  registry: ReleaseLinksRegistry,
  prototypePath: string
): ReleaseLink[] {
  return registry.releases.filter((r) => r.prototypePaths.includes(prototypePath));
}

/** 删除指定 releaseId 的链接。返回是否删除了记录。 */
export async function removeLink(
  projectRoot: string,
  releaseId: string
): Promise<boolean> {
  const registry = await loadRegistry(projectRoot);
  const index = registry.releases.findIndex((r) => r.releaseId === releaseId);
  if (index === -1) return false;

  registry.releases.splice(index, 1);
  await saveRegistry(projectRoot, registry);
  return true;
}

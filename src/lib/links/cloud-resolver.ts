import type { ReleaseLink } from "./types.js";
import { registerReleaseLink } from "./registry.js";
import { createCloudClient } from "#lib/cloud/client.js";
import { requireCloudHost } from "#utils/config.js";

export interface CloudResolveResult {
  link: ReleaseLink;
  fromCloud: boolean;
}

/** 从后端获取 release 详情并回填到本地注册表。 */
export async function resolveReleaseFromCloud(
  projectRoot: string,
  origin: string,
  projectId: string,
  releaseId: string,
  url: string
): Promise<CloudResolveResult> {
  const host = origin || (await requireCloudHost(projectRoot));
  const client = await createCloudClient(host);

  const status = await client.getReleaseStatus(projectId, releaseId);

  const link = await registerReleaseLink(projectRoot, {
    releaseId,
    projectId,
    url,
    prototypePaths: status.results.map((r) => r.prototypePath),
    source: "fetched",
    publishedAt: status.release.createdAt || new Date().toISOString(),
  });

  return { link, fromCloud: true };
}

import path from "node:path";
import type {
  PrdkitCloudConfig,
  PrdkitConfig,
  ReleaseCommitPayload,
  ReleaseCommitResult,
  ReleasePrepareResult
} from "#types/index.js";
import { requireCloudHost } from "#utils/config.js";
import { logger } from "#utils/logger.js";
import { readBlobSource, collectPrototypeSnapshot } from "../checkpoints/prototype/snapshot.js";
import { flattenPrototypes, scanPrototypes } from "../server/scanner.js";
import { createCloudClient } from "./client.js";

interface PublishToCloudOptions {
  projectRoot: string;
  config: PrdkitConfig;
  cloudConfig: PrdkitCloudConfig;
  hostOverride?: string;
  message?: string;
  entryFiles?: string[];
  dryRun?: boolean;
  json?: boolean;
  project?: string;
  open?: boolean;
}

export type PublishToCloudResult = {
  releaseId: string;
  projectId: string;
  changedCount: number;
  unchangedCount: number;
  uploadedBlobCount: number;
  results: ReleaseCommitResult["results"];
  releaseUrl: string;
  webUrl: string;
  dryRun: boolean;
};

type SnapshotBundle = {
  path: string;
  name: string;
  snapshot: ReturnType<typeof collectPrototypeSnapshot>;
};

export async function publishToCloud(options: PublishToCloudOptions): Promise<PublishToCloudResult> {
  const { projectRoot, config, cloudConfig, hostOverride, message, entryFiles, dryRun, project } = options;
  const host = await requireCloudHost(projectRoot, hostOverride);
  const client = await createCloudClient(host);
  await client.ensureValidAuth();
  const projectId = await resolvePublishProjectId(client, cloudConfig, project);

  const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
  const entries = resolveEntries(prototypesDir, entryFiles);
  if (entries.length === 0) {
    throw new Error("没有找到需要上传的原型");
  }

  const snapshots = entries.map((entry) => {
    const snapshot = collectPrototypeSnapshot(prototypesDir, entry);
    return {
      path: entry,
      name: entry.split("/").pop() || entry,
      snapshot,
    };
  });

  const prepare = await client.prepareRelease(projectId, {
    message,
    prototypes: snapshots.map((item) => ({
      path: item.path,
      name: item.name,
      contentHash: item.snapshot.contentHash,
      fileCount: item.snapshot.fileCount,
      markCount: item.snapshot.markCount,
      message,
      blobHashes: [
        ...new Set([
          ...item.snapshot.files.map((file) => file.blobHash),
          ...item.snapshot.marks.map((mark) => mark.blobHash),
        ]),
      ],
    })),
  });

  const changedCount = prepare.prototypes.filter((item) => item.status === "changed").length;
  const unchangedCount = prepare.prototypes.filter((item) => item.status === "unchanged").length;

  if (!options.json) {
    logger.info(`扫描 ${entries.length} 个页面，待更新 ${changedCount} 个，未变化 ${unchangedCount} 个`);
    logger.info(`远端缺失 blob：${prepare.missingBlobHashes.length} 个`);
  }

  if (dryRun) {
    return {
      releaseId: prepare.releaseId,
      projectId: prepare.projectId,
      changedCount,
      unchangedCount,
      uploadedBlobCount: 0,
      results: prepare.prototypes.map((item) => ({
        prototypePath: item.path,
        prototypeId: "",
        status: item.status,
        versionId: item.latestVersionId || undefined,
        versionNumber: item.latestVersionNumber || undefined,
      })),
      releaseUrl: prepare.releaseUrl,
      webUrl: prepare.webUrl,
      dryRun: true,
    };
  }

  const missingBlobSet = new Set(prepare.missingBlobHashes);
  if (missingBlobSet.size > 0) {
    const blobs = collectMissingBlobs(prototypesDir, snapshots, missingBlobSet);
    await client.uploadBlobs(prepare.releaseId, blobs);
  }

  const commitPayload = buildCommitPayload(snapshots, prepare, message);
  const commit = await client.commitRelease(projectId, prepare.releaseId, commitPayload);
  const status = await client.getReleaseStatus(projectId, prepare.releaseId);

  return {
    releaseId: commit.release.id,
    projectId,
    changedCount: commit.results.filter((item) => item.status === "changed").length,
    unchangedCount: commit.results.filter((item) => item.status === "unchanged").length,
    uploadedBlobCount: missingBlobSet.size,
    results: status.results,
    releaseUrl: status.release.releaseUrl,
    webUrl: status.release.webUrl,
    dryRun: false,
  };
}

async function resolvePublishProjectId(
  client: Awaited<ReturnType<typeof createCloudClient>>,
  cloudConfig: PrdkitCloudConfig,
  project?: string
): Promise<string> {
  if (!project?.trim()) {
    if (!cloudConfig.projectId) {
      throw new Error("未选择云端项目，请使用 `prdkit prototype publish --cloud --project <idOrSlug>` 或通过本地 viewer 选择项目");
    }
    return cloudConfig.projectId;
  }

  const identifier = project.trim();
  if (cloudConfig.projectId === identifier) {
    return identifier;
  }

  const projects = await client.listProjects();
  const match = projects.find((item) => item.id === identifier || item.slug === identifier);
  if (match) {
    return match.id;
  }

  const resolved = await client.resolveProjectBySlug(identifier).catch(() => undefined);
  if (resolved?.id) {
    return resolved.id;
  }

  throw new Error(`未找到云端项目：${identifier}`);
}

function resolveEntries(prototypesDir: string, entryFiles?: string[]): string[] {
  const allEntries = flattenPrototypes(scanPrototypes(prototypesDir));
  if (!entryFiles || entryFiles.length === 0) {
    return allEntries;
  }

  const selected = new Set(entryFiles);
  return allEntries.filter((entry) => selected.has(entry));
}

function collectMissingBlobs(
  prototypesDir: string,
  snapshots: SnapshotBundle[],
  missingBlobSet: Set<string>
): Array<{ hash: string; content: Buffer }> {
  const blobs = new Map<string, Buffer>();

  for (const item of snapshots) {
    for (const file of item.snapshot.files) {
      if (!missingBlobSet.has(file.blobHash) || blobs.has(file.blobHash)) {
        continue;
      }
      blobs.set(file.blobHash, readBlobSource(prototypesDir, item.path, file.relativePath));
    }

    for (const mark of item.snapshot.marks) {
      if (!missingBlobSet.has(mark.blobHash) || blobs.has(mark.blobHash)) {
        continue;
      }
      blobs.set(mark.blobHash, readBlobSource(prototypesDir, item.path, mark.relativePath));
    }
  }

  return [...blobs.entries()].map(([hash, content]) => ({ hash, content }));
}

function buildCommitPayload(
  snapshots: SnapshotBundle[],
  prepare: ReleasePrepareResult,
  message?: string
): ReleaseCommitPayload {
  const stateMap = new Map(prepare.prototypes.map((item) => [item.path, item]));

  return {
    message,
    prototypes: snapshots.map((item) => ({
      path: item.path,
      name: item.name,
      contentHash: item.snapshot.contentHash,
      fileCount: item.snapshot.fileCount,
      markCount: item.snapshot.markCount,
      filesManifest: item.snapshot.files,
      marksManifest: item.snapshot.marks,
      blobHashes: [
        ...new Set([
          ...item.snapshot.files.map((file) => file.blobHash),
          ...item.snapshot.marks.map((mark) => mark.blobHash),
        ]),
      ],
      baseVersionId: stateMap.get(item.path)?.latestVersionId ?? null,
    })),
  };
}

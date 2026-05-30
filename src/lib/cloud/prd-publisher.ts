import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type {
  PrdkitCloudConfig,
  PrdkitConfig,
  PrdReleaseCommitResult,
  PrdReleasePrepareResult,
} from "#types/index.js";
import { requireCloudHost } from "#utils/config.js";
import { logger } from "#utils/logger.js";
import { createCloudClient } from "./client.js";
import { resolvePublishProjectId } from "./publisher.js";

interface PublishPrdToCloudOptions {
  projectRoot: string;
  config: PrdkitConfig;
  cloudConfig: PrdkitCloudConfig;
  hostOverride?: string;
  message?: string;
  entryFiles?: string[];
  project?: string;
}

export type PublishPrdToCloudResult = {
  releaseId: string;
  projectId: string;
  changedCount: number;
  unchangedCount: number;
  results: PrdReleaseCommitResult["results"];
  releaseUrl: string;
  webUrl: string;
  sequenceNumber: number;
};

type PrdSnapshot = {
  path: string;
  name: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  contentHash: string;
  lineCount: number;
  wordCount: number;
};

export async function publishPrdsToCloud(options: PublishPrdToCloudOptions): Promise<PublishPrdToCloudResult> {
  const { projectRoot, cloudConfig, hostOverride, message, entryFiles, project } = options;
  const host = await requireCloudHost(projectRoot, hostOverride);
  const client = await createCloudClient(host);
  await client.ensureValidAuth();
  const projectId = await resolvePublishProjectId(client, cloudConfig, project);
  const snapshots = collectPrdSnapshots(projectRoot, entryFiles);

  if (snapshots.length === 0) {
    throw new Error("没有找到需要发布的 PRD 文档");
  }

  const prepare = await client.preparePrdRelease(projectId, {
    kind: "prd",
    message,
    documents: snapshots.map((item) => ({
      path: item.path,
      name: item.name,
      title: item.title,
      contentHash: item.contentHash,
      lineCount: item.lineCount,
      wordCount: item.wordCount,
      message,
    })),
  });

  const changedCount = prepare.documents.filter((item) => item.status === "changed").length;
  const unchangedCount = prepare.documents.filter((item) => item.status === "unchanged").length;
  logger.info(`扫描 ${snapshots.length} 份 PRD，待更新 ${changedCount} 份，未变化 ${unchangedCount} 份`);

  const commit = await client.commitPrdRelease(projectId, prepare.releaseId, {
    kind: "prd",
    message,
    documents: snapshots.map((item) => ({
      path: item.path,
      name: item.name,
      title: item.title,
      contentHash: item.contentHash,
      lineCount: item.lineCount,
      wordCount: item.wordCount,
      content: item.content,
      frontmatter: item.frontmatter,
      baseVersionId: prepare.documents.find((doc) => doc.path === item.path)?.latestVersionId ?? null,
    })),
  });
  const status = await client.getPrdReleaseStatus(projectId, prepare.releaseId);

  return {
    releaseId: commit.release.id,
    projectId,
    changedCount: commit.results.filter((item) => item.status === "changed").length,
    unchangedCount: commit.results.filter((item) => item.status === "unchanged").length,
    results: status.results,
    releaseUrl: status.release.releaseUrl,
    webUrl: status.release.webUrl,
    sequenceNumber: status.release.sequenceNumber,
  };
}

function collectPrdSnapshots(projectRoot: string, entryFiles?: string[]): PrdSnapshot[] {
  const prdsDir = path.join(projectRoot, "workspace", "prds");
  if (!existsSync(prdsDir)) {
    throw new Error(`未找到 PRD 目录：${prdsDir}`);
  }

  const allFiles = scanPrdFiles(prdsDir);
  const targetFiles = !entryFiles || entryFiles.length === 0
    ? allFiles
    : allFiles.filter((item) => entryFiles.includes(item));

  return targetFiles.map((fileName) => {
    const filePath = path.join(prdsDir, fileName);
    const rawContent = readFileSync(filePath, "utf8");
    const parsed = matter(rawContent);
    const title = typeof parsed.data?.title === "string" && parsed.data.title.trim()
      ? parsed.data.title.trim()
      : fileName.replace(/\.md$/, "");
    const content = parsed.content;

    return {
      path: fileName,
      name: fileName.split("/").pop() || fileName,
      title,
      content,
      frontmatter: parsed.data && typeof parsed.data === "object" ? { ...parsed.data } : {},
      contentHash: createHash("sha256").update(rawContent).digest("hex"),
      lineCount: content.split(/\r?\n/).length,
      wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
    };
  });
}

function scanPrdFiles(prdsDir: string): string[] {
  const results: string[] = [];

  const walk = (currentDir: string, relativeDir = "") => {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relativePath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(relativePath.replace(/\\/g, "/"));
      }
    }
  };

  walk(prdsDir);
  return results.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

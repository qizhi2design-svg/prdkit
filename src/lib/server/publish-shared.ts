import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CheckpointFileEntry, CheckpointMarkEntry, CheckpointSnapshot } from "../checkpoints/prototype/types.js";

const SHARED_REF_PATTERN = /(?:\.\.\/)+shared\/[^\s"'`)>]+/g;

export interface SharedDependencyFile {
  sourceAbsolutePath: string;
  sourceRelativePath: string;
  cloudRelativePath: string;
  blobHash: string;
  size: number;
  content: Buffer;
}

export function collectPrototypeSharedDependencies(
  prototypesDir: string,
  prototypePath: string,
  snapshotFiles: CheckpointFileEntry[],
): SharedDependencyFile[] {
  const prototypeDir = path.join(prototypesDir, prototypePath);
  const seen = new Set<string>();
  const results: SharedDependencyFile[] = [];

  for (const file of snapshotFiles) {
    if (!isTextLikeFile(file.relativePath)) {
      continue;
    }

    const absolutePath = path.join(prototypeDir, file.relativePath);
    const content = readFileSync(absolutePath, "utf8");
    const matches = content.match(SHARED_REF_PATTERN) ?? [];

    for (const matchedRef of matches) {
      const resolved = path.resolve(path.dirname(absolutePath), matchedRef);
      const normalizedResolved = path.normalize(resolved);
      if (!normalizedResolved.startsWith(path.normalize(prototypesDir + path.sep))) {
        continue;
      }
      if (!existsSync(normalizedResolved)) {
        continue;
      }

      const sourceRelativePath = toPosix(path.relative(prototypesDir, normalizedResolved));
      if (seen.has(sourceRelativePath)) {
        continue;
      }
      seen.add(sourceRelativePath);

      const suffix = matchedRef.split("shared/")[1];
      if (!suffix) {
        continue;
      }

      const dependencyContent = readFileSync(normalizedResolved);
      results.push({
        sourceAbsolutePath: normalizedResolved,
        sourceRelativePath,
        cloudRelativePath: `__shared__/${toPosix(suffix)}`,
        blobHash: sha256(dependencyContent),
        size: dependencyContent.length,
        content: dependencyContent,
      });
    }
  }

  return results.sort((a, b) => a.sourceRelativePath.localeCompare(b.sourceRelativePath, "zh-CN"));
}

export function mergeSnapshotWithSharedDependencies(
  snapshot: CheckpointSnapshot,
  dependencies: SharedDependencyFile[],
): CheckpointSnapshot {
  if (dependencies.length === 0) {
    return snapshot;
  }

  const files: CheckpointFileEntry[] = [
    ...snapshot.files,
    ...dependencies.map((dependency) => ({
      relativePath: dependency.cloudRelativePath,
      blobHash: dependency.blobHash,
      size: dependency.size,
    })),
  ].sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));

  return {
    ...snapshot,
    files,
    fileCount: files.length,
    contentHash: buildContentHash(snapshot.prototypePath, files, snapshot.marks),
  };
}

function buildContentHash(
  prototypePath: string,
  files: CheckpointFileEntry[],
  marks: CheckpointMarkEntry[],
): string {
  return sha256(JSON.stringify({
    prototypePath,
    files,
    marks: marks.map((mark) => ({
      id: mark.id,
      title: mark.title,
      description: mark.description,
      timestamp: mark.timestamp,
      fileName: mark.fileName,
      relativePath: mark.relativePath,
      blobHash: mark.blobHash,
      selector: mark.selector,
      domPath: mark.domPath,
    })),
  }));
}

function isTextLikeFile(relativePath: string): boolean {
  return [".html", ".js", ".mjs", ".cjs", ".css"].includes(path.extname(relativePath).toLowerCase());
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

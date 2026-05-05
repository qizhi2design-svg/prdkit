import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  readPrototypeMarksSync,
  stripMarkdownTitle,
  type MarkRecord
} from "../../server/marks.js";
import type {
  CheckpointFileEntry,
  CheckpointMarkEntry,
  CheckpointSnapshot
} from "./types.js";

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function walkFiles(rootDir: string, currentDir: string, entries: CheckpointFileEntry[]): void {
  const dirEntries = readdirSync(currentDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  for (const entry of dirEntries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "marks") continue;
      walkFiles(rootDir, fullPath, entries);
      continue;
    }

    const content = readFileSync(fullPath);
    entries.push({
      relativePath: normalizePath(path.relative(rootDir, fullPath)),
      blobHash: sha256(content),
      size: statSync(fullPath).size
    });
  }
}

function buildMarkEntry(
  prototypeDir: string,
  mark: MarkRecord
): CheckpointMarkEntry {
  const markPath = path.join(prototypeDir, "marks", mark.fileName);
  const content = readFileSync(markPath);

  return {
    id: mark.id,
    title: mark.title,
    description: stripMarkdownTitle(mark.description).trim(),
    timestamp: mark.timestamp,
    fileName: mark.fileName,
    relativePath: normalizePath(path.join("marks", mark.fileName)),
    blobHash: sha256(content),
    selector: mark.selector,
    domPath: mark.domPath
  };
}

function buildContentHash(
  prototypePath: string,
  files: CheckpointFileEntry[],
  marks: CheckpointMarkEntry[]
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
      domPath: mark.domPath
    }))
  }));
}

export function collectPrototypeSnapshot(
  prototypesDir: string,
  prototypePath: string
): CheckpointSnapshot {
  const prototypeDir = path.join(prototypesDir, prototypePath);
  if (!existsSync(prototypeDir)) {
    throw new Error(`原型 "${prototypePath}" 不存在`);
  }

  const files: CheckpointFileEntry[] = [];
  walkFiles(prototypeDir, prototypeDir, files);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));

  const marks = readPrototypeMarksSync(prototypesDir, prototypePath)
    .map((mark) => buildMarkEntry(prototypeDir, mark))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));

  return {
    prototypePath,
    files,
    marks,
    contentHash: buildContentHash(prototypePath, files, marks),
    fileCount: files.length,
    markCount: marks.length
  };
}

export function readBlobSource(
  prototypesDir: string,
  prototypePath: string,
  relativePath: string
): Buffer {
  return readFileSync(path.join(prototypesDir, prototypePath, relativePath));
}

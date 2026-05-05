import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { FileSystemError } from "#utils/errors.js";
import type { PrdCheckpointSnapshot } from "./types.js";

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function extractMarkdownTitle(content: string): string | undefined {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
  }
  return undefined;
}

function normalizePrdPath(projectRoot: string, prdPath: string): string {
  return path.relative(projectRoot, path.resolve(projectRoot, prdPath)).split(path.sep).join("/");
}

export function readPrdBlobSource(projectRoot: string, prdPath: string): Buffer {
  const absolutePath = path.join(projectRoot, prdPath);
  if (!fs.existsSync(absolutePath)) {
    throw FileSystemError.fileNotFound(prdPath);
  }
  return fs.readFileSync(absolutePath);
}

export function collectPrdSnapshot(projectRoot: string, prdPath: string): PrdCheckpointSnapshot {
  const normalizedPath = normalizePrdPath(projectRoot, prdPath);
  const absolutePath = path.join(projectRoot, normalizedPath);
  if (!fs.existsSync(absolutePath)) {
    throw FileSystemError.fileNotFound(normalizedPath);
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  const parsed = matter(content);
  const title = typeof parsed.data?.title === "string" && parsed.data.title.trim()
    ? parsed.data.title.trim()
    : extractMarkdownTitle(parsed.content) || path.basename(normalizedPath, path.extname(normalizedPath));
  const size = Buffer.byteLength(content);
  const lineCount = content.length === 0 ? 0 : content.split("\n").length;
  const blobHash = sha256(content);

  return {
    prdPath: normalizedPath,
    fileName: path.basename(normalizedPath),
    title,
    blobHash,
    size,
    lineCount,
    contentHash: blobHash,
  };
}

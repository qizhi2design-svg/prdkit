import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { COPY } from "./command-text.js";

const IGNORED_INIT_FILES = new Set([".DS_Store"]);

export async function ensureSafeInitTarget(targetDir: string): Promise<void> {
  if (!existsSync(targetDir)) return;
  const entries = (await readdir(targetDir)).filter((entry) => !IGNORED_INIT_FILES.has(entry));
  if (entries.length === 0) return;
  throw new Error(`${COPY.targetNotEmpty}：${targetDir}`);
}

export function sanitizeFileStem(value: string): string {
  const stem = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return stem || "document";
}

export function suggestedFileName(title: string, templateId: string): string {
  const stem = sanitizeFileStem(title);
  return `${stem}-${templateId}.md`;
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function pathIsDirectory(targetPath: string): Promise<boolean> {
  if (!existsSync(targetPath)) return false;
  const target = await stat(targetPath);
  return target.isDirectory();
}

export async function resolveOutputPath(options: {
  cwd?: string;
  output?: string;
  dir?: string;
  defaultDir?: string;
  title: string;
  templateId: string;
  outputSuggestion?: string;
}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const defaultName = suggestedFileName(options.title, options.templateId);

  if (options.output) {
    const resolved = path.resolve(cwd, options.output);
    if (resolved.endsWith(path.sep) || await pathIsDirectory(resolved)) {
      return path.join(resolved, defaultName);
    }
    return resolved;
  }

  const baseDir = options.dir ?? options.defaultDir ?? ".";
  return path.resolve(cwd, baseDir, defaultName);
}

export async function assertFileDoesNotExist(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    throw new Error(`输出文件已存在：${filePath}`);
  }
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, "utf8");
}

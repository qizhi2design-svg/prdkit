import { mkdir, readFile, rm, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { CreateTemplateVariables, TemplateItem, TemplateManifest } from "#types/index.js";

const execFileAsync = promisify(execFile);

const manifestSchema = z.object({
  version: z.number(),
  templates: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    file: z.string().min(1),
    output_suggestion: z.string().optional(),
    tags: z.array(z.string()).optional()
  }))
});

function templateDir(projectRoot: string): string {
  return path.join(projectRoot, ".prdkit", "templates");
}

function toSshGithub443(repoUrl: string): string {
  const match = repoUrl.match(/^git@github\.com:(.+)$/);
  if (!match) return repoUrl;
  return `ssh://git@ssh.github.com:443/${match[1]}`;
}

async function cloneRepo(repoUrl: string, targetDir: string): Promise<void> {
  await mkdir(path.dirname(targetDir), { recursive: true });
  const candidates = [repoUrl, toSshGithub443(repoUrl)];
  let lastError = "";
  for (const candidate of candidates) {
    try {
      await execFileAsync("git", ["clone", "--depth", "1", "--branch", "main", candidate, targetDir], {
        encoding: "utf8"
      });
      return;
    } catch (error) {
      await rm(targetDir, { recursive: true, force: true });
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`克隆模板仓库失败：${lastError}`);
}

export async function ensureTemplateRepo(repoUrl: string, projectRoot: string): Promise<string> {
  const repoDir = templateDir(projectRoot);
  if (existsSync(path.join(repoDir, "templates.json"))) return repoDir;
  await cloneRepo(repoUrl, repoDir);
  return repoDir;
}

export async function readTemplateManifest(repoDir: string): Promise<TemplateManifest> {
  const raw = await readFile(path.join(repoDir, "templates.json"), "utf8");
  return manifestSchema.parse(JSON.parse(raw));
}

export function resolveTemplate(manifest: TemplateManifest, id: string): TemplateItem {
  const item = manifest.templates.find((template) => template.id === id);
  if (!item) throw new Error(`模板不存在：${id}`);
  return item;
}

export async function readTemplateContent(repoDir: string, template: TemplateItem): Promise<string> {
  const filePath = path.join(repoDir, template.file);
  if (!existsSync(filePath)) throw new Error(`模板文件不存在：${template.file}`);
  return readFile(filePath, "utf8");
}

export function renderTemplate(content: string, variables: CreateTemplateVariables): string {
  return Object.entries(variables).reduce((rendered, [key, value]) => {
    const normalized = value == null ? "" : String(value);
    return rendered.replaceAll(`{{${key}}}`, normalized);
  }, content);
}

export async function isTemplateDirectory(repoDir: string, template: TemplateItem): Promise<boolean> {
  const templatePath = path.join(repoDir, template.file);
  if (!existsSync(templatePath)) return false;
  const stats = await stat(templatePath);
  return stats.isDirectory();
}

async function copyDirectoryRecursive(
  srcDir: string,
  destDir: string,
  variables: CreateTemplateVariables
): Promise<void> {
  await mkdir(destDir, { recursive: true });

  const entries = await readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath, variables);
    } else if (entry.isFile()) {
      // 读取源文件内容
      const content = await readFile(srcPath, "utf8");
      // 渲染模板变量
      const renderedContent = renderTemplate(content, variables);
      // 写入目标文件
      await writeFile(destPath, renderedContent, "utf8");
    }
  }
}

export async function copyTemplateDirectory(
  repoDir: string,
  template: TemplateItem,
  outputPath: string,
  variables: CreateTemplateVariables
): Promise<void> {
  const templatePath = path.join(repoDir, template.file);
  if (!existsSync(templatePath)) {
    throw new Error(`模板目录不存在：${template.file}`);
  }

  await copyDirectoryRecursive(templatePath, outputPath, variables);
}

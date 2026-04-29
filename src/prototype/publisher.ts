import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { sanitizeFileStem } from "../files.js";
import { flattenPrototypes, scanPrototypes, type PrototypeNode } from "./server/scanner.js";
import { readPrototypeMarksSync, type MarkRecord } from "./server/marks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, "../../package.json"), "utf8")
) as { version: string };

export interface PublishedSourceMeta {
  tool: "prdkit";
  toolVersion: string;
}

export interface PublishedManifest {
  version: 1;
  projectName: string;
  generatedAt: string;
  source: PublishedSourceMeta;
  prototypesTree: PrototypeNode;
  entryFiles: string[];
}

export type PublishedMarkMap = Record<string, MarkRecord[]>;

export interface PublishOptions {
  projectRoot: string;
  prototypesDir: string;
  outputDir: string;
  projectName: string;
  entryFiles?: string[];
}

export interface PublishResult {
  outputDir: string;
  manifest: PublishedManifest;
  marks: PublishedMarkMap;
}

export function buildDefaultPublishDirName(projectName: string, now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const projectSlug = sanitizeFileStem(projectName);
  return `prototype-${projectSlug}-${timestamp}`;
}

export function buildDefaultPublishOutputDir(projectRoot: string, projectName: string): string {
  return path.join(projectRoot, "dist", "publish", buildDefaultPublishDirName(projectName));
}

export async function publishArtifacts(options: PublishOptions): Promise<PublishResult> {
  const { projectRoot, prototypesDir, outputDir, projectName, entryFiles: requestedEntries } = options;

  if (!existsSync(prototypesDir)) {
    throw new Error(`未找到 prototypes 目录：${prototypesDir}`);
  }

  if (existsSync(outputDir)) {
    throw new Error(`输出目录已存在：${outputDir}`);
  }

  const fullTree = scanPrototypes(prototypesDir);
  const allEntryFiles = flattenPrototypes(fullTree);
  const entryFiles = normalizeRequestedEntries(allEntryFiles, requestedEntries);

  if (entryFiles.length === 0) {
    throw new Error(`未找到可发布的原型：${prototypesDir}`);
  }

  const prototypesTree = filterPrototypeTree(fullTree, new Set(entryFiles));

  const manifest: PublishedManifest = {
    version: 1,
    projectName,
    generatedAt: new Date().toISOString(),
    source: {
      tool: "prdkit",
      toolVersion: packageJson.version
    },
    prototypesTree,
    entryFiles
  };

  const marks = collectMarks(prototypesDir, entryFiles);

  await mkdir(outputDir, { recursive: true });
  await copyPrototypeDirectories(prototypesDir, outputDir, entryFiles);
  await writePublishFiles(projectRoot, outputDir, manifest, marks);

  return { outputDir, manifest, marks };
}

function normalizeRequestedEntries(allEntryFiles: string[], requestedEntries?: string[]): string[] {
  if (!requestedEntries || requestedEntries.length === 0) {
    return allEntryFiles;
  }

  const validEntries = new Set(allEntryFiles);
  const normalizedEntries = requestedEntries.filter((entry) => validEntries.has(entry));

  if (normalizedEntries.length === 0) {
    throw new Error("未选择可发布的原型页面");
  }

  return allEntryFiles.filter((entry) => normalizedEntries.includes(entry));
}

function filterPrototypeTree(node: PrototypeNode, selectedEntries: Set<string>): PrototypeNode {
  if (node.type === "file") {
    return node;
  }

  const children = (node.children ?? [])
    .map((child) => filterPrototypeTreeNode(child, selectedEntries))
    .filter((child): child is PrototypeNode => child !== null);

  return {
    ...node,
    children
  };
}

function filterPrototypeTreeNode(node: PrototypeNode, selectedEntries: Set<string>): PrototypeNode | null {
  if (node.type === "file") {
    return selectedEntries.has(node.path) ? node : null;
  }

  const children = (node.children ?? [])
    .map((child) => filterPrototypeTreeNode(child, selectedEntries))
    .filter((child): child is PrototypeNode => child !== null);

  if (children.length === 0) {
    return null;
  }

  return {
    ...node,
    children
  };
}

function collectMarks(prototypesDir: string, entryFiles: string[]): PublishedMarkMap {
  const marks: PublishedMarkMap = {};

  for (const entry of entryFiles) {
    marks[entry] = readPrototypeMarksSync(prototypesDir, entry);
  }

  return marks;
}

async function copyPrototypeDirectories(
  prototypesDir: string,
  outputDir: string,
  entryFiles: string[]
): Promise<void> {
  const publishPrototypesDir = path.join(outputDir, "prototypes");
  await mkdir(publishPrototypesDir, { recursive: true });

  for (const entry of entryFiles) {
    const sourceDir = path.join(prototypesDir, entry);
    const targetDir = path.join(publishPrototypesDir, entry);

    await cp(sourceDir, targetDir, {
      recursive: true,
      filter: (source) => {
        const relativePath = path.relative(sourceDir, source);
        if (!relativePath) return true;

        const segments = relativePath.split(path.sep);
        return !segments.some((segment) => segment === "marks" || segment.startsWith("."));
      }
    });
  }
}

async function writePublishFiles(
  projectRoot: string,
  outputDir: string,
  manifest: PublishedManifest,
  marks: PublishedMarkMap
): Promise<void> {
  await Promise.all([
    writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "marks.json"), `${JSON.stringify(marks, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "README.md"), buildReadme(projectRoot), "utf8")
  ]);
}

function buildReadme(projectRoot: string): string {
  return `# PRDKit Publish Artifact

这是由 \`prdkit publish\` 生成的标准发布产物目录。

## 内容说明

- \`manifest.json\`：发布元数据、原型树、入口列表
- \`marks.json\`：按 prototypePath 聚合的标记数据
- \`prototypes/\`：原始原型目录内容（不含 \`marks/\`）

## 使用方式

这个目录本身不是最终 viewer，也不依赖 \`prdkit serve\`。
后续根目录下的 \`viewer-publish/\` 项目或公网静态服务可以直接消费这些文件。

## 生成来源

- 项目根目录：\`${projectRoot}\`
- 生成工具：\`prdkit\`
`;
}

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import matter from "gray-matter";
import { sanitizeFileStem } from "#utils/files.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, "../../../package.json"), "utf8")
) as { version: string };

export interface PrdPublishDocument {
  fileName: string;
  title: string;
  status?: string;
  version?: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

export interface PublishedPrdManifest {
  version: 1;
  projectName: string;
  generatedAt: string;
  source: {
    tool: "prdkit";
    toolVersion: string;
  };
  entryFiles: string[];
  documents: Array<{
    fileName: string;
    title: string;
    status?: string;
    version?: string;
    outputPath: string;
  }>;
}

export interface PublishPrdOptions {
  projectRoot: string;
  outputDir: string;
  projectName: string;
  entryFiles?: string[];
}

export interface PublishPrdResult {
  outputDir: string;
  manifest: PublishedPrdManifest;
}

export function buildDefaultPrdPublishDirName(projectName: string, now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const projectSlug = sanitizeFileStem(projectName);
  return `prd-${projectSlug}-${timestamp}`;
}

export async function publishPrdArtifacts(options: PublishPrdOptions): Promise<PublishPrdResult> {
  const { projectRoot, outputDir, projectName, entryFiles: requestedEntries } = options;
  const prdsDir = path.join(projectRoot, "workspace", "prds");

  if (!existsSync(prdsDir)) {
    throw new Error(`未找到 PRD 目录：${prdsDir}`);
  }

  if (existsSync(outputDir)) {
    throw new Error(`输出目录已存在：${outputDir}`);
  }

  const allFiles = scanPrdFiles(prdsDir);
  const entryFiles = normalizeRequestedEntries(allFiles, requestedEntries);
  if (entryFiles.length === 0) {
    throw new Error("未选择可发布的 PRD 文档");
  }

  const documents = entryFiles.map((fileName) => readPrdDocument(prdsDir, fileName));
  const manifest: PublishedPrdManifest = {
    version: 1,
    projectName,
    generatedAt: new Date().toISOString(),
    source: {
      tool: "prdkit",
      toolVersion: packageJson.version,
    },
    entryFiles,
    documents: documents.map((document) => ({
      fileName: document.fileName,
      title: document.title,
      status: document.status,
      version: document.version,
      outputPath: `docs/${buildDocumentOutputName(document.fileName)}`,
    })),
  };

  await mkdir(path.join(outputDir, "docs"), { recursive: true });
  await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "index.html"), buildIndexHtml(projectName, documents), "utf8");
  await writeFile(path.join(outputDir, "styles.css"), buildSharedStyles(), "utf8");
  await writeFile(path.join(outputDir, "README.md"), buildReadme(projectRoot), "utf8");

  await Promise.all(documents.map((document) => {
    const outputName = buildDocumentOutputName(document.fileName);
    return writeFile(
      path.join(outputDir, "docs", outputName),
      buildDocumentHtml(projectName, document),
      "utf8"
    );
  }));

  return {
    outputDir,
    manifest,
  };
}

function scanPrdFiles(prdsDir: string): string[] {
  const results: string[] = [];

  const walk = (currentDir: string, relativeDir = "") => {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
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

function normalizeRequestedEntries(allEntries: string[], requestedEntries?: string[]): string[] {
  if (!requestedEntries || requestedEntries.length === 0) {
    return allEntries;
  }

  const validEntries = new Set(allEntries);
  const normalizedEntries = requestedEntries.filter((entry) => validEntries.has(entry));
  if (normalizedEntries.length === 0) {
    throw new Error("未选择可发布的 PRD 文档");
  }

  return allEntries.filter((entry) => normalizedEntries.includes(entry));
}

function readPrdDocument(prdsDir: string, fileName: string): PrdPublishDocument {
  const filePath = path.join(prdsDir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`PRD 文件不存在：${fileName}`);
  }

  const rawContent = readFileSync(filePath, "utf8");
  const parsed = matter(rawContent);
  const title = typeof parsed.data?.title === "string" && parsed.data.title.trim()
    ? parsed.data.title.trim()
    : fileName.replace(/\.md$/, "");
  const status = typeof parsed.data?.status === "string" ? parsed.data.status : undefined;
  const version = typeof parsed.data?.version === "string" ? parsed.data.version : undefined;

  return {
    fileName,
    title,
    status,
    version,
    frontmatter: parsed.data && typeof parsed.data === "object" ? { ...parsed.data } : {},
    content: parsed.content,
  };
}

function buildDocumentOutputName(fileName: string): string {
  const stem = fileName.replace(/\.md$/, "");
  return `${sanitizeFileStem(stem) || "document"}.html`;
}

function buildIndexHtml(projectName: string, documents: PrdPublishDocument[]): string {
  const items = documents.map((document) => {
    const href = `docs/${buildDocumentOutputName(document.fileName)}`;
    const meta = [document.status, document.version].filter(Boolean).join(" · ");
    return `
      <a class="prd-list-item" href="${escapeHtmlAttr(href)}">
        <div class="prd-list-item-title">${escapeHtml(document.title)}</div>
        <div class="prd-list-item-path">${escapeHtml(document.fileName)}</div>
        ${meta ? `<div class="prd-list-item-meta">${escapeHtml(meta)}</div>` : ""}
      </a>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(projectName)} · PRD 发布</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body class="prd-index-body">
    <main class="prd-index-shell">
      <header class="prd-index-header">
        <div class="prd-index-eyebrow">PRD 发布产物</div>
        <h1>${escapeHtml(projectName)}</h1>
        <p>选择一份文档开始浏览。</p>
      </header>
      <section class="prd-list">
        ${items || '<div class="prd-empty">暂无可浏览的 PRD 文档</div>'}
      </section>
    </main>
  </body>
</html>`;
}

function buildDocumentHtml(projectName: string, document: PrdPublishDocument): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(document.title)} · ${escapeHtml(projectName)}</title>
    <link rel="stylesheet" href="../styles.css" />
  </head>
  <body class="prd-doc-body">
    <main class="prd-doc-shell">
      <a class="prd-back-link" href="../index.html">返回文档列表</a>
      <header class="prd-doc-header">
        <h1>${escapeHtml(document.title)}</h1>
        <div class="prd-doc-meta">
          <span>${escapeHtml(document.fileName)}</span>
          ${document.status ? `<span>${escapeHtml(document.status)}</span>` : ""}
          ${document.version ? `<span>版本 ${escapeHtml(document.version)}</span>` : ""}
        </div>
      </header>
      <article class="prd-doc-content markdown-body">
        ${renderMarkdown(document.content)}
      </article>
    </main>
  </body>
</html>`;
}

function buildSharedStyles(): string {
  return `
:root {
  color-scheme: light;
  --prd-text: #1f2937;
  --prd-muted: #6b7280;
  --prd-border: #e5e7eb;
  --prd-bg: #f7f8fb;
  --prd-surface: #ffffff;
  --prd-accent: #2563eb;
  --prd-added-bg: #eff6ff;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--prd-text);
  background: linear-gradient(180deg, #f6f8fc 0%, #eef3fb 100%);
}
a { color: var(--prd-accent); text-decoration: none; }
.prd-index-shell, .prd-doc-shell {
  max-width: 1040px;
  margin: 0 auto;
  padding: 40px 24px 64px;
}
.prd-index-header, .prd-doc-header {
  margin-bottom: 24px;
}
.prd-index-eyebrow, .prd-back-link {
  display: inline-flex;
  font-size: 13px;
  color: var(--prd-muted);
  margin-bottom: 12px;
}
.prd-list {
  display: grid;
  gap: 12px;
}
.prd-list-item {
  display: block;
  background: var(--prd-surface);
  border: 1px solid var(--prd-border);
  border-radius: 16px;
  padding: 18px 20px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
}
.prd-list-item-title {
  font-size: 18px;
  font-weight: 600;
}
.prd-list-item-path, .prd-list-item-meta, .prd-doc-meta {
  color: var(--prd-muted);
  font-size: 13px;
  margin-top: 6px;
}
.prd-doc-meta { display: flex; gap: 12px; flex-wrap: wrap; }
.prd-doc-content {
  background: var(--prd-surface);
  border: 1px solid var(--prd-border);
  border-radius: 20px;
  padding: 32px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.07);
}
.markdown-body h1, .markdown-body h2, .markdown-body h3 { margin-top: 1.8em; margin-bottom: 0.6em; }
.markdown-body h1:first-child, .markdown-body h2:first-child, .markdown-body h3:first-child { margin-top: 0; }
.markdown-body p, .markdown-body li { line-height: 1.75; }
.markdown-body pre {
  overflow: auto;
  padding: 16px;
  border-radius: 12px;
  background: #111827;
  color: #f9fafb;
}
.markdown-body code {
  font-family: "SFMono-Regular", SFMono-Regular, Consolas, monospace;
}
.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}
.markdown-body th, .markdown-body td {
  border: 1px solid var(--prd-border);
  padding: 10px 12px;
  text-align: left;
}
.markdown-body blockquote {
  margin: 16px 0;
  padding: 0 16px;
  border-left: 4px solid #cbd5e1;
  color: #475569;
}
.prd-empty {
  padding: 24px;
  border: 1px dashed var(--prd-border);
  border-radius: 16px;
  background: rgba(255,255,255,0.7);
  color: var(--prd-muted);
}
@media (max-width: 720px) {
  .prd-index-shell, .prd-doc-shell { padding: 24px 16px 40px; }
  .prd-doc-content { padding: 20px; }
}
`;
}

function buildReadme(projectRoot: string): string {
  return `# PRDKit PRD Publish Artifact

这是由 \`prdkit\` 生成的 PRD 静态发布目录。

## 内容说明

- \`index.html\`：文档索引页
- \`docs/\`：每篇 PRD 的静态 HTML 页面
- \`styles.css\`：共享样式
- \`manifest.json\`：发布清单

## 生成来源

- 项目根目录：\`${projectRoot}\`
- 生成工具：\`prdkit\`
`;
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  let inCodeBlock = false;
  let codeBlockLanguage = "";
  let codeLines: string[] = [];
  let listItems: string[] = [];
  let tableLines: string[] = [];
  let paragraphLines: string[] = [];
  let blockquoteLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    html.push(`<p>${renderInline(paragraphLines.join(" "))}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    html.push(`<ul>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
    listItems = [];
  };

  const flushTable = () => {
    if (tableLines.length < 2) {
      if (tableLines.length > 0) {
        paragraphLines.push(...tableLines);
      }
      tableLines = [];
      return;
    }

    const rows = tableLines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => renderInline(cell.trim())));
    const [header, separator, ...body] = rows;
    const separatorLooksValid = separator.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/<[^>]+>/g, "")));
    if (!separatorLooksValid) {
      paragraphLines.push(...tableLines);
      tableLines = [];
      return;
    }

    html.push(`<table><thead><tr>${header.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    tableLines = [];
  };

  const flushBlockquote = () => {
    if (blockquoteLines.length === 0) return;
    html.push(`<blockquote>${blockquoteLines.map((line) => `<p>${renderInline(line)}</p>`).join("")}</blockquote>`);
    blockquoteLines = [];
  };

  const flushCodeBlock = () => {
    const languageClass = codeBlockLanguage ? ` class="language-${escapeHtmlAttr(codeBlockLanguage)}"` : "";
    html.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
    codeBlockLanguage = "";
  };

  while (i < lines.length) {
    const line = lines[i] || "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      flushTable();
      flushBlockquote();
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLanguage = trimmed.slice(3).trim();
      }
      i += 1;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      i += 1;
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      flushBlockquote();
      i += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      flushTable();
      blockquoteLines.push(trimmed.replace(/^>\s?/, ""));
      i += 1;
      continue;
    }
    flushBlockquote();

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushTable();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      flushTable();
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      i += 1;
      continue;
    }

    if (trimmed.includes("|")) {
      flushParagraph();
      flushList();
      tableLines.push(trimmed);
      i += 1;
      continue;
    }

    flushList();
    flushTable();
    paragraphLines.push(trimmed);
    i += 1;
  }

  if (inCodeBlock) {
    flushCodeBlock();
  }
  flushParagraph();
  flushList();
  flushTable();
  flushBlockquote();

  return html.join("\n");
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => `<a href="${escapeHtmlAttr(href)}">${label}</a>`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

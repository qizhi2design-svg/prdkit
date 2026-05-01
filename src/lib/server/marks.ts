import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface MarkRecord {
  id: string;
  title: string;
  selector?: string;
  domPath?: string;
  description: string;
  position?: unknown;
  rect?: unknown;
  timestamp: number;
  fileName: string;
}

export interface MarkCreateInput {
  title: string;
  description: string;
  selector: string;
  domPath?: string;
  position?: unknown;
  rect?: unknown;
}

export interface MarkPatch {
  title?: string;
  description?: string;
}

export function stripMarkdownTitle(content: string): string {
  return content.replace(/^#\s+.*(\r?\n|$)/, "").trimStart();
}

export function markFilePath(prototypesDir: string, prototypePath: string, markId: string): string {
  return path.join(prototypesDir, prototypePath, "marks", `${markId}.md`);
}

export function readMarkSync(
  prototypesDir: string,
  prototypePath: string,
  markId: string
): MarkRecord | undefined {
  return readPrototypeMarksSync(prototypesDir, prototypePath).find((mark) => mark.id === markId);
}

export function createMarkSync(
  prototypesDir: string,
  prototypePath: string,
  mark: MarkCreateInput
): MarkRecord {
  const marksDir = path.join(prototypesDir, prototypePath, "marks");
  fs.mkdirSync(marksDir, { recursive: true });

  const timestamp = Date.now();
  const markId = `mark-${timestamp}`;
  const filePath = markFilePath(prototypesDir, prototypePath, markId);
  const frontmatter = compactObject({
    title: mark.title,
    selector: mark.selector,
    domPath: mark.domPath,
    position: mark.position,
    rect: mark.rect,
    timestamp
  });

  const body = buildMarkBody(mark.title, mark.description);
  fs.writeFileSync(filePath, matter.stringify(body, frontmatter), "utf8");

  return {
    id: markId,
    ...mark,
    description: body.trim(),
    timestamp,
    fileName: path.basename(filePath)
  };
}

export function updateMarkSync(
  prototypesDir: string,
  prototypePath: string,
  markId: string,
  patch: MarkPatch
): MarkRecord {
  const filePath = markFilePath(prototypesDir, prototypePath, markId);
  if (!fs.existsSync(filePath)) {
    throw new Error("标记文件不存在");
  }

  const content = fs.readFileSync(filePath, "utf8");
  const { data, content: rawBody } = matter(content);
  const currentTitle = String(data.title || "标记");
  const currentDescription = stripMarkdownTitle(rawBody).trim();

  const nextTitle = patch.title ?? currentTitle;
  const nextDescription = patch.description ?? currentDescription;
  const metadata = compactObject({
    ...data,
    title: nextTitle
  }) as Record<string, unknown>;

  const body = buildMarkBody(nextTitle, nextDescription);
  fs.writeFileSync(filePath, matter.stringify(body, metadata), "utf8");

  return {
    id: markId,
    title: String(nextTitle),
    selector: metadata.selector as string | undefined,
    domPath: metadata.domPath as string | undefined,
    description: body.trim(),
    position: metadata.position,
    rect: metadata.rect,
    timestamp: Number(metadata.timestamp || 0),
    fileName: path.basename(filePath)
  };
}

export function deleteMarkSync(prototypesDir: string, prototypePath: string, markId: string): void {
  const filePath = markFilePath(prototypesDir, prototypePath, markId);
  if (!fs.existsSync(filePath)) {
    throw new Error("标记文件不存在");
  }
  fs.unlinkSync(filePath);
}

function buildMarkBody(title: string, description: string): string {
  const normalizedDescription = stripMarkdownTitle(description || "").trim();
  return title ? `# ${title}\n\n${normalizedDescription}`.trimEnd() : normalizedDescription;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}

export function readMarksFromDirSync(marksDir: string): MarkRecord[] {
  if (!fs.existsSync(marksDir)) {
    return [];
  }

  const files = fs.readdirSync(marksDir).filter((file) => file.endsWith(".md"));
  const marks: MarkRecord[] = [];

  for (const file of files) {
    try {
      const filePath = path.join(marksDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const { data, content: description } = matter(content);

      marks.push({
        id: path.basename(file, ".md"),
        title: data.title || "标记",
        selector: data.selector,
        domPath: data.domPath,
        description: description.trim(),
        position: data.position,
        rect: data.rect,
        timestamp: data.timestamp || 0,
        fileName: file
      });
    } catch {
      continue;
    }
  }

  marks.sort((a, b) => a.timestamp - b.timestamp);
  return marks;
}

export function readPrototypeMarksSync(prototypesDir: string, prototypePath: string): MarkRecord[] {
  return readMarksFromDirSync(path.join(prototypesDir, prototypePath, "marks"));
}

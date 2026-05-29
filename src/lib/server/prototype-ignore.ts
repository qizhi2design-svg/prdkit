import fs from "node:fs";
import path from "node:path";

const IGNORE_FILE_NAME = ".prdkitignore";

interface IgnoreRule {
  pattern: string;
  negate: boolean;
  dirOnly: boolean;
  anchored: boolean;
  hasSlash: boolean;
  baseDir: string;
  regex: RegExp;
}

export interface PrototypeIgnoreContext {
  rootDir: string;
  rules: IgnoreRule[];
}

export function createPrototypeIgnoreContext(rootDir: string): PrototypeIgnoreContext {
  return {
    rootDir: normalizePath(rootDir),
    rules: []
  };
}

export function enterPrototypeIgnoreDirectory(
  context: PrototypeIgnoreContext,
  dirPath: string
): PrototypeIgnoreContext {
  const ignorePath = path.join(dirPath, IGNORE_FILE_NAME);
  if (!fs.existsSync(ignorePath)) {
    return context;
  }

  const rules = parseIgnoreFile(ignorePath);
  if (rules.length === 0) {
    return context;
  }

  return {
    ...context,
    rules: [...context.rules, ...rules]
  };
}

export function shouldIgnorePrototypePath(
  context: PrototypeIgnoreContext,
  absolutePath: string,
  isDirectory: boolean
): boolean {
  const normalizedAbsolutePath = normalizePath(absolutePath);
  const rootRelativePath = normalizeRelativePath(path.relative(context.rootDir, normalizedAbsolutePath));
  if (!rootRelativePath || rootRelativePath.startsWith("../")) {
    return false;
  }

  let ignored = false;

  for (const rule of context.rules) {
    const relativeToRule = normalizeRelativePath(path.relative(rule.baseDir, normalizedAbsolutePath));
    if (!relativeToRule || relativeToRule.startsWith("../")) {
      continue;
    }

    if (!matchesRule(rule, relativeToRule, isDirectory)) {
      continue;
    }

    ignored = !rule.negate;
  }

  return ignored;
}

function parseIgnoreFile(ignorePath: string): IgnoreRule[] {
  const baseDir = normalizePath(path.dirname(ignorePath));
  const content = fs.readFileSync(ignorePath, "utf8");
  const rules: IgnoreRule[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    let pattern = trimmed;
    let negate = false;
    if (pattern.startsWith("!")) {
      negate = true;
      pattern = pattern.slice(1).trim();
    }

    if (!pattern) {
      continue;
    }

    let dirOnly = false;
    if (pattern.endsWith("/")) {
      dirOnly = true;
      pattern = pattern.replace(/\/+$/, "");
    }

    let anchored = false;
    if (pattern.startsWith("/")) {
      anchored = true;
      pattern = pattern.replace(/^\/+/, "");
    }

    pattern = normalizeRelativePath(pattern);
    if (!pattern) {
      continue;
    }

    rules.push({
      pattern,
      negate,
      dirOnly,
      anchored,
      hasSlash: pattern.includes("/"),
      baseDir,
      regex: globToRegExp(pattern)
    });
  }

  return rules;
}

function matchesRule(rule: IgnoreRule, relativePath: string, isDirectory: boolean): boolean {
  if (rule.dirOnly && !isDirectory) {
    return false;
  }

  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) {
    return false;
  }

  if (!rule.hasSlash) {
    if (rule.anchored) {
      const firstSegment = normalizedRelativePath.split("/")[0];
      return rule.regex.test(firstSegment);
    }

    return normalizedRelativePath
      .split("/")
      .some((segment) => segment.length > 0 && rule.regex.test(segment));
  }

  if (rule.anchored) {
    return rule.regex.test(normalizedRelativePath);
  }

  const segments = normalizedRelativePath.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const candidate = segments.slice(index).join("/");
    if (rule.regex.test(candidate)) {
      return true;
    }
  }

  return false;
}

function globToRegExp(pattern: string): RegExp {
  let regex = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const nextChar = pattern[index + 1];

    if (char === "*") {
      if (nextChar === "*") {
        regex += ".*";
        index += 1;
      } else {
        regex += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    regex += escapeRegExp(char);
  }

  regex += "$";
  return new RegExp(regex);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeRelativePath(value: string): string {
  const normalized = normalizePath(value).replace(/^\.\/+/, "").replace(/\/+/g, "/");
  return normalized.replace(/^\/+/, "").replace(/\/+$/, "");
}

import path from 'path';
import fs from 'fs';
import type { AuthHostRecord } from '#types/index.js';
import type { PrdkitConfig } from '#types/index.js';
import {
  DEFAULT_INSPECT_COPY_SKILL_COMMAND,
  DEFAULT_PAGE_CREATE_SKILL_COMMAND,
  DEFAULT_VIEWER_SKILLS,
} from '../../constants/index.js';

export type PendingViewerLogin = {
  resolve: (record: AuthHostRecord) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export interface ApiHelpers {
  prototypesDir: string;
  projectRoot: string;
  pendingViewerLogins: Map<string, PendingViewerLogin>;
  resolvePrototypeDir(prototypePath: string): string;
  buildDuplicatePrototypePath(prototypePath: string): { duplicatePath: string; duplicateDir: string; duplicateName: string };
  buildMovedPrototypePath(prototypePath: string, targetFolderPath: string): { movedPath: string; movedDir: string; movedName: string };
  buildRenamedPath(sourcePath: string, targetName: string): string;
  isMissingPrototypeError(error: unknown): boolean;
  toProjectSlug(name: string): string;
}

export function renderAuthCallbackHtml(title: string, description: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: sans-serif; padding: 48px 24px; text-align: center; color: #111827; }
      h1 { margin-bottom: 12px; }
      p { color: #4b5563; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p>${description}</p>
  </body>
</html>`;
}

export function normalizeViewerSkills(
  viewerSkills: {
    pageCreateSkillCommand?: string;
    inspectCopySkillCommand?: string;
    markCreateSkillCommand?: string;
    markUpdateSkillCommand?: string;
    copyTerminalGuide?: string;
  },
  hasExplicitPageCreateSkillCommand: boolean,
) {
  if (
    viewerSkills.inspectCopySkillCommand === DEFAULT_PAGE_CREATE_SKILL_COMMAND &&
    !hasExplicitPageCreateSkillCommand
  ) {
    return {
      ...viewerSkills,
      pageCreateSkillCommand: DEFAULT_PAGE_CREATE_SKILL_COMMAND,
      inspectCopySkillCommand: DEFAULT_INSPECT_COPY_SKILL_COMMAND,
    };
  }

  return viewerSkills;
}

export function readViewerSkills(projectRoot: string, config?: PrdkitConfig) {
  if (config?.viewerSkills) {
    const normalized = config.viewerSkills;
    return {
      pageCreateSkillCommand: normalized.pageCreateSkillCommand || DEFAULT_VIEWER_SKILLS.pageCreateSkillCommand,
      inspectCopySkillCommand: normalized.inspectCopySkillCommand || DEFAULT_VIEWER_SKILLS.inspectCopySkillCommand,
      markCreateSkillCommand: normalized.markCreateSkillCommand || DEFAULT_VIEWER_SKILLS.markCreateSkillCommand,
      markUpdateSkillCommand: normalized.markUpdateSkillCommand || DEFAULT_VIEWER_SKILLS.markUpdateSkillCommand,
      copyTerminalGuide: normalized.copyTerminalGuide || DEFAULT_VIEWER_SKILLS.copyTerminalGuide,
    };
  }

  const viewerSkillsPath = path.join(projectRoot, '.prdkit', 'skills.json');

  if (!fs.existsSync(viewerSkillsPath)) {
    return DEFAULT_VIEWER_SKILLS;
  }

  try {
    const raw = fs.readFileSync(viewerSkillsPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      viewer?: {
        pageCreateSkillCommand?: string;
        inspectCopySkillCommand?: string;
        markCreateSkillCommand?: string;
        markUpdateSkillCommand?: string;
        copyTerminalGuide?: string;
      };
    };

    const hasExplicitPageCreateSkillCommand = Boolean(
      parsed.viewer && Object.prototype.hasOwnProperty.call(parsed.viewer, 'pageCreateSkillCommand'),
    );
    const normalized = normalizeViewerSkills(parsed.viewer || {}, hasExplicitPageCreateSkillCommand);

    return {
      pageCreateSkillCommand: normalized.pageCreateSkillCommand || DEFAULT_VIEWER_SKILLS.pageCreateSkillCommand,
      inspectCopySkillCommand: normalized.inspectCopySkillCommand || DEFAULT_VIEWER_SKILLS.inspectCopySkillCommand,
      markCreateSkillCommand: normalized.markCreateSkillCommand || DEFAULT_VIEWER_SKILLS.markCreateSkillCommand,
      markUpdateSkillCommand: normalized.markUpdateSkillCommand || DEFAULT_VIEWER_SKILLS.markUpdateSkillCommand,
      copyTerminalGuide: normalized.copyTerminalGuide || DEFAULT_VIEWER_SKILLS.copyTerminalGuide,
    };
  } catch {
    return DEFAULT_VIEWER_SKILLS;
  }
}

export function createApiHelpers(prototypesDir: string): ApiHelpers {
  const projectRoot = path.dirname(path.dirname(prototypesDir));
  const pendingViewerLogins = new Map<string, PendingViewerLogin>();

  const resolvePrototypeDir = (prototypePath: string) => {
    const targetDir = path.resolve(prototypesDir, prototypePath);
    const normalizedRoot = `${path.resolve(prototypesDir)}${path.sep}`;

    if (!targetDir.startsWith(normalizedRoot)) {
      throw new Error('非法 prototypePath');
    }

    return targetDir;
  };

  const buildDuplicatePrototypePath = (prototypePath: string) => {
    const normalizedPath = prototypePath.replace(/\\/g, '/').replace(/\/+$/, '');
    const segments = normalizedPath.split('/');
    const leafName = segments.pop();

    if (!leafName) {
      throw new Error('无效页面路径');
    }

    const parentSegments = segments;
    const buildCandidate = (name: string) =>
      parentSegments.length > 0 ? `${parentSegments.join('/')}/${name}` : name;

    let candidateName = `${leafName}-副本`;
    let duplicatePath = buildCandidate(candidateName);
    let duplicateDir = path.resolve(prototypesDir, duplicatePath);
    let suffix = 2;

    while (fs.existsSync(duplicateDir)) {
      candidateName = `${leafName}-副本${suffix}`;
      duplicatePath = buildCandidate(candidateName);
      duplicateDir = path.resolve(prototypesDir, duplicatePath);
      suffix += 1;
    }

    return {
      duplicatePath,
      duplicateDir,
      duplicateName: candidateName,
    };
  };

  const buildMovedPrototypePath = (prototypePath: string, targetFolderPath: string) => {
    const normalizedPrototypePath = prototypePath.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalizedTargetFolderPath = targetFolderPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const leafName = normalizedPrototypePath.split('/').pop();

    if (!leafName) {
      throw new Error('无效页面路径');
    }

    const buildCandidate = (name: string) =>
      normalizedTargetFolderPath ? `${normalizedTargetFolderPath}/${name}` : name;

    let candidateName = leafName;
    let movedPath = buildCandidate(candidateName);
    let movedDir = path.resolve(prototypesDir, movedPath);

    if (!fs.existsSync(movedDir)) {
      return {
        movedPath,
        movedDir,
        movedName: candidateName,
      };
    }

    candidateName = `${leafName}-副本`;
    movedPath = buildCandidate(candidateName);
    movedDir = path.resolve(prototypesDir, movedPath);

    if (!fs.existsSync(movedDir)) {
      return {
        movedPath,
        movedDir,
        movedName: candidateName,
      };
    }

    let suffix = 2;
    while (fs.existsSync(movedDir)) {
      candidateName = `${leafName}-副本${suffix}`;
      movedPath = buildCandidate(candidateName);
      movedDir = path.resolve(prototypesDir, movedPath);
      suffix += 1;
    }

    return {
      movedPath,
      movedDir,
      movedName: candidateName,
    };
  };

  const buildRenamedPath = (sourcePath: string, targetName: string) => {
    const normalizedSourcePath = sourcePath.replace(/\\/g, '/').replace(/\/+$/, '');
    const segments = normalizedSourcePath.split('/');
    segments.pop();
    return segments.length > 0 ? `${segments.join('/')}/${targetName}` : targetName;
  };

  const isMissingPrototypeError = (error: unknown): boolean => {
    return error instanceof Error && error.message.includes('原型 "') && error.message.includes('" 不存在');
  };

  const toProjectSlug = (name: string): string => {
    const normalized = name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return normalized || `project-${Date.now().toString(36)}`;
  };

  return {
    prototypesDir,
    projectRoot,
    pendingViewerLogins,
    resolvePrototypeDir,
    buildDuplicatePrototypePath,
    buildMovedPrototypePath,
    buildRenamedPath,
    isMissingPrototypeError,
    toProjectSlug,
  };
}

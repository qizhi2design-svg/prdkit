import express, { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import open from 'open';
import { scanPrototypes } from './scanner.js';
import { createMarkSync, deleteMarkSync, readPrototypeMarksSync, stripMarkdownTitle, updateMarkSync } from './marks.js';
import { buildDefaultPublishDirName, publishArtifacts } from '../publisher.js';
import { selectDirectory } from '../../utils/system-dialog.js';
import { buildInitialCheckpointSummary, diffCheckpoints, diffCurrentAgainstLatest } from '../checkpoints/prototype/diff.js';
import { createCheckpoint, findCheckpointRecord, listCheckpointRecords, readCheckpointData } from '../checkpoints/prototype/store.js';
import { materializeCheckpointPreview } from '../checkpoints/prototype/preview.js';
import { restoreCheckpoint } from '../checkpoints/prototype/restore.js';
import { DEFAULT_INSPECT_COPY_SKILL_COMMAND, DEFAULT_PAGE_CREATE_SKILL_COMMAND, DEFAULT_VIEWER_SKILLS } from '../shared/index.js';
import { loadConfig } from '#utils/config.js';
import type { PrdkitConfig } from '#types/index.js';

function normalizeViewerSkills(viewerSkills: {
  pageCreateSkillCommand?: string;
  inspectCopySkillCommand?: string;
  markCreateSkillCommand?: string;
  markUpdateSkillCommand?: string;
  copyTerminalGuide?: string;
}, hasExplicitPageCreateSkillCommand: boolean) {
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

function readViewerSkills(projectRoot: string, config?: PrdkitConfig) {
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
      parsed.viewer && Object.prototype.hasOwnProperty.call(parsed.viewer, 'pageCreateSkillCommand')
    );
    const normalized = normalizeViewerSkills(parsed.viewer || {}, hasExplicitPageCreateSkillCommand);

    return {
      pageCreateSkillCommand: normalized.pageCreateSkillCommand || DEFAULT_VIEWER_SKILLS.pageCreateSkillCommand,
      inspectCopySkillCommand: normalized.inspectCopySkillCommand || DEFAULT_VIEWER_SKILLS.inspectCopySkillCommand,
      markCreateSkillCommand: normalized.markCreateSkillCommand || DEFAULT_VIEWER_SKILLS.markCreateSkillCommand,
      markUpdateSkillCommand: normalized.markUpdateSkillCommand || DEFAULT_VIEWER_SKILLS.markUpdateSkillCommand,
      copyTerminalGuide: normalized.copyTerminalGuide || DEFAULT_VIEWER_SKILLS.copyTerminalGuide,
    };
  } catch (error) {
    console.error('读取 .prdkit/skills.json 失败，已回退默认 viewer skill 配置:', error);
    return DEFAULT_VIEWER_SKILLS;
  }
}

function isMissingPrototypeError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('原型 "') && error.message.includes('" 不存在');
}

export function createApiRouter(prototypesDir: string): Router {
  const router = express.Router();
  const projectRoot = path.dirname(path.dirname(prototypesDir));

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

    // 第一次冲突：尝试 "名称-副本"
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

    // 后续冲突：尝试 "名称-副本2", "名称-副本3" ...
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

  // 添加 JSON 解析中间件
  router.use(express.json());

  // 获取原型列表
  router.get('/prototypes', (req: Request, res: Response) => {
    try {
      const tree = scanPrototypes(prototypesDir);
      res.json(tree);
    } catch (error) {
      console.error('扫描原型失败:', error);
      res.status(500).json({
        error: '扫描原型失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.delete(/^\/prototypes\/(.+)$/, async (req: Request, res: Response) => {
    try {
      const prototypePathRaw = req.params[0];
      const prototypePathValue = Array.isArray(prototypePathRaw) ? prototypePathRaw[0] : prototypePathRaw;
      const prototypePath = prototypePathValue ? decodeURIComponent(prototypePathValue) : prototypePathValue;

      if (!prototypePath || typeof prototypePath !== 'string') {
        return res.status(400).json({ error: '缺少 prototypePath' });
      }

      const targetDir = resolvePrototypeDir(prototypePath);

      if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: '页面不存在' });
      }

      fs.rmSync(targetDir, { recursive: true, force: true });

      res.json({
        success: true,
        prototypePath,
        checkpointPreserved: true,
      });
    } catch (error) {
      console.error('删除页面失败:', error);
      res.status(500).json({
        error: '删除页面失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.post('/prototypes/duplicate', async (req: Request, res: Response) => {
    try {
      const { prototypePath } = req.body as { prototypePath?: string };

      if (!prototypePath || typeof prototypePath !== 'string') {
        return res.status(400).json({ error: '缺少 prototypePath' });
      }

      const sourceDir = resolvePrototypeDir(prototypePath);

      if (!fs.existsSync(sourceDir)) {
        return res.status(404).json({ error: '页面不存在' });
      }

      const { duplicatePath, duplicateDir, duplicateName } = buildDuplicatePrototypePath(prototypePath);
      fs.cpSync(sourceDir, duplicateDir, { recursive: true });

      res.json({
        success: true,
        sourcePath: prototypePath,
        duplicatePath,
        duplicateName,
      });
    } catch (error) {
      console.error('复制页面失败:', error);
      res.status(500).json({
        error: '复制页面失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post('/prototypes/folders', async (req: Request, res: Response) => {
    try {
      const { folderName, parentPath = '' } = req.body as { folderName?: string; parentPath?: string };
      const normalizedFolderName = typeof folderName === 'string' ? folderName.trim() : '';
      const normalizedParentPath = typeof parentPath === 'string' ? parentPath.trim() : '';

      if (!normalizedFolderName) {
        return res.status(400).json({ error: '缺少 folderName' });
      }

      if (/[\\/:*?"<>|]/.test(normalizedFolderName)) {
        return res.status(400).json({ error: '文件夹名称包含非法字符' });
      }

      const parentDir = normalizedParentPath
        ? resolvePrototypeDir(normalizedParentPath)
        : path.resolve(prototypesDir);

      if (!fs.existsSync(parentDir)) {
        return res.status(404).json({ error: '目标目录不存在' });
      }

      const folderPath = normalizedParentPath
        ? `${normalizedParentPath}/${normalizedFolderName}`
        : normalizedFolderName;
      const targetDir = path.resolve(parentDir, normalizedFolderName);

      if (fs.existsSync(targetDir)) {
        return res.status(409).json({ error: '文件夹已存在' });
      }

      fs.mkdirSync(targetDir, { recursive: true });

      res.json({
        success: true,
        folderPath,
        folderName: normalizedFolderName,
      });
    } catch (error) {
      console.error('新建文件夹失败:', error);
      res.status(500).json({
        error: '新建文件夹失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.delete('/prototypes/folders', async (req: Request, res: Response) => {
    try {
      const folderPathRaw = req.query.folderPath;
      const folderPath = Array.isArray(folderPathRaw) ? folderPathRaw[0] : folderPathRaw;

      if (!folderPath || typeof folderPath !== 'string') {
        return res.status(400).json({ error: '缺少 folderPath' });
      }

      const targetDir = resolvePrototypeDir(folderPath);

      if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: '文件夹不存在' });
      }

      const targetStat = fs.statSync(targetDir);
      if (!targetStat.isDirectory()) {
        return res.status(400).json({ error: '目标不是文件夹' });
      }

      fs.rmSync(targetDir, { recursive: true, force: true });

      res.json({
        success: true,
        folderPath,
      });
    } catch (error) {
      console.error('删除文件夹失败:', error);
      res.status(500).json({
        error: '删除文件夹失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post('/prototypes/move', async (req: Request, res: Response) => {
    try {
      const { prototypePath, targetFolderPath = '' } = req.body as {
        prototypePath?: string;
        targetFolderPath?: string;
      };

      if (!prototypePath || typeof prototypePath !== 'string') {
        return res.status(400).json({ error: '缺少 prototypePath' });
      }

      const normalizedTargetFolderPath = typeof targetFolderPath === 'string'
        ? targetFolderPath.trim()
        : '';

      const sourceDir = resolvePrototypeDir(prototypePath);
      const targetFolderDir = normalizedTargetFolderPath
        ? resolvePrototypeDir(normalizedTargetFolderPath)
        : path.resolve(prototypesDir);

      if (!fs.existsSync(sourceDir)) {
        return res.status(404).json({ error: '页面不存在' });
      }

      if (!fs.existsSync(targetFolderDir)) {
        return res.status(404).json({ error: '目标文件夹不存在' });
      }

      const sourceStat = fs.statSync(sourceDir);
      const targetFolderStat = fs.statSync(targetFolderDir);
      if (!sourceStat.isDirectory() || !targetFolderStat.isDirectory()) {
        return res.status(400).json({ error: '仅支持页面目录拖入目标文件夹' });
      }

      const normalizedPrototypePath = prototypePath.replace(/\\/g, '/').replace(/\/+$/, '');
      const sourcePrefix = `${normalizedPrototypePath}/`;
      if (
        normalizedPrototypePath === normalizedTargetFolderPath ||
        (normalizedTargetFolderPath && normalizedTargetFolderPath.startsWith(sourcePrefix))
      ) {
        return res.status(400).json({ error: '不能将页面移动到自身目录中' });
      }

      // 检查源文件的父目录是否与目标文件夹相同
      const sourceSegments = normalizedPrototypePath.split('/');
      sourceSegments.pop(); // 移除文件名，得到父目录
      const sourceParentPath = sourceSegments.join('/');

      if (sourceParentPath === normalizedTargetFolderPath) {
        // 位置未变化，直接返回成功（不执行实际移动）
        const leafName = normalizedPrototypePath.split('/').pop() || '';
        return res.json({
          success: true,
          sourcePath: prototypePath,
          movedPath: prototypePath,
          movedName: leafName,
          unchanged: true,
        });
      }

      const { movedPath, movedDir, movedName } = buildMovedPrototypePath(prototypePath, normalizedTargetFolderPath);
      fs.renameSync(sourceDir, movedDir);

      res.json({
        success: true,
        sourcePath: prototypePath,
        movedPath,
        movedName,
      });
    } catch (error) {
      console.error('移动页面失败:', error);
      res.status(500).json({
        error: '移动页面失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post('/prototypes/rename', async (req: Request, res: Response) => {
    try {
      const { sourcePath, targetName } = req.body as {
        sourcePath?: string;
        targetName?: string;
      };

      const normalizedTargetName = typeof targetName === 'string' ? targetName.trim() : '';

      if (!sourcePath || typeof sourcePath !== 'string') {
        return res.status(400).json({ error: '缺少 sourcePath' });
      }

      if (!normalizedTargetName) {
        return res.status(400).json({ error: '缺少 targetName' });
      }

      if (/[\\/:*?"<>|]/.test(normalizedTargetName)) {
        return res.status(400).json({ error: '名称包含非法字符' });
      }

      const sourceDir = resolvePrototypeDir(sourcePath);
      if (!fs.existsSync(sourceDir)) {
        return res.status(404).json({ error: '目标不存在' });
      }

      const renamedPath = buildRenamedPath(sourcePath, normalizedTargetName);
      const renamedDir = resolvePrototypeDir(renamedPath);

      if (sourceDir === renamedDir) {
        return res.json({
          success: true,
          sourcePath,
          renamedPath,
          renamedName: normalizedTargetName,
        });
      }

      if (fs.existsSync(renamedDir)) {
        return res.status(409).json({ error: '同级已存在相同名称' });
      }

      fs.renameSync(sourceDir, renamedDir);

      res.json({
        success: true,
        sourcePath,
        renamedPath,
        renamedName: normalizedTargetName,
      });
    } catch (error) {
      console.error('重命名失败:', error);
      res.status(500).json({
        error: '重命名失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 获取项目配置
  router.get('/config', async (req: Request, res: Response) => {
    try {
      let config: any = { projectName: 'PRDKit' };

      const loadedConfig = await loadConfig(projectRoot);
      if (loadedConfig) {
        config = loadedConfig;
      }

      // 添加 prototypes 目录的绝对路径
      config.prototypesDir = prototypesDir;
      config.viewerSkills = readViewerSkills(projectRoot, config as PrdkitConfig);

      res.json(config);
    } catch (error) {
      console.error('读取配置失败:', error);
      res.json({ projectName: 'PRDKit', prototypesDir, viewerSkills: DEFAULT_VIEWER_SKILLS });
    }
  });

  router.get('/publish/options', (req: Request, res: Response) => {
    try {
      const configPath = path.join(projectRoot, '.prdkit', 'config.json');
      let projectName = 'PRDKit';

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent) as { projectName?: string };
        projectName = config.projectName || projectName;
      }

      const defaultOutputRoot = path.join(projectRoot, 'dist', 'publish');
      const suggestedArtifactName = buildDefaultPublishDirName(projectName);
      const suggestedOutputPath = path.join(defaultOutputRoot, suggestedArtifactName);

      res.json({
        projectName,
        defaultOutputRoot,
        suggestedArtifactName,
        suggestedOutputPath
      });
    } catch (error) {
      console.error('读取发布配置失败:', error);
      res.status(500).json({
        error: '读取发布配置失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/checkpoints', (req: Request, res: Response) => {
    try {
      const prototypePathRaw = req.query.prototypePath;
      const prototypePath = Array.isArray(prototypePathRaw) ? prototypePathRaw[0] : prototypePathRaw;
      const records = listCheckpointRecords(projectRoot, typeof prototypePath === 'string' && prototypePath ? prototypePath : undefined)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      res.json({ checkpoints: records });
    } catch (error) {
      console.error('读取 checkpoint 列表失败:', error);
      res.status(500).json({
        error: '读取 checkpoint 列表失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/checkpoints/status', (req: Request, res: Response) => {
    try {
      const prototypePathRaw = req.query.prototypePath;
      const prototypePath = Array.isArray(prototypePathRaw) ? prototypePathRaw[0] : prototypePathRaw;

      if (!prototypePath || typeof prototypePath !== 'string') {
        return res.status(400).json({ error: '缺少 prototypePath' });
      }

      const diff = diffCurrentAgainstLatest(projectRoot, prototypesDir, prototypePath);
      const changeCount = [
        diff.summary.addedFiles.length,
        diff.summary.modifiedFiles.length,
        diff.summary.deletedFiles.length,
        diff.summary.markAdded.length,
        diff.summary.markUpdated.length,
        diff.summary.markDeleted.length,
      ].reduce((sum, value) => sum + value, 0);

      res.json({
        prototypePath,
        latestCheckpointId: diff.latestCheckpointId ?? null,
        hasChanges: diff.hasChanges,
        changeCount,
        summary: diff.summary,
      });
    } catch (error) {
      if (isMissingPrototypeError(error)) {
        const prototypePathRaw = req.query.prototypePath;
        const prototypePath = Array.isArray(prototypePathRaw) ? prototypePathRaw[0] : prototypePathRaw;

        return res.json({
          prototypePath: typeof prototypePath === 'string' ? prototypePath : '',
          latestCheckpointId: null,
          hasChanges: false,
          changeCount: 0,
          missing: true,
          summary: {
            fromCheckpointId: 'working-tree',
            toCheckpointId: 'working-tree',
            addedFiles: [],
            modifiedFiles: [],
            deletedFiles: [],
            markAdded: [],
            markUpdated: [],
            markDeleted: [],
          },
        });
      }

      console.error('读取 checkpoint 状态失败:', error);
      res.status(500).json({
        error: '读取 checkpoint 状态失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.post('/checkpoints', async (req: Request, res: Response) => {
    try {
      const { prototypePath, message } = req.body as { prototypePath?: string; message?: string };

      if (!prototypePath || typeof prototypePath !== 'string') {
        return res.status(400).json({ error: '缺少 prototypePath' });
      }

      const result = await createCheckpoint({
        projectRoot,
        prototypesDir,
        prototypePath,
        kind: 'manual',
        message: typeof message === 'string' && message.trim() ? message.trim() : '保存版本',
      });

      const records = listCheckpointRecords(projectRoot, prototypePath)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const versionIndex = records.findIndex((item) => item.id === result.record.id);
      const versionLabel = versionIndex === -1 ? '版本' : `版本${records.length - versionIndex}`;

      res.json({
        success: true,
        created: result.created,
        record: result.record,
        duplicateOf: result.duplicateOf ?? null,
        versionLabel,
      });
    } catch (error) {
      console.error('创建 checkpoint 失败:', error);
      res.status(500).json({
        error: '创建 checkpoint 失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/checkpoints/:checkpointId', async (req: Request, res: Response) => {
    try {
      const checkpointId = Array.isArray(req.params.checkpointId) ? req.params.checkpointId[0] : req.params.checkpointId;
      const record = findCheckpointRecord(projectRoot, checkpointId);
      if (!record) {
        return res.status(404).json({ error: 'checkpoint 不存在' });
      }

      const data = readCheckpointData(projectRoot, checkpointId);
      const summary = record.baseCheckpointId
        ? diffCheckpoints(projectRoot, record.baseCheckpointId, checkpointId)
        : buildInitialCheckpointSummary(checkpointId, data.files, data.marks);
      await materializeCheckpointPreview(projectRoot, checkpointId);

      res.json({
        checkpoint: data.manifest,
        files: data.files,
        marks: data.marks,
        summary,
        previewUrl: `/checkpoint-preview/${encodeURIComponent(checkpointId)}/index.html`
      });
    } catch (error) {
      console.error('读取 checkpoint 详情失败:', error);
      res.status(500).json({
        error: '读取 checkpoint 详情失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.post('/checkpoints/:checkpointId/restore', async (req: Request, res: Response) => {
    try {
      const checkpointId = Array.isArray(req.params.checkpointId) ? req.params.checkpointId[0] : req.params.checkpointId;
      const { force } = req.body as { force?: boolean };
      const result = await restoreCheckpoint({
        projectRoot,
        prototypesDir,
        checkpointId,
        force: Boolean(force)
      });

      res.json({
        success: true,
        restoredTo: result.target.id,
        prototypePath: result.target.prototypePath,
        preRestore: result.preRestore.id,
        summary: result.summary
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('未归档变更')) {
        return res.status(409).json({ error: error.message });
      }
      console.error('还原 checkpoint 失败:', error);
      res.status(500).json({
        error: '还原 checkpoint 失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.post('/system/select-directory', async (req: Request, res: Response) => {
    try {
      const { defaultPath } = req.body as { defaultPath?: string };
      const selectedPath = await selectDirectory({ defaultPath });
      res.json({
        success: true,
        canceled: selectedPath === null,
        path: selectedPath
      });
    } catch (error) {
      console.error('打开目录选择器失败:', error);
      res.status(500).json({
        error: '打开目录选择器失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.post('/system/open-path', async (req: Request, res: Response) => {
    try {
      const { targetPath } = req.body as { targetPath?: string };

      if (!targetPath || typeof targetPath !== 'string') {
        return res.status(400).json({ error: '缺少 targetPath' });
      }

      await open(targetPath);

      res.json({
        success: true,
        targetPath
      });
    } catch (error) {
      console.error('打开路径失败:', error);
      res.status(500).json({
        error: '打开路径失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.post('/publish', async (req: Request, res: Response) => {
    try {
      const { outputPath, entryFiles, projectName } = req.body as {
        outputPath?: string;
        entryFiles?: string[];
        projectName?: string;
      };

      if (!outputPath || typeof outputPath !== 'string') {
        return res.status(400).json({ error: '缺少输出路径 outputPath' });
      }

      if (!Array.isArray(entryFiles) || entryFiles.length === 0) {
        return res.status(400).json({ error: '请至少选择一个需要发布的页面' });
      }

      const configPath = path.join(projectRoot, '.prdkit', 'config.json');
      let resolvedProjectName = projectName || 'PRDKit';

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent) as { projectName?: string };
        resolvedProjectName = config.projectName || resolvedProjectName;
      }

      const result = await publishArtifacts({
        projectRoot,
        prototypesDir,
        outputDir: path.resolve(outputPath),
        projectName: resolvedProjectName,
        entryFiles
      });

      res.json({
        success: true,
        outputDir: result.outputDir,
        entryCount: result.manifest.entryFiles.length
      });
    } catch (error) {
      console.error('发布产物失败:', error);
      res.status(500).json({
        error: '发布产物失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 获取标记列表
  router.get('/marks/:prototypeName', (req: Request, res: Response) => {
    try {
      const { prototypeName } = req.params;
      const protoName = Array.isArray(prototypeName) ? prototypeName[0] : prototypeName;
      const marks = readPrototypeMarksSync(prototypesDir, protoName).map(({ fileName, ...mark }) => mark);

      res.json({ marks });
    } catch (error) {
      console.error('读取标记失败:', error);
      res.status(500).json({
        error: '读取标记失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 创建标记
  router.post('/marks/:prototypeName', (req: Request, res: Response) => {
    try {
      const { prototypeName } = req.params;
      const protoName = Array.isArray(prototypeName) ? prototypeName[0] : prototypeName;
      const mark = req.body;

      if (!mark?.title || typeof mark.title !== 'string') {
        return res.status(400).json({ error: '缺少 title' });
      }

      if (!mark?.selector || typeof mark.selector !== 'string') {
        return res.status(400).json({ error: '缺少 selector' });
      }

      const createdMark = createMarkSync(prototypesDir, protoName, {
        title: mark.title,
        description: mark.description || '',
        selector: mark.selector,
        domPath: mark.domPath,
        position: mark.position,
        rect: mark.rect
      });

      res.json({ success: true, mark: createdMark });
    } catch (error) {
      console.error('创建标记失败:', error);
      res.status(500).json({
        error: '创建标记失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 更新标记
  router.put('/marks/:prototypeName/:markId', (req: Request, res: Response) => {
    try {
      const { prototypeName, markId } = req.params;
      const protoName = Array.isArray(prototypeName) ? prototypeName[0] : prototypeName;
      const markIdStr = Array.isArray(markId) ? markId[0] : markId;
      const { title, description, selector, domPath, position, rect } = req.body;

      const updatedMark = updateMarkSync(prototypesDir, protoName, markIdStr, {
        title,
        description: description === undefined ? undefined : stripMarkdownTitle(description),
        selector: selector === undefined ? undefined : String(selector),
        domPath: domPath === undefined ? undefined : String(domPath),
        position,
        rect
      });

      res.json({ success: true, mark: updatedMark });
    } catch (error) {
      if (error instanceof Error && error.message === '标记文件不存在') {
        return res.status(404).json({ error: error.message });
      }
      console.error('更新标记失败:', error);
      res.status(500).json({
        error: '更新标记失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 删除标记
  router.delete('/marks/:prototypeName/:markId', (req: Request, res: Response) => {
    try {
      const { prototypeName, markId } = req.params;
      const protoName = Array.isArray(prototypeName) ? prototypeName[0] : prototypeName;
      const markIdStr = Array.isArray(markId) ? markId[0] : markId;
      deleteMarkSync(prototypesDir, protoName, markIdStr);

      res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === '标记文件不存在') {
        return res.status(404).json({ error: error.message });
      }
      console.error('删除标记失败:', error);
      res.status(500).json({
        error: '删除标记失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}

import express, { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import open from 'open';
import { scanPrototypes } from './scanner.js';
import { createMarkSync, deleteMarkSync, readPrototypeMarksSync, stripMarkdownTitle, updateMarkSync } from './marks.js';
import { buildDefaultPublishDirName, publishArtifacts } from '../publisher.js';
import { selectDirectory } from '../../utils/system-dialog.js';
import { buildInitialCheckpointSummary, diffCheckpoints, diffCurrentAgainstLatest } from '../checkpoint/diff.js';
import { createCheckpoint, findCheckpointRecord, listCheckpointRecords, readCheckpointData } from '../checkpoint/store.js';
import { materializeCheckpointPreview } from '../checkpoint/preview.js';
import { restoreCheckpoint } from '../checkpoint/restore.js';

export function createApiRouter(prototypesDir: string): Router {
  const router = express.Router();
  const projectRoot = path.dirname(path.dirname(prototypesDir));

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

  // 获取项目配置
  router.get('/config', (req: Request, res: Response) => {
    try {
      const configPath = path.join(projectRoot, '.prdkit', 'config.json');

      let config: any = { projectName: 'PRDKit' };

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(configContent);
      }

      // 添加 prototypes 目录的绝对路径
      config.prototypesDir = prototypesDir;

      res.json(config);
    } catch (error) {
      console.error('读取配置失败:', error);
      res.json({ projectName: 'PRDKit', prototypesDir });
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
      const { title, description } = req.body;

      const updatedMark = updateMarkSync(prototypesDir, protoName, markIdStr, {
        title,
        description: description === undefined ? undefined : stripMarkdownTitle(description)
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

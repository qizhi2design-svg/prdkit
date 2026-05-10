import { Router, Request, Response } from 'express';
import {
  buildInitialCheckpointSummary,
  diffCheckpoints,
  diffCurrentAgainstLatest,
} from '../../checkpoints/prototype/diff.js';
import {
  createCheckpoint,
  findCheckpointRecord,
  listCheckpointRecords,
  readCheckpointData,
} from '../../checkpoints/prototype/store.js';
import { materializeCheckpointPreview } from '../../checkpoints/prototype/preview.js';
import { restoreCheckpoint } from '../../checkpoints/prototype/restore.js';
import type { ApiHelpers } from './helpers.js';

export function createCheckpointsRouter(helpers: ApiHelpers): Router {
  const router = Router();
  const { projectRoot, prototypesDir, isMissingPrototypeError } = helpers;

  router.get('/checkpoints', (req: Request, res: Response) => {
    try {
      const prototypePathRaw = req.query.prototypePath;
      const prototypePath = Array.isArray(prototypePathRaw) ? prototypePathRaw[0] : prototypePathRaw;
      const records = listCheckpointRecords(
        projectRoot,
        typeof prototypePath === 'string' && prototypePath ? prototypePath : undefined,
      ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      res.json({ checkpoints: records });
    } catch (error) {
      console.error('读取 checkpoint 列表失败:', error);
      res.status(500).json({
        error: '读取 checkpoint 列表失败',
        message: error instanceof Error ? error.message : String(error),
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
        message: error instanceof Error ? error.message : String(error),
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
        message: error instanceof Error ? error.message : String(error),
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
        previewUrl: `/checkpoint-preview/${encodeURIComponent(checkpointId)}/index.html`,
      });
    } catch (error) {
      console.error('读取 checkpoint 详情失败:', error);
      res.status(500).json({
        error: '读取 checkpoint 详情失败',
        message: error instanceof Error ? error.message : String(error),
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
        force: Boolean(force),
      });

      res.json({
        success: true,
        restoredTo: result.target.id,
        prototypePath: result.target.prototypePath,
        preRestore: result.preRestore.id,
        summary: result.summary,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('未归档变更')) {
        return res.status(409).json({ error: error.message });
      }
      console.error('还原 checkpoint 失败:', error);
      res.status(500).json({
        error: '还原 checkpoint 失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}

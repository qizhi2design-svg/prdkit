import { Router, Request, Response } from 'express';
import {
  buildInitialCheckpointSummary,
  diffCheckpoints,
  diffCurrentAgainstLatest,
  diffProjectAgainstLatest,
} from '../../checkpoints/prototype/diff.js';
import {
  assignIterationToSession,
  buildIterationSummaries,
  createCheckpointBatch,
  findCheckpointRecord,
  listCheckpointRecords,
  renameIteration,
  readCheckpointData,
} from '../../checkpoints/prototype/store.js';
import { materializeCheckpointPreview } from '../../checkpoints/prototype/preview.js';
import { restoreCheckpoint } from '../../checkpoints/prototype/restore.js';
import type { ApiHelpers } from './helpers.js';
import { flattenPrototypes, scanPrototypes } from '../scanner.js';

function getCheckpointVersionGroupKey(record: {
  id: string;
  iterationId?: string | null;
  sessionId?: string | null;
}): string {
  if (record.iterationId) {
    return `iteration:${record.iterationId}`;
  }
  if (record.sessionId) {
    return `session:${record.sessionId}`;
  }
  return `checkpoint:${record.id}`;
}

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

  router.get('/checkpoints/iterations', (_req: Request, res: Response) => {
    try {
      res.json({
        iterations: buildIterationSummaries(projectRoot),
      });
    } catch (error) {
      console.error('读取迭代列表失败:', error);
      res.status(500).json({
        error: '读取迭代列表失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/checkpoints/status', (req: Request, res: Response) => {
    try {
      const prototypePathRaw = req.query.prototypePath;
      const prototypePath = Array.isArray(prototypePathRaw) ? prototypePathRaw[0] : prototypePathRaw;

      if (!prototypePath || typeof prototypePath !== 'string') {
        const prototypePaths = flattenPrototypes(scanPrototypes(prototypesDir));
        const diff = diffProjectAgainstLatest(projectRoot, prototypesDir, prototypePaths);

        return res.json({
          prototypePath: null,
          latestCheckpointId: null,
          hasChanges: diff.hasChanges,
          changeCount: diff.changeCount,
          changedPrototypePaths: diff.changedPrototypePaths,
          summary: null,
        });
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
      const { prototypePaths, message } = req.body as {
        prototypePaths?: string[];
        message?: string;
      };

      const normalizedPrototypePaths = Array.isArray(prototypePaths)
        ? prototypePaths.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      const allPrototypePaths = normalizedPrototypePaths.length > 0
        ? normalizedPrototypePaths
        : flattenPrototypes(scanPrototypes(prototypesDir));
      const diff = diffProjectAgainstLatest(projectRoot, prototypesDir, allPrototypePaths);
      const changedPrototypePaths = diff.changedPrototypePaths;

      if (changedPrototypePaths.length === 0) {
        return res.json({
          success: true,
          created: false,
          record: null,
          duplicateOf: null,
          records: [],
          versionLabel: '版本',
          changedPrototypePaths: [],
          sessionId: null,
        });
      }

      const result = await createCheckpointBatch({
        projectRoot,
        prototypesDir,
        prototypePaths: allPrototypePaths,
        kind: 'manual',
        message: typeof message === 'string' && message.trim() ? message.trim() : '更新版本',
        allowDuplicate: true,
      });

      const records = listCheckpointRecords(projectRoot)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .filter((item) => result.createdRecords.some((record) => record.id === item.id));
      const newestRecord = records[0] ?? result.createdRecords[0] ?? null;
      const versionGroups = buildIterationSummaries(projectRoot);
      const matchedIteration = result.sessionId
        ? versionGroups.find((item) => item.sessionId === result.sessionId)
        : undefined;
      const groupedVersionCount = new Set(
        listCheckpointRecords(projectRoot).map((item) => getCheckpointVersionGroupKey(item)),
      ).size;
      const versionLabel = matchedIteration
        ? matchedIteration.name
        : newestRecord
          ? `版本${groupedVersionCount}`
          : '版本';

      return res.json({
        success: true,
        created: result.created,
        record: newestRecord,
        duplicateOf: null,
        records: result.createdRecords,
        versionLabel,
        changedPrototypePaths,
        sessionId: result.sessionId,
      });
    } catch (error) {
      console.error('创建 checkpoint 失败:', error);
      res.status(500).json({
        error: '创建 checkpoint 失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post('/checkpoints/iterations', async (req: Request, res: Response) => {
    try {
      const { checkpointId, name } = req.body as { checkpointId?: string; name?: string };
      if (!checkpointId || typeof checkpointId !== 'string') {
        return res.status(400).json({ error: '缺少 checkpointId' });
      }

      const checkpoint = findCheckpointRecord(projectRoot, checkpointId);
      if (!checkpoint) {
        return res.status(404).json({ error: 'checkpoint 不存在' });
      }
      if (!checkpoint.sessionId) {
        return res.status(409).json({ error: '该 checkpoint 没有关联 session，无法标记迭代' });
      }

      const iteration = await assignIterationToSession(
        projectRoot,
        checkpoint.sessionId,
        typeof name === 'string' ? name : undefined,
      );

      res.json({
        success: true,
        iteration,
      });
    } catch (error) {
      console.error('标记迭代失败:', error);
      res.status(500).json({
        error: '标记迭代失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.patch('/checkpoints/iterations/:iterationId', async (req: Request, res: Response) => {
    try {
      const iterationId = Array.isArray(req.params.iterationId) ? req.params.iterationId[0] : req.params.iterationId;
      const { name } = req.body as { name?: string };

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: '缺少迭代名称' });
      }

      const iteration = await renameIteration(projectRoot, iterationId, name);
      res.json({
        success: true,
        iteration,
      });
    } catch (error) {
      console.error('更新迭代名称失败:', error);
      res.status(500).json({
        error: '更新迭代名称失败',
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
      const preview = await materializeCheckpointPreview(projectRoot, checkpointId);

      res.json({
        checkpoint: data.manifest,
        files: data.files,
        marks: data.marks,
        summary,
        previewUrl: `/checkpoint-preview/${encodeURIComponent(checkpointId)}/index.html`,
        previewFsPath: preview.previewDir,
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

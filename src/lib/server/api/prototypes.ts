import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { scanPrototypes } from '../scanner.js';
import type { ApiHelpers } from './helpers.js';

export function createPrototypesRouter(helpers: ApiHelpers): Router {
  const router = Router();
  const { prototypesDir, resolvePrototypeDir, buildDuplicatePrototypePath, buildMovedPrototypePath, buildRenamedPath }
    = helpers;

  router.get('/prototypes', (_req: Request, res: Response) => {
    try {
      const tree = scanPrototypes(prototypesDir);
      res.json(tree);
    } catch (error) {
      console.error('扫描原型失败:', error);
      res.status(500).json({
        error: '扫描原型失败',
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
        message: error instanceof Error ? error.message : String(error),
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
      fs.cpSync(sourceDir, duplicateDir, {
        recursive: true,
        filter: (src) => path.basename(src) !== '.prdkit',
      });

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

      const sourceSegments = normalizedPrototypePath.split('/');
      sourceSegments.pop();
      const sourceParentPath = sourceSegments.join('/');

      if (sourceParentPath === normalizedTargetFolderPath) {
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

  return router;
}

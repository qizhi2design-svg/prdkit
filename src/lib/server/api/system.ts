import { Router, Request, Response } from 'express';
import open from 'open';
import { selectDirectory } from '../../../utils/system-dialog.js';
import type { ApiHelpers } from './helpers.js';

export function createSystemRouter(helpers: ApiHelpers): Router {
  const router = Router();

  router.post('/system/select-directory', async (req: Request, res: Response) => {
    try {
      const { defaultPath } = req.body as { defaultPath?: string };
      const selectedPath = await selectDirectory({ defaultPath });
      res.json({
        success: true,
        canceled: selectedPath === null,
        path: selectedPath,
      });
    } catch (error) {
      console.error('打开目录选择器失败:', error);
      res.status(500).json({
        error: '打开目录选择器失败',
        message: error instanceof Error ? error.message : String(error),
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
        targetPath,
      });
    } catch (error) {
      console.error('打开路径失败:', error);
      res.status(500).json({
        error: '打开路径失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}

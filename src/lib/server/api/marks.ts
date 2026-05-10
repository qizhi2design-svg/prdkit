import { Router, Request, Response } from 'express';
import {
  createMarkSync,
  deleteMarkSync,
  readPrototypeMarksSync,
  stripMarkdownTitle,
  updateMarkSync,
} from '../marks.js';
import type { ApiHelpers } from './helpers.js';

export function createMarksRouter(helpers: ApiHelpers): Router {
  const router = Router();
  const { prototypesDir } = helpers;

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
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

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
        rect: mark.rect,
      });

      res.json({ success: true, mark: createdMark });
    } catch (error) {
      console.error('创建标记失败:', error);
      res.status(500).json({
        error: '创建标记失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

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
        rect,
      });

      res.json({ success: true, mark: updatedMark });
    } catch (error) {
      if (error instanceof Error && error.message === '标记文件不存在') {
        return res.status(404).json({ error: error.message });
      }
      console.error('更新标记失败:', error);
      res.status(500).json({
        error: '更新标记失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

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
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}

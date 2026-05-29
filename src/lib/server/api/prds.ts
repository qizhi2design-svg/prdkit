import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { createPrdCheckpoint, listPrdCheckpointRecords, readPrdCheckpointData, readPrdBlob } from '../../checkpoints/prd/store.js';
import { diffPrdCheckpointAgainstCurrent } from '../../checkpoints/prd/diff.js';
import type { ApiHelpers } from './helpers.js';

export function createPrdsRouter(helpers: ApiHelpers): Router {
  const router = Router();
  const { projectRoot } = helpers;

  const prdsDir = (): string => path.join(projectRoot, 'workspace', 'prds');

  /** 确保 worksapce/prds/ 目录存在 */
  function ensurePrdsDir(): string {
    const dir = prdsDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  function getRouteParam(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] || '' : value || '';
  }

  /** 列出 workspace/prds/ 下所有 PRD 文件 */
  router.get('/prds', (_req: Request, res: Response) => {
    try {
      const dir = ensurePrdsDir();
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));

      const list = files.map((fileName) => {
        const filePath = path.join(dir, fileName);
        const stat = fs.statSync(filePath);
        let title = fileName.replace(/\.md$/, '');
        let status: string | undefined;
        let version: string | undefined;

        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const parsed = matter(content);
          if (typeof parsed.data?.title === 'string' && parsed.data.title.trim()) {
            title = parsed.data.title.trim();
          }
          if (typeof parsed.data?.status === 'string') {
            status = parsed.data.status;
          }
          if (typeof parsed.data?.version === 'string') {
            version = parsed.data.version;
          }
        } catch {
          // 解析失败时使用默认值
        }

        return {
          fileName,
          title,
          status,
          version,
          modifiedAt: stat.mtime.toISOString(),
          size: stat.size,
        };
      });

      res.json(list);
    } catch (error) {
      console.error('读取 PRD 列表失败:', error);
      res.status(500).json({
        error: '读取 PRD 列表失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /** 获取 PRD 版本历史列表 */
  router.get(/^\/prds\/(.+)\/checkpoints$/, (req: Request, res: Response) => {
    try {
      const fileName = getRouteParam(req.params[0]);
      const safePath = path.normalize(fileName).replace(/^(\.\.[/\\])+/, '');
      const prdPath = path.join('workspace', 'prds', safePath);

      const records = listPrdCheckpointRecords(projectRoot, prdPath);

      const list = records.map((record) => ({
        id: record.id,
        message: record.message || null,
        kind: record.kind,
        createdAt: record.createdAt,
        title: record.title,
        size: record.size,
        lineCount: record.lineCount,
      }));

      res.json(list);
    } catch (error) {
      console.error('读取 PRD 版本历史失败:', error);
      res.status(500).json({
        error: '读取 PRD 版本历史失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /** 创建 PRD checkpoint */
  router.post(/^\/prds\/(.+)\/checkpoints$/, async (req: Request, res: Response) => {
    try {
      const fileName = getRouteParam(req.params[0]);
      const safePath = path.normalize(fileName).replace(/^(\.\.[/\\])+/, '');
      const prdPath = path.join('workspace', 'prds', safePath);

      const kind = req.body?.kind === 'auto' ? 'auto' : 'manual';
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : undefined;

      const result = await createPrdCheckpoint({
        projectRoot,
        prdPath,
        kind,
        message,
      });

      res.json({
        created: result.created,
        checkpointId: result.record.id,
        message: result.record.message || null,
        kind: result.record.kind,
        createdAt: result.record.createdAt,
        title: result.record.title,
        duplicateOf: result.duplicateOf?.id ?? null,
      });
    } catch (error) {
      console.error('创建 PRD checkpoint 失败:', error);
      res.status(500).json({
        error: '创建 PRD 版本失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /** 获取 checkpoint 版本与当前文件的 diff */
  router.get(/^\/prds\/(.+)\/checkpoints\/([^/]+)\/diff$/, async (req: Request, res: Response) => {
    try {
      const checkpointId = getRouteParam(req.params[1]);
      const fileName = getRouteParam(req.params[0]);
      const safePath = path.normalize(fileName).replace(/^(\.\.[/\\])+/, '');
      const prdPath = path.join('workspace', 'prds', safePath);

      const { diffLines, summary } = await diffPrdCheckpointAgainstCurrent(projectRoot, checkpointId, prdPath);

      res.json({
        checkpointId,
        diffLines,
        summary: {
          changed: summary.changed,
          lineAdded: summary.lineAdded,
          lineDeleted: summary.lineDeleted,
          beforeLineCount: summary.beforeLineCount,
          afterLineCount: summary.afterLineCount,
        },
      });
    } catch (error) {
      console.error('获取 PRD diff 失败:', error);
      res.status(500).json({
        error: '获取 PRD diff 失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /** 获取特定 checkpoint 版本的 PRD 内容 */
  router.get(/^\/prds\/(.+)\/checkpoints\/([^/]+)$/, async (req: Request, res: Response) => {
    try {
      const checkpointId = getRouteParam(req.params[1]);

      const data = readPrdCheckpointData(projectRoot, checkpointId);
      const blob = await readPrdBlob(projectRoot, data.document.blobHash);

      res.json({
        checkpointId,
        fileName: data.document.fileName,
        title: data.manifest.title,
        kind: data.manifest.kind,
        message: data.manifest.message || null,
        createdAt: data.manifest.createdAt,
        content: blob.toString('utf8'),
      });
    } catch (error) {
      console.error('读取 PRD checkpoint 失败:', error);
      res.status(500).json({
        error: '读取 PRD 版本失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /** 读取单个 PRD 文件内容 */
  router.get(/^\/prds\/(.+)$/, (req: Request, res: Response) => {
    try {
      const dir = ensurePrdsDir();
      const fileName = getRouteParam(req.params[0]);
      // 确保路径安全，防止目录遍历
      const safePath = path.normalize(fileName).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(dir, safePath);

      if (!filePath.startsWith(dir)) {
        return res.status(400).json({ error: '非法路径' });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'PRD 文件不存在', fileName });
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = matter(content);

      const frontmatter: Record<string, unknown> = {};
      if (parsed.data && typeof parsed.data === 'object') {
        for (const [key, value] of Object.entries(parsed.data)) {
          frontmatter[key] = value;
        }
      }

      res.json({
        fileName,
        content: parsed.content,
        frontmatter,
      });
    } catch (error) {
      console.error('读取 PRD 文件失败:', error);
      res.status(500).json({
        error: '读取 PRD 文件失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}

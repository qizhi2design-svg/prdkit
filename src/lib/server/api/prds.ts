import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { listPrdCheckpointRecords, readPrdCheckpointData, readPrdBlob } from '../../checkpoints/prd/store.js';
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

  /** 读取单个 PRD 文件内容 */
  router.get('/prds/:path(*)', (req: Request, res: Response) => {
    try {
      const dir = ensurePrdsDir();
      const fileName = req.params.path;
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

  /** 获取 PRD 版本历史列表 */
  router.get('/prds/:path(*)/checkpoints', (req: Request, res: Response) => {
    try {
      const fileName = req.params.path;
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

  /** 获取特定 checkpoint 版本的 PRD 内容 */
  router.get('/prds/:path(*)/checkpoints/:checkpointId', async (req: Request, res: Response) => {
    try {
      const { checkpointId } = req.params;

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

  return router;
}

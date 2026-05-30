import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { createPrdCheckpoint, listPrdCheckpointRecords, readPrdCheckpointData, readPrdBlob } from '../../checkpoints/prd/store.js';
import { diffPrdCheckpointAgainstCurrent, diffPrdCheckpointAgainstEmpty, diffPrdCheckpointsWithLines } from '../../checkpoints/prd/diff.js';
import type { ApiHelpers } from './helpers.js';
import { sanitizeFileStem } from '#utils/files.js';

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

  function buildDuplicatePrdFileName(dir: string, fileName: string): string {
    const extension = path.extname(fileName) || '.md';
    const stem = path.basename(fileName, extension);
    let candidateName = `${stem}-副本${extension}`;
    let counter = 2;

    while (fs.existsSync(path.join(dir, candidateName))) {
      candidateName = `${stem}-副本${counter}${extension}`;
      counter += 1;
    }

    return candidateName;
  }

  function buildCreatedPrdFileName(dir: string, title: string): string {
    const stem = sanitizeFileStem(title);
    let candidateName = `${stem}.md`;
    let counter = 2;

    while (fs.existsSync(path.join(dir, candidateName))) {
      candidateName = `${stem}-副本${counter}.md`;
      counter += 1;
    }

    return candidateName;
  }

  function resolvePrdPath(relativePath: string): { safePath: string; absolutePath: string; dir: string } {
    const dir = ensurePrdsDir();
    const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
    const absolutePath = path.resolve(dir, safePath);
    const normalizedRoot = `${path.resolve(dir)}${path.sep}`;

    if (absolutePath !== path.resolve(dir) && !absolutePath.startsWith(normalizedRoot)) {
      throw new Error('非法路径');
    }

    return { safePath, absolutePath, dir };
  }

  function listPrdFilesRecursive(rootDir: string): Array<{
    fileName: string;
    name: string;
    title: string;
    status?: string;
    version?: string;
    modifiedAt: string;
    size: number;
  }> {
    const files: Array<{
      fileName: string;
      name: string;
      title: string;
      status?: string;
      version?: string;
      modifiedAt: string;
      size: number;
    }> = [];

    const walk = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

      for (const entry of entries) {
        const entryPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(entryPath);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

        const relativePath = path.relative(rootDir, entryPath).replace(/\\/g, '/');
        const stat = fs.statSync(entryPath);
        let title = entry.name.replace(/\.md$/, '');
        let status: string | undefined;
        let version: string | undefined;

        try {
          const content = fs.readFileSync(entryPath, 'utf8');
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
          // ignore parse errors
        }

        files.push({
          fileName: relativePath,
          name: entry.name.replace(/\.md$/, ''),
          title,
          status,
          version,
          modifiedAt: stat.mtime.toISOString(),
          size: stat.size,
        });
      }
    };

    walk(rootDir);
    return files;
  }

  function listPrdFoldersRecursive(rootDir: string): Array<{
    folderPath: string;
    name: string;
    modifiedAt: string;
  }> {
    const folders: Array<{
      folderPath: string;
      name: string;
      modifiedAt: string;
    }> = [];

    const walk = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const entryPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(rootDir, entryPath).replace(/\\/g, '/');
        const stat = fs.statSync(entryPath);
        folders.push({
          folderPath: relativePath,
          name: entry.name,
          modifiedAt: stat.mtime.toISOString(),
        });
        walk(entryPath);
      }
    };

    walk(rootDir);
    return folders;
  }

  function buildDuplicatePrdPath(rootDir: string, relativePath: string, targetFolderPath?: string): { relativePath: string; absolutePath: string } {
    const normalizedRelative = relativePath.replace(/\\/g, '/');
    const extension = path.extname(normalizedRelative) || '.md';
    const leafName = path.basename(normalizedRelative, extension);
    const parentDir = typeof targetFolderPath === 'string'
      ? targetFolderPath.replace(/\\/g, '/').replace(/\/+$/, '')
      : path.posix.dirname(normalizedRelative) === '.' ? '' : path.posix.dirname(normalizedRelative);

    let candidateName = `${leafName}-副本${extension}`;
    let counter = 2;
    let candidateRelative = parentDir ? `${parentDir}/${candidateName}` : candidateName;
    let candidateAbsolute = path.join(rootDir, candidateRelative);

    while (fs.existsSync(candidateAbsolute)) {
      candidateName = `${leafName}-副本${counter}${extension}`;
      candidateRelative = parentDir ? `${parentDir}/${candidateName}` : candidateName;
      candidateAbsolute = path.join(rootDir, candidateRelative);
      counter += 1;
    }

    return {
      relativePath: candidateRelative.replace(/\\/g, '/'),
      absolutePath: candidateAbsolute,
    };
  }

  function buildMovedPrdPath(rootDir: string, relativePath: string, targetFolderPath?: string): { relativePath: string; absolutePath: string } {
    const normalizedRelative = relativePath.replace(/\\/g, '/');
    const extension = path.extname(normalizedRelative) || '.md';
    const leafName = path.basename(normalizedRelative, extension);
    const parentDir = typeof targetFolderPath === 'string'
      ? targetFolderPath.replace(/\\/g, '/').replace(/\/+$/, '')
      : path.posix.dirname(normalizedRelative) === '.' ? '' : path.posix.dirname(normalizedRelative);

    const preferredRelative = (parentDir ? `${parentDir}/${leafName}${extension}` : `${leafName}${extension}`).replace(/\\/g, '/');
    const preferredAbsolute = path.join(rootDir, preferredRelative);

    if (!fs.existsSync(preferredAbsolute)) {
      return {
        relativePath: preferredRelative,
        absolutePath: preferredAbsolute,
      };
    }

    return buildDuplicatePrdPath(rootDir, relativePath, targetFolderPath);
  }

  function readProjectConfig(): { projectName?: string; author?: string } {
    const configPath = path.join(projectRoot, '.prdkit', 'config.json');
    if (!fs.existsSync(configPath)) return {};

    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8')) as { projectName?: string; author?: string };
    } catch {
      return {};
    }
  }

  function buildInitialPrdContent(input: {
    title: string;
    projectName?: string;
    author?: string;
  }): string {
    const today = new Date().toISOString().slice(0, 10);
    const frontmatter = {
      title: input.title,
      author: input.author || '待补充',
      status: 'draft',
      version: '0.1',
      created: today,
      ...(input.projectName ? { projectName: input.projectName } : {}),
    };

    return matter.stringify(`# ${input.title}\n\n## 背景\n\n待补充\n\n## 目标\n\n待补充\n\n## 需求内容\n\n待补充\n`, frontmatter);
  }

  async function createOperationCheckpoint(prdPath: string, message: string): Promise<void> {
    await createPrdCheckpoint({
      projectRoot,
      prdPath,
      kind: 'auto',
      message,
      allowDuplicate: true,
    });
  }

  /** 新建 PRD 文件 */
  router.post('/prds', async (req: Request, res: Response) => {
    try {
      const dir = ensurePrdsDir();
      const { title } = req.body as { title?: string };
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';

      if (!trimmedTitle) {
        return res.status(400).json({ error: '缺少 PRD 标题' });
      }

      const { projectName, author } = readProjectConfig();
      const fileName = buildCreatedPrdFileName(dir, trimmedTitle);
      const filePath = path.join(dir, fileName);
      const content = buildInitialPrdContent({
        title: trimmedTitle,
        projectName,
        author,
      });

      fs.writeFileSync(filePath, content, 'utf8');

      await createOperationCheckpoint(path.join('workspace', 'prds', fileName), `新建文档「${trimmedTitle}」`);

      res.json({
        success: true,
        fileName,
        title: trimmedTitle,
      });
    } catch (error) {
      console.error('新建 PRD 文件失败:', error);
      res.status(500).json({
        error: '新建 PRD 文件失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /** 列出 workspace/prds/ 下所有 PRD 文件 */
  router.get('/prds', (_req: Request, res: Response) => {
    try {
      const dir = ensurePrdsDir();
      res.json({
        files: listPrdFilesRecursive(dir),
        folders: listPrdFoldersRecursive(dir),
      });
    } catch (error) {
      console.error('读取 PRD 列表失败:', error);
      res.status(500).json({
        error: '读取 PRD 列表失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post('/prds/folders', (req: Request, res: Response) => {
    try {
      const { folderName, parentPath } = req.body as { folderName?: string; parentPath?: string };
      const trimmedName = typeof folderName === 'string' ? folderName.trim() : '';
      const normalizedParent = typeof parentPath === 'string' ? parentPath.trim().replace(/\\/g, '/').replace(/\/+$/, '') : '';

      if (!trimmedName) {
        return res.status(400).json({ error: '缺少 folderName' });
      }

      const { dir } = resolvePrdPath(normalizedParent || '.');
      const relativeFolderPath = normalizedParent ? `${normalizedParent}/${trimmedName}` : trimmedName;
      const { absolutePath } = resolvePrdPath(relativeFolderPath);

      if (fs.existsSync(absolutePath)) {
        return res.status(409).json({ error: '文件夹已存在', folderPath: relativeFolderPath });
      }

      fs.mkdirSync(absolutePath, { recursive: true });
      res.json({ success: true, folderPath: relativeFolderPath });
    } catch (error) {
      console.error('新建 PRD 文件夹失败:', error);
      res.status(500).json({
        error: '新建 PRD 文件夹失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.delete('/prds/folders', async (req: Request, res: Response) => {
    try {
      const folderPathRaw = Array.isArray(req.query.folderPath) ? req.query.folderPath[0] : req.query.folderPath;
      const folderPath = typeof folderPathRaw === 'string' ? folderPathRaw.trim() : '';
      if (!folderPath) {
        return res.status(400).json({ error: '缺少 folderPath' });
      }

      const { safePath, absolutePath, dir } = resolvePrdPath(folderPath);
      if (absolutePath === path.resolve(dir)) {
        return res.status(400).json({ error: '不允许删除 PRD 根目录' });
      }
      if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
        return res.status(404).json({ error: 'PRD 文件夹不存在', folderPath });
      }

      const nestedFiles = listPrdFilesRecursive(absolutePath);
      for (const file of nestedFiles) {
        await createOperationCheckpoint(
          path.join('workspace', 'prds', safePath, file.fileName).replace(/\\/g, '/'),
          `删除文件夹前保存版本「${folderPath}」`,
        );
      }

      fs.rmSync(absolutePath, { recursive: true, force: true });
      res.json({ success: true, folderPath });
    } catch (error) {
      console.error('删除 PRD 文件夹失败:', error);
      res.status(500).json({
        error: '删除 PRD 文件夹失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post('/prds/folders/rename', (req: Request, res: Response) => {
    try {
      const { folderPath, targetName } = req.body as { folderPath?: string; targetName?: string };
      const normalizedFolderPath = typeof folderPath === 'string' ? folderPath.trim().replace(/\\/g, '/').replace(/\/+$/, '') : '';
      const trimmedTargetName = typeof targetName === 'string' ? targetName.trim() : '';

      if (!normalizedFolderPath) {
        return res.status(400).json({ error: '缺少 folderPath' });
      }
      if (!trimmedTargetName) {
        return res.status(400).json({ error: '缺少 targetName' });
      }

      const source = resolvePrdPath(normalizedFolderPath);
      if (!fs.existsSync(source.absolutePath) || !fs.statSync(source.absolutePath).isDirectory()) {
        return res.status(404).json({ error: 'PRD 文件夹不存在', folderPath: normalizedFolderPath });
      }

      const parentPath = path.posix.dirname(source.safePath) === '.' ? '' : path.posix.dirname(source.safePath);
      const nextFolderPath = parentPath ? `${parentPath}/${trimmedTargetName}` : trimmedTargetName;
      const destination = resolvePrdPath(nextFolderPath);

      if (source.absolutePath === destination.absolutePath) {
        return res.json({ success: true, folderPath: normalizedFolderPath, renamedPath: nextFolderPath, renamedName: trimmedTargetName });
      }

      if (fs.existsSync(destination.absolutePath)) {
        return res.status(409).json({ error: '目标文件夹已存在', folderPath: nextFolderPath });
      }

      fs.renameSync(source.absolutePath, destination.absolutePath);
      res.json({
        success: true,
        folderPath: normalizedFolderPath,
        renamedPath: nextFolderPath,
        renamedName: trimmedTargetName,
      });
    } catch (error) {
      console.error('重命名 PRD 文件夹失败:', error);
      res.status(500).json({
        error: '重命名 PRD 文件夹失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post('/prds/move', async (req: Request, res: Response) => {
    try {
      const { fileName, targetFolderPath } = req.body as { fileName?: string; targetFolderPath?: string };
      const relativeFile = typeof fileName === 'string' ? fileName.trim() : '';
      const normalizedTargetFolder = typeof targetFolderPath === 'string'
        ? targetFolderPath.trim().replace(/\\/g, '/').replace(/\/+$/, '')
        : '';

      if (!relativeFile) {
        return res.status(400).json({ error: '缺少 fileName' });
      }

      const { safePath, absolutePath, dir } = resolvePrdPath(relativeFile);
      if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        return res.status(404).json({ error: 'PRD 文件不存在', fileName: relativeFile });
      }
      const currentFolderPath = path.posix.dirname(safePath) === '.' ? '' : path.posix.dirname(safePath);

      const targetFolderResolved = resolvePrdPath(normalizedTargetFolder || '.');
      if (!fs.existsSync(targetFolderResolved.absolutePath) || !fs.statSync(targetFolderResolved.absolutePath).isDirectory()) {
        return res.status(404).json({ error: '目标文件夹不存在', targetFolderPath: normalizedTargetFolder });
      }

      if (currentFolderPath === (normalizedTargetFolder || '')) {
        return res.json({ success: true, movedPath: safePath, movedName: path.basename(safePath, '.md') });
      }

      const destination = buildMovedPrdPath(dir, safePath, normalizedTargetFolder || '');
      fs.renameSync(absolutePath, destination.absolutePath);
      res.json({
        success: true,
        movedPath: destination.relativePath,
        movedName: path.basename(destination.relativePath, '.md'),
      });
    } catch (error) {
      console.error('移动 PRD 文件失败:', error);
      res.status(500).json({
        error: '移动 PRD 文件失败',
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
        baseCheckpointId: record.baseCheckpointId ?? null,
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

  /** 保存 PRD 文件内容 */
  router.post(/^\/prds\/(.+)\/save$/, (req: Request, res: Response) => {
    try {
      const fileName = getRouteParam(req.params[0]);
      const { absolutePath: filePath, safePath } = resolvePrdPath(fileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'PRD 文件不存在', fileName });
      }

      const content = typeof req.body?.content === 'string' ? req.body.content : '';
      if (!content.trim()) {
        return res.status(400).json({ error: 'PRD 内容不能为空' });
      }

      fs.writeFileSync(filePath, content, 'utf8');

      const savedContent = fs.readFileSync(filePath, 'utf8');
      const parsed = matter(savedContent);

      const frontmatter: Record<string, unknown> = {};
      Object.entries(parsed.data || {}).forEach(([key, value]) => {
        frontmatter[key] = value;
      });

      res.json({
        fileName: safePath.replace(/\\/g, '/'),
        content: savedContent,
        frontmatter,
      });
    } catch (error) {
      console.error('保存 PRD 文件失败:', error);
      res.status(500).json({
        error: '保存 PRD 文件失败',
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
      const fromCheckpointIdRaw = req.query.fromCheckpointId;
      const fromCheckpointId = Array.isArray(fromCheckpointIdRaw)
        ? typeof fromCheckpointIdRaw[0] === 'string'
          ? fromCheckpointIdRaw[0]
          : ''
        : typeof fromCheckpointIdRaw === 'string'
          ? fromCheckpointIdRaw
          : '';

      const { diffLines, summary } = fromCheckpointId
        ? fromCheckpointId === '__empty__'
          ? await diffPrdCheckpointAgainstEmpty(projectRoot, checkpointId)
          : await diffPrdCheckpointsWithLines(projectRoot, fromCheckpointId, checkpointId)
        : await diffPrdCheckpointAgainstCurrent(projectRoot, checkpointId, prdPath);

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

  /** 删除 PRD 文件 */
  router.delete(/^\/prds\/(.+)$/, async (req: Request, res: Response) => {
    try {
      const fileName = getRouteParam(req.params[0]);
      const { safePath, absolutePath: filePath } = resolvePrdPath(fileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'PRD 文件不存在', fileName });
      }

      await createOperationCheckpoint(path.join('workspace', 'prds', safePath), `删除文档前保存版本「${fileName}」`);
      fs.unlinkSync(filePath);

      res.json({ success: true, fileName });
    } catch (error) {
      console.error('删除 PRD 文件失败:', error);
      res.status(500).json({
        error: '删除 PRD 文件失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /** 重命名 PRD 文件（同步更新文件名与 frontmatter title） */
  router.post(/^\/prds\/(.+)\/rename$/, async (req: Request, res: Response) => {
    try {
      const fileName = getRouteParam(req.params[0]);
      const { safePath, absolutePath: filePath, dir } = resolvePrdPath(fileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'PRD 文件不存在', fileName });
      }

      const { newTitle } = req.body as { newTitle?: string };
      const trimmedTitle = typeof newTitle === 'string' ? newTitle.trim() : '';
      if (!trimmedTitle) {
        return res.status(400).json({ error: '缺少 newTitle' });
      }

      const parentPath = path.posix.dirname(safePath) === '.' ? '' : path.posix.dirname(safePath);
      const nextBaseName = `${sanitizeFileStem(trimmedTitle)}.md`;
      const nextRelativePath = parentPath ? `${parentPath}/${nextBaseName}` : nextBaseName;
      const nextAbsolutePath = path.join(dir, nextRelativePath);

      if (nextRelativePath !== safePath && fs.existsSync(nextAbsolutePath)) {
        return res.status(409).json({ error: '目标文件已存在', fileName: nextRelativePath });
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = matter(content);
      parsed.data.title = trimmedTitle;
      const updated = matter.stringify(parsed.content, parsed.data);
      fs.writeFileSync(filePath, updated, 'utf8');

      if (nextRelativePath !== safePath) {
        fs.renameSync(filePath, nextAbsolutePath);
      }

      await createOperationCheckpoint(path.join('workspace', 'prds', nextRelativePath).replace(/\\/g, '/'), `重命名文档为「${trimmedTitle}」`);

      res.json({
        success: true,
        fileName,
        renamedFileName: nextRelativePath,
        newTitle: trimmedTitle,
      });
    } catch (error) {
      console.error('重命名 PRD 文件失败:', error);
      res.status(500).json({
        error: '重命名 PRD 文件失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /** 复制 PRD 文件 */
  router.post(/^\/prds\/(.+)\/duplicate$/, async (req: Request, res: Response) => {
    try {
      const fileName = getRouteParam(req.params[0]);
      const { safePath, absolutePath: filePath, dir } = resolvePrdPath(fileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'PRD 文件不存在', fileName });
      }

      const destination = buildDuplicatePrdPath(dir, safePath);
      const newFileName = destination.relativePath;
      const newFilePath = destination.absolutePath;

      fs.copyFileSync(filePath, newFilePath);

      await createOperationCheckpoint(path.join('workspace', 'prds', newFileName), `复制文档自「${fileName}」`);

      res.json({
        success: true,
        sourceFileName: fileName,
        newFileName,
      });
    } catch (error) {
      console.error('复制 PRD 文件失败:', error);
      res.status(500).json({
        error: '复制 PRD 文件失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /** 读取单个 PRD 文件内容 */
  router.get(/^\/prds\/(.+)$/, (req: Request, res: Response) => {
    try {
      const fileName = getRouteParam(req.params[0]);
      const { absolutePath: filePath } = resolvePrdPath(fileName);

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

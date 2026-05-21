import chokidar from 'chokidar';
import { WebSocket } from 'ws';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { CheckpointEvent } from '../checkpoints/prototype/types.js';

export interface WatcherOptions {
  prototypesDir: string;
  onReload: () => void;
  checkpointEventsFile?: string;
  checkpointRootDir?: string;
  onCheckpointEvent?: (event: CheckpointEvent) => void;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeWatchedPath(targetPath: string): string {
  return path.resolve(targetPath);
}

function collectWatchedFileHashes(rootDir: string, hashes: Map<string, string>, currentDir = rootDir): void {
  const dirEntries = fs.readdirSync(currentDir, { withFileTypes: true })
    .filter((entry) => !shouldIgnoreWatchPath(path.join(currentDir, entry.name)))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  for (const entry of dirEntries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectWatchedFileHashes(rootDir, hashes, entryPath);
      continue;
    }

    if (!entry.isFile()) continue;
    hashes.set(normalizeWatchedPath(entryPath), sha256(fs.readFileSync(entryPath)));
  }
}

export class WatchContentTracker {
  private readonly fileHashes = new Map<string, string>();

  constructor(rootDir: string) {
    if (fs.existsSync(rootDir)) {
      collectWatchedFileHashes(rootDir, this.fileHashes);
    }
  }

  onFileChange(targetPath: string): boolean {
    const absolutePath = normalizeWatchedPath(targetPath);
    const stats = fs.statSync(absolutePath, { throwIfNoEntry: false });
    if (!stats?.isFile()) {
      return true;
    }

    const nextHash = sha256(fs.readFileSync(absolutePath));
    const previousHash = this.fileHashes.get(absolutePath);
    this.fileHashes.set(absolutePath, nextHash);
    return previousHash !== nextHash;
  }

  onFileAdd(targetPath: string): void {
    const absolutePath = normalizeWatchedPath(targetPath);
    const stats = fs.statSync(absolutePath, { throwIfNoEntry: false });
    if (!stats?.isFile()) return;
    this.fileHashes.set(absolutePath, sha256(fs.readFileSync(absolutePath)));
  }

  onFileUnlink(targetPath: string): void {
    this.fileHashes.delete(normalizeWatchedPath(targetPath));
  }
}

export function shouldIgnoreWatchPath(targetPath: string): boolean {
  return /(^|[\/\\])\./.test(targetPath) ||
         targetPath.includes(`${path.sep}.prdkit${path.sep}checkpoints${path.sep}prototype${path.sep}`) ||
         targetPath.includes(`${path.sep}.prdkit${path.sep}checkpoints${path.sep}prd${path.sep}`);
}

export function resolvePrototypePathFromWatchEvent(prototypesDir: string, targetPath: string): string | null {
  const absoluteTarget = path.resolve(targetPath);
  const absoluteRoot = path.resolve(prototypesDir);
  if (!absoluteTarget.startsWith(absoluteRoot)) {
    return null;
  }

  let current = fs.statSync(absoluteTarget, { throwIfNoEntry: false })?.isDirectory()
    ? absoluteTarget
    : path.dirname(absoluteTarget);

  while (current.startsWith(absoluteRoot)) {
    if (fs.existsSync(path.join(current, 'index.html'))) {
      return path.relative(absoluteRoot, current).replace(/\\/g, '/');
    }
    if (current === absoluteRoot) break;
    current = path.dirname(current);
  }

  return null;
}

export function createWatcher(options: WatcherOptions) {
  const {
    prototypesDir,
    onReload,
    checkpointEventsFile,
    checkpointRootDir,
    onCheckpointEvent,
  } = options;
  const contentTracker = new WatchContentTracker(prototypesDir);

  const watcher = chokidar.watch(prototypesDir, {
    ignored: (watchedPath) => shouldIgnoreWatchPath(watchedPath), // 忽略隐藏文件
    persistent: true,
    ignoreInitial: true,
  });
  let checkpointEventTimer: ReturnType<typeof setTimeout> | null = null;
  let lastBroadcastCheckpointId: string | null = null;

  const handleChange = (changedPath: string) => {
    if (shouldIgnoreWatchPath(changedPath)) return;
    onReload();
  };

  watcher
    .on('add', (path: string) => {
      console.log(chalk.green('  ✓ 文件已添加:'), chalk.gray(path));
      contentTracker.onFileAdd(path);
      handleChange(path);
    })
    .on('change', (path: string) => {
      if (!contentTracker.onFileChange(path)) {
        return;
      }
      console.log(chalk.yellow('  ⟳ 文件已修改:'), chalk.gray(path));
      handleChange(path);
    })
    .on('unlink', (path: string) => {
      console.log(chalk.red('  ✗ 文件已删除:'), chalk.gray(path));
      contentTracker.onFileUnlink(path);
      handleChange(path);
    })
    .on('addDir', (path: string) => {
      console.log(chalk.green('  ✓ 目录已添加:'), chalk.gray(path));
      handleChange(path);
    })
    .on('unlinkDir', (path: string) => {
      console.log(chalk.red('  ✗ 目录已删除:'), chalk.gray(path));
      handleChange(path);
    });

  if (checkpointEventsFile || checkpointRootDir) {
    const checkpointWatcherTargets = [
      checkpointEventsFile,
      checkpointRootDir,
    ].filter((value): value is string => Boolean(value));
    const checkpointWatcher = chokidar.watch(checkpointWatcherTargets, {
      persistent: true,
      ignoreInitial: true,
    });

    const emitLatestCheckpointEvent = () => {
      if (!checkpointEventsFile) return;
      if (checkpointEventTimer) {
        clearTimeout(checkpointEventTimer);
      }

      checkpointEventTimer = setTimeout(() => {
        const event = readLatestCheckpointEvent(checkpointEventsFile);
        if (!event) return;
        if (event.checkpointId && event.checkpointId === lastBroadcastCheckpointId) {
          return;
        }
        if (event.checkpointId) {
          lastBroadcastCheckpointId = event.checkpointId;
        }
        if (event.type === 'create') {
          console.log(chalk.cyan('  ⟳ checkpoint 已创建:'), chalk.gray(event.checkpointId || '-'));
        }
        onCheckpointEvent?.(event);
      }, 120);
    };

    checkpointWatcher
      .on('add', emitLatestCheckpointEvent)
      .on('addDir', emitLatestCheckpointEvent)
      .on('change', emitLatestCheckpointEvent);

    const originalClose = watcher.close.bind(watcher);
    watcher.close = async () => {
      if (checkpointEventTimer) {
        clearTimeout(checkpointEventTimer);
        checkpointEventTimer = null;
      }
      await checkpointWatcher.close();
      return originalClose();
    };
  }

  return watcher;
}

export function broadcastReload(clients: Set<WebSocket>) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'reload' }));
    }
  });
}

export function broadcastCheckpointCreated(clients: Set<WebSocket>, checkpointId?: string) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'checkpoint-created', checkpointId: checkpointId || null }));
    }
  });
}

function readLatestCheckpointEvent(filePath: string): CheckpointEvent | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return null;
    const lastLine = content.split('\n').filter(Boolean).at(-1);
    if (!lastLine) return null;
    return JSON.parse(lastLine) as CheckpointEvent;
  } catch (error) {
    console.error(chalk.red('读取 checkpoint 事件失败:'), error);
    return null;
  }
}

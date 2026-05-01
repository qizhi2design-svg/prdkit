import chokidar from 'chokidar';
import { WebSocket } from 'ws';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface WatcherOptions {
  prototypesDir: string;
  onReload: () => void;
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
  return /(^|[\/\\])\./.test(targetPath) || targetPath.includes(`${path.sep}.prdkit${path.sep}checkpoints${path.sep}`);
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
  const { prototypesDir, onReload } = options;
  const contentTracker = new WatchContentTracker(prototypesDir);

  const watcher = chokidar.watch(prototypesDir, {
    ignored: (watchedPath) => shouldIgnoreWatchPath(watchedPath), // 忽略隐藏文件
    persistent: true,
    ignoreInitial: true,
  });

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

  return watcher;
}

export function broadcastReload(clients: Set<WebSocket>) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'reload' }));
    }
  });
}

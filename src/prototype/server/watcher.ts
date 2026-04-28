import chokidar from 'chokidar';
import { WebSocket } from 'ws';
import chalk from 'chalk';

export interface WatcherOptions {
  prototypesDir: string;
  onReload: () => void;
}

export function createWatcher(options: WatcherOptions) {
  const { prototypesDir, onReload } = options;

  const watcher = chokidar.watch(prototypesDir, {
    ignored: /(^|[\/\\])\../, // 忽略隐藏文件
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on('add', (path: string) => {
      console.log(chalk.green('  ✓ 文件已添加:'), chalk.gray(path));
      onReload();
    })
    .on('change', (path: string) => {
      console.log(chalk.yellow('  ⟳ 文件已修改:'), chalk.gray(path));
      onReload();
    })
    .on('unlink', (path: string) => {
      console.log(chalk.red('  ✗ 文件已删除:'), chalk.gray(path));
      onReload();
    })
    .on('addDir', (path: string) => {
      console.log(chalk.green('  ✓ 目录已添加:'), chalk.gray(path));
      onReload();
    })
    .on('unlinkDir', (path: string) => {
      console.log(chalk.red('  ✗ 目录已删除:'), chalk.gray(path));
      onReload();
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

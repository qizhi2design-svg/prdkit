import { Command } from 'commander';
import path from 'path';
import { loadConfig } from '../config.js';
import { startServer } from '../prototype/server/index.js';
import { fail, success } from '../ui.js';
import { COPY } from '../command-text.js';
import { spawn } from 'child_process';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createApiRouter } from '../prototype/server/api.js';
import { createWatcher, broadcastReload } from '../prototype/server/watcher.js';
import { findAvailablePort } from '../utils/port.js';

export function registerServe(program: Command) {
  program
    .command('serve')
    .description(COPY.serveDescription)
    .option('-p, --port <port>', '端口号（默认自动查找 7788-7888 范围内的可用端口）')
    .option('--no-open', '不自动打开浏览器')
    .option('--dev', '开发模式（启用热更新）')
    .addHelpText('after', COPY.serveHelpAfter)
    .action(async (options) => {
      // 加载项目配置
      const config = await loadConfig();
      if (!config) {
        fail('未找到 prdkit 项目，请先运行 prdkit init');
        process.exit(1);
      }

      let port: number;
      if (options.port) {
        port = parseInt(options.port);
        if (isNaN(port) || port < 1 || port > 65535) {
          fail('无效的端口号');
          process.exit(1);
        }
      } else {
        port = await findAvailablePort(7788, 7888);
        console.log(`✓ 自动选择端口: ${port}`);
      }

      // 获取 prototypes 目录和 viewer 目录
      const prototypesDir = path.join(process.cwd(), 'workspace', 'prototypes');

      try {
        if (options.dev) {
          // 开发模式：启动 vite dev server
          await startDevMode({ port, prototypesDir, openBrowser: options.open });
        } else {
          // 生产模式：使用构建好的静态文件
          // viewerDir 应该指向编译后的 dist/viewer 目录
          const viewerDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../viewer');

          startServer({
            port,
            prototypesDir,
            viewerDir
          });

          // 自动打开浏览器
          if (options.open) {
            const open = await import('open');
            await open.default(`http://localhost:${port}`);
          }
        }
      } catch (error) {
        fail('启动服务器失败');
        console.error(error);
        process.exit(1);
      }
    });
}

async function startDevMode(options: { port: number; prototypesDir: string; openBrowser: boolean }) {
  const { port, prototypesDir, openBrowser } = options;

  // 1. 创建 Express 服务器（提供 API 和原型文件）
  const apiApp = express();
  const apiPort = port + 1; // API 服务器使用 port+1

  const apiServer = createServer(apiApp);
  const wss = new WebSocketServer({ server: apiServer });
  const clients = new Set<WebSocket>();

  // WebSocket 连接处理
  wss.on('connection', (ws: WebSocket) => {
    console.log('客户端已连接');
    clients.add(ws);
    ws.on('close', () => {
      console.log('客户端已断开');
      clients.delete(ws);
    });
    ws.on('error', (error: Error) => {
      console.error('WebSocket 连接错误:', error.message);
      clients.delete(ws);
    });
  });

  // API 路由
  apiApp.use('/api', createApiRouter(prototypesDir));

  // 原型文件静态服务
  apiApp.use('/preview', express.static(prototypesDir));

  // 启动 API 服务器
  await new Promise<void>((resolve) => {
    apiServer.listen(apiPort, () => {
      console.log(`✓ API 服务器已启动: http://localhost:${apiPort}`);
      resolve();
    });
  });

  // 启动文件监听
  const watcher = createWatcher({
    prototypesDir,
    onReload: () => {
      broadcastReload(clients);
    }
  });

  // 2. 启动 Vite 开发服务器（通过子进程）
  const viewerDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../../src/prototype/viewer');

  const viteProcess = spawn('pnpm', ['dev', '--port', port.toString()], {
    cwd: viewerDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      API_PORT: apiPort.toString()
    }
  });

  console.log(`\n✓ 开发服务器已启动（热更新已启用）`);
  console.log(`➜ 本地访问: http://localhost:${port}`);
  console.log(`➜ 按 Ctrl+C 停止服务器\n`);

  // 自动打开浏览器
  if (openBrowser) {
    // 等待 vite 启动
    await new Promise(resolve => setTimeout(resolve, 2000));
    const open = await import('open');
    await open.default(`http://localhost:${port}`);
  }

  // 优雅关闭
  const shutdown = async () => {
    console.log('\n正在关闭服务器...');

    watcher.close();
    clients.forEach((client) => client.close());
    clients.clear();
    wss.close();
    apiServer.close();
    viteProcess.kill();

    console.log('服务器已关闭');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

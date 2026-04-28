import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import chalk from 'chalk';
import { createApiRouter } from './api.js';
import { createWatcher, broadcastReload } from './watcher.js';

export interface ServerOptions {
  port: number;
  prototypesDir: string;
  viewerDir?: string; // React 应用的静态文件目录
}

// 辅助函数：格式化时间戳
function getTimestamp(): string {
  const now = new Date();
  return chalk.gray(`[${now.toLocaleTimeString('zh-CN', { hour12: false })}]`);
}

// 辅助函数：显示连接状态
function logConnectionStatus(count: number) {
  const icon = count > 0 ? '●' : '○';
  const color = count > 0 ? chalk.green : chalk.gray;
  console.log(`${getTimestamp()} ${color(icon)} 活跃连接: ${color(count)}`);
}

export function startServer(options: ServerOptions) {
  const { port, prototypesDir, viewerDir } = options;

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  const clients = new Set<WebSocket>();

  // WebSocket 连接处理
  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    logConnectionStatus(clients.size);

    ws.on('close', () => {
      clients.delete(ws);
      // 只在连接数归零时输出，减少噪音
      if (clients.size === 0) {
        logConnectionStatus(clients.size);
      }
    });

    ws.on('error', (error: Error) => {
      console.error(`${getTimestamp()} ${chalk.red('✗')} WebSocket 错误:`, error.message);
      clients.delete(ws);
    });
  });

  // API 路由
  app.use('/api', createApiRouter(prototypesDir));

  // 原型文件静态服务
  app.use('/prototypes', express.static(prototypesDir));

  // React 应用静态服务（如果提供了）
  if (viewerDir) {
    app.use(express.static(viewerDir));
  } else {
    // 临时：返回简单的 HTML 页面
    app.get('/', (req: Request, res: Response) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>PRDKit 原型预览</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h1 { color: #1890ff; }
            pre { background: #f5f5f5; padding: 10px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>PRDKit 原型预览服务器</h1>
          <p>服务器正在运行...</p>
          <h2>API 端点</h2>
          <ul>
            <li><a href="/api/prototypes">/api/prototypes</a> - 获取原型列表</li>
          </ul>
          <h2>WebSocket</h2>
          <p>连接到 <code>ws://localhost:${port}</code> 接收文件变更通知</p>
          <script>
            const ws = new WebSocket('ws://localhost:${port}');
            ws.onopen = () => console.log('WebSocket 已连接');
            ws.onmessage = (event) => {
              console.log('收到消息:', event.data);
              const msg = JSON.parse(event.data);
              if (msg.type === 'reload') {
                console.log('文件已变更，刷新页面...');
                location.reload();
              }
            };
          </script>
        </body>
        </html>
      `);
    });
  }

  // 启动文件监听
  const watcher = createWatcher({
    prototypesDir,
    onReload: () => {
      broadcastReload(clients);
    }
  });

  // 启动服务器
  server.listen(port, () => {
    console.log('');
    console.log(chalk.green.bold('✓ PRDKit 预览服务器已启动'));
    console.log('');
    console.log(`  ${chalk.cyan('➜')} 本地访问: ${chalk.cyan.underline(`http://localhost:${port}`)}`);
    console.log(`  ${chalk.gray('➜')} 按 ${chalk.yellow('Ctrl+C')} 停止服务器`);
    console.log('');
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');
  });

  // 错误处理
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error('');
      console.error(chalk.red.bold('✗ 端口已被占用'));
      console.error('');
      console.error(`  端口 ${chalk.yellow(port)} 已被其他程序使用`);
      console.error(`  请尝试以下方法：`);
      console.error(`  ${chalk.gray('1.')} 关闭占用该端口的程序`);
      console.error(`  ${chalk.gray('2.')} 使用 ${chalk.cyan('--port')} 参数指定其他端口`);
      console.error(`  ${chalk.gray('3.')} 不指定端口，让系统自动选择可用端口`);
      console.error('');
      process.exit(1);
    } else {
      console.error('');
      console.error(chalk.red.bold('✗ 服务器启动失败'));
      console.error('');
      console.error(`  ${error.message}`);
      console.error('');
      process.exit(1);
    }
  });

  // 优雅关闭
  const shutdown = () => {
    console.log('\n正在关闭服务器...');

    // 1. 先关闭文件监听
    watcher.close();

    // 2. 关闭所有 WebSocket 连接
    clients.forEach((client) => {
      client.close();
    });
    clients.clear();

    // 3. 关闭 WebSocket 服务器
    wss.close();

    // 4. 关闭 HTTP 服务器
    server.close(() => {
      console.log('服务器已关闭');
      process.exit(0);
    });

    // 5. 如果 5 秒后还没关闭，强制退出
    setTimeout(() => {
      console.log('强制关闭服务器');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, wss, watcher };
}

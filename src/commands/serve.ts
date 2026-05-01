import { Command } from 'commander';
import { spawn } from 'node:child_process';
import path from 'path';
import { loadConfig } from '#utils/config.js';
import { startServer } from '#lib/server/index.js';
import { logger } from '#utils/logger.js';
import { ConfigError, ValidationError, ServerError } from '#utils/errors.js';
import { COPY } from '#constants/command-text.js';
import { findAvailablePort, findAvailablePortBlock, isPortAvailable } from '#utils/port.js';

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
        throw ConfigError.projectNotInitialized();
      }

      let port: number;
      if (options.port) {
        port = parseInt(options.port);
        if (isNaN(port) || port < 1 || port > 65535) {
          throw ValidationError.invalidPort(options.port);
        }

        if (options.dev) {
          if (port >= 65535) {
            throw ValidationError.invalidPort(options.port);
          }

          const portAvailable = await isPortAvailable(port);
          const apiPortAvailable = await isPortAvailable(port + 1);
          if (!portAvailable) {
            throw ServerError.portInUse(port);
          }
          if (!apiPortAvailable) {
            throw ServerError.portInUse(port + 1);
          }
        }
      } else {
        port = options.dev
          ? await findAvailablePortBlock(7788, 7888, 2)
          : await findAvailablePort(7788, 7888);
        logger.success(`自动选择端口: ${port}`);
      }

      // 获取 prototypes 目录和 viewer 目录
      const prototypesDir = path.join(process.cwd(), 'workspace', 'prototypes');

      if (options.dev) {
        const apiPort = port + 1;
        startServer({
          port: apiPort,
          prototypesDir
        });

        const viewerDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../../src/lib/viewer');
        const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
        const viteProcess = spawn(
          pnpmCommand,
          ['exec', 'vite', '--port', String(port)],
          {
            cwd: viewerDir,
            env: {
              ...process.env,
              API_PORT: String(apiPort)
            },
            stdio: 'inherit'
          }
        );

        viteProcess.on('error', (error) => {
          throw ServerError.startFailed('Vite 进程启动失败', error);
        });

        const shutdownVite = () => {
          if (!viteProcess.killed) {
            viteProcess.kill('SIGTERM');
          }
        };

        process.on('SIGINT', shutdownVite);
        process.on('SIGTERM', shutdownVite);
      } else {
        const viewerDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../viewer');

        startServer({
          port,
          prototypesDir,
          viewerDir
        });
      }

      // 自动打开浏览器
      if (options.open) {
        const open = await import('open');
        await open.default(`http://localhost:${port}`);
      }
    });
}

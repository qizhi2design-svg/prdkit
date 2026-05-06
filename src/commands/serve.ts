import { Command } from 'commander';
import { spawn } from 'node:child_process';
import path from 'path';
import { loadConfig } from '#utils/config.js';
import { startServer } from '#lib/server/index.js';
import { logger } from '#utils/logger.js';
import { ConfigError, ValidationError, ServerError } from '#utils/errors.js';
import { COPY } from '#constants/command-text.js';
import { findAvailablePort, findAvailablePortBlock, isPortAvailable } from '#utils/port.js';
import { writeServerInfo, removeServerInfo, getServerStatus } from '#utils/pid.js';

export function registerServe(program: Command) {
  const serve = program
    .command('serve')
    .description(COPY.serveDescription);

  // serve start 命令（默认行为）
  serve
    .command('start', { isDefault: true })
    .description('启动预览服务器')
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

      const projectRoot = process.cwd();

      // 检查是否已有服务在运行
      const status = await getServerStatus(projectRoot);
      if (status.running && status.info) {
        logger.warn(`服务已在运行中 (PID: ${status.info.pid}, 端口: ${status.info.port})`);
        logger.info('如需重启，请先停止现有服务');
        return;
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

      const mode = options.dev ? 'dev' : 'prod';
      const apiPort = options.dev ? port + 1 : undefined;

      // 写入服务信息
      await writeServerInfo({
        pid: process.pid,
        port,
        apiPort,
        mode,
        startTime: Date.now(),
        projectRoot
      });

      // 清理函数
      const cleanup = async () => {
        await removeServerInfo(projectRoot);
      };

      // 注册清理钩子
      process.on('SIGINT', async () => {
        await cleanup();
        process.exit(0);
      });
      process.on('SIGTERM', async () => {
        await cleanup();
        process.exit(0);
      });
      process.on('exit', () => {
        // 同步清理
        removeServerInfo(projectRoot).catch(() => {});
      });

      if (options.dev) {
        await startServer({
          port: apiPort!,
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

        const shutdownVite = async () => {
          if (!viteProcess.killed) {
            viteProcess.kill('SIGTERM');
          }
          await cleanup();
        };

        process.on('SIGINT', shutdownVite);
        process.on('SIGTERM', shutdownVite);
      } else {
        const viewerDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../viewer');

        await startServer({
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

  // serve status 命令
  serve
    .command('status')
    .description(COPY.serveStatusDescription)
    .addHelpText('after', COPY.serveStatusHelpAfter)
    .action(async () => {
      const projectRoot = process.cwd();
      const status = await getServerStatus(projectRoot);

      if (!status.running || !status.info) {
        logger.info('当前项目没有运行中的服务');
        return;
      }

      const { info } = status;
      const uptime = Date.now() - info.startTime;
      const uptimeSeconds = Math.floor(uptime / 1000);
      const uptimeMinutes = Math.floor(uptimeSeconds / 60);
      const uptimeHours = Math.floor(uptimeMinutes / 60);

      let uptimeStr = '';
      if (uptimeHours > 0) {
        uptimeStr = `${uptimeHours} 小时 ${uptimeMinutes % 60} 分钟`;
      } else if (uptimeMinutes > 0) {
        uptimeStr = `${uptimeMinutes} 分钟`;
      } else {
        uptimeStr = `${uptimeSeconds} 秒`;
      }

      logger.success('服务运行中');
      console.log(`  PID:      ${info.pid}`);
      console.log(`  端口:     ${info.port}`);
      if (info.apiPort) {
        console.log(`  API 端口: ${info.apiPort}`);
      }
      console.log(`  模式:     ${info.mode === 'dev' ? '开发模式' : '生产模式'}`);
      console.log(`  运行时长: ${uptimeStr}`);
      console.log(`  访问地址: http://localhost:${info.port}`);
    });
}

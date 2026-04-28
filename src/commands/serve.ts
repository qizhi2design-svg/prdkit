import { Command } from 'commander';
import path from 'path';
import { loadConfig } from '../config.js';
import { startServer } from '../prototype/server/index.js';
import { fail } from '../ui.js';
import { COPY } from '../command-text.js';
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
        // `serve --dev` 保持与普通 `serve` 一致的 viewer UI，
        // 仅通过文件监听提供原型内容热更新。
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
      } catch (error) {
        fail('启动服务器失败');
        console.error(error);
        process.exit(1);
      }
    });
}

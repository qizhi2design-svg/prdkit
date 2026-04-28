import { Command } from 'commander';
import { execSync } from 'child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, success } from '../ui.js';
import { COPY } from '../command-text.js';
import ora from 'ora';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

export function registerUpdate(program: Command) {
  program
    .command('update')
    .description(COPY.updateDescription)
    .addHelpText('after', COPY.updateHelpAfter)
    .action(async () => {
      const spinner = ora('正在检查版本...').start();

      try {
        // 获取当前版本
        const packageJson = JSON.parse(
          readFileSync(join(__dirname, '../../package.json'), 'utf8')
        );
        const currentVersion = packageJson.version as string;
        const packageName = packageJson.name as string;

        spinner.text = '正在查询最新版本...';

        // 查询 npm 上的最新版本
        let latestVersion: string;
        try {
          const output = execSync(`npm view ${packageName} version`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
          });
          latestVersion = output.trim();
        } catch (error) {
          spinner.fail('无法查询最新版本');
          console.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }

        spinner.stop();

        // 比较版本
        const comparison = compareVersions(currentVersion, latestVersion);

        if (comparison === 0) {
          success(`当前已是最新版本: ${currentVersion}`);
          return;
        }

        if (comparison > 0) {
          console.log(chalk.yellow(`当前版本 ${currentVersion} 高于 npm 最新版本 ${latestVersion}`));
          console.log(chalk.dim('无需更新'));
          return;
        }

        console.log(`当前版本: ${currentVersion}`);
        console.log(`最新版本: ${latestVersion}`);
        console.log('');

        // 执行更新
        const updateSpinner = ora('正在更新...').start();
        try {
          execSync(`pnpm add -g ${packageName}@latest`, {
            stdio: 'inherit'
          });
          updateSpinner.succeed(`更新成功！当前版本: ${latestVersion}`);
        } catch (error) {
          updateSpinner.fail('更新失败');
          console.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      } catch (error) {
        spinner.fail('检查更新失败');
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

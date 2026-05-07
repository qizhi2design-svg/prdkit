import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import matter from "gray-matter";
import { COPY } from "#constants/command-text.js";
import { createCloudClient } from "#lib/cloud/client.js";
import type { CloudAuthStatus } from "#types/index.js";
import { getAuthRecord, loadConfig, resolveCloudHost, resolveProjectRoot } from "#utils/config.js";
import { flattenPrototypes, scanPrototypes } from "#lib/server/scanner.js";
import { ConfigError } from "#utils/errors.js";

interface InfoOptions {
  json?: boolean;
}

interface ProjectStats {
  projectName: string;
  author: string;
  description?: string;
  productPositioning?: string;
  teamSize?: string;
  projectStage?: string;
  prds: {
    total: number;
    byStatus: Record<string, number>;
  };
  prototypes: number;
  discussions: number;
  bugs: number;
  cloud: {
    host?: string;
    authStatus: CloudAuthStatus | "unavailable";
    userEmail?: string;
    projectId?: string;
    projectName?: string;
    lastReleaseId?: string;
    lastPublishedAt?: string;
  };
}

function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir);
  return files.filter(f => {
    const fullPath = path.join(dir, f);
    return fs.statSync(fullPath).isFile() && f.endsWith('.md');
  }).length;
}

function countPrototypes(prototypesDir: string): number {
  if (!fs.existsSync(prototypesDir)) return 0;
  return flattenPrototypes(scanPrototypes(prototypesDir)).length;
}

function analyzePrds(prdsDir: string): { total: number; byStatus: Record<string, number> } {
  if (!fs.existsSync(prdsDir)) {
    return { total: 0, byStatus: {} };
  }

  const files = fs.readdirSync(prdsDir).filter(f => f.endsWith('.md'));
  const byStatus: Record<string, number> = {};

  for (const file of files) {
    const filePath = path.join(prdsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { data } = matter(content);
      const status = (data.status as string) || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
    } catch (error) {
      // 如果解析失败，计入 unknown
      byStatus['unknown'] = (byStatus['unknown'] || 0) + 1;
    }
  }

  return { total: files.length, byStatus };
}

export async function getProjectStats(projectRoot: string): Promise<ProjectStats> {
  const config = await loadConfig(projectRoot);
  if (!config) {
    throw ConfigError.notFound(path.join(projectRoot, ".prdkit", "config.json"));
  }

  const workspaceDir = path.join(projectRoot, 'workspace');
  const prdsDir = path.join(workspaceDir, 'prds');
  const prototypesDir = path.join(workspaceDir, 'prototypes');
  const discussionsDir = path.join(workspaceDir, 'discussions');
  const bugsDir = path.join(workspaceDir, 'bugs');

  const prds = analyzePrds(prdsDir);
  const prototypes = countPrototypes(prototypesDir);
  const discussions = countFiles(discussionsDir);
  const bugs = countFiles(bugsDir);

  return {
    projectName: config.projectName,
    author: config.author,
    description: config.description,
    productPositioning: config.productPositioning,
    teamSize: config.teamSize,
    projectStage: config.projectStage,
    prds,
    prototypes,
    discussions,
    bugs,
    cloud: await resolveCloudInfo(config),
  };
}

async function resolveCloudInfo(statsConfig: NonNullable<Awaited<ReturnType<typeof loadConfig>>>): Promise<ProjectStats["cloud"]> {
  const host = resolveCloudHost();
  const base = {
    host,
    projectId: statsConfig.cloud?.projectId,
    projectName: statsConfig.cloud?.projectName,
    lastReleaseId: statsConfig.cloud?.lastReleaseId,
    lastPublishedAt: statsConfig.cloud?.lastPublishedAt,
  };

  if (!host) {
    return {
      ...base,
      authStatus: "unavailable",
    };
  }

  const authRecord = await getAuthRecord(host);
  if (!authRecord) {
    return {
      ...base,
      authStatus: "loggedOut",
    };
  }

  if (new Date(authRecord.expiresAt).getTime() <= Date.now()) {
    return {
      ...base,
      authStatus: "expired",
      userEmail: authRecord.user.email,
    };
  }

  const client = await createCloudClient(host);
  const user = await client.getCurrentUser().catch(() => authRecord.user);
  return {
    ...base,
    authStatus: "active",
    userEmail: user.email,
  };
}

function displayStats(stats: ProjectStats): void {
  console.log();
  console.log(chalk.cyan.bold('项目信息'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`${chalk.yellow('项目名称:')} ${stats.projectName}`);
  console.log(`${chalk.yellow('作者:')} ${stats.author}`);
  if (stats.description) {
    console.log(`${chalk.yellow('项目描述:')} ${stats.description}`);
  }
  if (stats.productPositioning) {
    console.log(`${chalk.yellow('产品定型:')} ${stats.productPositioning}`);
  }
  if (stats.teamSize) {
    console.log(`${chalk.yellow('团队规模:')} ${stats.teamSize}`);
  }
  if (stats.projectStage) {
    console.log(`${chalk.yellow('项目阶段:')} ${stats.projectStage}`);
  }
  console.log();

  console.log(chalk.cyan.bold('内容统计'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`${chalk.yellow('PRD 文档:')} ${stats.prds.total}`);

  if (Object.keys(stats.prds.byStatus).length > 0) {
    for (const [status, count] of Object.entries(stats.prds.byStatus)) {
      const statusColor = status === 'completed' ? chalk.green :
                         status === 'in-progress' ? chalk.blue :
                         status === 'planning' ? chalk.yellow : chalk.gray;
      console.log(`  ${statusColor(`${status}:`)} ${count}`);
    }
  }

  console.log(`${chalk.yellow('原型:')} ${stats.prototypes}`);
  console.log(`${chalk.yellow('讨论:')} ${stats.discussions}`);
  console.log(`${chalk.yellow('Bug 报告:')} ${stats.bugs}`);
  console.log();

  console.log(chalk.cyan.bold('云端状态'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`${chalk.yellow('服务器地址:')} ${stats.cloud.host || "未配置"}`);
  console.log(`${chalk.yellow('登录状态:')} ${stats.cloud.authStatus}`);
  console.log(`${chalk.yellow('登录用户:')} ${stats.cloud.userEmail || "暂无"}`);
  console.log(`${chalk.yellow('默认项目:')} ${stats.cloud.projectName || stats.cloud.projectId || "未选择"}`);
  console.log(`${chalk.yellow('最近发布:')} ${stats.cloud.lastReleaseId || "暂无"}`);
  console.log();
}

export function registerInfo(program: Command): void {
  program
    .command("info")
    .description(COPY.infoDescription)
    .option("-j, --json", COPY.jsonOutputOption)
    .action(async (options: InfoOptions) => {
      const projectRoot = await resolveProjectRoot();
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const stats = await getProjectStats(projectRoot);

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        displayStats(stats);
      }
    });
}

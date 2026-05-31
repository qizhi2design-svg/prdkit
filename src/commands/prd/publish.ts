import { Command } from "commander";
import { publishPrdsToCloud } from "#lib/cloud/prd-publisher.js";
import { ConfigError } from "#utils/errors.js";
import path from "node:path";
import { ensureCloudConfig, loadConfig, resolveProjectRoot, saveCloudConfig, normalizeHost } from "#utils/config.js";
import { logger } from "#utils/logger.js";

export interface PrdPublishOptions {
  cloud?: boolean;
  host?: string;
  message?: string;
  json?: boolean;
  project?: string;
}

async function runPrdPublish(options: PrdPublishOptions): Promise<void> {
  const projectRoot = await resolveProjectRoot(process.cwd());
  if (!projectRoot) {
    throw ConfigError.projectNotInitialized();
  }

  const config = await loadConfig(projectRoot);
  if (!config) {
    throw ConfigError.notFound(path.join(projectRoot, ".prdkit", "config.json"));
  }

  let cloudConfig = options.host
    ? { version: 1 as const, host: normalizeHost(options.host) }
    : await ensureCloudConfig(projectRoot, {
        promptMessage: "输入默认云端服务器地址",
      });

  const result = await publishPrdsToCloud({
    projectRoot,
    config,
    cloudConfig,
    hostOverride: options.host,
    message: options.message,
    project: options.project,
  });

  if (options.host) {
    cloudConfig = { ...cloudConfig, host: normalizeHost(options.host) };
  }

  if (options.json) {
    const nextConfig = {
      ...cloudConfig,
      projectId: result.projectId,
      lastReleaseId: result.releaseId,
      lastPublishedAt: new Date().toISOString(),
    };
    if (!options.host) {
      await saveCloudConfig(nextConfig, projectRoot);
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  logger.success(`PRD 发布成功，版本 ${result.sequenceNumber}`);
  logger.info(`变更文档: ${result.changedCount} 份`);
  logger.info(`未变化文档: ${result.unchangedCount} 份`);
  logger.info(`查看地址: ${result.releaseUrl}`);

  const nextConfig = {
    ...cloudConfig,
    projectId: result.projectId,
    lastReleaseId: result.releaseId,
    lastPublishedAt: new Date().toISOString(),
  };
  if (!options.host) {
    await saveCloudConfig(nextConfig, projectRoot);
  }
}

export function registerPrdPublish(parent: Command): void {
  parent
    .command("publish")
    .description("发布 PRD 文档到云端")
    .option("-H, --host <url>", "指定云端服务器地址（临时覆盖 cloud.json）")
    .option("-m, --message <message>", "版本说明")
    .option("--json", "输出 JSON 结果")
    .option("-p, --project <idOrSlug>", "指定云端项目 ID 或 slug")
    .action(runPrdPublish);
}

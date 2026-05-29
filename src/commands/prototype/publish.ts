import { Command } from "commander";
import { COPY } from "#constants/command-text.js";
import { buildDefaultPublishOutputDir, publishArtifacts } from "#lib/server/publish.js";
import { publishToCloud } from "#lib/cloud/publisher.js";
import { ConfigError } from "#utils/errors.js";
import path from "node:path";
import { ensureCloudConfig, loadCloudConfig, loadConfig, resolveProjectRoot, saveCloudConfig, requireCloudHost, normalizeHost } from "#utils/config.js";
import { registerReleaseLink } from "#lib/links/registry.js";
import { logger } from "#utils/logger.js";

export interface PrototypePublishOptions {
  output?: string;
  cloud?: boolean;
  host?: string;
  message?: string;
  json?: boolean;
  project?: string;
  open?: boolean;
}

async function runPrototypePublish(options: PrototypePublishOptions): Promise<void> {
  const projectRoot = await resolveProjectRoot(process.cwd());
  if (!projectRoot) {
    throw ConfigError.projectNotInitialized();
  }

  const config = await loadConfig(projectRoot);
  if (!config) {
    throw ConfigError.notFound(path.join(projectRoot, ".prdkit", "config.json"));
  }

  if (options.cloud) {
    let cloudConfig = options.host
      ? { version: 1 as const, host: normalizeHost(options.host) }
      : await ensureCloudConfig(projectRoot, {
          promptMessage: "输入默认云端服务器地址",
        });

    const result = await publishToCloud({
      projectRoot,
      config,
      cloudConfig,
      hostOverride: options.host,
      message: options.message,
      json: options.json,
      project: options.project,
    });

    if (options.host) {
      // --host 覆盖时不修改 cloud.json（临时发布到其他服务器）
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
      await registerReleaseLink(projectRoot, {
        releaseId: result.releaseId,
        projectId: result.projectId,
        url: result.releaseUrl,
        prototypePaths: result.results.map((r) => r.prototypePath),
        source: "cli-publish",
        publishedAt: new Date().toISOString(),
      }).catch(() => undefined);

      console.log(JSON.stringify(result, null, 2));
      return;
    }

    logger.success(`云端发布成功，releaseId: ${result.releaseId}`);
    logger.info(`变更页面: ${result.changedCount} 个`);
    logger.info(`未变化页面: ${result.unchangedCount} 个`);
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

    await registerReleaseLink(projectRoot, {
      releaseId: result.releaseId,
      projectId: result.projectId,
      url: result.releaseUrl,
      prototypePaths: result.results.map((r) => r.prototypePath),
      source: "cli-publish",
      publishedAt: new Date().toISOString(),
    }).catch(() => {
      logger.warn("注册 release 链接失败，不影响发布结果");
    });

    if (options.open !== false) {
      await import("open").then((m) => m.default(result.releaseUrl).catch(() => undefined));
    }
    return;
  }

  const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
  const outputDir = options.output
    ? path.resolve(process.cwd(), options.output)
    : buildDefaultPublishOutputDir(projectRoot, config.projectName);

  logger.info(`准备导出 publish 产物到：${outputDir}`);

  const result = await publishArtifacts({
    projectRoot,
    prototypesDir,
    outputDir,
    projectName: config.projectName,
  });

  logger.success(`发布产物已生成：${result.outputDir}`);
  logger.info(`原型数量：${result.manifest.entryFiles.length}`);
  logger.info(`协议文件：manifest.json, marks.json`);
}

export function registerPrototypePublish(parent: Command): void {
  parent
    .command("publish")
    .description(COPY.prototypePublishDescription)
    .option("-o, --output <dir>", "输出目录（默认生成到 dist/publish 下）")
    .option("-c, --cloud", "发布到云端服务器")
    .option("-H, --host <url>", "指定云端服务器地址（临时覆盖 cloud.json）")
    .option("-m, --message <message>", "版本说明（云端发布时使用）")
    .option("--json", "输出 JSON 结果")
    .option("-p, --project <idOrSlug>", "指定云端项目 ID 或 slug")
    .option("--no-open", "发布成功后不自动打开结果页")
    .addHelpText("after", `\n${COPY.prototypePublishHelpAfter}`)
    .action(runPrototypePublish);
}

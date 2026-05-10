import open from "open";
import path from "node:path";
import { Command } from "commander";
import { COPY } from "#constants/command-text.js";
import { buildDefaultPublishOutputDir, publishArtifacts } from "#lib/server/publish.js";
import { publishToCloud } from "#lib/cloud/publisher.js";
import { ConfigError } from "#utils/errors.js";
import { ensureCloudConfig, loadCloudConfig, loadConfig, resolveProjectRoot, saveCloudConfig } from "#utils/config.js";
import { logger } from "#utils/logger.js";

export interface PrototypePublishOptions {
  output?: string;
  cloud?: boolean;
  message?: string;
  dryRun?: boolean;
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
    const cloudConfig = await ensureCloudConfig(projectRoot, {
      promptMessage: "输入默认云端服务器地址",
    });
    const result = await publishToCloud({
      projectRoot,
      config,
      cloudConfig,
      message: options.message,
      dryRun: options.dryRun,
      json: options.json,
      project: options.project,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.dryRun) {
      logger.success(`预检完成，releaseId: ${result.releaseId}`);
      logger.info(`查看地址: ${result.releaseUrl}`);
      return;
    }

    logger.success(`云端发布成功，releaseId: ${result.releaseId}`);
    logger.info(`变更页面: ${result.changedCount} 个`);
    logger.info(`未变化页面: ${result.unchangedCount} 个`);
    logger.info(`查看地址: ${result.releaseUrl}`);

    const nextConfig = {
      ...(await loadCloudConfig(projectRoot) ?? cloudConfig),
      projectId: result.projectId,
      lastReleaseId: result.releaseId,
      lastPublishedAt: new Date().toISOString(),
    };
    await saveCloudConfig(nextConfig, projectRoot);

    if (options.open !== false) {
      await open(result.releaseUrl).catch(() => undefined);
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
    .option("-m, --message <message>", "版本说明（云端发布时使用）")
    .option("--dry-run", "仅执行云端预检，不提交发布")
    .option("--json", "输出 JSON 结果")
    .option("-p, --project <idOrSlug>", "指定云端项目 ID 或 slug")
    .option("--no-open", "发布成功后不自动打开结果页")
    .addHelpText("after", `\n${COPY.prototypePublishHelpAfter}`)
    .action(runPrototypePublish);
}

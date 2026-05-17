import { Command } from "commander";
import { COPY } from "#constants/command-text.js";
import { resolveProjectRoot } from "#utils/config.js";
import { logger } from "#utils/logger.js";
import { ConfigError } from "#utils/errors.js";
import {
  loadRegistry,
  registerReleaseLink as saveLink,
  findLinkByProjectAndRelease,
  removeLink as deleteLink,
} from "#lib/links/registry.js";
import { parseReleaseUrl } from "#lib/links/url-parser.js";
import { resolveReleaseFromCloud } from "#lib/links/cloud-resolver.js";

export function registerReleaseLinkList(parent: Command): void {
  const link = parent.command("link").description("管理 release 链接注册表");

  link
    .command("list")
    .description("列出所有已注册的 release 链接")
    .option("--json", "以 JSON 格式输出")
    .action(runLinkList);

  link
    .command("resolve")
    .description("解析 release URL，找到关联的本地原型")
    .argument("<url>", "云端 release URL")
    .option("--json", "以 JSON 格式输出")
    .action(runLinkResolve);

  link
    .command("add")
    .description("手动注册一条 release 链接到指定原型")
    .argument("<prototypePath>", "原型路径（如 login-page）")
    .argument("<url>", "云端 release URL")
    .action(runLinkAdd);

  link
    .command("remove")
    .description("移除一条 release 链接记录")
    .argument("<releaseId>", "release ID")
    .action(runLinkRemove);
}

interface LinkOptions {
  json?: boolean;
}

async function ensureProjectRoot(): Promise<string> {
  const projectRoot = await resolveProjectRoot(process.cwd());
  if (!projectRoot) {
    throw ConfigError.projectNotInitialized();
  }
  return projectRoot;
}

async function runLinkList(options: LinkOptions): Promise<void> {
  const projectRoot = await ensureProjectRoot();
  const registry = await loadRegistry(projectRoot);

  if (options.json) {
    console.log(JSON.stringify(registry.releases, null, 2));
    return;
  }

  if (registry.releases.length === 0) {
    logger.info("暂无已注册的 release 链接");
    return;
  }

  logger.info(`已注册的 release 链接（共 ${registry.releases.length} 条）：`);
  for (const link of registry.releases) {
    const paths = link.prototypePaths.join(", ");
    logger.info(`  [${link.source}] ${link.releaseId}`);
    logger.info(`    URL: ${link.url}`);
    logger.info(`    原型: ${paths}`);
    logger.info(`    时间: ${link.publishedAt}`);
  }
}

async function runLinkResolve(url: string, options: LinkOptions): Promise<void> {
  const projectRoot = await ensureProjectRoot();

  let parsed: ReturnType<typeof parseReleaseUrl>;
  try {
    parsed = parseReleaseUrl(url);
  } catch (e) {
    logger.error((e as Error).message);
    process.exit(1);
  }

  const registry = await loadRegistry(projectRoot);
  const local = findLinkByProjectAndRelease(registry, parsed.projectId, parsed.releaseId);

  if (local) {
    if (options.json) {
      console.log(JSON.stringify(local, null, 2));
      return;
    }
    logger.success("本地查找到匹配的 release 链接：");
    logger.info(`  URL: ${local.url}`);
    logger.info(`  原型: ${local.prototypePaths.join(", ")}`);
    logger.info(`  来源: ${local.source}`);
    return;
  }

  // 本地未命中，从后端拉取
  logger.info("本地未找到匹配记录，尝试从云端获取...");

  try {
    const result = await resolveReleaseFromCloud(
      projectRoot,
      parsed.origin,
      parsed.projectId,
      parsed.releaseId,
      url
    );

    if (options.json) {
      console.log(JSON.stringify(result.link, null, 2));
      return;
    }

    logger.success("从云端获取到 release 信息并已缓存到本地：");
    logger.info(`  URL: ${result.link.url}`);
    logger.info(`  原型: ${result.link.prototypePaths.join(", ")}`);
  } catch (e) {
    logger.error(`从云端获取 release 信息失败：${(e as Error).message}`);
    process.exit(1);
  }
}

async function runLinkAdd(prototypePath: string, url: string): Promise<void> {
  const projectRoot = await ensureProjectRoot();

  let parsed: ReturnType<typeof parseReleaseUrl>;
  try {
    parsed = parseReleaseUrl(url);
  } catch (e) {
    logger.error((e as Error).message);
    process.exit(1);
  }

  await saveLink(projectRoot, {
    releaseId: parsed.releaseId,
    projectId: parsed.projectId,
    url,
    prototypePaths: [prototypePath],
    source: "manual",
    publishedAt: new Date().toISOString(),
  });

  logger.success(`已注册 release 链接：${prototypePath} ← ${url}`);
}

async function runLinkRemove(releaseId: string): Promise<void> {
  const projectRoot = await ensureProjectRoot();

  const removed = await deleteLink(projectRoot, releaseId);
  if (!removed) {
    logger.warn(`未找到 releaseId 为 ${releaseId} 的记录`);
    return;
  }

  logger.success(`已移除 release 链接：${releaseId}`);
}

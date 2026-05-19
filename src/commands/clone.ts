import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { Command } from "commander";
import { COPY } from "#constants/command-text.js";
import { createDefaultConfig } from "#constants/defaults.js";
import { createCloudClient } from "#lib/cloud/client.js";
import type { CloudCloneManifest, CloudProjectSummary, PrdkitCloudConfig } from "#types/index.js";
import { ensureCloudConfig, requireCloudHost, saveCloudConfig, saveConfig, saveHostProjectMeta } from "#utils/config.js";
import { ensureSafeInitTarget } from "#utils/files.js";
import { logger } from "#utils/logger.js";
import { copyScaffoldInto, personalizeReadme } from "#utils/scaffold.js";
import { ensureTemplateRepo } from "#utils/templates.js";

type CloneOptions = {
  version?: string;
  host?: string;
};

export function registerClone(program: Command): void {
  program
    .command("clone")
    .argument("<project-slug-or-id>", "云端项目 slug 或 projectId")
    .argument("[target-dir]", "目标目录，默认使用项目 slug")
    .description(COPY.cloneDescription)
    .option("--version <n>", "指定要克隆的历史版本号")
    .option("--host <url>", "临时指定云端服务器地址")
    .addHelpText("after", `\n${COPY.cloneHelpAfter}`)
    .action(async (projectSlugOrId: string, targetDir: string | undefined, options: CloneOptions) => {
      const versionNumber = normalizeVersionOption(options.version);
      const host = await requireCloudHost(process.cwd(), options.host);
      const client = await createCloudClient(host);
      const auth = await client.ensureValidAuth();
      const project = await resolveCloneProject(client, projectSlugOrId);
      const resolvedTargetDir = path.resolve(process.cwd(), targetDir?.trim() || project.slug);

      if (!existsSync(resolvedTargetDir)) {
        await mkdir(resolvedTargetDir, { recursive: true });
      }
      await ensureSafeInitTarget(resolvedTargetDir);

      const spinner = logger.spinner(`正在从 ${host} 克隆项目 ${project.slug}`).start();

      try {
        spinner.text = "下载云端项目归档";
        const archive = await client.downloadProjectArchive(project.id, versionNumber);

        spinner.text = "初始化本地 prdkit 项目骨架";
        const author = auth.user.name?.trim() || auth.user.email;
        const config = createDefaultConfig(project.name, author, undefined, undefined, project.description ?? undefined);
        await copyScaffoldInto(resolvedTargetDir, config.scaffoldRepo, "main");
        await personalizeReadme(resolvedTargetDir, project.name, author, currentDate());
        await saveConfig(config, resolvedTargetDir);

        spinner.text = "拉取模板仓库";
        await ensureTemplateRepo(config.templateRepo, resolvedTargetDir);

        spinner.text = "还原页面与 marks";
        await extractArchiveToProject(resolvedTargetDir, archive.buffer, archive.manifest);

        spinner.text = "写入云端配置";
        const cloudConfig: PrdkitCloudConfig = {
          version: 1,
          host,
          projectId: project.id,
          projectSlug: project.slug,
          projectName: project.name,
        };
        await saveCloudConfig(cloudConfig, resolvedTargetDir);
        await ensureCloudConfig(resolvedTargetDir, { hostOverride: host, prompt: false, nonInteractive: true });
        await saveHostProjectMeta(host, {
          projectId: project.id,
          projectSlug: project.slug,
          projectName: project.name,
        });

        spinner.succeed(`已克隆项目到 ${resolvedTargetDir}`);
      } catch (error) {
        spinner.fail("克隆项目失败");
        throw error;
      }

      logger.success(`项目目录：${resolvedTargetDir}`);
      logger.info(`后续可执行：cd ${resolvedTargetDir} && prdkit serve`);
    });
}

function normalizeVersionOption(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("版本号必须是大于 0 的整数");
  }
  return parsed;
}

async function resolveCloneProject(
  client: Awaited<ReturnType<typeof createCloudClient>>,
  identifier: string
): Promise<CloudProjectSummary> {
  const normalized = identifier.trim();
  if (!normalized) {
    throw new Error("缺少项目标识");
  }

  const bySlug = await client.resolveProjectBySlug(normalized).catch(() => undefined);
  if (bySlug) {
    return bySlug;
  }

  const byId = await client.getProject(normalized).catch(() => undefined);
  if (byId) {
    return byId;
  }

  throw new Error(`未找到云端项目：${normalized}`);
}

async function extractArchiveToProject(projectRoot: string, zipBuffer: Buffer, manifest: CloudCloneManifest): Promise<void> {
  const prototypesRoot = path.join(projectRoot, "workspace", "prototypes");
  const archiveEntries = unzipSync(new Uint8Array(zipBuffer));
  const archiveMap = new Map(manifest.entries.map((entry) => [entry.archiveDir, entry.prototypePath]));

  await rm(prototypesRoot, { recursive: true, force: true });
  await mkdir(prototypesRoot, { recursive: true });

  for (const [archivePath, content] of Object.entries(archiveEntries)) {
    if (archivePath === ".prdkit-clone-manifest.json") {
      continue;
    }

    const normalizedArchivePath = archivePath.replace(/^\/+/, "");
    if (!normalizedArchivePath) {
      continue;
    }

    const [archiveDir, ...restSegments] = normalizedArchivePath.split("/");
    const prototypePath = archiveMap.get(archiveDir);
    if (!prototypePath || restSegments.length === 0) {
      continue;
    }

    const destinationPath = path.join(prototypesRoot, prototypePath, ...restSegments);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, Buffer.from(content));
  }
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

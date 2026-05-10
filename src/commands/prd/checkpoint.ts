import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { COPY } from "#constants/command-text.js";
import { diffCurrentPrdAgainstLatest, diffPrdCheckpoints } from "#lib/checkpoints/prd/diff.js";
import { restorePrdCheckpoint } from "#lib/checkpoints/prd/restore.js";
import { createPrdCheckpoint, findPrdCheckpointRecord, listPrdCheckpointRecords, readPrdCheckpointData } from "#lib/checkpoints/prd/store.js";
import { resolveProjectRoot } from "#utils/config.js";
import { logger } from "#utils/logger.js";
import { ConfigError } from "#utils/errors.js";
import {
  PrdCheckpointBaseOptions,
  PrdCheckpointCreateOptions,
  PrdCheckpointRestoreOptions,
  resolvePrdCheckTarget,
  outputJson,
  formatPrdCheckpointRecord,
  formatPrdCheckpointSummary,
} from "./common.js";

export function registerPrdCheckpoint(prd: Command): void {
  const prdCheckpoint = prd.command("checkpoint").description(COPY.prdCheckpointDescription);

  prdCheckpoint
    .command("create")
    .argument("[target]", "PRD 标题、文件名或路径，默认为最近修改的一份")
    .description(COPY.prdCheckpointCreateDescription)
    .option("-m, --message <text>", "checkpoint 说明")
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointCreateHelpAfter}`)
    .action(async (target: string | undefined, options: PrdCheckpointCreateOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const resolved = await resolvePrdCheckTarget(projectRoot, target);
      const result = await createPrdCheckpoint({
        projectRoot,
        prdPath: resolved.projectRelativePath,
        kind: "manual",
        message: options.message,
      });

      if (options.json) {
        outputJson(result);
        return;
      }

      if (!result.created) {
        logger.warn(`没有检测到新变更，最近 checkpoint：${result.record.id}`);
        return;
      }

      logger.success(`已创建 PRD checkpoint：${result.record.id}`);
      logger.info(`文档：${resolved.projectRelativePath}`);
    });

  prdCheckpoint
    .command("list")
    .argument("[target]", "PRD 标题、文件名或路径")
    .description(COPY.prdCheckpointListDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointListHelpAfter}`)
    .action(async (target: string | undefined, options: PrdCheckpointBaseOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      let prdPath: string | undefined;
      if (target?.trim()) {
        prdPath = (await resolvePrdCheckTarget(projectRoot, target)).projectRelativePath;
      }

      const records = listPrdCheckpointRecords(projectRoot, prdPath);
      if (options.json) {
        outputJson({ checkpoints: records });
        return;
      }

      if (records.length === 0) {
        logger.warn("未找到任何 PRD checkpoint");
        return;
      }

      console.log(records.map((record, index) => formatPrdCheckpointRecord(record, index)).join("\n"));
      console.log(chalk.dim(`\n共找到 ${records.length} 个 PRD checkpoint`));
    });

  prdCheckpoint
    .command("show")
    .argument("<checkpoint-id>", "checkpoint ID")
    .description(COPY.prdCheckpointShowDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointShowHelpAfter}`)
    .action(async (checkpointId: string, options: PrdCheckpointBaseOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const data = readPrdCheckpointData(projectRoot, checkpointId);
      if (options.json) {
        outputJson(data);
        return;
      }

      console.log(formatPrdCheckpointRecord(data.manifest));
      console.log(`${chalk.dim("title:")} ${data.manifest.title}`);
      console.log(`${chalk.dim("size:")} ${data.document.size} bytes`);
      console.log(`${chalk.dim("lines:")} ${data.document.lineCount}`);
    });

  prdCheckpoint
    .command("diff")
    .argument("<from-id>", "起始 checkpoint ID")
    .argument("<to-id>", "目标 checkpoint ID")
    .description(COPY.prdCheckpointDiffDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointDiffHelpAfter}`)
    .action(async (fromId: string, toId: string, options: PrdCheckpointBaseOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const summary = await diffPrdCheckpoints(projectRoot, fromId, toId);
      if (options.json) {
        outputJson(summary);
        return;
      }

      console.log(formatPrdCheckpointSummary(summary));
    });

  prdCheckpoint
    .command("status")
    .argument("[target]", "PRD 标题、文件名或路径，默认为最近修改的一份")
    .description(COPY.prdCheckpointStatusDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointStatusHelpAfter}`)
    .action(async (target: string | undefined, options: PrdCheckpointBaseOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const resolved = await resolvePrdCheckTarget(projectRoot, target);
      const status = await diffCurrentPrdAgainstLatest(projectRoot, resolved.projectRelativePath);
      if (options.json) {
        outputJson(status);
        return;
      }

      logger.info(`文档：${resolved.projectRelativePath}`);
      if (status.latestCheckpointId) {
        logger.info(`最近 checkpoint：${status.latestCheckpointId}`);
      }
      console.log(formatPrdCheckpointSummary(status.summary));
    });

  prdCheckpoint
    .command("restore")
    .argument("<checkpoint-id>", "checkpoint ID")
    .description(COPY.prdCheckpointRestoreDescription)
    .option("-f, --force", "存在未归档变更时先创建 pre-restore checkpoint 再恢复")
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckpointRestoreHelpAfter}`)
    .action(async (checkpointId: string, options: PrdCheckpointRestoreOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const record = findPrdCheckpointRecord(projectRoot, checkpointId);
      if (!record) {
        throw new Error(`未找到 PRD checkpoint：${checkpointId}`);
      }

      const result = await restorePrdCheckpoint({
        projectRoot,
        checkpointId,
        force: options.force,
      });

      if (options.json) {
        outputJson(result);
        return;
      }

      logger.success(`已恢复到 PRD checkpoint：${checkpointId}`);
      logger.info(`文档：${record.prdPath}`);
      if (result.preRestore) {
        logger.info(`已创建 pre-restore checkpoint：${result.preRestore.id}`);
      }
    });
}

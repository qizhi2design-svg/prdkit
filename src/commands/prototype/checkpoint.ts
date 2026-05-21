import { Command } from "commander";
import chalk from "chalk";
import open from "open";
import { COPY } from "#constants/command-text.js";
import { flattenPrototypes, scanPrototypes } from "#lib/server/scanner.js";
import {
  diffCheckpoints,
  diffCurrentAgainstLatest,
  diffProjectAgainstLatest,
} from "#lib/checkpoints/prototype/diff.js";
import { materializeCheckpointPreview } from "#lib/checkpoints/prototype/preview.js";
import { pruneAutoCheckpoints } from "#lib/checkpoints/prototype/retention.js";
import { restoreCheckpoint } from "#lib/checkpoints/prototype/restore.js";
import {
  createCheckpointBatch,
  endCheckpointSession,
  getCheckpointSession,
  getLatestCheckpointRecord,
  listCheckpointRecords,
  readCheckpointData,
  startCheckpointSession,
} from "#lib/checkpoints/prototype/store.js";
import { collectPrototypeSnapshot } from "#lib/checkpoints/prototype/snapshot.js";
import { logger } from "#utils/logger.js";
import {
  CheckpointBaseOptions,
  CreateOptions,
  RestoreOptions,
  SessionStartOptions,
  resolveCheckpointContext,
  outputJson,
  formatRecord,
  formatSummary,
  printPathList,
} from "./common.js";

export function registerPrototypeCheckpoint(prototype: Command): void {
  const checkpoint = prototype.command("checkpoint").description(COPY.checkpointDescription);

  checkpoint
    .command("preview")
    .argument("<checkpoint-id>", "checkpoint ID")
    .description(COPY.checkpointPreviewDescription)
    .option("-o, --open", "生成后直接打开 index.html")
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointPreviewHelpAfter}`)
    .action(async (checkpointId: string, options: { open?: boolean; json?: boolean }) => {
      const { projectRoot } = await resolveCheckpointContext();
      const result = await materializeCheckpointPreview(projectRoot, checkpointId);

      if (options.json) {
        outputJson(result);
        return;
      }

      logger.success(`已生成 checkpoint 预览目录：${result.previewDir}`);
      logger.info(`入口文件：${result.entryFilePath}`);
      if (options.open) {
        await open(result.entryFilePath);
      }
    });

  checkpoint
    .command("create")
    .description(COPY.checkpointCreateDescription)
    .option("-m, --message <text>", "checkpoint 说明")
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointCreateHelpAfter}`)
    .action(async (options: CreateOptions) => {
      const { projectRoot, prototypesDir } = await resolveCheckpointContext();
      const prototypePaths = flattenPrototypes(scanPrototypes(prototypesDir));
      const diff = diffProjectAgainstLatest(projectRoot, prototypesDir, prototypePaths);
      if (!diff.hasChanges) {
        if (options.json) {
          outputJson({
            created: false,
            sessionId: null,
            createdRecords: [],
            duplicateRecords: [],
            skippedPrototypePaths: [],
            changedPrototypePaths: [],
          });
          return;
        }

        logger.warn("没有检测到整套页面的新变更");
        return;
      }

      const result = await createCheckpointBatch({
        projectRoot,
        prototypesDir,
        prototypePaths,
        kind: "manual",
        message: options.message || "更新版本",
        allowDuplicate: true,
      });

      if (options.json) {
        outputJson({
          ...result,
          changedPrototypePaths: diff.changedPrototypePaths,
        });
        return;
      }

      logger.success(`已创建整套页面版本，涉及 ${result.createdRecords.length} 个页面`);
      if (result.skippedPrototypePaths.length > 0) {
        logger.warn(`以下页面保存失败：${result.skippedPrototypePaths.join(", ")}`);
      }
    });

  const session = checkpoint.command("session").description(COPY.checkpointSessionDescription);

  session
    .command("start")
    .description(COPY.checkpointSessionStartDescription)
    .option("-n, --name <text>", "session 名称")
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointSessionStartHelpAfter}`)
    .action(async (options: SessionStartOptions) => {
      const { projectRoot } = await resolveCheckpointContext();
      const result = await startCheckpointSession(projectRoot, options.name);

      if (options.json) {
        outputJson(result);
        return;
      }

      logger.success(`已启动 session：${result.id}`);
      if (result.name) {
        logger.info(`名称：${result.name}`);
      }
    });

  session
    .command("status")
    .description(COPY.checkpointSessionStatusDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointSessionStatusHelpAfter}`)
    .action(async (options: CheckpointBaseOptions) => {
      const { projectRoot } = await resolveCheckpointContext();
      const current = getCheckpointSession(projectRoot);

      if (options.json) {
        outputJson({ session: current ?? null });
        return;
      }

      if (!current) {
        logger.warn("当前没有进行中的 session");
        return;
      }

      console.log(`${chalk.bold(current.id)} ${chalk.green("[active]")}`);
      if (current.name) {
        console.log(`${chalk.dim("name:")} ${current.name}`);
      }
      console.log(`${chalk.dim("startedAt:")} ${current.startedAt}`);
      console.log(`${chalk.dim("updatedAt:")} ${current.updatedAt}`);
    });

  session
    .command("end")
    .description(COPY.checkpointSessionEndDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointSessionEndHelpAfter}`)
    .action(async (options: CheckpointBaseOptions) => {
      const { projectRoot } = await resolveCheckpointContext();
      const result = await endCheckpointSession(projectRoot);

      if (options.json) {
        outputJson({ session: result ?? null });
        return;
      }

      if (!result) {
        logger.warn("当前没有进行中的 session");
        return;
      }

      logger.success(`已结束 session：${result.id}`);
    });

  checkpoint
    .command("list")
    .argument("[prototype-path]", "原型路径")
    .description(COPY.checkpointListDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointListHelpAfter}`)
    .action(async (prototypePath: string | undefined, options: CheckpointBaseOptions) => {
      const { projectRoot } = await resolveCheckpointContext();
      const records = listCheckpointRecords(projectRoot, prototypePath);

      if (options.json) {
        outputJson({ checkpoints: records });
        return;
      }

      if (records.length === 0) {
        logger.warn("未找到任何 checkpoint");
        return;
      }

      console.log(records.map((record, index) => formatRecord(record, index)).join("\n"));
      console.log(chalk.dim(`\n共找到 ${records.length} 个 checkpoint`));
    });

  checkpoint
    .command("show")
    .argument("<checkpoint-id>", "checkpoint ID")
    .description(COPY.checkpointShowDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointShowHelpAfter}`)
    .action(async (checkpointId: string, options: CheckpointBaseOptions) => {
      const { projectRoot } = await resolveCheckpointContext();
      const data = readCheckpointData(projectRoot, checkpointId);

      if (options.json) {
        outputJson(data);
        return;
      }

      console.log(formatRecord(data.manifest));
      console.log(`${chalk.dim("createdAt:")} ${data.manifest.createdAt}`);
      console.log(`${chalk.dim("files:")} ${data.files.length}`);
      console.log(`${chalk.dim("marks:")} ${data.marks.length}`);
    });

  checkpoint
    .command("diff")
    .argument("<from-id>", "起始 checkpoint ID")
    .argument("<to-id>", "目标 checkpoint ID")
    .description(COPY.checkpointDiffDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointDiffHelpAfter}`)
    .action(async (fromId: string, toId: string, options: CheckpointBaseOptions) => {
      const { projectRoot } = await resolveCheckpointContext();
      const summary = diffCheckpoints(projectRoot, fromId, toId);

      if (options.json) {
        outputJson(summary);
        return;
      }

      console.log(formatSummary(summary));
      printPathList("新增文件", summary.addedFiles);
      printPathList("修改文件", summary.modifiedFiles);
      printPathList("删除文件", summary.deletedFiles);
      printPathList("新增标记", summary.markAdded);
      printPathList("更新标记", summary.markUpdated);
      printPathList("删除标记", summary.markDeleted);
    });

  checkpoint
    .command("restore")
    .argument("<checkpoint-id>", "checkpoint ID")
    .description(COPY.checkpointRestoreDescription)
    .option("-f, --force", "存在未归档变更时先创建还原前备份 checkpoint 再恢复")
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointRestoreHelpAfter}`)
    .action(async (checkpointId: string, options: RestoreOptions) => {
      const { projectRoot, prototypesDir } = await resolveCheckpointContext();
      const result = await restoreCheckpoint({
        projectRoot,
        prototypesDir,
        checkpointId,
        force: options.force,
      });

      if (options.json) {
        outputJson(result);
        return;
      }

      logger.success(`已恢复到 checkpoint：${checkpointId}`);
      logger.info(`页面数：${result.restoredPrototypePaths.length}`);
      logger.info(`页面：${result.restoredPrototypePaths.join(", ")}`);
      logger.info("已创建还原前备份");
    });

  checkpoint
    .command("status")
    .argument("[prototype-path]", "原型路径")
    .description(COPY.checkpointStatusDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointStatusHelpAfter}`)
    .action(async (prototypePath: string | undefined, options: CheckpointBaseOptions) => {
      const { projectRoot, prototypesDir } = await resolveCheckpointContext();
      const targets = prototypePath
        ? [prototypePath]
        : flattenPrototypes(scanPrototypes(prototypesDir));

      const result = targets.map((targetPath) => {
        const latest = getLatestCheckpointRecord(projectRoot, targetPath);
        const snapshot = collectPrototypeSnapshot(prototypesDir, targetPath);
        const diff = diffCurrentAgainstLatest(projectRoot, prototypesDir, targetPath);
        return {
          prototypePath: targetPath,
          latestCheckpointId: latest?.id,
          contentHash: snapshot.contentHash,
          hasChanges: diff.hasChanges,
          summary: diff.summary,
        };
      });

      if (options.json) {
        outputJson({ checkpoints: result });
        return;
      }

      for (const item of result) {
        console.log(`${chalk.bold(item.prototypePath)} ${item.hasChanges ? chalk.yellow("dirty") : chalk.green("clean")}`);
        if (item.latestCheckpointId) {
          console.log(`  ${chalk.dim("latest:")} ${item.latestCheckpointId}`);
        } else {
          console.log(`  ${chalk.dim("latest:")} none`);
        }
        console.log(`  ${chalk.dim("files:")} +${item.summary.addedFiles.length} ~${item.summary.modifiedFiles.length} -${item.summary.deletedFiles.length}`);
        console.log(`  ${chalk.dim("marks:")} +${item.summary.markAdded.length} ~${item.summary.markUpdated.length} -${item.summary.markDeleted.length}`);
      }
    });

  checkpoint
    .command("prune")
    .argument("[prototype-path]", "原型路径")
    .description(COPY.checkpointPruneDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointPruneHelpAfter}`)
    .action(async (prototypePath: string | undefined, options: CheckpointBaseOptions) => {
      const { projectRoot } = await resolveCheckpointContext();
      const removed = await pruneAutoCheckpoints(projectRoot, prototypePath, 0);
      if (options.json) {
        outputJson({ removed });
        return;
      }

      if (removed.length === 0) {
        logger.warn("没有需要清理的自动 checkpoint");
        return;
      }

      logger.success(`已清理 ${removed.length} 个自动 checkpoint`);
    });
}

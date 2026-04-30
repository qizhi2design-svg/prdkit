import { Command } from "commander";
import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import open from "open";
import { COPY } from "../command-text.js";
import { resolveProjectRoot } from "../config.js";
import { fail, info, success, warn } from "../ui.js";
import {
  diffCheckpoints,
  diffCurrentAgainstLatest
} from "../prototype/checkpoint/diff.js";
import { materializeCheckpointPreview } from "../prototype/checkpoint/preview.js";
import { pruneAutoCheckpoints } from "../prototype/checkpoint/retention.js";
import { restoreCheckpoint } from "../prototype/checkpoint/restore.js";
import {
  createCheckpoint,
  endCheckpointSession,
  findCheckpointRecord,
  getCheckpointSession,
  getLatestCheckpointRecord,
  listCheckpointRecords,
  readCheckpointData,
  startCheckpointSession
} from "../prototype/checkpoint/store.js";
import { collectPrototypeSnapshot } from "../prototype/checkpoint/snapshot.js";
import { flattenPrototypes, scanPrototypes } from "../prototype/server/scanner.js";
import type { CheckpointDiffSummary, CheckpointRecord } from "../prototype/checkpoint/types.js";

interface CheckpointBaseOptions {
  json?: boolean;
}

interface CreateOptions extends CheckpointBaseOptions {
  message?: string;
}

interface RestoreOptions extends CheckpointBaseOptions {
  force?: boolean;
}

interface SessionStartOptions extends CheckpointBaseOptions {
  name?: string;
}

function outputJson(value: unknown): void {
  console.log(`${JSON.stringify(value, null, 2)}\n`);
}

async function resolveCheckpointContext(): Promise<{ projectRoot: string; prototypesDir: string }> {
  const projectRoot = await resolveProjectRoot(process.cwd());
  if (!projectRoot) {
    throw new Error("未找到 .prdkit/config.json，请先运行 prdkit init 初始化项目");
  }

  const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
  if (!existsSync(prototypesDir)) {
    throw new Error("未找到 workspace/prototypes 目录");
  }

  return { projectRoot, prototypesDir };
}

function ensurePrototypeExists(prototypesDir: string, prototypePath: string): void {
  const target = path.join(prototypesDir, prototypePath);
  if (!existsSync(target)) {
    throw new Error(`原型 "${prototypePath}" 不存在`);
  }
}

function formatRecord(record: CheckpointRecord, index?: number): string {
  const prefix = index === undefined ? "" : `${chalk.cyan(`${index + 1}.`)} `;
  const message = record.message ? ` ${chalk.gray(`- ${record.message}`)}` : "";
  return `${prefix}${chalk.bold(record.id)} ${chalk.yellow(`[${record.kind}]`)} ${chalk.dim(record.prototypePath)}${message}`;
}

function formatSummary(summary: CheckpointDiffSummary): string {
  const lines = [
    `${chalk.dim("from:")} ${summary.fromCheckpointId}`,
    `${chalk.dim("to:")} ${summary.toCheckpointId}`,
    `${chalk.dim("files +")} ${summary.addedFiles.length}`,
    `${chalk.dim("files ~")} ${summary.modifiedFiles.length}`,
    `${chalk.dim("files -")} ${summary.deletedFiles.length}`,
    `${chalk.dim("marks +")} ${summary.markAdded.length}`,
    `${chalk.dim("marks ~")} ${summary.markUpdated.length}`,
    `${chalk.dim("marks -")} ${summary.markDeleted.length}`
  ];
  return lines.join("\n");
}

function printPathList(label: string, values: string[]): void {
  if (values.length === 0) return;
  console.log(`${chalk.bold(label)} (${values.length})`);
  for (const value of values) {
    console.log(`  - ${value}`);
  }
}

export function registerCheckpoint(program: Command): void {
  const checkpoint = program.command("checkpoint").description(COPY.checkpointDescription);

  checkpoint
    .command("preview")
    .argument("<checkpoint-id>", "checkpoint ID")
    .description(COPY.checkpointPreviewDescription)
    .option("--open", "生成后直接打开 index.html")
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointPreviewHelpAfter}`)
    .action(async (checkpointId: string, options: { open?: boolean; json?: boolean }) => {
      try {
        const { projectRoot } = await resolveCheckpointContext();
        const result = await materializeCheckpointPreview(projectRoot, checkpointId);

        if (options.json) {
          outputJson(result);
          return;
        }

        success(`已生成 checkpoint 预览目录：${result.previewDir}`);
        info(`入口文件：${result.entryFilePath}`);
        if (options.open) {
          await open(result.entryFilePath);
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  checkpoint
    .command("create")
    .argument("<prototype-path>", "原型路径，例如 dashboard 或 foo/bar")
    .description(COPY.checkpointCreateDescription)
    .option("--message <text>", "checkpoint 说明")
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointCreateHelpAfter}`)
    .action(async (prototypePath: string, options: CreateOptions) => {
      try {
        const { projectRoot, prototypesDir } = await resolveCheckpointContext();
        ensurePrototypeExists(prototypesDir, prototypePath);
        const result = await createCheckpoint({
          projectRoot,
          prototypesDir,
          prototypePath,
          kind: "manual",
          message: options.message
        });

        if (options.json) {
          outputJson(result);
          return;
        }

        if (!result.created) {
          warn(`没有检测到新变更，最近 checkpoint：${result.record.id}`);
          return;
        }

        success(`已创建 checkpoint：${result.record.id}`);
        info(`原型：${prototypePath}`);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  const session = checkpoint.command("session").description(COPY.checkpointSessionDescription);

  session
    .command("start")
    .description(COPY.checkpointSessionStartDescription)
    .option("--name <text>", "session 名称")
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointSessionStartHelpAfter}`)
    .action(async (options: SessionStartOptions) => {
      try {
        const { projectRoot } = await resolveCheckpointContext();
        const result = await startCheckpointSession(projectRoot, options.name);

        if (options.json) {
          outputJson(result);
          return;
        }

        success(`已启动 session：${result.id}`);
        if (result.name) {
          info(`名称：${result.name}`);
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  session
    .command("status")
    .description(COPY.checkpointSessionStatusDescription)
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointSessionStatusHelpAfter}`)
    .action(async (options: CheckpointBaseOptions) => {
      try {
        const { projectRoot } = await resolveCheckpointContext();
        const current = getCheckpointSession(projectRoot);

        if (options.json) {
          outputJson({ session: current ?? null });
          return;
        }

        if (!current) {
          warn("当前没有进行中的 session");
          return;
        }

        console.log(`${chalk.bold(current.id)} ${chalk.green("[active]")}`);
        if (current.name) {
          console.log(`${chalk.dim("name:")} ${current.name}`);
        }
        console.log(`${chalk.dim("startedAt:")} ${current.startedAt}`);
        console.log(`${chalk.dim("updatedAt:")} ${current.updatedAt}`);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  session
    .command("end")
    .description(COPY.checkpointSessionEndDescription)
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointSessionEndHelpAfter}`)
    .action(async (options: CheckpointBaseOptions) => {
      try {
        const { projectRoot } = await resolveCheckpointContext();
        const result = await endCheckpointSession(projectRoot);

        if (options.json) {
          outputJson({ session: result ?? null });
          return;
        }

        if (!result) {
          warn("当前没有进行中的 session");
          return;
        }

        success(`已结束 session：${result.id}`);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  checkpoint
    .command("list")
    .argument("[prototype-path]", "原型路径")
    .description(COPY.checkpointListDescription)
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointListHelpAfter}`)
    .action(async (prototypePath: string | undefined, options: CheckpointBaseOptions) => {
      try {
        const { projectRoot } = await resolveCheckpointContext();
        const records = listCheckpointRecords(projectRoot, prototypePath);

        if (options.json) {
          outputJson({ checkpoints: records });
          return;
        }

        if (records.length === 0) {
          warn("未找到任何 checkpoint");
          return;
        }

        console.log(records.map((record, index) => formatRecord(record, index)).join("\n"));
        console.log(chalk.dim(`\n共找到 ${records.length} 个 checkpoint`));
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  checkpoint
    .command("show")
    .argument("<checkpoint-id>", "checkpoint ID")
    .description(COPY.checkpointShowDescription)
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointShowHelpAfter}`)
    .action(async (checkpointId: string, options: CheckpointBaseOptions) => {
      try {
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
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  checkpoint
    .command("diff")
    .argument("<from-id>", "起始 checkpoint ID")
    .argument("<to-id>", "目标 checkpoint ID")
    .description(COPY.checkpointDiffDescription)
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointDiffHelpAfter}`)
    .action(async (fromId: string, toId: string, options: CheckpointBaseOptions) => {
      try {
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
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  checkpoint
    .command("restore")
    .argument("<checkpoint-id>", "checkpoint ID")
    .description(COPY.checkpointRestoreDescription)
    .option("--force", "存在未归档变更时先创建 pre-restore checkpoint 再恢复")
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointRestoreHelpAfter}`)
    .action(async (checkpointId: string, options: RestoreOptions) => {
      try {
        const { projectRoot, prototypesDir } = await resolveCheckpointContext();
        const result = await restoreCheckpoint({
          projectRoot,
          prototypesDir,
          checkpointId,
          force: options.force
        });

        if (options.json) {
          outputJson(result);
          return;
        }

        success(`已恢复到 checkpoint：${checkpointId}`);
        info(`原型：${result.target.prototypePath}`);
        info(`pre-restore：${result.preRestore.id}`);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  checkpoint
    .command("status")
    .argument("[prototype-path]", "原型路径")
    .description(COPY.checkpointStatusDescription)
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointStatusHelpAfter}`)
    .action(async (prototypePath: string | undefined, options: CheckpointBaseOptions) => {
      try {
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
            summary: diff.summary
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
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  checkpoint
    .command("prune")
    .argument("[prototype-path]", "原型路径")
    .description(COPY.checkpointPruneDescription)
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointPruneHelpAfter}`)
    .action(async (prototypePath: string | undefined, options: CheckpointBaseOptions) => {
      try {
        const { projectRoot } = await resolveCheckpointContext();
        const removed = await pruneAutoCheckpoints(projectRoot, prototypePath, 0);
        if (options.json) {
          outputJson({ removed });
          return;
        }

        if (removed.length === 0) {
          warn("没有需要清理的自动 checkpoint");
          return;
        }

        success(`已清理 ${removed.length} 个自动 checkpoint`);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

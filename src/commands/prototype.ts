import { Command } from "commander";
import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import open from "open";
import { COPY } from "#constants/command-text.js";
import { resolveProjectRoot } from "#utils/config.js";
import { flattenPrototypes, scanPrototypes } from "#lib/server/scanner.js";
import { logger } from "#utils/logger.js";
import { ConfigError, FileSystemError, PrototypeError, ValidationError } from "#utils/errors.js";
import { runCreateTemplate, type CreateTemplateOptions } from "#core/create-command.js";
import {
  diffCheckpoints,
  diffCurrentAgainstLatest
} from "#lib/checkpoints/prototype/diff.js";
import { materializeCheckpointPreview } from "#lib/checkpoints/prototype/preview.js";
import { pruneAutoCheckpoints } from "#lib/checkpoints/prototype/retention.js";
import { restoreCheckpoint } from "#lib/checkpoints/prototype/restore.js";
import {
  createCheckpoint,
  endCheckpointSession,
  getCheckpointSession,
  getLatestCheckpointRecord,
  listCheckpointRecords,
  readCheckpointData,
  startCheckpointSession
} from "#lib/checkpoints/prototype/store.js";
import { collectPrototypeSnapshot } from "#lib/checkpoints/prototype/snapshot.js";
import type { CheckpointDiffSummary, CheckpointRecord } from "#lib/checkpoints/prototype/types.js";

interface PrototypeListOptions {
  json?: boolean;
}

interface PrototypeCreateOptions extends CreateTemplateOptions {
  template?: string;
}

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

const prototypeTemplateAliases: Record<string, string> = {
  default: "prototype",
  web: "prototype",
  desktop: "prototype",
  mobile: "prototype-mobile",
  admin: "prototype-admin",
  "pc-admin": "prototype-admin",
  "prototype-mobile": "prototype-mobile",
  "prototype-admin": "prototype-admin",
  prototype: "prototype"
};

function resolvePrototypeTemplate(template?: string): string {
  if (!template?.trim()) {
    return "prototype";
  }

  const normalized = template.trim().toLowerCase();
  const resolved = prototypeTemplateAliases[normalized];
  if (!resolved) {
    throw ValidationError.invalidInput(
      "template",
      "不支持的原型模板，请使用 web、mobile、admin、prototype-mobile 或 prototype-admin"
    );
  }
  return resolved;
}

function formatPrototypeList(prototypes: string[]): string {
  if (prototypes.length === 0) {
    return chalk.yellow("未找到任何原型");
  }

  return prototypes.map((name, index) => `${chalk.cyan(`${index + 1}.`)} ${name}`).join("\n");
}

function outputJson(value: unknown): void {
  console.log(`${JSON.stringify(value, null, 2)}\n`);
}

async function resolveCheckpointContext(): Promise<{ projectRoot: string; prototypesDir: string }> {
  const projectRoot = await resolveProjectRoot(process.cwd());
  if (!projectRoot) {
    throw ConfigError.projectNotInitialized();
  }

  const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
  if (!existsSync(prototypesDir)) {
    throw FileSystemError.directoryNotFound(prototypesDir);
  }

  return { projectRoot, prototypesDir };
}

function ensurePrototypeExists(prototypesDir: string, prototypePath: string): void {
  const target = path.join(prototypesDir, prototypePath);
  if (!existsSync(target)) {
    throw PrototypeError.notFound(prototypePath);
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

export function registerPrototype(program: Command): void {
  const prototype = program.command("prototype").description(COPY.prototypeDescription);

  prototype
    .command("create")
    .argument("[title]", "原型标题")
    .description(COPY.prototypeCreateDescription)
    .option("-t, --template <type>", "原型模板类型：web | mobile | admin")
    .option("-o, --output <file-or-dir>", "输出文件路径或目录")
    .option("-d, --dir <dir>", "输出目录")
    .option("-n, --name <project-name>", "项目名称")
    .option("-a, --author <author>", "作者")
    .option("-D, --date <yyyy-mm-dd>", "文档日期")
    .option("--non-interactive", "禁用交互式输入")
    .addHelpText("after", `\n${COPY.prototypeCreateHelpAfter}`)
    .action(async (titleArg: string | undefined, options: PrototypeCreateOptions) => {
      const templateId = resolvePrototypeTemplate(options.template);
      await runCreateTemplate(titleArg, { ...options, template: templateId }, templateId);
    });

  prototype
    .command("list")
    .description(COPY.prototypeListDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prototypeListHelpAfter}`)
    .action(async (options: PrototypeListOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
      const tree = scanPrototypes(prototypesDir);
      const prototypeList = flattenPrototypes(tree);

      if (options.json) {
        console.log(`${JSON.stringify({ prototypes: prototypeList }, null, 2)}\n`);
        return;
      }

      console.log(formatPrototypeList(prototypeList));
      console.log(chalk.dim(`\n共找到 ${prototypeList.length} 个原型`));
    });

  // Checkpoint 子命令
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
    .argument("<prototype-path>", "原型路径，例如 dashboard 或 foo/bar")
    .description(COPY.checkpointCreateDescription)
    .option("-m, --message <text>", "checkpoint 说明")
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointCreateHelpAfter}`)
    .action(async (prototypePath: string, options: CreateOptions) => {
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
        logger.warn(`没有检测到新变更，最近 checkpoint：${result.record.id}`);
        return;
      }

      logger.success(`已创建 checkpoint：${result.record.id}`);
      logger.info(`原型：${prototypePath}`);
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
    .option("-f, --force", "存在未归档变更时先创建 pre-restore checkpoint 再恢复")
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.checkpointRestoreHelpAfter}`)
    .action(async (checkpointId: string, options: RestoreOptions) => {
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

      logger.success(`已恢复到 checkpoint：${checkpointId}`);
      logger.info(`原型：${result.target.prototypePath}`);
      logger.info(`pre-restore：${result.preRestore.id}`);
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

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { diffCheckpoints, diffProjectAgainstLatest } from "./diff.js";
import {
  appendCheckpointEvent,
  createCheckpointBatch,
  listCheckpointGroupRecords,
  readBlob,
  readCheckpointData,
  writeRestoreSuppression
} from "./store.js";
import type { CheckpointDiffSummary, CheckpointRecord } from "./types.js";
import { flattenPrototypes, scanPrototypes } from "../../server/scanner.js";

export interface RestoreCheckpointOptions {
  projectRoot: string;
  prototypesDir: string;
  checkpointId: string;
  force?: boolean;
}

export interface RestoreCheckpointResult {
  target: CheckpointRecord;
  preRestore: CheckpointRecord;
  summary: CheckpointDiffSummary;
  restoredPrototypePaths: string[];
}

export async function restoreCheckpoint(
  options: RestoreCheckpointOptions
): Promise<RestoreCheckpointResult> {
  const { projectRoot, prototypesDir, checkpointId, force = false } = options;
  const targetRecords = listCheckpointGroupRecords(projectRoot, checkpointId);
  if (targetRecords.length === 0) {
    throw new Error(`未找到 checkpoint：${checkpointId}`);
  }

  const targetCheckpoint = targetRecords.find((record) => record.id === checkpointId) ?? targetRecords[0];
  const currentPrototypePaths = flattenPrototypes(scanPrototypes(prototypesDir));
  const targetPrototypePaths = targetRecords.map((record) => record.prototypePath);
  const targetPrototypePathSet = new Set(targetPrototypePaths);
  const restoreScopePaths = Array.from(new Set([...currentPrototypePaths, ...targetPrototypePaths]));
  const status = diffProjectAgainstLatest(projectRoot, prototypesDir, currentPrototypePaths);

  if (status.hasChanges && !force) {
    throw new Error("当前原型存在未归档变更，请先创建 checkpoint 或使用 --force");
  }

  const preRestoreBatch = currentPrototypePaths.length > 0
    ? await createCheckpointBatch({
      projectRoot,
      prototypesDir,
      prototypePaths: currentPrototypePaths,
      kind: "pre-restore",
      message: `还原前备份 ${checkpointId}`,
      allowDuplicate: true,
    })
    : null;

  if (preRestoreBatch && preRestoreBatch.skippedPrototypePaths.length > 0) {
    throw new Error(`创建还原前备份失败：${preRestoreBatch.skippedPrototypePaths.join(", ")}`);
  }

  const preRestoreRecord = preRestoreBatch?.createdRecords.find((record) => record.prototypePath === targetCheckpoint.prototypePath)
    ?? preRestoreBatch?.createdRecords[0];

  if (!preRestoreRecord) {
    throw new Error("创建还原前备份失败");
  }

  const targetDataList = targetRecords.map((record) => ({
    record,
    data: readCheckpointData(projectRoot, record.id),
  }));
  const summary = diffCheckpoints(projectRoot, preRestoreRecord.id, targetCheckpoint.id);

  for (const prototypePath of restoreScopePaths) {
    await writeRestoreSuppression(projectRoot, prototypePath);
    if (!targetPrototypePathSet.has(prototypePath)) {
      await rm(path.join(prototypesDir, prototypePath), { recursive: true, force: true });
    }
  }

  for (const { record, data } of targetDataList) {
    const prototypeDir = path.join(prototypesDir, record.prototypePath);
    await rm(prototypeDir, { recursive: true, force: true });
    await mkdir(prototypeDir, { recursive: true });

    for (const file of data.files) {
      const outputPath = path.join(prototypeDir, file.relativePath);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, await readBlob(projectRoot, file.blobHash));
    }

    for (const mark of data.marks) {
      const outputPath = path.join(prototypeDir, mark.relativePath);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, await readBlob(projectRoot, mark.blobHash));
    }
  }

  await appendCheckpointEvent(projectRoot, {
    type: "restore",
    timestamp: new Date().toISOString(),
    prototypePath: targetCheckpoint.prototypePath,
    checkpointId,
    detail: {
      fromCheckpointId: preRestoreRecord.id,
      toCheckpointId: checkpointId,
      force,
      restoredPrototypePaths: targetPrototypePaths,
      affectedFiles: {
        added: summary.addedFiles,
        modified: summary.modifiedFiles,
        deleted: summary.deletedFiles
      },
      marks: {
        added: summary.markAdded,
        updated: summary.markUpdated,
        deleted: summary.markDeleted
      }
    }
  });

  return {
    target: targetCheckpoint,
    preRestore: preRestoreRecord,
    summary,
    restoredPrototypePaths: targetPrototypePaths,
  };
}

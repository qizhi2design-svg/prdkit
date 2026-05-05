import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { diffCheckpoints, diffCurrentAgainstLatest } from "./diff.js";
import {
  appendCheckpointEvent,
  createCheckpoint,
  readBlob,
  readCheckpointData,
  writeRestoreSuppression
} from "./store.js";
import type { CheckpointDiffSummary, CheckpointRecord } from "./types.js";

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
}

export async function restoreCheckpoint(
  options: RestoreCheckpointOptions
): Promise<RestoreCheckpointResult> {
  const { projectRoot, prototypesDir, checkpointId, force = false } = options;
  const checkpoint = readCheckpointData(projectRoot, checkpointId);
  const prototypePath = checkpoint.manifest.prototypePath;
  const status = diffCurrentAgainstLatest(projectRoot, prototypesDir, prototypePath);

  if (status.hasChanges && !force) {
    throw new Error("当前原型存在未归档变更，请先创建 checkpoint 或使用 --force");
  }

  const preRestore = await createCheckpoint({
    projectRoot,
    prototypesDir,
    prototypePath,
    kind: "pre-restore",
    message: `Before restoring ${checkpointId}`,
    allowDuplicate: true
  });

  const summary = diffCheckpoints(projectRoot, preRestore.record.id, checkpointId);
  const prototypeDir = path.join(prototypesDir, prototypePath);

  await writeRestoreSuppression(projectRoot, prototypePath);
  await rm(prototypeDir, { recursive: true, force: true });
  await mkdir(prototypeDir, { recursive: true });

  for (const file of checkpoint.files) {
    const outputPath = path.join(prototypeDir, file.relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await readBlob(projectRoot, file.blobHash));
  }

  for (const mark of checkpoint.marks) {
    const outputPath = path.join(prototypeDir, mark.relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await readBlob(projectRoot, mark.blobHash));
  }

  await appendCheckpointEvent(projectRoot, {
    type: "restore",
    timestamp: new Date().toISOString(),
    prototypePath,
    checkpointId,
    detail: {
      fromCheckpointId: preRestore.record.id,
      toCheckpointId: checkpointId,
      force,
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
    target: checkpoint.manifest,
    preRestore: preRestore.record,
    summary
  };
}

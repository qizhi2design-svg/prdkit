import fs from "node:fs";
import path from "node:path";
import { createPrdCheckpoint } from "./store.js";
import { diffCurrentPrdAgainstLatest } from "./diff.js";
import { appendPrdCheckpointEvent, readPrdBlob, readPrdCheckpointData } from "./store.js";
import type { RestorePrdCheckpointResult } from "./types.js";

interface RestorePrdCheckpointOptions {
  projectRoot: string;
  checkpointId: string;
  force?: boolean;
}

export async function restorePrdCheckpoint(
  options: RestorePrdCheckpointOptions
): Promise<RestorePrdCheckpointResult> {
  const { projectRoot, checkpointId, force = false } = options;
  const checkpoint = readPrdCheckpointData(projectRoot, checkpointId);
  const prdPath = checkpoint.manifest.prdPath;
  const status = await diffCurrentPrdAgainstLatest(projectRoot, prdPath);

  if (status.hasChanges && !force) {
    throw new Error("当前 PRD 存在未归档变更，请先创建 checkpoint 或使用 --force");
  }

  let preRestore;
  const absolutePath = path.join(projectRoot, prdPath);
  if (status.hasChanges && force && fs.existsSync(absolutePath)) {
    const result = await createPrdCheckpoint({
      projectRoot,
      prdPath,
      kind: "pre-restore",
      message: `Before restoring ${checkpointId}`,
      allowDuplicate: true,
    });
    preRestore = result.record;
  }

  const content = await readPrdBlob(projectRoot, checkpoint.document.blobHash);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);

  await appendPrdCheckpointEvent(projectRoot, {
    type: "restore",
    timestamp: new Date().toISOString(),
    prdPath,
    checkpointId,
    detail: {
      restoredTo: checkpointId,
      preRestoreCheckpointId: preRestore?.id ?? null,
    },
  });

  return {
    target: checkpoint.manifest,
    restoredPath: absolutePath,
    preRestore,
  };
}

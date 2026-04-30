import {
  appendCheckpointEvent,
  deleteCheckpointRecord,
  listCheckpointRecords
} from "./store.js";
import { DEFAULT_AUTO_CHECKPOINT_LIMIT } from "./store.js";
import type { CheckpointRecord } from "./types.js";

export async function pruneAutoCheckpoints(
  projectRoot: string,
  prototypePath?: string,
  keepAuto = DEFAULT_AUTO_CHECKPOINT_LIMIT
): Promise<CheckpointRecord[]> {
  const records = listCheckpointRecords(projectRoot, prototypePath);
  const grouped = new Map<string, CheckpointRecord[]>();

  for (const record of records) {
    if (record.kind !== "auto") continue;
    const bucket = grouped.get(record.prototypePath) ?? [];
    bucket.push(record);
    grouped.set(record.prototypePath, bucket);
  }

  const pruned: CheckpointRecord[] = [];
  for (const [groupPath, group] of grouped.entries()) {
    const toDelete = group
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt, "en"))
      .slice(0, Math.max(0, group.length - keepAuto));

    for (const record of toDelete) {
      const removed = await deleteCheckpointRecord(projectRoot, record.id);
      if (!removed) continue;
      pruned.push(removed);
      await appendCheckpointEvent(projectRoot, {
        type: "prune",
        timestamp: new Date().toISOString(),
        prototypePath: groupPath,
        checkpointId: removed.id,
        detail: {
          keepAuto,
          kind: removed.kind,
          createdAt: removed.createdAt
        }
      });
    }
  }

  return pruned;
}

import {
  collectPrototypeSnapshot
} from "./snapshot.js";
import {
  getLatestCheckpointRecord,
  readCheckpointData
} from "./store.js";
import type {
  CheckpointDiffSummary,
  CheckpointFileEntry,
  CheckpointMarkEntry
} from "./types.js";

function buildFileMap<T extends { relativePath: string }>(entries: T[]): Map<string, T> {
  return new Map(entries.map((entry) => [entry.relativePath, entry]));
}

function buildMarkMap(entries: CheckpointMarkEntry[]): Map<string, CheckpointMarkEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

export function buildDiffSummary(
  fromId: string,
  toId: string,
  fromFiles: CheckpointFileEntry[],
  toFiles: CheckpointFileEntry[],
  fromMarks: CheckpointMarkEntry[],
  toMarks: CheckpointMarkEntry[]
): CheckpointDiffSummary {
  const fromFileMap = buildFileMap(fromFiles);
  const toFileMap = buildFileMap(toFiles);
  const fromMarkMap = buildMarkMap(fromMarks);
  const toMarkMap = buildMarkMap(toMarks);

  const addedFiles = toFiles
    .filter((entry) => !fromFileMap.has(entry.relativePath))
    .map((entry) => entry.relativePath);
  const modifiedFiles = toFiles
    .filter((entry) => {
      const previous = fromFileMap.get(entry.relativePath);
      return previous && previous.blobHash !== entry.blobHash;
    })
    .map((entry) => entry.relativePath);
  const deletedFiles = fromFiles
    .filter((entry) => !toFileMap.has(entry.relativePath))
    .map((entry) => entry.relativePath);

  const markAdded = toMarks
    .filter((entry) => !fromMarkMap.has(entry.id))
    .map((entry) => entry.id);
  const markUpdated = toMarks
    .filter((entry) => {
      const previous = fromMarkMap.get(entry.id);
      return previous && (
        previous.blobHash !== entry.blobHash ||
        previous.title !== entry.title ||
        previous.description !== entry.description
      );
    })
    .map((entry) => entry.id);
  const markDeleted = fromMarks
    .filter((entry) => !toMarkMap.has(entry.id))
    .map((entry) => entry.id);

  return {
    fromCheckpointId: fromId,
    toCheckpointId: toId,
    addedFiles,
    modifiedFiles,
    deletedFiles,
    markAdded,
    markUpdated,
    markDeleted
  };
}

export function buildInitialCheckpointSummary(
  checkpointId: string,
  files: CheckpointFileEntry[],
  marks: CheckpointMarkEntry[]
): CheckpointDiffSummary {
  return buildDiffSummary(
    "empty",
    checkpointId,
    [],
    files,
    [],
    marks
  );
}

export function diffCheckpoints(projectRoot: string, fromCheckpointId: string, toCheckpointId: string): CheckpointDiffSummary {
  const from = readCheckpointData(projectRoot, fromCheckpointId);
  const to = readCheckpointData(projectRoot, toCheckpointId);
  return buildDiffSummary(fromCheckpointId, toCheckpointId, from.files, to.files, from.marks, to.marks);
}

export function diffCurrentAgainstLatest(
  projectRoot: string,
  prototypesDir: string,
  prototypePath: string
): { latestCheckpointId?: string; summary: CheckpointDiffSummary; hasChanges: boolean } {
  const latest = getLatestCheckpointRecord(projectRoot, prototypePath);
  const current = collectPrototypeSnapshot(prototypesDir, prototypePath);

  if (!latest) {
    const summary = buildDiffSummary(
      "working-tree",
      "working-tree",
      [],
      current.files,
      [],
      current.marks
    );
    return {
      summary,
      hasChanges: current.fileCount > 0 || current.markCount > 0
    };
  }

  const checkpoint = readCheckpointData(projectRoot, latest.id);
  const summary = buildDiffSummary(
    latest.id,
    "working-tree",
    checkpoint.files,
    current.files,
    checkpoint.marks,
    current.marks
  );
  const hasChanges = summary.addedFiles.length > 0 ||
    summary.modifiedFiles.length > 0 ||
    summary.deletedFiles.length > 0 ||
    summary.markAdded.length > 0 ||
    summary.markUpdated.length > 0 ||
    summary.markDeleted.length > 0;

  return {
    latestCheckpointId: latest.id,
    summary,
    hasChanges
  };
}

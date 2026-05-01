export type CheckpointKind = "manual" | "auto" | "pre-restore";

export interface CheckpointRecord {
  id: string;
  prototypePath: string;
  kind: CheckpointKind;
  message?: string;
  createdAt: string;
  baseCheckpointId?: string;
  fileCount: number;
  markCount: number;
  contentHash: string;
}

export interface CheckpointIndex {
  version: 1;
  checkpoints: CheckpointRecord[];
}

export interface CheckpointFileEntry {
  relativePath: string;
  blobHash: string;
  size: number;
}

export interface CheckpointMarkEntry {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  fileName: string;
  relativePath: string;
  blobHash: string;
  selector?: string;
  domPath?: string;
}

export interface CheckpointManifest extends CheckpointRecord {
  filesPath: string;
  marksPath: string;
}

export interface CheckpointSnapshot {
  prototypePath: string;
  files: CheckpointFileEntry[];
  marks: CheckpointMarkEntry[];
  contentHash: string;
  fileCount: number;
  markCount: number;
}

export interface CheckpointDiffSummary {
  fromCheckpointId: string;
  toCheckpointId: string;
  addedFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  markAdded: string[];
  markUpdated: string[];
  markDeleted: string[];
}

export interface CheckpointEvent {
  type: "create" | "restore" | "prune";
  timestamp: string;
  prototypePath: string;
  checkpointId?: string;
  detail: Record<string, unknown>;
}

export interface CheckpointData {
  manifest: CheckpointManifest;
  files: CheckpointFileEntry[];
  marks: CheckpointMarkEntry[];
}

export interface CheckpointSessionState {
  id: string;
  name?: string;
  startedAt: string;
  updatedAt: string;
}

export interface CreateCheckpointOptions {
  projectRoot: string;
  prototypesDir: string;
  prototypePath: string;
  kind: CheckpointKind;
  message?: string;
  allowDuplicate?: boolean;
  recordEvent?: boolean;
}

export interface CreateCheckpointResult {
  created: boolean;
  record: CheckpointRecord;
  duplicateOf?: CheckpointRecord;
  snapshot: CheckpointSnapshot;
}

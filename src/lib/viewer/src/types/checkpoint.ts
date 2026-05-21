import type { Mark } from './mark';

export type CheckpointKind = 'manual' | 'auto' | 'pre-restore';

export interface CheckpointRecord {
  id: string;
  prototypePath: string;
  kind: CheckpointKind;
  message?: string;
  createdAt: string;
  baseCheckpointId?: string;
  sessionId?: string;
  iterationId?: string;
  fileCount: number;
  markCount: number;
  contentHash: string;
}

export interface IterationRecord {
  id: string;
  name: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface IterationSummary extends IterationRecord {
  checkpointCount: number;
  pageCount: number;
  pages: string[];
  checkpointsByPage: Record<string, CheckpointRecord>;
}

export interface CheckpointSummary {
  fromCheckpointId: string;
  toCheckpointId: string;
  addedFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  markAdded: string[];
  markUpdated: string[];
  markDeleted: string[];
}

export interface CheckpointDetail {
  checkpoint: CheckpointRecord;
  summary: CheckpointSummary;
  previewUrl?: string;
  previewFsPath?: string;
  marks?: Mark[];
  files?: Array<{ relativePath: string; blobHash: string; size: number }>;
}

export interface ActiveCheckpointPreview {
  checkpointId: string;
  prototypePath: string;
  previewUrl: string;
  previewFsPath?: string;
  marks: Mark[];
  message?: string;
  iterationId?: string;
}

export interface CheckpointStatus {
  prototypePath: string | null;
  latestCheckpointId: string | null;
  hasChanges: boolean;
  changeCount: number;
  summary: CheckpointSummary | null;
  changedPrototypePaths?: string[];
}

import type { Mark } from './mark';

export type CheckpointKind = 'manual' | 'auto' | 'pre-restore';

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
  marks?: Mark[];
  files?: Array<{ relativePath: string; blobHash: string; size: number }>;
}

export interface ActiveCheckpointPreview {
  checkpointId: string;
  prototypePath: string;
  previewUrl: string;
  marks: Mark[];
  message?: string;
}

export interface CheckpointStatus {
  prototypePath: string;
  latestCheckpointId: string | null;
  hasChanges: boolean;
  changeCount: number;
  summary: CheckpointSummary;
}

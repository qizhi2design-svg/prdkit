export type PrdCheckpointKind = "manual" | "auto" | "pre-restore";

export interface PrdCheckpointRecord {
  id: string;
  prdPath: string;
  title: string;
  kind: PrdCheckpointKind;
  message?: string;
  createdAt: string;
  baseCheckpointId?: string;
  contentHash: string;
  size: number;
  lineCount: number;
}

export interface PrdCheckpointIndex {
  version: 1;
  checkpoints: PrdCheckpointRecord[];
}

export interface PrdCheckpointDocumentEntry {
  prdPath: string;
  fileName: string;
  title: string;
  blobHash: string;
  size: number;
  lineCount: number;
}

export interface PrdCheckpointManifest extends PrdCheckpointRecord {
  documentPath: string;
}

export interface PrdCheckpointSnapshot {
  prdPath: string;
  fileName: string;
  title: string;
  blobHash: string;
  size: number;
  lineCount: number;
  contentHash: string;
}

export interface PrdCheckpointData {
  manifest: PrdCheckpointManifest;
  document: PrdCheckpointDocumentEntry;
}

export interface PrdCheckpointDiffSummary {
  fromCheckpointId: string;
  toCheckpointId: string;
  changed: boolean;
  lineAdded: number;
  lineDeleted: number;
  beforeSize: number;
  afterSize: number;
  beforeLineCount: number;
  afterLineCount: number;
}

export interface PrdCheckpointEvent {
  type: "create" | "restore";
  timestamp: string;
  prdPath: string;
  checkpointId?: string;
  detail: Record<string, unknown>;
}

export interface CreatePrdCheckpointOptions {
  projectRoot: string;
  prdPath: string;
  kind: PrdCheckpointKind;
  message?: string;
  allowDuplicate?: boolean;
  recordEvent?: boolean;
}

export interface CreatePrdCheckpointResult {
  created: boolean;
  record: PrdCheckpointRecord;
  duplicateOf?: PrdCheckpointRecord;
  snapshot: PrdCheckpointSnapshot;
}

export interface PrdCheckpointStatus {
  latestCheckpointId?: string;
  summary: PrdCheckpointDiffSummary;
  hasChanges: boolean;
}

export interface RestorePrdCheckpointResult {
  target: PrdCheckpointManifest;
  restoredPath: string;
  preRestore?: PrdCheckpointRecord;
}

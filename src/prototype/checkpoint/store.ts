import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  collectPrototypeSnapshot,
  readBlobSource
} from "./snapshot.js";
import type {
  CheckpointData,
  CheckpointEvent,
  CheckpointIndex,
  CheckpointManifest,
  CheckpointRecord,
  CheckpointSessionState,
  CreateCheckpointOptions,
  CreateCheckpointResult
} from "./types.js";

export const DEFAULT_AUTO_CHECKPOINT_LIMIT = 20;
export const DEFAULT_CHECKPOINT_SILENCE_MS = 10_000;
const CHECKPOINT_VERSION = 1;
const RESTORE_SUPPRESSION_FILE = "restore-state.json";
const SESSION_STATE_FILE = "session.json";

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function checkpointRoot(projectRoot: string): string {
  return path.join(projectRoot, ".prdkit", "checkpoints");
}

function checkpointIndexPath(projectRoot: string): string {
  return path.join(checkpointRoot(projectRoot), "index.json");
}

function checkpointEventsPath(projectRoot: string): string {
  return path.join(checkpointRoot(projectRoot), "events.jsonl");
}

function checkpointDir(projectRoot: string, checkpointId: string): string {
  return path.join(checkpointRoot(projectRoot), "checkpoints", checkpointId);
}

function blobsDir(projectRoot: string): string {
  return path.join(checkpointRoot(projectRoot), "blobs");
}

function restoreSuppressionPath(projectRoot: string): string {
  return path.join(checkpointRoot(projectRoot), RESTORE_SUPPRESSION_FILE);
}

function checkpointSessionPath(projectRoot: string): string {
  return path.join(checkpointRoot(projectRoot), SESSION_STATE_FILE);
}

function normalizeIndex(value: Partial<CheckpointIndex> | undefined): CheckpointIndex {
  return {
    version: CHECKPOINT_VERSION,
    checkpoints: Array.isArray(value?.checkpoints) ? value.checkpoints : []
  };
}

function checkpointId(kind: CheckpointRecord["kind"]): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${kind}-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

function checkpointSessionId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `session-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureCheckpointStore(projectRoot: string): void {
  mkdirSync(path.join(checkpointRoot(projectRoot), "checkpoints"), { recursive: true });
  mkdirSync(blobsDir(projectRoot), { recursive: true });
  if (!existsSync(checkpointIndexPath(projectRoot))) {
    writeFileSync(checkpointIndexPath(projectRoot), `${JSON.stringify({ version: CHECKPOINT_VERSION, checkpoints: [] }, null, 2)}\n`, "utf8");
  }
}

export function getCheckpointSession(projectRoot: string): CheckpointSessionState | undefined {
  ensureCheckpointStore(projectRoot);
  const filePath = checkpointSessionPath(projectRoot);
  if (!existsSync(filePath)) return undefined;

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as CheckpointSessionState;
  } catch {
    return undefined;
  }
}

export async function startCheckpointSession(projectRoot: string, name?: string): Promise<CheckpointSessionState> {
  const current = getCheckpointSession(projectRoot);
  if (current) {
    throw new Error(`已有进行中的 session：${current.id}`);
  }

  const now = new Date().toISOString();
  const session: CheckpointSessionState = {
    id: checkpointSessionId(),
    name: name?.trim() || undefined,
    startedAt: now,
    updatedAt: now
  };

  await writeJsonFile(checkpointSessionPath(projectRoot), session);
  return session;
}

export async function touchCheckpointSession(projectRoot: string): Promise<CheckpointSessionState | undefined> {
  const current = getCheckpointSession(projectRoot);
  if (!current) return undefined;

  const next: CheckpointSessionState = {
    ...current,
    updatedAt: new Date().toISOString()
  };
  await writeJsonFile(checkpointSessionPath(projectRoot), next);
  return next;
}

export async function endCheckpointSession(projectRoot: string): Promise<CheckpointSessionState | undefined> {
  const current = getCheckpointSession(projectRoot);
  if (!current) return undefined;

  rmSync(checkpointSessionPath(projectRoot), { force: true });
  return current;
}

export function loadCheckpointIndex(projectRoot: string): CheckpointIndex {
  ensureCheckpointStore(projectRoot);
  return normalizeIndex(JSON.parse(readFileSync(checkpointIndexPath(projectRoot), "utf8")) as Partial<CheckpointIndex>);
}

export async function saveCheckpointIndex(projectRoot: string, index: CheckpointIndex): Promise<void> {
  ensureCheckpointStore(projectRoot);
  await writeFile(checkpointIndexPath(projectRoot), `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export function listCheckpointRecords(projectRoot: string, prototypePath?: string): CheckpointRecord[] {
  const index = loadCheckpointIndex(projectRoot);
  return index.checkpoints
    .filter((record) => !prototypePath || record.prototypePath === prototypePath)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt, "en"));
}

export function findCheckpointRecord(projectRoot: string, checkpointIdValue: string): CheckpointRecord | undefined {
  return loadCheckpointIndex(projectRoot).checkpoints.find((record) => record.id === checkpointIdValue);
}

export function getLatestCheckpointRecord(projectRoot: string, prototypePath: string): CheckpointRecord | undefined {
  const records = listCheckpointRecords(projectRoot, prototypePath);
  return records.at(-1);
}

async function ensureBlob(projectRoot: string, hash: string, content: Buffer): Promise<void> {
  const targetPath = path.join(blobsDir(projectRoot), hash);
  if (existsSync(targetPath)) return;
  await writeFile(targetPath, content);
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function appendCheckpointEvent(projectRoot: string, event: CheckpointEvent): Promise<void> {
  ensureCheckpointStore(projectRoot);
  await appendFile(checkpointEventsPath(projectRoot), `${JSON.stringify(event)}\n`, "utf8");
}

export async function createCheckpoint(
  options: CreateCheckpointOptions
): Promise<CreateCheckpointResult> {
  const {
    projectRoot,
    prototypesDir,
    prototypePath,
    kind,
    message,
    allowDuplicate = false,
    recordEvent = true
  } = options;

  ensureCheckpointStore(projectRoot);
  const snapshot = collectPrototypeSnapshot(prototypesDir, prototypePath);
  const index = loadCheckpointIndex(projectRoot);
  const latest = getLatestCheckpointRecord(projectRoot, prototypePath);

  if (!allowDuplicate && latest && latest.contentHash === snapshot.contentHash) {
    return {
      created: false,
      record: latest,
      duplicateOf: latest,
      snapshot
    };
  }

  const id = checkpointId(kind);
  const record: CheckpointRecord = {
    id,
    prototypePath,
    kind,
    message,
    createdAt: new Date().toISOString(),
    baseCheckpointId: latest?.id,
    fileCount: snapshot.fileCount,
    markCount: snapshot.markCount,
    contentHash: snapshot.contentHash
  };

  for (const file of snapshot.files) {
    await ensureBlob(projectRoot, file.blobHash, readBlobSource(prototypesDir, prototypePath, file.relativePath));
  }
  for (const mark of snapshot.marks) {
    await ensureBlob(projectRoot, mark.blobHash, readBlobSource(prototypesDir, prototypePath, mark.relativePath));
  }

  const manifest: CheckpointManifest = {
    ...record,
    filesPath: "files.json",
    marksPath: "marks.json"
  };

  const targetDir = checkpointDir(projectRoot, id);
  await mkdir(targetDir, { recursive: true });
  await Promise.all([
    writeJsonFile(path.join(targetDir, "manifest.json"), manifest),
    writeJsonFile(path.join(targetDir, "files.json"), snapshot.files),
    writeJsonFile(path.join(targetDir, "marks.json"), snapshot.marks)
  ]);

  index.checkpoints.push(record);
  index.checkpoints.sort((a, b) => a.createdAt.localeCompare(b.createdAt, "en"));
  await saveCheckpointIndex(projectRoot, index);
  await touchCheckpointSession(projectRoot);

  if (recordEvent) {
    await appendCheckpointEvent(projectRoot, {
      type: "create",
      timestamp: record.createdAt,
      prototypePath,
      checkpointId: id,
      detail: {
        kind,
        message: message ?? null,
        fileCount: record.fileCount,
        markCount: record.markCount,
        baseCheckpointId: record.baseCheckpointId ?? null
      }
    });
  }

  return {
    created: true,
    record,
    snapshot
  };
}

export function readCheckpointData(projectRoot: string, checkpointIdValue: string): CheckpointData {
  const dir = checkpointDir(projectRoot, checkpointIdValue);
  const manifestPath = path.join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`未找到 checkpoint：${checkpointIdValue}`);
  }

  return {
    manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as CheckpointManifest,
    files: JSON.parse(readFileSync(path.join(dir, "files.json"), "utf8")),
    marks: JSON.parse(readFileSync(path.join(dir, "marks.json"), "utf8"))
  };
}

export async function readBlob(projectRoot: string, hash: string): Promise<Buffer> {
  return readFile(path.join(blobsDir(projectRoot), hash));
}

export async function deleteCheckpointRecord(projectRoot: string, checkpointIdValue: string): Promise<CheckpointRecord | undefined> {
  const index = loadCheckpointIndex(projectRoot);
  const target = index.checkpoints.find((record) => record.id === checkpointIdValue);
  if (!target) return undefined;

  index.checkpoints = index.checkpoints.filter((record) => record.id !== checkpointIdValue);
  await saveCheckpointIndex(projectRoot, index);
  rmSync(checkpointDir(projectRoot, checkpointIdValue), { recursive: true, force: true });
  return target;
}

export async function writeRestoreSuppression(
  projectRoot: string,
  prototypePath: string,
  durationMs = 1_500
): Promise<void> {
  ensureCheckpointStore(projectRoot);
  await writeJsonFile(restoreSuppressionPath(projectRoot), {
    prototypePath,
    suppressUntil: Date.now() + durationMs,
    operator: os.userInfo().username
  });
}

export function isRestoreSuppressed(projectRoot: string, prototypePath: string, now = Date.now()): boolean {
  const filePath = restoreSuppressionPath(projectRoot);
  if (!existsSync(filePath)) return false;

  try {
    const value = JSON.parse(readFileSync(filePath, "utf8")) as {
      prototypePath?: string;
      suppressUntil?: number;
    };
    return value.prototypePath === prototypePath && typeof value.suppressUntil === "number" && value.suppressUntil > now;
  } catch {
    return false;
  }
}

export function blobFilePath(projectRoot: string, hash: string): string {
  return path.join(blobsDir(projectRoot), hash);
}

export function checkpointStoreRoot(projectRoot: string): string {
  return checkpointRoot(projectRoot);
}

export function createContentHash(value: unknown): string {
  return sha256(JSON.stringify(value));
}

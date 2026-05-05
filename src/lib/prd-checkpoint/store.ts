import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectPrdSnapshot, readPrdBlobSource } from "./snapshot.js";
import type {
  CreatePrdCheckpointOptions,
  CreatePrdCheckpointResult,
  PrdCheckpointData,
  PrdCheckpointDocumentEntry,
  PrdCheckpointEvent,
  PrdCheckpointIndex,
  PrdCheckpointManifest,
  PrdCheckpointRecord,
} from "./types.js";

const CHECKPOINT_VERSION = 1;

function prdCheckpointRoot(projectRoot: string): string {
  return path.join(projectRoot, ".prdkit", "prd-checkpoints");
}

function indexPath(projectRoot: string): string {
  return path.join(prdCheckpointRoot(projectRoot), "index.json");
}

function eventsPath(projectRoot: string): string {
  return path.join(prdCheckpointRoot(projectRoot), "events.jsonl");
}

function checkpointDir(projectRoot: string, checkpointId: string): string {
  return path.join(prdCheckpointRoot(projectRoot), "checkpoints", checkpointId);
}

function blobsDir(projectRoot: string): string {
  return path.join(prdCheckpointRoot(projectRoot), "blobs");
}

function normalizeIndex(value: Partial<PrdCheckpointIndex> | undefined): PrdCheckpointIndex {
  return {
    version: CHECKPOINT_VERSION,
    checkpoints: Array.isArray(value?.checkpoints) ? value.checkpoints : [],
  };
}

function checkpointId(kind: PrdCheckpointRecord["kind"]): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `prd-${kind}-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureBlob(projectRoot: string, hash: string, content: Buffer): Promise<void> {
  const targetPath = path.join(blobsDir(projectRoot), hash);
  if (existsSync(targetPath)) return;
  await writeFile(targetPath, content);
}

export function ensurePrdCheckpointStore(projectRoot: string): void {
  mkdirSync(path.join(prdCheckpointRoot(projectRoot), "checkpoints"), { recursive: true });
  mkdirSync(blobsDir(projectRoot), { recursive: true });
  if (!existsSync(indexPath(projectRoot))) {
    writeFileSync(indexPath(projectRoot), `${JSON.stringify({ version: CHECKPOINT_VERSION, checkpoints: [] }, null, 2)}\n`, "utf8");
  }
}

export function loadPrdCheckpointIndex(projectRoot: string): PrdCheckpointIndex {
  ensurePrdCheckpointStore(projectRoot);
  return normalizeIndex(JSON.parse(readFileSync(indexPath(projectRoot), "utf8")) as Partial<PrdCheckpointIndex>);
}

export async function savePrdCheckpointIndex(projectRoot: string, index: PrdCheckpointIndex): Promise<void> {
  ensurePrdCheckpointStore(projectRoot);
  await writeFile(indexPath(projectRoot), `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export function listPrdCheckpointRecords(projectRoot: string, prdPath?: string): PrdCheckpointRecord[] {
  const index = loadPrdCheckpointIndex(projectRoot);
  return index.checkpoints
    .filter((record) => !prdPath || record.prdPath === prdPath)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt, "en"));
}

export function findPrdCheckpointRecord(projectRoot: string, checkpointIdValue: string): PrdCheckpointRecord | undefined {
  return loadPrdCheckpointIndex(projectRoot).checkpoints.find((record) => record.id === checkpointIdValue);
}

export function getLatestPrdCheckpointRecord(projectRoot: string, prdPath: string): PrdCheckpointRecord | undefined {
  const records = listPrdCheckpointRecords(projectRoot, prdPath);
  return records.at(-1);
}

export async function appendPrdCheckpointEvent(projectRoot: string, event: PrdCheckpointEvent): Promise<void> {
  ensurePrdCheckpointStore(projectRoot);
  await appendFile(eventsPath(projectRoot), `${JSON.stringify(event)}\n`, "utf8");
}

export async function createPrdCheckpoint(
  options: CreatePrdCheckpointOptions
): Promise<CreatePrdCheckpointResult> {
  const {
    projectRoot,
    prdPath,
    kind,
    message,
    allowDuplicate = false,
    recordEvent = true,
  } = options;

  ensurePrdCheckpointStore(projectRoot);
  const snapshot = collectPrdSnapshot(projectRoot, prdPath);
  const index = loadPrdCheckpointIndex(projectRoot);
  const latest = getLatestPrdCheckpointRecord(projectRoot, snapshot.prdPath);

  if (!allowDuplicate && latest && latest.contentHash === snapshot.contentHash) {
    return {
      created: false,
      record: latest,
      duplicateOf: latest,
      snapshot,
    };
  }

  const id = checkpointId(kind);
  const record: PrdCheckpointRecord = {
    id,
    prdPath: snapshot.prdPath,
    title: snapshot.title,
    kind,
    message,
    createdAt: new Date().toISOString(),
    baseCheckpointId: latest?.id,
    contentHash: snapshot.contentHash,
    size: snapshot.size,
    lineCount: snapshot.lineCount,
  };

  await ensureBlob(projectRoot, snapshot.blobHash, readPrdBlobSource(projectRoot, snapshot.prdPath));

  const document: PrdCheckpointDocumentEntry = {
    prdPath: snapshot.prdPath,
    fileName: snapshot.fileName,
    title: snapshot.title,
    blobHash: snapshot.blobHash,
    size: snapshot.size,
    lineCount: snapshot.lineCount,
  };

  const manifest: PrdCheckpointManifest = {
    ...record,
    documentPath: "document.json",
  };

  const targetDir = checkpointDir(projectRoot, id);
  await mkdir(targetDir, { recursive: true });
  await Promise.all([
    writeJsonFile(path.join(targetDir, "manifest.json"), manifest),
    writeJsonFile(path.join(targetDir, "document.json"), document),
  ]);

  index.checkpoints.push(record);
  index.checkpoints.sort((a, b) => a.createdAt.localeCompare(b.createdAt, "en"));
  await savePrdCheckpointIndex(projectRoot, index);

  if (recordEvent) {
    await appendPrdCheckpointEvent(projectRoot, {
      type: "create",
      timestamp: record.createdAt,
      prdPath: snapshot.prdPath,
      checkpointId: id,
      detail: {
        kind,
        message: message ?? null,
        size: snapshot.size,
        lineCount: snapshot.lineCount,
        baseCheckpointId: record.baseCheckpointId ?? null,
      },
    });
  }

  return {
    created: true,
    record,
    snapshot,
  };
}

export function readPrdCheckpointData(projectRoot: string, checkpointIdValue: string): PrdCheckpointData {
  const dir = checkpointDir(projectRoot, checkpointIdValue);
  const manifestPath = path.join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`未找到 PRD checkpoint：${checkpointIdValue}`);
  }

  return {
    manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as PrdCheckpointManifest,
    document: JSON.parse(readFileSync(path.join(dir, "document.json"), "utf8")) as PrdCheckpointDocumentEntry,
  };
}

export async function readPrdBlob(projectRoot: string, hash: string): Promise<Buffer> {
  return readFile(path.join(blobsDir(projectRoot), hash));
}

export async function deletePrdCheckpointRecord(projectRoot: string, checkpointIdValue: string): Promise<PrdCheckpointRecord | undefined> {
  const index = loadPrdCheckpointIndex(projectRoot);
  const target = index.checkpoints.find((record) => record.id === checkpointIdValue);
  if (!target) return undefined;

  index.checkpoints = index.checkpoints.filter((record) => record.id !== checkpointIdValue);
  await savePrdCheckpointIndex(projectRoot, index);
  rmSync(checkpointDir(projectRoot, checkpointIdValue), { recursive: true, force: true });
  return target;
}

export function prdCheckpointStoreRoot(projectRoot: string): string {
  return prdCheckpointRoot(projectRoot);
}

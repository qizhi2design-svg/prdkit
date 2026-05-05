import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { needsMigration, migrateCheckpointStorage, getMigrationStatus } from "../src/lib/checkpoints/migration.js";

describe("checkpoint migration", () => {
  const tempDirs: string[] = [];

  function createOldStructure() {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-migration-"));
    tempDirs.push(projectRoot);

    // 创建旧的 prototype checkpoint 结构
    const oldPrototypePath = path.join(projectRoot, ".prdkit", "checkpoints");
    fs.mkdirSync(path.join(oldPrototypePath, "checkpoints"), { recursive: true });
    fs.mkdirSync(path.join(oldPrototypePath, "blobs"), { recursive: true });
    fs.writeFileSync(
      path.join(oldPrototypePath, "index.json"),
      JSON.stringify({ version: 1, checkpoints: [] }, null, 2)
    );
    fs.writeFileSync(
      path.join(oldPrototypePath, "events.jsonl"),
      ""
    );

    // 创建旧的 prd checkpoint 结构
    const oldPrdPath = path.join(projectRoot, ".prdkit", "prd-checkpoints");
    fs.mkdirSync(path.join(oldPrdPath, "checkpoints"), { recursive: true });
    fs.mkdirSync(path.join(oldPrdPath, "blobs"), { recursive: true });
    fs.writeFileSync(
      path.join(oldPrdPath, "index.json"),
      JSON.stringify({ version: 1, checkpoints: [] }, null, 2)
    );

    return projectRoot;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects old structure and performs migration", () => {
    const projectRoot = createOldStructure();

    expect(needsMigration(projectRoot)).toBe(true);

    migrateCheckpointStorage(projectRoot);

    // 验证新结构
    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "checkpoints", "prototype", "index.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "checkpoints", "prototype", "checkpoints"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "checkpoints", "prototype", "blobs"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "checkpoints", "prd", "index.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "checkpoints", "prd", "checkpoints"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "checkpoints", "prd", "blobs"))).toBe(true);

    // 验证旧目录已删除
    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "prd-checkpoints"))).toBe(false);

    // 验证迁移状态
    const state = getMigrationStatus(projectRoot);
    expect(state).not.toBeNull();
    expect(state?.version).toBe(2);
    expect(state?.prototypeCheckpointsMigrated).toBe(true);
    expect(state?.prdCheckpointsMigrated).toBe(true);

    // 验证不再需要迁移
    expect(needsMigration(projectRoot)).toBe(false);
  });

  it("skips migration if already migrated", () => {
    const projectRoot = createOldStructure();

    migrateCheckpointStorage(projectRoot);
    const firstState = getMigrationStatus(projectRoot);

    // 再次调用应该跳过
    migrateCheckpointStorage(projectRoot);
    const secondState = getMigrationStatus(projectRoot);

    expect(firstState?.migratedAt).toBe(secondState?.migratedAt);
  });

  it("handles project with only prototype checkpoints", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-migration-"));
    tempDirs.push(projectRoot);

    // 只创建 prototype checkpoint
    const oldPrototypePath = path.join(projectRoot, ".prdkit", "checkpoints");
    fs.mkdirSync(path.join(oldPrototypePath, "checkpoints"), { recursive: true });
    fs.writeFileSync(
      path.join(oldPrototypePath, "index.json"),
      JSON.stringify({ version: 1, checkpoints: [] }, null, 2)
    );

    expect(needsMigration(projectRoot)).toBe(true);

    migrateCheckpointStorage(projectRoot);

    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "checkpoints", "prototype", "index.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "checkpoints", "prd"))).toBe(true);

    const state = getMigrationStatus(projectRoot);
    expect(state?.prototypeCheckpointsMigrated).toBe(true);
    expect(state?.prdCheckpointsMigrated).toBe(false);
  });

  it("handles project with only prd checkpoints", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-migration-"));
    tempDirs.push(projectRoot);

    // 只创建 prd checkpoint
    const oldPrdPath = path.join(projectRoot, ".prdkit", "prd-checkpoints");
    fs.mkdirSync(path.join(oldPrdPath, "checkpoints"), { recursive: true });
    fs.writeFileSync(
      path.join(oldPrdPath, "index.json"),
      JSON.stringify({ version: 1, checkpoints: [] }, null, 2)
    );

    expect(needsMigration(projectRoot)).toBe(true);

    migrateCheckpointStorage(projectRoot);

    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "checkpoints", "prototype"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, ".prdkit", "checkpoints", "prd", "index.json"))).toBe(true);

    const state = getMigrationStatus(projectRoot);
    expect(state?.prototypeCheckpointsMigrated).toBe(false);
    expect(state?.prdCheckpointsMigrated).toBe(true);
  });

  it("does not migrate if new structure already exists", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-migration-"));
    tempDirs.push(projectRoot);

    // 直接创建新结构
    fs.mkdirSync(path.join(projectRoot, ".prdkit", "checkpoints", "prototype"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, ".prdkit", "checkpoints", "prd"), { recursive: true });

    expect(needsMigration(projectRoot)).toBe(false);
  });

  it("preserves checkpoint data during migration", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-migration-"));
    tempDirs.push(projectRoot);

    // 创建带有实际数据的旧结构
    const oldPrototypePath = path.join(projectRoot, ".prdkit", "checkpoints");
    fs.mkdirSync(path.join(oldPrototypePath, "checkpoints", "test-checkpoint-1"), { recursive: true });
    fs.mkdirSync(path.join(oldPrototypePath, "blobs"), { recursive: true });

    const testCheckpoint = {
      id: "test-checkpoint-1",
      prototypePath: "dashboard",
      kind: "manual",
      createdAt: "2024-01-01T00:00:00.000Z",
      fileCount: 1,
      markCount: 0,
      contentHash: "abc123"
    };

    fs.writeFileSync(
      path.join(oldPrototypePath, "index.json"),
      JSON.stringify({ version: 1, checkpoints: [testCheckpoint] }, null, 2)
    );

    fs.writeFileSync(
      path.join(oldPrototypePath, "checkpoints", "test-checkpoint-1", "manifest.json"),
      JSON.stringify(testCheckpoint, null, 2)
    );

    fs.writeFileSync(
      path.join(oldPrototypePath, "blobs", "test-blob-hash"),
      "test content"
    );

    migrateCheckpointStorage(projectRoot);

    // 验证数据完整性
    const newIndexPath = path.join(projectRoot, ".prdkit", "checkpoints", "prototype", "index.json");
    const newIndex = JSON.parse(fs.readFileSync(newIndexPath, "utf8"));
    expect(newIndex.checkpoints).toHaveLength(1);
    expect(newIndex.checkpoints[0].id).toBe("test-checkpoint-1");

    const newManifestPath = path.join(projectRoot, ".prdkit", "checkpoints", "prototype", "checkpoints", "test-checkpoint-1", "manifest.json");
    expect(fs.existsSync(newManifestPath)).toBe(true);

    const newBlobPath = path.join(projectRoot, ".prdkit", "checkpoints", "prototype", "blobs", "test-blob-hash");
    expect(fs.readFileSync(newBlobPath, "utf8")).toBe("test content");
  });
});

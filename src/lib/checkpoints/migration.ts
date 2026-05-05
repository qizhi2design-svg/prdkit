import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, readdirSync, rmdirSync } from "node:fs";
import path from "node:path";

interface MigrationState {
  version: number;
  migratedAt: string;
  prototypeCheckpointsMigrated: boolean;
  prdCheckpointsMigrated: boolean;
}

const MIGRATION_STATE_FILE = "migration-state.json";
const TARGET_VERSION = 2;

function getMigrationStatePath(projectRoot: string): string {
  return path.join(projectRoot, ".prdkit", "checkpoints", MIGRATION_STATE_FILE);
}

function loadMigrationState(projectRoot: string): MigrationState | null {
  const statePath = getMigrationStatePath(projectRoot);
  if (!existsSync(statePath)) return null;

  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as MigrationState;
  } catch {
    return null;
  }
}

function saveMigrationState(projectRoot: string, state: MigrationState): void {
  const statePath = getMigrationStatePath(projectRoot);
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

export function needsMigration(projectRoot: string): boolean {
  const state = loadMigrationState(projectRoot);
  if (state && state.version >= TARGET_VERSION) {
    return false;
  }

  const oldPrototypePath = path.join(projectRoot, ".prdkit", "checkpoints");
  const oldPrdPath = path.join(projectRoot, ".prdkit", "prd-checkpoints");
  const newPrototypePath = path.join(projectRoot, ".prdkit", "checkpoints", "prototype");
  const newPrdPath = path.join(projectRoot, ".prdkit", "checkpoints", "prd");

  // 如果新结构已存在且有迁移状态，不需要迁移
  if (existsSync(newPrototypePath) || existsSync(newPrdPath)) {
    return false;
  }

  // 检查是否存在旧数据（排除已经是新结构的情况）
  const hasOldPrototype = existsSync(oldPrototypePath) &&
    !existsSync(newPrototypePath) &&
    (existsSync(path.join(oldPrototypePath, "index.json")) ||
     existsSync(path.join(oldPrototypePath, "checkpoints")));

  const hasOldPrd = existsSync(oldPrdPath);

  return hasOldPrototype || hasOldPrd;
}

export function migrateCheckpointStorage(projectRoot: string): void {
  const state = loadMigrationState(projectRoot);
  if (state && state.version >= TARGET_VERSION) {
    return;
  }

  const oldPrototypePath = path.join(projectRoot, ".prdkit", "checkpoints");
  const oldPrdPath = path.join(projectRoot, ".prdkit", "prd-checkpoints");
  const newRootPath = path.join(projectRoot, ".prdkit", "checkpoints");
  const tempBackupPath = path.join(projectRoot, ".prdkit", "checkpoints-backup-temp");

  let prototypeCheckpointsMigrated = false;
  let prdCheckpointsMigrated = false;

  try {
    // 步骤 1: 备份旧的 prototype checkpoints
    if (existsSync(oldPrototypePath)) {
      renameSync(oldPrototypePath, tempBackupPath);
    }

    // 步骤 2: 创建新结构
    mkdirSync(path.join(newRootPath, "prototype"), { recursive: true });
    mkdirSync(path.join(newRootPath, "prd"), { recursive: true });

    // 步骤 3: 迁移 prototype checkpoints
    if (existsSync(tempBackupPath)) {
      const newPrototypePath = path.join(newRootPath, "prototype");

      const entries = ["index.json", "events.jsonl", "session.json",
        "restore-state.json", "checkpoints", "blobs", "previews"];

      for (const entry of entries) {
        const oldPath = path.join(tempBackupPath, entry);
        const newPath = path.join(newPrototypePath, entry);
        if (existsSync(oldPath)) {
          renameSync(oldPath, newPath);
        }
      }

      prototypeCheckpointsMigrated = true;

      // 清理临时备份目录
      const remaining = readdirSync(tempBackupPath);
      if (remaining.length === 0) {
        rmdirSync(tempBackupPath);
      }
    }

    // 步骤 4: 迁移 PRD checkpoints
    if (existsSync(oldPrdPath)) {
      const newPrdPath = path.join(newRootPath, "prd");

      const entries = ["index.json", "events.jsonl", "checkpoints", "blobs"];

      for (const entry of entries) {
        const oldPath = path.join(oldPrdPath, entry);
        const newPath = path.join(newPrdPath, entry);
        if (existsSync(oldPath)) {
          renameSync(oldPath, newPath);
        }
      }

      // 删除旧的 prd-checkpoints 目录
      const remaining = readdirSync(oldPrdPath);
      if (remaining.length === 0) {
        rmdirSync(oldPrdPath);
      }

      prdCheckpointsMigrated = true;
    }

    // 步骤 5: 保存迁移状态
    saveMigrationState(projectRoot, {
      version: TARGET_VERSION,
      migratedAt: new Date().toISOString(),
      prototypeCheckpointsMigrated,
      prdCheckpointsMigrated,
    });

  } catch (error) {
    // 回滚：恢复备份
    if (existsSync(tempBackupPath)) {
      if (existsSync(newRootPath)) {
        const entries = readdirSync(newRootPath);
        for (const entry of entries) {
          if (entry !== "migration-state.json") {
            const entryPath = path.join(newRootPath, entry);
            try {
              if (existsSync(entryPath)) {
                const stat = require("fs").statSync(entryPath);
                if (stat.isDirectory()) {
                  require("fs").rmSync(entryPath, { recursive: true, force: true });
                } else {
                  require("fs").unlinkSync(entryPath);
                }
              }
            } catch {
              // 忽略清理错误
            }
          }
        }
      }
      renameSync(tempBackupPath, oldPrototypePath);
    }
    throw new Error(`Checkpoint 迁移失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function getMigrationStatus(projectRoot: string): MigrationState | null {
  return loadMigrationState(projectRoot);
}

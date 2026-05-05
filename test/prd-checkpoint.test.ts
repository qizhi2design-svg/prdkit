import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveConfig } from "../src/utils/config.js";
import { createPrdCheckpoint, listPrdCheckpointRecords, loadPrdCheckpointIndex } from "../src/lib/checkpoints/prd/store.js";
import { diffCurrentPrdAgainstLatest, diffPrdCheckpoints } from "../src/lib/checkpoints/prd/diff.js";
import { restorePrdCheckpoint } from "../src/lib/checkpoints/prd/restore.js";

const tempDirs: string[] = [];

function createProject(): { projectRoot: string; prdPath: string; absolutePath: string } {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-prd-checkpoint-"));
  tempDirs.push(projectRoot);

  saveConfig({
    version: 1,
    projectName: "Demo",
    author: "Alice",
    scaffoldRepo: "a",
    templateRepo: "b",
    defaultCreateDirs: {
      prd: "workspace/prds",
    },
  }, projectRoot);

  const prdPath = path.join("workspace", "prds", "支付流程优化-prd.md");
  const absolutePath = path.join(projectRoot, prdPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `---\ntitle: 支付流程优化\nstatus: draft\n---\n\n# 支付流程优化\n\n第一版内容\n`, "utf8");

  return { projectRoot, prdPath: prdPath.split(path.sep).join("/"), absolutePath };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("prd checkpoint core", () => {
  it("creates checkpoints and skips duplicate manual snapshots", async () => {
    const { projectRoot, prdPath } = createProject();

    const first = await createPrdCheckpoint({
      projectRoot,
      prdPath,
      kind: "manual",
      message: "v1",
    });
    const second = await createPrdCheckpoint({
      projectRoot,
      prdPath,
      kind: "manual",
      message: "dup",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(loadPrdCheckpointIndex(projectRoot).checkpoints).toHaveLength(1);
  });

  it("builds text diff summary and reports dirty status", async () => {
    const { projectRoot, prdPath, absolutePath } = createProject();

    const first = await createPrdCheckpoint({
      projectRoot,
      prdPath,
      kind: "manual",
    });

    fs.writeFileSync(absolutePath, `---\ntitle: 支付流程优化\nstatus: review\n---\n\n# 支付流程优化\n\n第一版内容\n\n新增一段说明\n`, "utf8");

    const status = await diffCurrentPrdAgainstLatest(projectRoot, prdPath);
    expect(status.hasChanges).toBe(true);
    expect(status.summary.lineAdded).toBeGreaterThan(0);

    const second = await createPrdCheckpoint({
      projectRoot,
      prdPath,
      kind: "manual",
    });

    const diff = await diffPrdCheckpoints(projectRoot, first.record.id, second.record.id);
    expect(diff.changed).toBe(true);
    expect(diff.lineAdded).toBeGreaterThan(0);
    expect(listPrdCheckpointRecords(projectRoot, prdPath)).toHaveLength(2);
  });

  it("restores deleted prd file from checkpoint", async () => {
    const { projectRoot, prdPath, absolutePath } = createProject();

    const target = await createPrdCheckpoint({
      projectRoot,
      prdPath,
      kind: "manual",
    });

    fs.unlinkSync(absolutePath);

    await expect(restorePrdCheckpoint({
      projectRoot,
      checkpointId: target.record.id,
    })).rejects.toThrow("未归档变更");

    const restored = await restorePrdCheckpoint({
      projectRoot,
      checkpointId: target.record.id,
      force: true,
    });

    expect(restored.target.id).toBe(target.record.id);
    expect(fs.readFileSync(absolutePath, "utf8")).toContain("第一版内容");
  });
});

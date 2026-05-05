import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { saveConfig } from "../src/utils/config.js";
import { buildDiffSummary, diffCheckpoints, diffCurrentAgainstLatest } from "../src/lib/checkpoints/prototype/diff.js";
import { pruneAutoCheckpoints } from "../src/lib/checkpoints/prototype/retention.js";
import { restoreCheckpoint } from "../src/lib/checkpoints/prototype/restore.js";
import {
  createCheckpoint,
  endCheckpointSession,
  getCheckpointSession,
  listCheckpointRecords,
  loadCheckpointIndex,
  startCheckpointSession
} from "../src/lib/checkpoints/prototype/store.js";

const tempDirs: string[] = [];

function createProject(): { projectRoot: string; prototypesDir: string; prototypePath: string } {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-checkpoint-"));
  tempDirs.push(projectRoot);
  const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
  const prototypePath = "dashboard";
  fs.mkdirSync(path.join(prototypesDir, prototypePath, "marks"), { recursive: true });
  fs.writeFileSync(path.join(prototypesDir, prototypePath, "index.html"), "<html>v1</html>\n", "utf8");
  fs.writeFileSync(path.join(prototypesDir, prototypePath, "style.css"), "body { color: red; }\n", "utf8");
  fs.writeFileSync(
    path.join(prototypesDir, prototypePath, "marks", "mark-1.md"),
    `---
title: 首屏
selector: .hero
timestamp: 1
---
# 首屏

旧文案
`,
    "utf8"
  );

  saveConfig({
    version: 1,
    projectName: "Demo",
    author: "Alice",
    scaffoldRepo: "a",
    templateRepo: "b"
  }, projectRoot);

  return { projectRoot, prototypesDir, prototypePath };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("checkpoint core", () => {
  it("creates checkpoints and skips duplicate manual snapshots", async () => {
    const { projectRoot, prototypesDir, prototypePath } = createProject();

    const first = await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath,
      kind: "manual",
      message: "v1"
    });
    const second = await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath,
      kind: "manual",
      message: "dup"
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(loadCheckpointIndex(projectRoot).checkpoints).toHaveLength(1);
  });

  it("builds structured diff for files and marks", async () => {
    const { projectRoot, prototypesDir, prototypePath } = createProject();
    const first = await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath,
      kind: "manual"
    });

    fs.writeFileSync(path.join(prototypesDir, prototypePath, "style.css"), "body { color: blue; }\n", "utf8");
    fs.writeFileSync(path.join(prototypesDir, prototypePath, "script.js"), "console.log('new');\n", "utf8");
    fs.unlinkSync(path.join(prototypesDir, prototypePath, "index.html"));
    fs.writeFileSync(
      path.join(prototypesDir, prototypePath, "marks", "mark-1.md"),
      `---
title: 首屏
selector: .hero
timestamp: 1
---
# 首屏

新文案
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(prototypesDir, prototypePath, "marks", "mark-2.md"),
      `---
title: 次级按钮
selector: .cta
timestamp: 2
---
# 次级按钮

新增
`,
      "utf8"
    );
    const second = await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath,
      kind: "manual"
    });

    const diff = diffCheckpoints(projectRoot, first.record.id, second.record.id);
    expect(diff.addedFiles).toContain("script.js");
    expect(diff.modifiedFiles).toContain("style.css");
    expect(diff.deletedFiles).toContain("index.html");
    expect(diff.markUpdated).toContain("mark-1");
    expect(diff.markAdded).toContain("mark-2");
  });

  it("creates pre-restore checkpoint and restores prototype files and marks", async () => {
    const { projectRoot, prototypesDir, prototypePath } = createProject();
    const target = await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath,
      kind: "manual"
    });

    fs.writeFileSync(path.join(prototypesDir, prototypePath, "style.css"), "body { color: green; }\n", "utf8");
    fs.writeFileSync(
      path.join(prototypesDir, prototypePath, "marks", "mark-1.md"),
      `---
title: 首屏
selector: .hero
timestamp: 1
---
# 首屏

恢复前
`,
      "utf8"
    );

    await expect(restoreCheckpoint({
      projectRoot,
      prototypesDir,
      checkpointId: target.record.id
    })).rejects.toThrow("未归档变更");

    const restored = await restoreCheckpoint({
      projectRoot,
      prototypesDir,
      checkpointId: target.record.id,
      force: true
    });

    expect(restored.preRestore.kind).toBe("pre-restore");
    expect(fs.readFileSync(path.join(prototypesDir, prototypePath, "style.css"), "utf8")).toContain("red");
    expect(fs.readFileSync(path.join(prototypesDir, prototypePath, "marks", "mark-1.md"), "utf8")).toContain("旧文案");
    expect(listCheckpointRecords(projectRoot, prototypePath).some((record) => record.kind === "pre-restore")).toBe(true);
  });

  it("reports working tree status and prunes auto checkpoints only", async () => {
    const { projectRoot, prototypesDir, prototypePath } = createProject();
    await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath,
      kind: "manual"
    });

    fs.writeFileSync(path.join(prototypesDir, prototypePath, "style.css"), "body { color: blue; }\n", "utf8");
    const dirty = diffCurrentAgainstLatest(projectRoot, prototypesDir, prototypePath);
    expect(dirty.hasChanges).toBe(true);
    expect(dirty.summary.modifiedFiles).toContain("style.css");

    await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath,
      kind: "auto"
    });
    fs.writeFileSync(path.join(prototypesDir, prototypePath, "style.css"), "body { color: black; }\n", "utf8");
    await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath,
      kind: "auto"
    });

    const removed = await pruneAutoCheckpoints(projectRoot, prototypePath, 1);
    expect(removed).toHaveLength(1);
    expect(removed[0].kind).toBe("auto");
    expect(listCheckpointRecords(projectRoot, prototypePath).some((record) => record.kind === "manual")).toBe(true);
  });

  it("starts and ends a manual checkpoint session", async () => {
    const { projectRoot } = createProject();

    const session = await startCheckpointSession(projectRoot, "AI 改版");
    expect(session.name).toBe("AI 改版");
    expect(getCheckpointSession(projectRoot)?.id).toBe(session.id);

    const ended = await endCheckpointSession(projectRoot);
    expect(ended?.id).toBe(session.id);
    expect(getCheckpointSession(projectRoot)).toBeUndefined();
  });
});

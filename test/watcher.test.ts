import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WatchContentTracker, resolvePrototypePathFromWatchEvent, shouldIgnoreWatchPath } from "../src/lib/server/watcher.js";

const tempDirs: string[] = [];

function createProject(): { projectRoot: string; prototypesDir: string; prototypePath: string } {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-watcher-"));
  tempDirs.push(projectRoot);
  const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
  const prototypePath = "dashboard";
  fs.mkdirSync(path.join(prototypesDir, prototypePath, "marks"), { recursive: true });
  fs.writeFileSync(path.join(prototypesDir, prototypePath, "index.html"), "<html>v1</html>\n", "utf8");
  return { projectRoot, prototypesDir, prototypePath };
}

afterEach(() => {
  vi.useRealTimers();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("watcher helpers", () => {
  it("ignores checkpoint store paths", () => {
    expect(shouldIgnoreWatchPath("/tmp/demo/.prdkit/checkpoints/index.json")).toBe(true);
    expect(shouldIgnoreWatchPath("/tmp/demo/workspace/prototypes/a/index.html")).toBe(false);
  });

  it("resolves prototype path from nested file changes", () => {
    const { prototypesDir, prototypePath } = createProject();
    fs.mkdirSync(path.join(prototypesDir, prototypePath, "nested"), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, prototypePath, "nested", "foo.js"), "console.log(1)\n", "utf8");

    expect(resolvePrototypePathFromWatchEvent(
      prototypesDir,
      path.join(prototypesDir, prototypePath, "nested", "foo.js")
    )).toBe(prototypePath);
  });

  it("ignores change events when file content is unchanged", () => {
    const { prototypesDir, prototypePath } = createProject();
    const tracker = new WatchContentTracker(prototypesDir);
    const filePath = path.join(prototypesDir, prototypePath, "index.html");

    fs.writeFileSync(filePath, "<html>v1</html>\n", "utf8");
    expect(tracker.onFileChange(filePath)).toBe(false);
  });

  it("detects change events when file content actually changed", () => {
    const { prototypesDir, prototypePath } = createProject();
    const tracker = new WatchContentTracker(prototypesDir);
    const filePath = path.join(prototypesDir, prototypePath, "index.html");

    fs.writeFileSync(filePath, "<html>v2</html>\n", "utf8");
    expect(tracker.onFileChange(filePath)).toBe(true);
  });
});

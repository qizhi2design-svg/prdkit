import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeDefaultDirectory } from "../src/lib/system-dialog.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("normalizeDefaultDirectory", () => {
  it("returns the nearest existing parent when the target directory does not exist", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-dialog-"));
    tempDirs.push(projectRoot);

    const existingDir = path.join(projectRoot, "demo5", "dist");
    fs.mkdirSync(existingDir, { recursive: true });

    const targetDir = path.join(existingDir, "publish");
    expect(normalizeDefaultDirectory(targetDir)).toBe(existingDir);
  });

  it("returns the same path when the directory already exists", () => {
    const existingDir = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-dialog-existing-"));
    tempDirs.push(existingDir);

    expect(normalizeDefaultDirectory(existingDir)).toBe(existingDir);
  });
});

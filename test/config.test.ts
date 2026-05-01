import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, resolveProjectRoot, saveConfig } from "../src/utils/config.js";

describe("config", () => {
  it("saves and loads project config", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prdkit-config-"));
    await saveConfig({
      version: 1,
      projectName: "Demo",
      author: "Alice",
      scaffoldRepo: "git@github.com:demo/scaffold.git",
      templateRepo: "git@github.com:demo/templates.git",
      defaultCreateDirs: {
        prd: "workspace/prds"
      }
    }, dir);

    await expect(loadConfig(dir)).resolves.toEqual({
      version: 1,
      projectName: "Demo",
      author: "Alice",
      scaffoldRepo: "git@github.com:demo/scaffold.git",
      templateRepo: "git@github.com:demo/templates.git",
      defaultCreateDirs: {
        prd: "workspace/prds"
      }
    });

    await rm(dir, { recursive: true, force: true });
  });

  it("resolves project root by walking parents", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prdkit-root-"));
    const child = path.join(dir, "workspace", "prds");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(child, { recursive: true }));
    await saveConfig({
      version: 1,
      projectName: "Demo",
      author: "Alice",
      scaffoldRepo: "a",
      templateRepo: "b"
    }, dir);

    await expect(resolveProjectRoot(child)).resolves.toBe(dir);
    await rm(dir, { recursive: true, force: true });
  });
});

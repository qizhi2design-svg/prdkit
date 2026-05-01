import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_VIEWER_SKILLS } from "../src/lib/shared/index.js";
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
      viewerSkills: {
        inspectCopySkillCommand: "/skill inspect-demo",
        markCreateSkillCommand: "/skill mark-create-demo",
        markUpdateSkillCommand: "/skill mark-update-demo",
        copyTerminalGuide: "复制后切到终端使用",
      },
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
      viewerSkills: {
        inspectCopySkillCommand: "/skill inspect-demo",
        markCreateSkillCommand: "/skill mark-create-demo",
        markUpdateSkillCommand: "/skill mark-update-demo",
        copyTerminalGuide: "复制后切到终端使用",
      },
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

  it("fills default viewer skill config when old config omits it", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prdkit-config-legacy-"));
    await saveConfig({
      version: 1,
      projectName: "Legacy Demo",
      author: "Alice",
      scaffoldRepo: "a",
      templateRepo: "b",
    }, dir);

    const loaded = await loadConfig(dir);
    expect(loaded?.viewerSkills).toEqual(DEFAULT_VIEWER_SKILLS);

    await rm(dir, { recursive: true, force: true });
  });
});

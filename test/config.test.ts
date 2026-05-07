import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_INSPECT_COPY_SKILL_COMMAND, DEFAULT_PAGE_CREATE_SKILL_COMMAND, DEFAULT_VIEWER_SKILLS } from "../src/lib/shared/index.js";
import {
  clearAuthRecord,
  CLOUD_HOST_ENV_VAR,
  getAuthRecord,
  loadConfig,
  resolveCloudHost,
  resolveProjectRoot,
  saveConfig,
  setAuthRecord
} from "../src/utils/config.js";

const originalHome = process.env.HOME;
const originalCloudHost = process.env[CLOUD_HOST_ENV_VAR];

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }

  if (originalCloudHost === undefined) {
    delete process.env[CLOUD_HOST_ENV_VAR];
  } else {
    process.env[CLOUD_HOST_ENV_VAR] = originalCloudHost;
  }
});

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
        pageCreateSkillCommand: "/skill page-create-demo",
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
        pageCreateSkillCommand: "/skill page-create-demo",
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

  it("migrates legacy inspect create command into separate create/update commands", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prdkit-config-migrate-"));
    await mkdir(path.join(dir, ".prdkit"), { recursive: true });
    await writeFile(path.join(dir, ".prdkit", "config.json"), `${JSON.stringify({
      version: 1,
      projectName: "Legacy Skill Demo",
      author: "Alice",
      scaffoldRepo: "a",
      templateRepo: "b",
      viewerSkills: {
        inspectCopySkillCommand: DEFAULT_PAGE_CREATE_SKILL_COMMAND,
        markCreateSkillCommand: "/skill mark-create-demo",
        markUpdateSkillCommand: "/skill mark-update-demo",
        copyTerminalGuide: "复制后切到终端使用",
      },
    }, null, 2)}\n`);

    const loaded = await loadConfig(dir);
    expect(loaded?.viewerSkills).toEqual({
      pageCreateSkillCommand: DEFAULT_PAGE_CREATE_SKILL_COMMAND,
      inspectCopySkillCommand: DEFAULT_INSPECT_COPY_SKILL_COMMAND,
      markCreateSkillCommand: "/skill mark-create-demo",
      markUpdateSkillCommand: "/skill mark-update-demo",
      copyTerminalGuide: "复制后切到终端使用",
    });

    await rm(dir, { recursive: true, force: true });
  });

  it("resolves cloud host from environment variable", () => {
    process.env[CLOUD_HOST_ENV_VAR] = "https://cloud.example.com///";
    expect(resolveCloudHost()).toBe("https://cloud.example.com");
  });

  it("stores auth records by normalized host", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prdkit-auth-store-"));
    process.env.HOME = dir;

    await setAuthRecord("https://cloud.example.com///", {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      user: {
        id: 1,
        email: "demo@example.com",
      },
      scopes: ["publish"],
    });

    await expect(getAuthRecord("https://cloud.example.com")).resolves.toMatchObject({
      accessToken: "access-token",
      user: {
        email: "demo@example.com",
      },
    });

    await clearAuthRecord("https://cloud.example.com");
    await expect(getAuthRecord("https://cloud.example.com")).resolves.toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });
});

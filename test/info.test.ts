import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOUD_HOST_ENV_VAR, saveConfig, setAuthRecord } from "../src/utils/config.js";
import { getProjectStats } from "../src/commands/info.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalCloudHost = process.env[CLOUD_HOST_ENV_VAR];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
  vi.unstubAllGlobals();
});

describe("getProjectStats", () => {
  it("counts directory-based prototypes", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-info-"));
    tempDirs.push(projectRoot);

    const workspaceDir = path.join(projectRoot, "workspace");
    const prototypesDir = path.join(workspaceDir, "prototypes");
    fs.mkdirSync(path.join(prototypesDir, "移动端内容浏览页"), { recursive: true });
    fs.mkdirSync(path.join(prototypesDir, "需求管理后台"), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, "prds"), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, "discussions"), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, "bugs"), { recursive: true });

    fs.writeFileSync(path.join(prototypesDir, "移动端内容浏览页", "index.html"), "<html>mobile</html>\n", "utf8");
    fs.writeFileSync(path.join(prototypesDir, "需求管理后台", "index.html"), "<html>admin</html>\n", "utf8");
    fs.writeFileSync(path.join(prototypesDir, "需求管理后台", "style.css"), "body {}\n", "utf8");

    await saveConfig({
      version: 1,
      projectName: "测试项目",
      author: "三清",
      scaffoldRepo: "a",
      templateRepo: "b"
    }, projectRoot);
    const stats = await getProjectStats(projectRoot);
    expect(stats.prototypes).toBe(2);
    expect("checkpoints" in stats).toBe(false);
    expect(stats.cloud.authStatus).toBe("unavailable");
  });

  it("includes cloud login status and current user", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-info-cloud-"));
    tempDirs.push(projectRoot);
    process.env.HOME = projectRoot;
    process.env[CLOUD_HOST_ENV_VAR] = "https://cloud.example.com";

    fs.mkdirSync(path.join(projectRoot, "workspace", "prototypes", "demo"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "workspace", "prototypes", "demo", "index.html"), "<html></html>", "utf8");

    await saveConfig({
      version: 1,
      projectName: "测试项目",
      author: "三清",
      scaffoldRepo: "a",
      templateRepo: "b",
      cloud: {
        projectId: "p-1",
        projectName: "云端项目",
      },
    }, projectRoot);

    await setAuthRecord("https://cloud.example.com", {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      user: {
        id: 1,
        email: "demo@example.com",
      },
      scopes: [],
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const stats = await getProjectStats(projectRoot);
    expect(stats.cloud.authStatus).toBe("active");
    expect(stats.cloud.userEmail).toBe("demo@example.com");
    expect(stats.cloud.projectId).toBe("p-1");
  });
});

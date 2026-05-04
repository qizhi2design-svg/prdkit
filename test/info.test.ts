import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveConfig } from "../src/utils/config.js";
import { getProjectStats } from "../src/commands/info.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
  });
});

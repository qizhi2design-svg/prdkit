import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDefaultPublishDirName, publishArtifacts } from "../src/lib/prototype/publisher.js";

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

describe("publishArtifacts", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("exports manifest, marks, and raw prototypes", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-publish-"));
    tempDirs.push(projectRoot);

    writeJson(path.join(projectRoot, ".prdkit", "config.json"), {
      version: 1,
      projectName: "Publish Demo",
      author: "tester",
      scaffoldRepo: "demo",
      templateRepo: "demo"
    });

    const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
    writeText(path.join(prototypesDir, "landing", "index.html"), "<html><body>landing</body></html>");
    writeText(path.join(prototypesDir, "landing", "assets", "app.js"), "console.log('landing');");
    writeText(
      path.join(prototypesDir, "landing", "marks", "mark-2.md"),
      `---
id: mark-2
title: 第二个
timestamp: 2
---
second`
    );
    writeText(
      path.join(prototypesDir, "landing", "marks", "mark-1.md"),
      `---
id: mark-1
title: 第一个
timestamp: 1
---
first`
    );
    writeText(path.join(prototypesDir, "nested", "mobile-home", "index.html"), "<html>mobile</html>");

    const outputDir = path.join(projectRoot, "dist", "publish", "artifact");
    const result = await publishArtifacts({
      projectRoot,
      prototypesDir,
      outputDir,
      projectName: "Publish Demo"
    });

    expect(result.manifest.version).toBe(1);
    expect(result.manifest.entryFiles).toEqual(["landing", "nested/mobile-home"]);
    expect(result.marks.landing.map((mark) => mark.id)).toEqual(["mark-1", "mark-2"]);

    expect(fs.existsSync(path.join(outputDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "marks.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "prototypes", "landing", "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "prototypes", "landing", "assets", "app.js"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "prototypes", "landing", "marks"))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, "prototypes", "nested", "mobile-home", "index.html"))).toBe(true);
  });

  it("fails when output directory already exists", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-publish-"));
    tempDirs.push(projectRoot);

    const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
    writeText(path.join(prototypesDir, "landing", "index.html"), "<html></html>");

    const outputDir = path.join(projectRoot, "dist", "publish", "artifact");
    fs.mkdirSync(outputDir, { recursive: true });

    await expect(
      publishArtifacts({
        projectRoot,
        prototypesDir,
        outputDir,
        projectName: "Publish Demo"
      })
    ).rejects.toThrow("输出目录已存在");
  });

  it("exports only selected prototype entries", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-publish-"));
    tempDirs.push(projectRoot);

    const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
    writeText(path.join(prototypesDir, "landing", "index.html"), "<html>landing</html>");
    writeText(path.join(prototypesDir, "dashboard", "index.html"), "<html>dashboard</html>");
    writeText(
      path.join(prototypesDir, "dashboard", "marks", "mark-1.md"),
      `---
id: mark-1
title: Dashboard
timestamp: 1
---
dashboard`
    );

    const outputDir = path.join(projectRoot, "dist", "publish", "selected-only");
    const result = await publishArtifacts({
      projectRoot,
      prototypesDir,
      outputDir,
      projectName: "Publish Demo",
      entryFiles: ["dashboard"]
    });

    expect(result.manifest.entryFiles).toEqual(["dashboard"]);
    expect(result.manifest.prototypesTree.children?.map((node) => node.path)).toEqual(["dashboard"]);
    expect(result.marks.dashboard).toHaveLength(1);
    expect(fs.existsSync(path.join(outputDir, "prototypes", "dashboard", "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "prototypes", "landing"))).toBe(false);
  });

  it("builds the default publish directory name with prototype prefix", () => {
    const dirName = buildDefaultPublishDirName("Publish Demo", new Date("2026-04-29T10:11:12.345Z"));
    expect(dirName).toBe("prototype-Publish-Demo-2026-04-29T10-11-12-345Z");
  });
});

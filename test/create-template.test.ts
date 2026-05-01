import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveConfig } from "../src/config.js";
import { runCreateTemplate } from "../src/commands/create-template.js";
import { listCheckpointRecords } from "../src/lib/prototype/checkpoint/store.js";

const tempDirs: string[] = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("runCreateTemplate", () => {
  it("creates an initial checkpoint for prototype directory templates", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-create-template-"));
    tempDirs.push(projectRoot);

    await saveConfig({
      version: 1,
      projectName: "Demo",
      author: "Alice",
      scaffoldRepo: "scaffold",
      templateRepo: "local-template",
      defaultCreateDirs: {
        "prototype-admin": "workspace/prototypes"
      }
    }, projectRoot);

    const bundledTemplateDir = path.resolve(__dirname, "../../template");
    const localTemplateDir = path.join(projectRoot, ".prdkit", "templates");
    fs.mkdirSync(localTemplateDir, { recursive: true });
    fs.cpSync(bundledTemplateDir, localTemplateDir, { recursive: true });

    process.chdir(projectRoot);

    await runCreateTemplate("运营后台", {
      dir: "workspace/prototypes",
      creator: "Alice",
      nonInteractive: true
    }, "prototype-admin");

    const outputDir = path.join(projectRoot, "workspace", "prototypes", "运营后台");
    const records = listCheckpointRecords(projectRoot, "运营后台");

    expect(fs.existsSync(path.join(outputDir, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "mock.js"))).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe("auto");
    expect(records[0].message).toBe("初始版本");
  });
});

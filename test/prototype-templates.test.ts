import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { copyTemplateDirectory } from "../src/templates.js";

const tempDirs: string[] = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("prototype directory templates", () => {
  it("renders web prototype with mock.js and script.js wiring", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-prototype-web-"));
    tempDirs.push(outputDir);

    await copyTemplateDirectory(path.resolve(__dirname, "../../template"), {
      id: "prototype",
      name: "Prototype Web",
      file: "prototype"
    }, path.join(outputDir, "demo"), {
      title: "首页原型",
      creator: "Alice",
      label: "local-md|cli",
      status: "planning",
      templateId: "prototype"
    });

    const html = fs.readFileSync(path.join(outputDir, "demo", "index.html"), "utf8");
    const script = fs.readFileSync(path.join(outputDir, "demo", "script.js"), "utf8");
    const mock = fs.readFileSync(path.join(outputDir, "demo", "mock.js"), "utf8");

    expect(html).toContain('<script src="mock.js"></script>');
    expect(html).toContain('<script src="script.js"></script>');
    expect(script).toContain("window.prototypeMock");
    expect(mock).toContain('title: "首页原型"');
  });

  it("renders mobile and admin templates with mock.js", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-prototype-multi-"));
    tempDirs.push(outputDir);

    await copyTemplateDirectory(path.resolve(__dirname, "../../template"), {
      id: "prototype-mobile",
      name: "Prototype Mobile",
      file: "prototype-mobile"
    }, path.join(outputDir, "mobile"), {
      title: "移动首页",
      creator: "Alice",
      label: "local-md|cli",
      status: "planning",
      templateId: "prototype-mobile"
    });

    await copyTemplateDirectory(path.resolve(__dirname, "../../template"), {
      id: "prototype-admin",
      name: "Prototype Admin",
      file: "prototype-admin"
    }, path.join(outputDir, "admin"), {
      title: "运营后台",
      creator: "Alice",
      label: "local-md|cli",
      status: "planning",
      templateId: "prototype-admin"
    });

    const mobileHtml = fs.readFileSync(path.join(outputDir, "mobile", "index.html"), "utf8");
    const mobileMock = fs.readFileSync(path.join(outputDir, "mobile", "mock.js"), "utf8");
    const adminHtml = fs.readFileSync(path.join(outputDir, "admin", "index.html"), "utf8");
    const adminMock = fs.readFileSync(path.join(outputDir, "admin", "mock.js"), "utf8");

    expect(mobileHtml).toContain('<script src="mock.js"></script>');
    expect(mobileMock).toContain('title: "移动首页"');
    expect(adminHtml).toContain('<script src="mock.js"></script>');
    expect(adminMock).toContain('title: "运营后台"');
  });
});

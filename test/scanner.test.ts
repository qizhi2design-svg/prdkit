import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { flattenPrototypes, scanPrototypes } from "../src/lib/server/scanner.js";

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

describe("scanPrototypes", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("keeps existing behavior when no .prdkitignore is present", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-scanner-"));
    tempDirs.push(projectRoot);

    const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
    writeText(path.join(prototypesDir, "landing", "index.html"), "<html>landing</html>");
    writeText(path.join(prototypesDir, "nested", "mobile-home", "index.html"), "<html>mobile</html>");

    const tree = scanPrototypes(prototypesDir);

    expect(flattenPrototypes(tree)).toEqual(["landing", "nested/mobile-home"]);
    expect(tree.children?.map((node) => node.path)).toEqual(["landing", "nested"]);
  });

  it("applies root and nested .prdkitignore rules to the prototype list", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-scanner-"));
    tempDirs.push(projectRoot);

    const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
    writeText(
      path.join(prototypesDir, ".prdkitignore"),
      ["hidden-root", "group/hidden-child", "*.draft"].join("\n")
    );
    writeText(path.join(prototypesDir, "visible-root", "index.html"), "<html>visible</html>");
    writeText(path.join(prototypesDir, "hidden-root", "index.html"), "<html>hidden</html>");
    writeText(path.join(prototypesDir, "notes.draft", "index.html"), "<html>draft</html>");
    writeText(path.join(prototypesDir, "group", "visible-child", "index.html"), "<html>group visible</html>");
    writeText(path.join(prototypesDir, "group", "hidden-child", "index.html"), "<html>group hidden</html>");
    writeText(
      path.join(prototypesDir, "group", ".prdkitignore"),
      ["nested-hidden", "中文目录/**", "!中文目录/保留页面"].join("\n")
    );
    writeText(path.join(prototypesDir, "group", "nested-hidden", "index.html"), "<html>nested hidden</html>");
    writeText(path.join(prototypesDir, "group", "nested-visible", "index.html"), "<html>nested visible</html>");
    writeText(path.join(prototypesDir, "group", "中文目录", "已忽略页面", "index.html"), "<html>ignored zh</html>");
    writeText(path.join(prototypesDir, "group", "中文目录", "保留页面", "index.html"), "<html>kept zh</html>");

    const tree = scanPrototypes(prototypesDir);

    expect(flattenPrototypes(tree)).toEqual([
      "group/nested-visible",
      "group/visible-child",
      "group/中文目录/保留页面",
      "visible-root"
    ]);

    const groupNode = tree.children?.find((node) => node.path === "group");
    expect(groupNode?.type).toBe("folder");
    expect(groupNode?.children?.map((node) => node.path)).toEqual([
      "group/nested-visible",
      "group/visible-child",
      "group/中文目录"
    ]);
  });

  it("supports anchored and descendant directory rules", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-scanner-"));
    tempDirs.push(projectRoot);

    const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
    writeText(
      path.join(prototypesDir, ".prdkitignore"),
      ["/only-top-level", "archive/**", "!archive/keep-me"].join("\n")
    );
    writeText(path.join(prototypesDir, "only-top-level", "index.html"), "<html>top hidden</html>");
    writeText(path.join(prototypesDir, "nested", "only-top-level", "index.html"), "<html>nested keep</html>");
    writeText(path.join(prototypesDir, "archive", "drop-me", "index.html"), "<html>archive hidden</html>");
    writeText(path.join(prototypesDir, "archive", "keep-me", "index.html"), "<html>archive keep</html>");

    const tree = scanPrototypes(prototypesDir);

    expect(flattenPrototypes(tree)).toEqual([
      "archive/keep-me",
      "nested/only-top-level"
    ]);
  });
});

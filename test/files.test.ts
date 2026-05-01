import { describe, expect, it } from "vitest";
import { resolveOutputPath, sanitizeFileStem, suggestedFileName } from "../src/utils/files.js";

describe("files", () => {
  it("sanitizes titles into file stems", () => {
    expect(sanitizeFileStem(" 支付 流程 优化 ")).toBe("支付-流程-优化");
    expect(sanitizeFileStem("a/b:c")).toBe("a-b-c");
  });

  it("builds default names with template id", () => {
    expect(suggestedFileName("支付流程优化", "prd")).toBe("支付流程优化-prd.md");
  });

  it("uses folder names for directory templates", async () => {
    const output = await resolveOutputPath({
      cwd: "/tmp/demo",
      dir: "workspace/prototypes",
      title: "移动验证页",
      templateId: "prototype-mobile",
      isDirectoryTemplate: true
    });

    expect(output).toBe("/tmp/demo/workspace/prototypes/移动验证页");
  });
});

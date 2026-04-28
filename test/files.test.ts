import { describe, expect, it } from "vitest";
import { sanitizeFileStem, suggestedFileName } from "../src/files.js";

describe("files", () => {
  it("sanitizes titles into file stems", () => {
    expect(sanitizeFileStem(" 支付 流程 优化 ")).toBe("支付-流程-优化");
    expect(sanitizeFileStem("a/b:c")).toBe("a-b-c");
  });

  it("builds default names with template id", () => {
    expect(suggestedFileName("支付流程优化", "prd")).toBe("支付流程优化-prd.md");
  });
});

import { describe, expect, it } from "vitest";
import { renderTemplate, resolveTemplate } from "../src/lib/templates.js";

describe("templates", () => {
  it("renders supported placeholders", () => {
    const content = "# {{title}}\n\n创建者：{{creator}}\n标签：{{label}}\n状态：{{status}}\n类型：{{templateId}}\n";
    const rendered = renderTemplate(content, {
      title: "支付优化",
      creator: "Alice",
      label: "local-md|cli",
      status: "planning",
      templateId: "prd"
    });

    expect(rendered).toContain("# 支付优化");
    expect(rendered).toContain("创建者：Alice");
    expect(rendered).toContain("标签：local-md|cli");
    expect(rendered).toContain("状态：planning");
    expect(rendered).toContain("类型：prd");
  });

  it("resolves template by id", () => {
    const template = resolveTemplate({
      version: 1,
      templates: [
        { id: "prd", name: "PRD", file: "prd.md" },
        { id: "prototype", name: "Prototype", file: "prototype.md" }
      ]
    }, "prototype");

    expect(template.file).toBe("prototype.md");
  });
});

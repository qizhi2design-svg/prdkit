import { describe, expect, it } from "vitest";
import { renderTemplate, resolveTemplate } from "../src/templates.js";

describe("templates", () => {
  it("renders supported placeholders", () => {
    const content = "# {{title}}\n\n项目：{{projectName}}\n作者：{{author}}\n日期：{{date}}\n类型：{{templateId}}\n";
    const rendered = renderTemplate(content, {
      title: "支付优化",
      projectName: "Demo",
      author: "Alice",
      date: "2026-04-26",
      templateId: "prd"
    });

    expect(rendered).toContain("# 支付优化");
    expect(rendered).toContain("项目：Demo");
    expect(rendered).toContain("作者：Alice");
    expect(rendered).toContain("日期：2026-04-26");
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

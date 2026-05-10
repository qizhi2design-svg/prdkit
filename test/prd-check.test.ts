import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveConfig } from "../src/utils/config.js";
import { resolvePrdCheckTarget } from "../src/commands/prd/common.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolvePrdCheckTarget", () => {
  it("resolves by title and falls back to latest when target is empty", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-prd-check-"));
    tempDirs.push(projectRoot);

    await saveConfig({
      version: 1,
      projectName: "Demo",
      author: "Alice",
      scaffoldRepo: "scaffold",
      templateRepo: "local-template",
      defaultCreateDirs: {
        prd: "workspace/prds",
      }
    }, projectRoot);

    const prdsDir = path.join(projectRoot, "workspace", "prds");
    fs.mkdirSync(prdsDir, { recursive: true });

    const olderPath = path.join(prdsDir, "订单中心-prd.md");
    fs.writeFileSync(olderPath, `---\ntitle: "订单中心"\n---\n\n# 订单中心\n`, "utf8");

    const latestPath = path.join(prdsDir, "支付流程优化-prd.md");
    fs.writeFileSync(latestPath, `---\ntitle: "支付流程优化"\n---\n\n# 支付流程优化\n`, "utf8");

    const olderTime = new Date("2026-05-01T10:00:00.000Z");
    const latestTime = new Date("2026-05-01T11:00:00.000Z");
    fs.utimesSync(olderPath, olderTime, olderTime);
    fs.utimesSync(latestPath, latestTime, latestTime);

    const byTitle = await resolvePrdCheckTarget(projectRoot, "订单中心");
    expect(byTitle.title).toBe("订单中心");
    expect(byTitle.fileName).toBe("订单中心-prd.md");
    expect(byTitle.selectionReason).toBe("explicit");

    const latest = await resolvePrdCheckTarget(projectRoot);
    expect(latest.title).toBe("支付流程优化");
    expect(latest.fileName).toBe("支付流程优化-prd.md");
    expect(latest.selectionReason).toBe("latest");
  });
});

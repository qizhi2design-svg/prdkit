import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveConfig } from "../src/utils/config.js";
import { runCreateTemplate } from "../src/core/create-command.js";
import { listCheckpointRecords } from "../src/lib/checkpoints/prototype/store.js";
import { loadPrdPlan } from "../src/commands/prd/common.js";

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

  it("renders complexity-aware prd template variables from a plan file", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-prd-plan-"));
    tempDirs.push(projectRoot);

    await saveConfig({
      version: 1,
      projectName: "Demo",
      author: "Alice",
      scaffoldRepo: "scaffold",
      templateRepo: "local-template",
      defaultCreateDirs: {
        prd: "workspace/prds"
      }
    }, projectRoot);

    const bundledTemplateDir = path.resolve(__dirname, "../../template");
    const localTemplateDir = path.join(projectRoot, ".prdkit", "templates");
    fs.mkdirSync(localTemplateDir, { recursive: true });
    fs.cpSync(bundledTemplateDir, localTemplateDir, { recursive: true });

    const planDir = path.join(projectRoot, "draft", "reference");
    fs.mkdirSync(planDir, { recursive: true });
    const planPath = path.join(planDir, "支付流程优化-prd-plan.md");
    fs.writeFileSync(planPath, `---
title: "支付流程优化"
creator: "Alice"
project_name: "Demo"
product_mode: "企业自研系统"
product_type: "交易型平台"
product_type_reasoning: "涉及支付、账单和结果回执链路"
complexity_level: "L3"
complexity_reasoning: "涉及支付链路、消息通知与账单同步"
recommended_sections:
  - 背景与问题
  - 目标与成功标准
chapter_strategy:
  - 背景与问题：必选
  - 业务规则 / 流程：必选
plan_assumptions:
  - 默认账单中心接口能提供实时状态
high_complexity_selfcheck:
  - 明确支付异常流
  - 明确外部依赖与回滚方案
confirmed_info:
  background: "支付成功后缺少统一结果回执。"
  problem: "用户无法快速确认支付状态。"
  users:
    - C 端付款用户
  scenarios:
    - 支付完成后查看结果
  goals:
    - 降低支付后客服咨询量
  success_metrics:
    - 支付结果页点击完成率达到 95%
  in_scope:
    - 新增支付结果页回执区
  out_of_scope:
    - 不改造收银台
  functional_requirements:
    - 展示支付状态、订单号、到账说明
  business_rules:
    - 支付成功、处理中、失败三种状态分别展示
  interaction_requirements:
    - 成功态提供返回订单详情入口
  data_requirements:
    - 记录支付状态曝光与按钮点击
  risks:
    - 第三方支付回调延迟
  dependencies:
    - 账单中心接口
  acceptance_criteria:
    - 三种支付状态都可正确展示
  milestones:
    - 第一周完成方案评审
  open_questions:
    - 是否需要短信补偿通知
---

# 支付流程优化 PRD 方案稿
`, "utf8");

    process.chdir(projectRoot);

    const loadedPlan = loadPrdPlan("./draft/reference/支付流程优化-prd-plan.md");
    await runCreateTemplate(loadedPlan.title, {
      dir: "workspace/prds",
      creator: loadedPlan.creator,
      nonInteractive: true,
      extraVariables: loadedPlan.extraVariables,
    }, "prd");

    const outputPath = path.join(projectRoot, "workspace", "prds", "支付流程优化-prd.md");
    const content = fs.readFileSync(outputPath, "utf8");

    expect(content).toContain("复杂度等级：L3");
    expect(content).toContain("产品定型：企业自研系统 × 交易型平台");
    expect(content).toContain("涉及支付、账单和结果回执链路");
    expect(content).toContain("业务规则 / 流程：必选");
    expect(content).toContain("涉及支付链路、消息通知与账单同步");
    expect(content).toContain("支付成功后缺少统一结果回执。");
    expect(content).toContain("默认账单中心接口能提供实时状态");
    expect(content).toContain("明确支付异常流");
    expect(content).toContain("第三方支付回调延迟");
    expect(content).toContain("是否需要短信补偿通知");
  });
});

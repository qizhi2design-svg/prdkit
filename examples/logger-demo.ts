#!/usr/bin/env tsx

/**
 * Logger 功能演示脚本
 * 运行方式：pnpm tsx examples/logger-demo.ts
 */

import { Logger } from "../src/logger.js";

async function demo() {
  console.log("=== Logger 功能演示 ===\n");

  // 1. 基本日志级别
  console.log("1. 基本日志级别（Pretty 格式）");
  const logger = new Logger({ level: "debug", format: "pretty" });

  logger.debug("这是调试信息", { module: "demo", line: 15 });
  logger.info("这是一般信息");
  logger.warn("这是警告信息");
  logger.error("这是错误信息");
  logger.success("这是成功消息");

  console.log("\n2. JSON 格式输出");
  logger.setFormat("json");
  logger.info("JSON 格式的日志", { timestamp: Date.now(), user: "demo" });

  // 切换回 pretty 格式
  logger.setFormat("pretty");

  // 3. 日志级别过滤
  console.log("\n3. 日志级别过滤（设置为 warn）");
  logger.setLevel("warn");
  logger.debug("这条不会显示");
  logger.info("这条也不会显示");
  logger.warn("这条会显示");
  logger.error("这条也会显示");

  // 恢复到 info 级别
  logger.setLevel("info");

  // 4. Spinner 演示
  console.log("\n4. Spinner 演示");
  const spinner = logger.spinner("正在处理任务...");
  spinner.start();

  await new Promise(resolve => setTimeout(resolve, 1500));
  spinner.succeed("任务处理完成");

  // 5. 带元数据的日志
  console.log("\n5. 带元数据的日志");
  logger.info("用户操作", {
    action: "create_document",
    documentType: "prd",
    title: "支付流程优化",
    timestamp: new Date().toISOString()
  });

  // 6. 错误场景
  console.log("\n6. 错误场景演示");
  const errorSpinner = logger.spinner("尝试读取文件...");
  errorSpinner.start();

  await new Promise(resolve => setTimeout(resolve, 1000));
  errorSpinner.fail("文件读取失败");

  logger.error("无法读取配置文件", {
    path: "/path/to/config.json",
    error: "ENOENT: no such file or directory",
    code: "ENOENT"
  });

  // 7. 配置信息
  console.log("\n7. 当前配置");
  const config = logger.getConfig();
  logger.info("Logger 配置", {
    level: config.level,
    format: config.format,
    logFile: config.logFile || "未设置"
  });

  console.log("\n=== 演示完成 ===");
  console.log("\n提示：");
  console.log("- 可通过环境变量配置：PRDKIT_LOG_LEVEL, PRDKIT_LOG_FORMAT, PRDKIT_LOG_FILE");
  console.log("- 例如：PRDKIT_LOG_LEVEL=debug PRDKIT_LOG_FORMAT=json pnpm tsx examples/logger-demo.ts");
}

demo().catch(console.error);

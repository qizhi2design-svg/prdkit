import { Command } from "commander";
import { buildDeprecatedCommand } from "#commands/deprecations.js";

export function registerCloud(program: Command): void {
  const cloud = program
    .command("cloud")
    .description("已废弃，请改用 auth / info / prototype publish");

  buildDeprecatedCommand(cloud, "config", "`prdkit cloud config` 已移除，请改为在当前项目的 .prdkit/config.json 中设置 cloud.host");
  buildDeprecatedCommand(cloud, "status", "`prdkit cloud status` 已移除，请改用 `prdkit info` 查看云端登录状态");
  buildDeprecatedCommand(cloud, "login", "`prdkit cloud login` 已移除，请改用 `prdkit auth login`");
  buildDeprecatedCommand(cloud, "link", "`prdkit cloud link` 已移除，请改用本地 viewer 的云端发布面板选择或创建项目");
  buildDeprecatedCommand(cloud, "unlink", "`prdkit cloud unlink` 已移除，请改用本地 viewer 的云端发布面板管理发布目标");
}

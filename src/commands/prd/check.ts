import { Command } from "commander";
import chalk from "chalk";
import { COPY } from "#constants/command-text.js";
import { resolveProjectRoot } from "#utils/config.js";
import { logger } from "#utils/logger.js";
import { ConfigError } from "#utils/errors.js";
import { PrdCheckOptions, resolvePrdCheckTarget, outputJson } from "./common.js";

export function registerPrdCheck(prd: Command): void {
  prd
    .command("check")
    .argument("[target]", "PRD 标题、文件名或路径")
    .description(COPY.prdCheckDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdCheckHelpAfter}`)
    .action(async (target: string | undefined, options: PrdCheckOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const resolved = await resolvePrdCheckTarget(projectRoot, target);
      const suggestedSkillCommand = `/skill prdkit-prd-check ${resolved.absolutePath}`;
      const promptHint = `请审查这份 PRD：${resolved.absolutePath}`;

      if (options.json) {
        outputJson({
          prd: resolved,
          suggestedSkillCommand,
          promptHint,
        });
        return;
      }

      logger.success(`已定位 PRD：${resolved.title}`);
      logger.info(`文件：${resolved.projectRelativePath}`);
      logger.info(`绝对路径：${resolved.absolutePath}`);
      if (resolved.selectionReason === "latest") {
        logger.info("未指定目标，已默认选择最近修改的一份 PRD");
      }
      console.log("");
      console.log(chalk.bold("推荐下一步"));
      console.log(`  ${suggestedSkillCommand}`);
      console.log(chalk.dim(`  或直接告诉支持 skill 的终端：${promptHint}`));
    });
}

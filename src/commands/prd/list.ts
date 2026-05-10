import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { COPY } from "#constants/command-text.js";
import { resolveProjectRoot } from "#utils/config.js";
import { logger } from "#utils/logger.js";
import { ConfigError } from "#utils/errors.js";
import { PrdListOptions, scanPrdFiles, formatPrdList } from "./common.js";

export function registerPrdList(prd: Command): void {
  prd
    .command("list")
    .description(COPY.prdListDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prdListHelpAfter}`)
    .action(async (options: PrdListOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const prdsDir = path.join(projectRoot, "workspace", "prds");
      const prdList = scanPrdFiles(prdsDir);

      if (options.json) {
        console.log(`${JSON.stringify({ prds: prdList }, null, 2)}\n`);
        return;
      }

      console.log(formatPrdList(prdList));
      console.log(chalk.dim(`\n共找到 ${prdList.length} 个 PRD 文档`));
    });
}

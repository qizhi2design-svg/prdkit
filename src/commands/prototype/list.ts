import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { COPY } from "#constants/command-text.js";
import { resolveProjectRoot } from "#utils/config.js";
import { flattenPrototypes, scanPrototypes } from "#lib/server/scanner.js";
import { ConfigError } from "#utils/errors.js";
import { PrototypeListOptions, formatPrototypeList } from "./common.js";

export function registerPrototypeList(prototype: Command): void {
  prototype
    .command("list")
    .description(COPY.prototypeListDescription)
    .option("-j, --json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prototypeListHelpAfter}`)
    .action(async (options: PrototypeListOptions) => {
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
      const tree = scanPrototypes(prototypesDir);
      const prototypeList = flattenPrototypes(tree);

      if (options.json) {
        console.log(`${JSON.stringify({ prototypes: prototypeList }, null, 2)}\n`);
        return;
      }

      console.log(formatPrototypeList(prototypeList));
      console.log(chalk.dim(`\n共找到 ${prototypeList.length} 个原型`));
    });
}

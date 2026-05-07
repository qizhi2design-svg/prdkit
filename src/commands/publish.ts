import { Command } from "commander";
import { COPY } from "#constants/command-text.js";

export function registerPublish(program: Command): void {
  program
    .command("publish")
    .description(COPY.publishDescription)
    .allowUnknownOption(true)
    .addHelpText("after", `\n${COPY.publishHelpAfter}`)
    .action(() => {
      throw new Error("`prdkit publish` 已移除，请改用 `prdkit prototype publish`");
    });
}

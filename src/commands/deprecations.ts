import { Command } from "commander";

export function buildDeprecatedCommand(
  parent: Command,
  name: string,
  message: string,
  description = "已废弃命令"
): Command {
  return parent
    .command(name)
    .description(description)
    .allowUnknownOption(true)
    .action(() => {
      throw new Error(message);
    });
}

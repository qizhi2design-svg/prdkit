#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { COPY } from "./command-text.js";
import { registerCreate } from "./commands/create.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerInit } from "./commands/init.js";
import { registerServe } from "./commands/serve.js";
import { registerUpdate } from "./commands/update.js";
import { fail } from "./ui.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));
const version = packageJson.version as string;

const program = new Command();

program
  .name("prdkit")
  .description(COPY.rootDescription)
  .version(version)
  .addHelpCommand(false)
  .showHelpAfterError("(使用 prdkit -h 查看帮助)")
  .configureHelp({
    styleTitle: (str) => chalk.cyan.bold(str),
    styleCommandText: (str) => chalk.green(str),
    styleOptionText: (str) => chalk.yellow(str),
    styleArgumentText: (str) => chalk.magenta(str),
    sortSubcommands: false,
    sortOptions: true,
    showGlobalOptions: true,
    subcommandTerm: (cmd) => cmd.name()
  })
  .addHelpText("after", `\n${COPY.rootHelpAfter.trim()}\n`);

registerInit(program);
registerCreate(program);
registerDoctor(program);
registerServe(program);
registerUpdate(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof Error && error.message.includes("force closed the prompt")) {
    process.exit(0);
  }
  fail(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

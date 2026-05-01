#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { COPY } from "#constants/command-text.js";
import { registerDoctor } from "#commands/doctor.js";
import { registerInit } from "#commands/init.js";
import { registerMark } from "#commands/mark.js";
import { registerPrd } from "#commands/prd.js";
import { registerPrototype } from "#commands/prototype.js";
import { registerServe } from "#commands/serve.js";
import { registerUpdate } from "#commands/update.js";
import { registerPublish } from "#commands/publish.js";
import { registerCheckpoint } from "#commands/checkpoint.js";
import { registerInfo } from "#commands/info.js";
import { handleError } from "#utils/error-handler.js";
import { UserCancelledError } from "#utils/errors.js";

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
registerPrd(program);
registerPrototype(program);
registerMark(program);
registerInfo(program);
registerDoctor(program);
registerServe(program);
registerUpdate(program);
registerPublish(program);
registerCheckpoint(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  // 用户取消操作（Ctrl+C）
  if (error instanceof Error && error.message.includes("force closed the prompt")) {
    throw new UserCancelledError();
  }
  // 其他错误直接抛出，由 handleError 处理
  throw error;
}).catch(handleError);

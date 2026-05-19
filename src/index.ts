#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { COPY } from "#constants/command-text.js";
import { handleError } from "#utils/error-handler.js";
import { UserCancelledError } from "#utils/errors.js";
import { notifyIfCliUpdateAvailable } from "#utils/update-notifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));
const version = packageJson.version as string;

const program = new Command();

program
  .name("prdkit")
  .description(COPY.rootDescription)
  .version(version, "-V")
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
    subcommandTerm: (cmd) => cmd.name(),
  })
  .addHelpText("after", `\n${COPY.rootHelpAfter.trim()}\n`);

// 懒加载命令模块：所有命令的注册函数在启动时并行加载
const commands = await Promise.all([
  import("#commands/clone.js").then(m => m.registerClone(program)),
  import("#commands/init.js").then(m => m.registerInit(program)),
  import("#commands/prd/index.js").then(m => m.registerPrd(program)),
  import("#commands/prototype/index.js").then(m => m.registerPrototype(program)),
  import("#commands/info.js").then(m => m.registerInfo(program)),
  import("#commands/doctor.js").then(m => m.registerDoctor(program)),
  import("#commands/serve.js").then(m => m.registerServe(program)),
  import("#commands/update.js").then(m => m.registerUpdate(program)),
  import("#commands/auth.js").then(m => m.registerAuth(program)),
  import("#commands/cloud.js").then(m => m.registerCloud(program)),
])

await notifyIfCliUpdateAvailable({
  packageName: packageJson.name as string,
  currentVersion: version,
  argv: process.argv.slice(2),
});

program.parseAsync(process.argv).catch((error: unknown) => {
  // 用户取消操作（Ctrl+C）
  if (error instanceof Error && error.message.includes("force closed the prompt")) {
    throw new UserCancelledError();
  }
  // 其他错误直接抛出，由 handleError 处理
  throw error;
}).catch(handleError);

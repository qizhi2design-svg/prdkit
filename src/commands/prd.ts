import { Command } from "commander";
import { COPY } from "../command-text.js";
import { runCreateTemplate, type CreateTemplateOptions } from "./create-template.js";

export function registerPrd(program: Command): void {
  program
    .command("prd")
    .description(COPY.prdDescription)
    .addCommand(
      new Command("create")
        .argument("[title]", "PRD 标题")
        .description(COPY.prdCreateDescription)
        .option("--output <file-or-dir>", "输出文件路径或目录")
        .option("--dir <dir>", "输出目录")
        .option("--name <project-name>", "项目名称")
        .option("--author <author>", "作者")
        .option("--date <yyyy-mm-dd>", "文档日期")
        .option("--non-interactive", "禁用交互式输入")
        .addHelpText("after", `\n${COPY.prdCreateHelpAfter}`)
        .action(async (titleArg: string | undefined, options: CreateTemplateOptions) => {
          await runCreateTemplate(titleArg, options, "prd");
        })
    );
}

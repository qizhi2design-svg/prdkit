import { Command } from "commander";
import { COPY } from "#constants/command-text.js";
import { runCreateTemplate } from "#core/create-command.js";
import { PrototypeCreateOptions, resolvePrototypeTemplate } from "./common.js";

export function registerPrototypeCreate(prototype: Command): void {
  prototype
    .command("create")
    .argument("[title]", "原型标题")
    .description(COPY.prototypeCreateDescription)
    .option("-t, --template <type>", "原型模板类型：web | mobile | admin")
    .option("-o, --output <file-or-dir>", "输出文件路径或目录")
    .option("-d, --dir <dir>", "输出目录")
    .option("-n, --name <project-name>", "项目名称")
    .option("-a, --author <author>", "作者")
    .option("-D, --date <yyyy-mm-dd>", "文档日期")
    .option("--non-interactive", "禁用交互式输入")
    .addHelpText("after", `\n${COPY.prototypeCreateHelpAfter}`)
    .action(async (titleArg: string | undefined, options: PrototypeCreateOptions) => {
      const templateId = resolvePrototypeTemplate(options.template);
      await runCreateTemplate(titleArg, { ...options, template: templateId }, templateId);
    });
}

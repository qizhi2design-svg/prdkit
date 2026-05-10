import { Command } from "commander";
import { COPY } from "#constants/command-text.js";
import { runCreateTemplate } from "#core/create-command.js";
import {
  PrdCreateOptions,
  DEFAULT_PRD_TEMPLATE_VARIABLES,
  loadPrdPlan,
} from "./common.js";

export function registerPrdCreate(prd: Command): void {
  prd
    .command("create")
    .argument("[title]", "PRD 标题")
    .description(COPY.prdCreateDescription)
    .option("-o, --output <file-or-dir>", "输出文件路径或目录")
    .option("-d, --dir <dir>", "输出目录")
    .option("-n, --name <project-name>", "项目名称")
    .option("-a, --author <author>", "作者")
    .option("-D, --date <yyyy-mm-dd>", "文档日期")
    .option("-f, --from-plan <file>", "从第一阶段方案稿生成正式 PRD")
    .option("--non-interactive", "禁用交互式输入")
    .addHelpText("after", `\n${COPY.prdCreateHelpAfter}`)
    .action(async (titleArg: string | undefined, options: PrdCreateOptions) => {
      let resolvedTitle = titleArg;
      let resolvedOptions: PrdCreateOptions = { ...options };

      resolvedOptions = {
        ...resolvedOptions,
        creator: resolvedOptions.creator ?? options.author,
        extraVariables: {
          ...DEFAULT_PRD_TEMPLATE_VARIABLES,
          ...(options.name ? { projectName: options.name } : {}),
          ...(options.date ? { documentDate: options.date } : {}),
          ...(resolvedOptions.extraVariables ?? {}),
        },
      };

      if (options.fromPlan) {
        const loadedPlan = loadPrdPlan(options.fromPlan);
        resolvedTitle = resolvedTitle ?? loadedPlan.title;
        resolvedOptions = {
          ...resolvedOptions,
          creator: resolvedOptions.creator ?? loadedPlan.creator,
          extraVariables: {
            ...DEFAULT_PRD_TEMPLATE_VARIABLES,
            ...(resolvedOptions.extraVariables ?? {}),
            ...loadedPlan.extraVariables,
          },
        };
      }

      await runCreateTemplate(resolvedTitle, resolvedOptions, "prd");
    });
}

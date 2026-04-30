import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { COPY } from "../command-text.js";
import { resolveProjectRoot } from "../config.js";
import { flattenPrototypes, scanPrototypes } from "../prototype/server/scanner.js";
import { fail } from "../ui.js";
import { runCreateTemplate, type CreateTemplateOptions } from "./create-template.js";

interface PrototypeListOptions {
  json?: boolean;
}

interface PrototypeCreateOptions extends CreateTemplateOptions {
  template?: string;
}

const prototypeTemplateAliases: Record<string, string> = {
  default: "prototype",
  web: "prototype",
  desktop: "prototype",
  mobile: "prototype-mobile",
  admin: "prototype-admin",
  "pc-admin": "prototype-admin",
  "prototype-mobile": "prototype-mobile",
  "prototype-admin": "prototype-admin",
  prototype: "prototype"
};

function resolvePrototypeTemplate(template?: string): string {
  if (!template?.trim()) {
    return "prototype";
  }

  const normalized = template.trim().toLowerCase();
  const resolved = prototypeTemplateAliases[normalized];
  if (!resolved) {
    throw new Error("不支持的原型模板，请使用 web、mobile、admin、prototype-mobile 或 prototype-admin");
  }
  return resolved;
}

function formatPrototypeList(prototypes: string[]): string {
  if (prototypes.length === 0) {
    return chalk.yellow("未找到任何原型");
  }

  return prototypes.map((name, index) => `${chalk.cyan(`${index + 1}.`)} ${name}`).join("\n");
}

export function registerPrototype(program: Command): void {
  const prototype = program.command("prototype").description(COPY.prototypeDescription);

  prototype
    .command("create")
    .argument("[title]", "原型标题")
    .description(COPY.prototypeCreateDescription)
    .option("--template <type>", "原型模板类型：web | mobile | admin")
    .option("--output <file-or-dir>", "输出文件路径或目录")
    .option("--dir <dir>", "输出目录")
    .option("--name <project-name>", "项目名称")
    .option("--author <author>", "作者")
    .option("--date <yyyy-mm-dd>", "文档日期")
    .option("--non-interactive", "禁用交互式输入")
    .addHelpText("after", `\n${COPY.prototypeCreateHelpAfter}`)
    .action(async (titleArg: string | undefined, options: PrototypeCreateOptions) => {
      const templateId = resolvePrototypeTemplate(options.template);
      await runCreateTemplate(titleArg, { ...options, template: templateId }, templateId);
    });

  prototype
    .command("list")
    .description(COPY.prototypeListDescription)
    .option("--json", "以 JSON 输出")
    .addHelpText("after", `\n${COPY.prototypeListHelpAfter}`)
    .action(async (options: PrototypeListOptions) => {
      try {
        const projectRoot = await resolveProjectRoot(process.cwd());
        if (!projectRoot) {
          throw new Error("未找到 .prdkit/config.json，请先运行 prdkit init 初始化项目");
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
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

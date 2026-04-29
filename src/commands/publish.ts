import { Command } from "commander";
import path from "node:path";
import { COPY } from "../command-text.js";
import { loadConfig, resolveProjectRoot } from "../config.js";
import { fail, info, success } from "../ui.js";
import { buildDefaultPublishOutputDir, publishArtifacts } from "../prototype/publisher.js";

interface PublishOptions {
  output?: string;
}

export function registerPublish(program: Command): void {
  program
    .command("publish")
    .description(COPY.publishDescription)
    .option("-o, --output <dir>", "输出目录（默认生成到 dist/publish 下）")
    .addHelpText("after", `\n${COPY.publishHelpAfter}`)
    .action(async (options: PublishOptions) => {
      try {
        const projectRoot = await resolveProjectRoot(process.cwd());
        if (!projectRoot) {
          throw new Error("未找到 .prdkit/config.json，请先运行 prdkit init 初始化项目");
        }

        const config = await loadConfig(projectRoot);
        if (!config) {
          throw new Error("未找到项目配置，请先运行 prdkit init 初始化项目");
        }

        const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
        const outputDir = options.output
          ? path.resolve(process.cwd(), options.output)
          : buildDefaultPublishOutputDir(projectRoot, config.projectName);

        info(`准备导出 publish 产物到：${outputDir}`);

        const result = await publishArtifacts({
          projectRoot,
          prototypesDir,
          outputDir,
          projectName: config.projectName
        });

        success(`发布产物已生成：${result.outputDir}`);
        info(`原型数量：${result.manifest.entryFiles.length}`);
        info(`协议文件：manifest.json, marks.json`);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

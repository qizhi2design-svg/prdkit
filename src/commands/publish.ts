import { Command } from "commander";
import path from "node:path";
import { COPY } from "../command-text.js";
import { loadConfig, resolveProjectRoot } from "../config.js";
import { logger } from "../logger.js";
import { ConfigError } from "../errors.js";
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
      const projectRoot = await resolveProjectRoot(process.cwd());
      if (!projectRoot) {
        throw ConfigError.projectNotInitialized();
      }

      const config = await loadConfig(projectRoot);
      if (!config) {
        throw ConfigError.notFound(path.join(projectRoot, ".prdkit", "config.json"));
      }

      const prototypesDir = path.join(projectRoot, "workspace", "prototypes");
      const outputDir = options.output
        ? path.resolve(process.cwd(), options.output)
        : buildDefaultPublishOutputDir(projectRoot, config.projectName);

      logger.info(`准备导出 publish 产物到：${outputDir}`);

      const result = await publishArtifacts({
        projectRoot,
        prototypesDir,
        outputDir,
        projectName: config.projectName
      });

      logger.success(`发布产物已生成：${result.outputDir}`);
      logger.info(`原型数量：${result.manifest.entryFiles.length}`);
      logger.info(`协议文件：manifest.json, marks.json`);
    });
}

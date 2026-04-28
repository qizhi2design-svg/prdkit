import type { PrdkitConfig } from "./types.js";

export const DEFAULT_SCAFFOLD_REPO = "https://github.com/qizhi2design-svg/scaffold.git";
export const DEFAULT_TEMPLATE_REPO = "https://github.com/qizhi2design-svg/prdkit-tempaltes.git";

export function createDefaultConfig(
  projectName: string,
  author: string,
  scaffoldRepo?: string,
  templateRepo?: string
): PrdkitConfig {
  return {
    version: 1,
    projectName,
    author,
    scaffoldRepo: scaffoldRepo ?? DEFAULT_SCAFFOLD_REPO,
    templateRepo: templateRepo ?? DEFAULT_TEMPLATE_REPO,
    defaultCreateDirs: {
      prd: "workspace/prds",
      prototype: "workspace/prototypes"
    }
  };
}

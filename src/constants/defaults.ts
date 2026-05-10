import type { PrdkitConfig } from "#types/index.js";
import { DEFAULT_VIEWER_SKILLS } from "#lib/constants/index.js";

export const DEFAULT_SCAFFOLD_REPO = "https://github.com/qizhi2design-svg/scaffold.git";
export const DEFAULT_TEMPLATE_REPO = "https://github.com/qizhi2design-svg/prdkit-tempaltes.git";

export function createDefaultConfig(
  projectName: string,
  author: string,
  scaffoldRepo?: string,
  templateRepo?: string,
  description?: string,
  productPositioning?: string,
  teamSize?: string,
  projectStage?: string
): PrdkitConfig {
  return {
    version: 1,
    projectName,
    author,
    description,
    productPositioning,
    teamSize,
    projectStage,
    scaffoldRepo: scaffoldRepo ?? DEFAULT_SCAFFOLD_REPO,
    templateRepo: templateRepo ?? DEFAULT_TEMPLATE_REPO,
    defaultCreateDirs: {
      prd: "workspace/prds",
      prototype: "workspace/prototypes",
      "prototype-mobile": "workspace/prototypes",
      "prototype-admin": "workspace/prototypes"
    },
    viewerSkills: DEFAULT_VIEWER_SKILLS,
  };
}

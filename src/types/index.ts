export type ViewerSkillConfig = {
  inspectCopySkillCommand: string;
  markCreateSkillCommand: string;
  markUpdateSkillCommand: string;
  copyTerminalGuide: string;
};

export type PrdkitConfig = {
  version: 1;
  projectName: string;
  author: string;
  description?: string;
  productPositioning?: string;
  teamSize?: string;
  projectStage?: string;
  scaffoldRepo: string;
  templateRepo: string;
  defaultCreateDirs?: Record<string, string>;
  viewerSkills?: ViewerSkillConfig;
};

export type TemplateItem = {
  id: string;
  name: string;
  description?: string;
  file: string;
  output_suggestion?: string;
  tags?: string[];
};

export type TemplateManifest = {
  version: number;
  templates: TemplateItem[];
};

export type CreateTemplateVariables = {
  title: string;
  creator: string;
  label: string;
  status: string;
  templateId: string;
};

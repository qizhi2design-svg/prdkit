export type PrdkitConfig = {
  version: 1;
  projectName: string;
  author: string;
  scaffoldRepo: string;
  templateRepo: string;
  defaultCreateDirs?: Record<string, string>;
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
  projectName: string;
  author: string;
  date: string;
  templateId: string;
};

// 视图模式类型
export type ViewMode = 'preview' | 'inspect' | 'mark';

// 原型节点类型
export interface PrototypeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: PrototypeNode[];
}

// Viewer 配置
export interface ViewerSkillConfig {
  pageCreateSkillCommand: string;
  inspectCopySkillCommand: string;
  markCreateSkillCommand: string;
  markUpdateSkillCommand: string;
  copyTerminalGuide: string;
}

export interface ViewerConfigResponse {
  projectName: string;
  prototypesDir: string;
  viewerSkills: ViewerSkillConfig;
}

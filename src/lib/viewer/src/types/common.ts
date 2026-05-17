// 工具态类型
export type ActiveTool = 'none' | 'inspect' | 'mark';
// 兼容旧命名，逐步迁移中
export type ViewMode = ActiveTool;

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
  cloud?: {
    host: string;
    projectId?: string;
    projectName?: string;
    projectSlug?: string;
    authStatus: 'loggedOut' | 'expired' | 'active';
    lastReleaseId?: string;
    lastPublishedAt?: string;
  };
}

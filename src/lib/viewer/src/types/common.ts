// 工具态类型
export type ActiveTool = 'none' | 'inspect' | 'mark';
// 兼容旧命名，逐步迁移中
export type ViewMode = ActiveTool;

// 视图模式：原型预览 / PRD 文档预览
export type AppViewMode = 'prototype' | 'prd';

// PRD 文件信息
export interface PrdFileInfo {
  fileName: string;
  title: string;
  status?: string;
  version?: string;
  modifiedAt: string;
  size: number;
}

// PRD checkpoint 记录（前端展示用）
export interface PrdCheckpointListItem {
  id: string;
  message: string | null;
  kind: string;
  createdAt: string;
  title: string;
  size: number;
  lineCount: number;
}

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

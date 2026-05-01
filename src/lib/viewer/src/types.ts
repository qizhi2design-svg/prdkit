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

// 标记数据结构
export interface Mark {
  id: string;
  title: string; // 标记标题
  selector: string; // CSS 选择器，用于定位元素
  domPath: string; // DOM 层级路径（如 div > section > input#username）
  description: string; // Markdown 描述内容
  position: {
    x: number; // 标记点在页面中的 x 坐标
    y: number; // 标记点在页面中的 y 坐标
  };
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  }; // 元素的位置和尺寸
  timestamp: number; // 创建时间戳
}

// 标记列表响应
export interface MarksResponse {
  marks: Mark[];
}

// 待创建标记的元素信息
export interface PendingMarkInfo {
  selector: string;
  domPath: string; // DOM 层级路径
  position: {
    x: number;
    y: number;
  };
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

export interface ViewerSkillConfig {
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

export type CheckpointKind = 'manual' | 'auto' | 'pre-restore';

export interface CheckpointRecord {
  id: string;
  prototypePath: string;
  kind: CheckpointKind;
  message?: string;
  createdAt: string;
  baseCheckpointId?: string;
  fileCount: number;
  markCount: number;
  contentHash: string;
}

export interface CheckpointSummary {
  fromCheckpointId: string;
  toCheckpointId: string;
  addedFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  markAdded: string[];
  markUpdated: string[];
  markDeleted: string[];
}

export interface CheckpointDetail {
  checkpoint: CheckpointRecord;
  summary: CheckpointSummary;
  previewUrl?: string;
  marks?: Mark[];
  files?: Array<{ relativePath: string; blobHash: string; size: number }>;
}

export interface ActiveCheckpointPreview {
  checkpointId: string;
  prototypePath: string;
  previewUrl: string;
  marks: Mark[];
  message?: string;
}

export interface CheckpointStatus {
  prototypePath: string;
  latestCheckpointId: string | null;
  hasChanges: boolean;
  changeCount: number;
  summary: CheckpointSummary;
}

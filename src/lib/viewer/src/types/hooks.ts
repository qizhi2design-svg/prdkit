import type { RefObject, MutableRefObject } from 'react';
import type {
  ActiveTool,
  Mark,
  MarkUpdatePatch,
  PendingMarkInfo,
  ActiveCheckpointPreview,
  CheckpointDetail,
  CheckpointStatus,
  IterationSummary,
} from '../types';

// ==================== Zustand Store ====================

export interface ViewerPreferences {
  autoSaveInterval: number; // 自动保存间隔（秒）
  showLineNumbers: boolean; // 是否显示行号
  enableHotReload: boolean; // 是否启用热重载
  defaultTool: ActiveTool; // 默认工具态
}

export interface ViewerStore {
  // 主题
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;

  // 布局偏好（持久化）
  siderWidth: number;
  setSiderWidth: (width: number) => void;
  siderCollapsed: boolean;
  setSiderCollapsed: (collapsed: boolean) => void;

  markPanelWidth: number;
  setMarkPanelWidth: (width: number) => void;
  markPanelCollapsed: boolean;
  setMarkPanelCollapsed: (collapsed: boolean) => void;

  // 用户偏好
  preferences: ViewerPreferences;
  updatePreferences: (preferences: Partial<ViewerPreferences>) => void;
}

// ==================== Layout Hooks ====================

export interface ResizablePanelOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  direction: 'left' | 'right'; // left: 从左边拖拽, right: 从右边拖拽
  persistKey?: 'siderWidth' | 'markPanelWidth'; // 可选：持久化到 store
}

export interface ResizablePanelReturn {
  width: number;
  isResizing: boolean;
  panelRef: RefObject<HTMLDivElement>;
  handleMouseDown: (e: React.MouseEvent) => void;
}

export interface MarkPanelState {
  collapsed: boolean;
  width: number;
  savedWidth: number;
}

export interface MarkPanelActions {
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
  setWidth: (width: number) => void;
}

export interface MarkPanelReturn {
  state: MarkPanelState;
  actions: MarkPanelActions;
}

export interface CanvasViewportSize {
  width: number;
  height: number;
}

export interface CanvasPanOffset {
  x: number;
  y: number;
}

// ==================== Data Hooks ====================

export interface UseMarksOptions {
  prototypePath: string | null;
  activeTool: ActiveTool;
  activeCheckpointPreview: ActiveCheckpointPreview | null;
}

export interface UseMarksReturn {
  // 状态
  marks: Mark[];
  selectedMarkId: string | null;
  pendingMarkInfo: PendingMarkInfo | null;
  relinkingMarkId: string | null;
  missingMarkIds: string[];
  hiddenMarkIds: string[];
  effectiveMarks: Mark[]; // 考虑 checkpoint 预览的标记

  // 操作方法
  loadMarks: () => Promise<void>;
  selectMark: (markId: string | null) => void;
  createMark: (title: string, description: string) => Promise<void>;
  updateMark: (markId: string, patch: MarkUpdatePatch) => Promise<void>;
  deleteMark: (markId: string) => Promise<void>;
  prepareMark: (info: PendingMarkInfo) => void;
  cancelMark: () => void;
  startRelink: (markId: string) => void;
  confirmRelink: (markId: string, info: PendingMarkInfo) => void;
  cancelRelink: () => void;
  setMissingMarkIds: (ids: string[]) => void;
  setHiddenMarkIds: (ids: string[]) => void;

  // Ref (用于 WebSocket 回调)
  loadMarksRef: MutableRefObject<() => void>;
}

export interface UseCheckpointOptions {
  prototypePath: string | null;
}

export interface UseCheckpointReturn {
  // 状态
  status: CheckpointStatus | null;
  activePreview: ActiveCheckpointPreview | null;
  activeIterationId: string | null;
  iterations: IterationSummary[];
  historyDrawerOpen: boolean;
  saveSubmitting: boolean;
  historyRefreshVersion: number;
  historyTargetCheckpointId: string | null;
  activeHistoryFiles: string[];
  activeIterationFiles: string[];
  historyViewActive: boolean;

  // 操作方法
  loadStatus: () => Promise<void>;
  loadIterations: () => Promise<void>;
  activateVersionGroup: (checkpointId?: string | null) => Promise<void>;
  notifyCheckpointCreated: (checkpointId?: string | null) => Promise<void>;
  saveVersion: () => Promise<void>;
  preview: (detail: CheckpointDetail) => void;
  previewGroup: (details: CheckpointDetail[]) => void;
  restore: (detail: CheckpointDetail, versionLabel: string) => Promise<void>;
  exitPreview: () => void;
  selectIteration: (iterationId: string | null) => void;
  openHistory: () => void;
  closeHistory: () => void;

  // Ref (用于 WebSocket 回调)
  loadStatusRef: MutableRefObject<() => void>;
}

export interface UseFileNavigationOptions {
  projectName: string;
}

export interface UseFileNavigationReturn {
  selectedFile: string | null;
  fileList: string[];
  currentIndex: number;

  selectFile: (path: string | null) => void;
  navigatePrev: () => void;
  navigateNext: () => void;
  updateFileList: (files: string[]) => void;
  refreshPrototypes: () => void;

  prototypeRefreshVersion: number;
}

// ==================== Network Hooks ====================

export interface WebSocketOptions {
  url: string;
  onMessage?: (data: any) => void;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
}

export interface WebSocketReturn {
  connected: boolean;
  send: (data: any) => void;
  close: () => void;
}

// ==================== Feature Hooks ====================

export interface PublishParams {
  outputPath: string;
  entryFiles: string[];
  openAfterPublish: boolean;
}

export interface UsePublishReturn {
  drawerOpen: boolean;
  loading: boolean;
  submitting: boolean;
  defaultPath: string;

  open: () => Promise<void>;
  close: () => void;
  submit: (params: PublishParams) => Promise<void>;
  pickDirectory: (currentPath: string) => Promise<string | null>;
}

// ==================== UI Hooks ====================

export interface UseThemeReturn {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
}

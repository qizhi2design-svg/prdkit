import { App as AntdApp, Layout, ConfigProvider } from 'antd';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import FileTree from './components/FileTree';
import Preview from './components/Preview';
import Header from './components/Header';
import PublishDrawer from './components/PublishDrawer';
import HistoryDrawer from './components/HistoryDrawer';
import PrdPreview from './components/PrdPreview';
import PreferencesDrawer from './components/PreferencesDrawer';
import { AppConfigProvider } from './contexts/AppConfigContext';
import { useViewerStore } from './stores/useViewerStore';
import { useTheme } from './hooks/ui/useTheme';
import { useResizablePanel } from './hooks/layout/useResizablePanel';
import { useMarkPanel } from './hooks/layout/useMarkPanel';
import { useCanvasViewport } from './hooks/layout/useCanvasViewport';
import { useMarks } from './hooks/data/useMarks';
import { useCheckpoint } from './hooks/data/useCheckpoint';
import { useFileNavigation } from './hooks/data/useFileNavigation';
import { useWebSocket } from './hooks/network/useWebSocket';
import { usePublish } from './hooks/features/usePublish';
import { DEFAULT_COPY_TERMINAL_GUIDE, DEFAULT_INSPECT_COPY_SKILL_COMMAND, DEFAULT_MARK_CREATE_SKILL_COMMAND, DEFAULT_MARK_UPDATE_SKILL_COMMAND, DEFAULT_PAGE_CREATE_SKILL_COMMAND } from './constants/clipboard';
import { copySkillClipboardText } from './utils/clipboard';
import type { ActiveTool, AppViewMode, PrdFileInfo, PrdFolderInfo, PrdCheckpointListItem, PrototypeNode, ViewerConfigResponse } from './types';
import type { DiffLine } from './components/PrdPreview';
import type { AppConfig } from './contexts/AppConfigContext';
import type { CanvasViewportSize } from './types';
import type { PrdContentResponse, PrdCheckpointContentResponse, PrdContextBlock, PrdSaveResponse } from './types/prd';
import { antdTheme } from './theme/antd-theme';
import { message, setMessageApi } from './utils/message';
import './App.css';

const { Sider, Content } = Layout;
const DESKTOP_VIEWPORT_SIZE: CanvasViewportSize = { width: 1440, height: 900 };

function AppContent() {
  const antd = AntdApp.useApp();

  // ========== 全局配置 ==========
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [cloudConfig, setCloudConfig] = useState<{
    host: string;
    projectId?: string;
    projectName?: string;
    projectSlug?: string;
    authStatus: 'loggedOut' | 'expired' | 'active';
  } | null>(null);

  useEffect(() => {
    setMessageApi(antd.message);
  }, [antd.message]);

  // ========== Zustand 全局状态 ==========
  const siderCollapsed = useViewerStore((state) => state.siderCollapsed);
  const setSiderCollapsed = useViewerStore((state) => state.setSiderCollapsed);
  const preferences = useViewerStore((state) => state.preferences);

  // ========== 主题 ==========
  useTheme(); // 自动应用主题到 document

  // ========== 布局状态（持久化到 Zustand）==========
  const sider = useResizablePanel({
    initialWidth: 200,
    minWidth: 200,
    maxWidth: 600,
    direction: 'left',
    persistKey: 'siderWidth', // 持久化
  });

  const markPanelResize = useResizablePanel({
    initialWidth: 350,
    minWidth: 350,
    maxWidth: 800,
    direction: 'right',
    persistKey: 'markPanelWidth', // 持久化
  });

  const markPanel = useMarkPanel(350);

  // ========== 视图模式 ==========
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [appViewMode, setAppViewMode] = useState<AppViewMode>('prototype');
  const [previewStageSize, setPreviewStageSize] = useState<CanvasViewportSize>({ width: 0, height: 0 });
  const [previewCanvasSize, setPreviewCanvasSize] = useState<CanvasViewportSize>(DESKTOP_VIEWPORT_SIZE);
  const viewport = useCanvasViewport({
    stageSize: previewStageSize,
    canvasSize: previewCanvasSize,
    fitSize: DESKTOP_VIEWPORT_SIZE,
  });

  // ========== 文件导航 ==========
  const fileNav = useFileNavigation({ projectName: config?.projectName || 'PRDKit' });

  // ========== 版本历史 ==========
  const checkpoint = useCheckpoint({ prototypePath: fileNav.selectedFile });
  const visibleFileList = useMemo(
    () => checkpoint.activeHistoryFiles.length > 0 ? checkpoint.activeHistoryFiles : fileNav.fileList,
    [checkpoint.activeHistoryFiles, fileNav.fileList],
  );
  const activePreviewPrototypePath = checkpoint.activePreview?.prototypePath ?? null;
  const previewIdentity = checkpoint.activePreview
    ? `checkpoint:${checkpoint.activePreview.checkpointId}`
    : `file:${fileNav.selectedFile ?? 'none'}`;
  const renderedPreviewFilePath = activePreviewPrototypePath ?? fileNav.selectedFile;
  const effectivePrototypeRoot = checkpoint.activePreview?.previewFsPath ?? config?.prototypesDir ?? '';
  const visibleCurrentIndex = useMemo(() => {
    if (!fileNav.selectedFile) return 0;
    const index = visibleFileList.indexOf(fileNav.selectedFile);
    return index >= 0 ? index + 1 : 0;
  }, [fileNav.selectedFile, visibleFileList]);

  // ========== 标记管理 ==========
  const marks = useMarks({
    prototypePath: fileNav.selectedFile,
    activeTool,
    activeCheckpointPreview: checkpoint.activePreview,
  });

  // ========== WebSocket ==========
  const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (!import.meta.env.DEV) {
      // 生产模式：直接连接到同一 host
      return `${protocol}//${window.location.host}`;
    }
    // 开发模式：通过 Vite 代理连接（/ws 会被代理到 API 服务器）
    return `${protocol}//${window.location.host}/ws`;
  };

  // ========== PRD 预览 ==========
  const [prdFiles, setPrdFiles] = useState<PrdFileInfo[]>([]);
  const [prdFolders, setPrdFolders] = useState<PrdFolderInfo[]>([]);
  const [selectedPrdFile, setSelectedPrdFile] = useState<string | null>(null);
  const [prdContent, setPrdContent] = useState<string | null>(null);
  const [prdDraftContent, setPrdDraftContent] = useState<string>('');
  const [prdFrontmatter, setPrdFrontmatter] = useState<Record<string, unknown>>({});
  const [prdHistoryOpen, setPrdHistoryOpen] = useState(false);
  const [prdViewingHistory, setPrdViewingHistory] = useState(false);
  const [prdCheckpoints, setPrdCheckpoints] = useState<PrdCheckpointListItem[]>([]);
  const [prdActiveCheckpointId, setPrdActiveCheckpointId] = useState<string | null>(null);
  const [prdDiffLines, setPrdDiffLines] = useState<DiffLine[] | null>(null);
  const [prdDiffSummary, setPrdDiffSummary] = useState<{ lineAdded: number; lineDeleted: number; changed: boolean } | null>(null);
  const [prdViewMode, setPrdViewMode] = useState<'preview' | 'edit' | 'block-select'>('preview');
  const [prdSaveSubmitting, setPrdSaveSubmitting] = useState(false);
  const [selectedPrdContextBlocks, setSelectedPrdContextBlocks] = useState<PrdContextBlock[]>([]);
  const prdDirty = !prdViewingHistory && prdContent !== null && prdDraftContent !== prdContent;

  const resetPrdContextCapture = useCallback(() => {
    setPrdViewMode('preview');
    setSelectedPrdContextBlocks([]);
  }, []);

  // 加载 PRD 文件列表
  const loadPrdFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/prds');
      const data = await res.json() as { files?: PrdFileInfo[]; folders?: PrdFolderInfo[] };
      const files = Array.isArray(data.files) ? data.files : [];
      const folders = Array.isArray(data.folders) ? data.folders : [];
      setPrdFiles(files);
      setPrdFolders(folders);
      return files;
    } catch (err) {
      console.error('加载 PRD 列表失败:', err);
      setPrdFolders([]);
      return [];
    }
  }, []);

  // 加载 PRD 内容
  const loadPrdContent = useCallback(async (fileName: string) => {
    try {
      const res = await fetch(`/api/prds/${encodeURIComponent(fileName)}`);
      const data: PrdContentResponse = await res.json();
      setPrdContent(data.content);
      setPrdDraftContent(data.content);
      setPrdFrontmatter(data.frontmatter);
      setSelectedPrdFile(data.fileName);
      setPrdViewingHistory(false);
      setPrdActiveCheckpointId(null);
      setPrdDiffLines(null);
      setPrdDiffSummary(null);
      setPrdViewMode('preview');
      resetPrdContextCapture();
    } catch (err) {
      console.error('加载 PRD 内容失败:', err);
    }
  }, [resetPrdContextCapture]);

  // 加载 PRD checkpoint 列表
  const loadPrdCheckpoints = useCallback(async (fileName: string) => {
    try {
      const res = await fetch(`/api/prds/${encodeURIComponent(fileName)}/checkpoints`);
      const data: PrdCheckpointListItem[] = await res.json();
      setPrdCheckpoints(data);
    } catch (err) {
      console.error('加载 PRD 版本历史失败:', err);
    }
  }, []);

  // 加载 PRD checkpoint 版本内容
  const loadPrdCheckpointContent = useCallback(async (checkpointId: string) => {
    if (!selectedPrdFile) return;
    try {
      const checkpoint = prdCheckpoints.find((item) => item.id === checkpointId) || null;
      const diffQuery = checkpoint?.baseCheckpointId
        ? `?fromCheckpointId=${encodeURIComponent(checkpoint.baseCheckpointId)}`
        : '?fromCheckpointId=__empty__';
      const [contentRes, diffRes] = await Promise.all([
        fetch(`/api/prds/${encodeURIComponent(selectedPrdFile)}/checkpoints/${checkpointId}`),
        fetch(`/api/prds/${encodeURIComponent(selectedPrdFile)}/checkpoints/${checkpointId}/diff${diffQuery}`),
      ]);
      const data: PrdCheckpointContentResponse = await contentRes.json();
      setPrdContent(data.content);
      setPrdDraftContent(data.content);
      setPrdFrontmatter(data.frontmatter);
      setPrdActiveCheckpointId(checkpointId);
      setPrdViewingHistory(true);
      setPrdViewMode('preview');
      resetPrdContextCapture();

      if (diffRes.ok) {
        const diffData = await diffRes.json();
        setPrdDiffLines(diffData.diffLines);
        setPrdDiffSummary(diffData.summary);
      } else {
        setPrdDiffLines(null);
        setPrdDiffSummary(null);
      }
    } catch (err) {
      console.error('加载 PRD checkpoint 内容失败:', err);
    }
  }, [prdCheckpoints, resetPrdContextCapture, selectedPrdFile]);

  // 返回 PRD 当前版本
  const handleReturnToCurrentPrdVersion = useCallback(() => {
    if (selectedPrdFile) {
      loadPrdContent(selectedPrdFile);
    }
  }, [selectedPrdFile, loadPrdContent]);

  const discardPrdDraft = useCallback(() => {
    setPrdDraftContent(prdContent ?? '');
    setPrdViewMode('preview');
    resetPrdContextCapture();
  }, [prdContent, resetPrdContextCapture]);

  const confirmDiscardPrdDraft = useCallback(() => {
    if (!prdDirty) return true;
    return window.confirm('当前 PRD 编辑尚未更新版本，离开将丢失未提交内容，是否继续？');
  }, [prdDirty]);

  const guardPrdDraft = useCallback(async <T,>(action: () => Promise<T> | T): Promise<T | null> => {
    if (prdDirty) {
      const confirmed = confirmDiscardPrdDraft();
      if (!confirmed) {
        return null;
      }
      discardPrdDraft();
    }
    return await action();
  }, [confirmDiscardPrdDraft, discardPrdDraft, prdDirty]);

  const saveCurrentPrdDraft = useCallback(async () => {
    if (!selectedPrdFile) {
      throw new Error('当前未选中 PRD 文档');
    }

    const response = await fetch(`/api/prds/${encodeURIComponent(selectedPrdFile)}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: prdDraftContent }),
    });
    const data: (PrdSaveResponse & { error?: string; message?: string }) | null = await response.json().catch(() => null);

    if (!response.ok || !data) {
      throw new Error(data?.error || data?.message || '保存 PRD 失败');
    }

    setSelectedPrdFile(data.fileName);
    setPrdContent(data.content);
    setPrdDraftContent(data.content);
    setPrdFrontmatter(data.frontmatter);
    setPrdViewingHistory(false);
    setPrdActiveCheckpointId(null);
    setPrdDiffLines(null);
    setPrdDiffSummary(null);
    resetPrdContextCapture();
    return data;
  }, [prdDraftContent, resetPrdContextCapture, selectedPrdFile]);

  const handleSavePrdVersion = useCallback(async () => {
    if (!selectedPrdFile || !prdDirty || prdViewingHistory) return;

    try {
      setPrdSaveSubmitting(true);
      const saved = await saveCurrentPrdDraft();
      const response = await fetch(`/api/prds/${encodeURIComponent(saved.fileName)}/checkpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'manual' }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || '创建 PRD 版本失败');
      }

      await loadPrdFiles();
      await loadPrdCheckpoints(saved.fileName);
      setPrdViewMode('preview');
      message.success(data?.created === false ? '没有检测到新的文档变化' : 'PRD 已更新版本');
    } catch (error) {
      console.error('更新 PRD 版本失败:', error);
      message.error(error instanceof Error ? error.message : '更新 PRD 版本失败');
    } finally {
      setPrdSaveSubmitting(false);
    }
  }, [loadPrdCheckpoints, loadPrdFiles, prdDirty, prdViewingHistory, saveCurrentPrdDraft, selectedPrdFile]);

  const refreshPrdAfterReload = useCallback(async () => {
    const files = await loadPrdFiles();
    const nextSelectedFile = selectedPrdFile && files.some((item) => item.fileName === selectedPrdFile)
      ? selectedPrdFile
      : files[0]?.fileName ?? null;

    if (!nextSelectedFile) {
      setSelectedPrdFile(null);
      setPrdContent(null);
      setPrdDraftContent('');
      setPrdFrontmatter({});
      setPrdCheckpoints([]);
      setPrdActiveCheckpointId(null);
      setPrdViewingHistory(false);
      setPrdDiffLines(null);
      setPrdDiffSummary(null);
      setPrdViewMode('preview');
      resetPrdContextCapture();
      return;
    }

    if (prdViewingHistory && prdActiveCheckpointId && nextSelectedFile === selectedPrdFile) {
      await loadPrdCheckpoints(nextSelectedFile);
      await loadPrdCheckpointContent(prdActiveCheckpointId);
      return;
    }

    await loadPrdContent(nextSelectedFile);
    await loadPrdCheckpoints(nextSelectedFile);
  }, [
    loadPrdFiles,
    selectedPrdFile,
    prdViewingHistory,
    prdActiveCheckpointId,
    loadPrdCheckpoints,
    loadPrdCheckpointContent,
    loadPrdContent,
    resetPrdContextCapture,
  ]);

  const handlePrdDraftChange = useCallback((content: string) => {
    setPrdDraftContent(content);
  }, []);

  const handlePrdModeChange = useCallback((mode: 'preview' | 'edit' | 'block-select') => {
    setPrdViewMode(mode);
    if (mode !== 'block-select') {
      setSelectedPrdContextBlocks([]);
    }
  }, []);

  const handlePrdContextCaptureChange = useCallback((active: boolean, blocks: PrdContextBlock[]) => {
    setSelectedPrdContextBlocks(blocks);
    setPrdViewMode(active ? 'block-select' : 'preview');
  }, []);

  const handleCopyPrdContextBlocks = useCallback(async (blocksOverride?: PrdContextBlock[]) => {
    const blocks = blocksOverride ?? selectedPrdContextBlocks;
    if (blocks.length === 0) {
      message.warning('请先选择要复制的 block');
      return;
    }

    const fileName = selectedPrdFile || '';
    const title = (prdFrontmatter.title as string)
      || fileName.split('/').pop()?.replace(/\.md$/, '')
      || '未命名 PRD';

    const payload = blocksOverride
      ? `文件: ${fileName || '未命名文件'}\n标题: ${title}\n\n${blocks[0].text.trimEnd()}`
      : [
          `文件: ${fileName || '未命名文件'}`,
          `标题: ${title}`,
          '',
          '以下为选中的 PRD 上下文 blocks:',
          '',
          ...blocks.flatMap((block, index) => [
            `--- block ${index + 1} ---`,
            block.text.trimEnd(),
            '',
          ]),
        ].join('\n').trimEnd();

    try {
      await copySkillClipboardText(
        {
          skillCommand: config?.viewerSkills.inspectCopySkillCommand || DEFAULT_INSPECT_COPY_SKILL_COMMAND,
          payload,
        },
        {
          successPrefix: `已复制 ${blocks.length} 个 block 的 skill 指令`,
          terminalGuide: config?.viewerSkills.copyTerminalGuide || DEFAULT_COPY_TERMINAL_GUIDE,
        }
      );
    } catch (error) {
      console.error('复制 PRD 上下文失败:', error);
      message.error('复制失败，请检查浏览器权限');
    }
  }, [config?.viewerSkills.copyTerminalGuide, config?.viewerSkills.inspectCopySkillCommand, prdFrontmatter.title, selectedPrdContextBlocks, selectedPrdFile]);

  const ws = useWebSocket({
    url: getWebSocketUrl(),
    onMessage: (message) => {
      if (message.type === 'reload') {
        console.log('检测到文件变更，刷新预览并重新加载标记数据');
        setReloadVersion((prev) => prev + 1);
        marks.loadMarksRef.current();
        checkpoint.loadStatusRef.current();
        if (appViewMode === 'prd') {
          if (prdDirty) {
            void loadPrdFiles();
          } else {
            void refreshPrdAfterReload();
          }
        }
        return;
      }

      if (message.type === 'checkpoint-created') {
        void checkpoint.notifyCheckpointCreated(
          typeof message.checkpointId === 'string' ? message.checkpointId : null,
        ).catch((error) => {
          console.error('刷新新创建版本状态失败:', error);
        });
      }
    },
    reconnect: true,
  });

  // ========== 发布功能 ==========
  const publish = usePublish();

  // ========== 偏好设置抽屉 ==========
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // ========== 配置加载函数 ==========
  const loadConfig = async () => {
    try {
      const configRes = await fetch('/api/config', { cache: 'no-store' });
      const configData: ViewerConfigResponse = await configRes.json();
      const loadedProjectName = configData.projectName || 'PRDKit';

      setConfig({
        projectName: loadedProjectName,
        prototypesDir: configData.prototypesDir || '',
        viewerSkills: configData.viewerSkills || {
          pageCreateSkillCommand: DEFAULT_PAGE_CREATE_SKILL_COMMAND,
          inspectCopySkillCommand: DEFAULT_INSPECT_COPY_SKILL_COMMAND,
          markCreateSkillCommand: DEFAULT_MARK_CREATE_SKILL_COMMAND,
          markUpdateSkillCommand: DEFAULT_MARK_UPDATE_SKILL_COMMAND,
          copyTerminalGuide: DEFAULT_COPY_TERMINAL_GUIDE,
        },
      });

      // 加载云端配置
      if (configData.cloud) {
        setCloudConfig({
          host: configData.cloud.host || '',
          projectId: configData.cloud.projectId,
          projectName: configData.cloud.projectName,
          projectSlug: configData.cloud.projectSlug,
          authStatus: configData.cloud.authStatus,
        });
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      throw error;
    }
  };

  // ========== 初始化加载配置和文件列表 ==========
  useEffect(() => {
    const loadData = async () => {
      try {
        await loadConfig();

        const prototypesRes = await fetch('/api/prototypes', { cache: 'no-store' });
        const prototypesData: PrototypeNode = await prototypesRes.json();

        const files: string[] = [];
        const extractFiles = (nodes: PrototypeNode[]) => {
          nodes.forEach((node) => {
            if (node.type === 'file' && node.path) {
              files.push(node.path);
            }
            if (node.children) {
              extractFiles(node.children);
            }
          });
        };
        if (prototypesData.children) {
          extractFiles(prototypesData.children);
        }
        fileNav.updateFileList(files);

        // 如果 URL 中没有指定文件且有文件列表，自动选中第一个
        const urlParams = new URLSearchParams(window.location.search);
        const urlFile = urlParams.get('p');
        if (!urlFile && files.length > 0) {
          fileNav.selectFile(files[0]);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
      }
    };

    loadData();
  }, []);

  // ========== 联动逻辑 ==========
  // 切换文件时清空状态
  useEffect(() => {
    marks.selectMark(null);
    marks.cancelMark();
  }, [
    fileNav.selectedFile,
    marks.selectMark,
    marks.cancelMark,
  ]);

  useEffect(() => {
    if (checkpoint.activeIterationId) return;
    if (!activePreviewPrototypePath) return;
    if (fileNav.selectedFile === activePreviewPrototypePath) return;

    fileNav.selectFile(activePreviewPrototypePath);
  }, [
    checkpoint.activeIterationId,
    activePreviewPrototypePath,
    fileNav.selectedFile,
    fileNav.selectFile,
  ]);

  useEffect(() => {
    if (!checkpoint.historyViewActive) return;

    const activeFiles = checkpoint.activeHistoryFiles;
    if (activeFiles.length === 0) return;
    if (fileNav.selectedFile && activeFiles.includes(fileNav.selectedFile)) return;

    fileNav.selectFile(activeFiles[0] || null);
  }, [checkpoint.activeHistoryFiles, checkpoint.historyViewActive, fileNav.selectedFile, fileNav.selectFile]);

  useEffect(() => {
    setActiveTool(preferences.defaultTool);
  }, [preferences.defaultTool]);

  const handleRestoreCheckpoint = useCallback(async (detail: Parameters<typeof checkpoint.restore>[0], versionLabel: string) => {
    await checkpoint.restore(detail, versionLabel);
    fileNav.selectFile(detail.checkpoint.prototypePath);
    fileNav.refreshPrototypes();
    await marks.loadMarks();
    setReloadVersion((prev) => prev + 1);
  }, [checkpoint, fileNav, marks]);

  const ensureEditableWorkspace = useCallback(() => {
    if (!checkpoint.historyViewActive) {
      return false;
    }

    checkpoint.exitPreview();
    return true;
  }, [checkpoint]);

  const prevActiveToolRef = useRef<ActiveTool>(activeTool);
  useEffect(() => {
    const prevTool = prevActiveToolRef.current;
    prevActiveToolRef.current = activeTool;

    if (prevTool !== 'mark' && activeTool === 'mark' && markPanel.state.collapsed) {
      markPanel.actions.expand();
    }
  }, [activeTool, markPanel.actions, markPanel.state.collapsed]);

  const handleToolChange = (tool: ActiveTool) => {
    setActiveTool((currentTool) => (currentTool === tool ? 'none' : tool));
  };

  const handleViewModeChange = useCallback((mode: AppViewMode) => {
    void guardPrdDraft(async () => {
      setAppViewMode(mode);
      if (mode === 'prd') {
        const files = await loadPrdFiles();
        if (files.length > 0 && !selectedPrdFile) {
          await loadPrdContent(files[0].fileName);
        }
      }
    });
  }, [guardPrdDraft, loadPrdContent, loadPrdFiles, selectedPrdFile]);

  // 初始化时加载 PRD 文件列表
  useEffect(() => {
    loadPrdFiles();
  }, [loadPrdFiles]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!prdDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [prdDirty]);

  // PRD mode: 选中文件时自动加载内容和版本历史
  useEffect(() => {
    if (appViewMode !== 'prd' || !selectedPrdFile) return;
    loadPrdCheckpoints(selectedPrdFile);
  }, [appViewMode, selectedPrdFile, loadPrdCheckpoints]);

  // 创建/选择标记时自动展开面板（忽略用户手动折叠后的状态变化）
  const prevSelectedRef = useRef<string | null>(null);
  const prevPendingRef = useRef(false);
  useEffect(() => {
    const prevSelected = prevSelectedRef.current;
    const prevPending = prevPendingRef.current;
    prevSelectedRef.current = marks.selectedMarkId;
    prevPendingRef.current = Boolean(marks.pendingMarkInfo);

    // 只在标记真正切换时自动展开——当 selectedMarkId 或 pendingMarkInfo 从空变有值
    const justSelected = marks.selectedMarkId && marks.selectedMarkId !== prevSelected;
    const justPending = marks.pendingMarkInfo && !prevPending;

    if ((justSelected || justPending) && markPanel.state.collapsed) {
      markPanel.actions.expand();
    }
  }, [marks.pendingMarkInfo, marks.selectedMarkId]);

  useEffect(() => {
    const handleEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;

      return element.tagName === 'INPUT'
        || element.tagName === 'TEXTAREA'
        || element.tagName === 'SELECT'
        || element.isContentEditable
        || Boolean(element.closest('.ant-select'))
        || Boolean(element.closest('.ant-select-dropdown'));
    };

    const handleViewportHotkeys = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (handleEditableTarget(event.target)) return;

      const isZoomInKey = event.key === '+' || event.key === '=' || event.code === 'NumpadAdd';
      const isZoomOutKey = event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract';
      const isResetKey = event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0';

      if (isZoomInKey) {
        event.preventDefault();
        viewport.zoomIn();
        return;
      }

      if (isZoomOutKey) {
        event.preventDefault();
        viewport.zoomOut();
        return;
      }

      if (isResetKey) {
        event.preventDefault();
        viewport.resetToFit();
      }
    };

    window.addEventListener('keydown', handleViewportHotkeys, true);
    return () => window.removeEventListener('keydown', handleViewportHotkeys, true);
  }, [viewport]);

  // ========== 文件操作处理函数 ==========
  const handlePrototypeDelete = async (prototypePath: string) => {
    ensureEditableWorkspace();

    try {
      const response = await fetch(`/api/prototypes/${encodeURIComponent(prototypePath)}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || '删除页面失败');
      }

      const remainingFiles = fileNav.fileList.filter((file) => file !== prototypePath);

      if (fileNav.selectedFile === prototypePath) {
        const deletedIndex = fileNav.fileList.indexOf(prototypePath);
        const nextFile = remainingFiles[deletedIndex] || remainingFiles[deletedIndex - 1] || null;
        fileNav.selectFile(nextFile);
      }

      fileNav.updateFileList(remainingFiles);
      fileNav.refreshPrototypes();
      message.success('页面已删除，checkpoint 历史已保留');
    } catch (error) {
      console.error('删除页面失败:', error);
      message.error(error instanceof Error ? error.message : '删除页面失败');
    }
  };

  const handlePrototypeDuplicate = async (prototypePath: string) => {
    ensureEditableWorkspace();

    try {
      const response = await fetch('/api/prototypes/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prototypePath }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || '复制页面失败');
      }

      const duplicatePath = typeof data?.duplicatePath === 'string' ? data.duplicatePath : null;
      if (duplicatePath) {
        fileNav.selectFile(duplicatePath);
      }

      fileNav.refreshPrototypes();
    } catch (error) {
      console.error('复制页面失败:', error);
      message.error(error instanceof Error ? error.message : '复制页面失败');
    }
  };

  const handleFolderDelete = async (folderPath: string) => {
    ensureEditableWorkspace();

    try {
      const response = await fetch(`/api/prototypes/folders?folderPath=${encodeURIComponent(folderPath)}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || '删除文件夹失败');
      }

      if (fileNav.selectedFile && (fileNav.selectedFile === folderPath || fileNav.selectedFile.startsWith(`${folderPath}/`))) {
        fileNav.selectFile(null);
      }

      fileNav.refreshPrototypes();
      message.success('文件夹已删除，包含的页面和标记已一并清理');
    } catch (error) {
      console.error('删除文件夹失败:', error);
      message.error(error instanceof Error ? error.message : '删除文件夹失败');
    }
  };

  const handleCreateFolder = async (folderName: string) => {
    ensureEditableWorkspace();

    const response = await fetch('/api/prototypes/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.message || data?.error || '新建文件夹失败');
    }

    fileNav.refreshPrototypes();
  };

  const handleRenameNode = async (sourcePath: string, targetName: string) => {
    ensureEditableWorkspace();

    const response = await fetch('/api/prototypes/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath, targetName }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.message || data?.error || '重命名失败');
    }

    const renamedPath = typeof data?.renamedPath === 'string' ? data.renamedPath : null;
    if (fileNav.selectedFile && renamedPath) {
      if (fileNav.selectedFile === sourcePath) {
        fileNav.selectFile(renamedPath);
      } else if (fileNav.selectedFile.startsWith(`${sourcePath}/`)) {
        fileNav.selectFile(fileNav.selectedFile.replace(sourcePath, renamedPath));
      }
    }

    fileNav.refreshPrototypes();
  };

  const handleMovePrototype = async (prototypePath: string, targetFolderPath: string) => {
    ensureEditableWorkspace();

    try {
      const response = await fetch('/api/prototypes/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prototypePath, targetFolderPath }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || '移动页面失败');
      }

      const movedPath = typeof data?.movedPath === 'string' ? data.movedPath : null;
      if (fileNav.selectedFile === prototypePath && movedPath) {
        fileNav.selectFile(movedPath);
      }

      fileNav.refreshPrototypes();
    } catch (error) {
      console.error('移动页面失败:', error);
      message.error(error instanceof Error ? error.message : '移动页面失败');
    }
  };

  // ========== PRD 操作处理函数 ==========
  const handlePrdRename = useCallback(async (fileName: string, newTitle: string) => {
    const result = await guardPrdDraft(async () => {
      const res = await fetch(`/api/prds/${encodeURIComponent(fileName)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newTitle }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || data?.message || '重命名失败');
      }
      await loadPrdFiles();
      const renamedFileName = typeof data?.renamedFileName === 'string' ? data.renamedFileName : fileName;
      if (selectedPrdFile === fileName) {
        await loadPrdContent(renamedFileName);
        await loadPrdCheckpoints(renamedFileName);
      } else if (selectedPrdFile) {
        await loadPrdCheckpoints(selectedPrdFile);
      }
      message.success(`PRD 已重命名为 ${renamedFileName}，并已保存版本`);
    });
    return result ?? undefined;
  }, [guardPrdDraft, loadPrdFiles, loadPrdContent, loadPrdCheckpoints, selectedPrdFile]);

  const handlePrdCreate = useCallback(async (title: string) => {
    const res = await fetch('/api/prds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error || data?.message || '新建失败');
    }

    await loadPrdFiles();
    if (data?.fileName) {
      await loadPrdContent(data.fileName);
      await loadPrdCheckpoints(data.fileName);
    }
    message.success(`PRD 已创建为 ${data?.fileName || title}，并已保存初始版本`);
  }, [loadPrdFiles, loadPrdContent, loadPrdCheckpoints]);

  const handlePrdCreateFolder = useCallback(async (folderName: string) => {
    const res = await fetch('/api/prds/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error || data?.message || '新建文件夹失败');
    }

    await loadPrdFiles();
  }, [loadPrdFiles]);

  const handlePrdDeleteFolder = useCallback(async (folderPath: string) => {
    const result = await guardPrdDraft(async () => {
      const res = await fetch(`/api/prds/folders?folderPath=${encodeURIComponent(folderPath)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || data?.message || '删除文件夹失败');
      }

      if (selectedPrdFile && (selectedPrdFile === folderPath || selectedPrdFile.startsWith(`${folderPath}/`))) {
        const files = await loadPrdFiles();
        const nextFile = files[0]?.fileName ?? null;
        if (nextFile) {
          await loadPrdContent(nextFile);
          await loadPrdCheckpoints(nextFile);
        } else {
          setSelectedPrdFile(null);
          setPrdContent(null);
          setPrdDraftContent('');
          setPrdFrontmatter({});
          setPrdCheckpoints([]);
          setPrdActiveCheckpointId(null);
          setPrdViewingHistory(false);
          setPrdDiffLines(null);
          setPrdDiffSummary(null);
          setPrdViewMode('preview');
        }
      } else {
        await loadPrdFiles();
      }

      message.success('PRD 文件夹已删除，删除前版本已保留');
    });
    return result ?? undefined;
  }, [guardPrdDraft, selectedPrdFile, loadPrdFiles, loadPrdContent, loadPrdCheckpoints]);

  const handlePrdMove = useCallback(async (fileName: string, targetFolderPath: string) => {
    const result = await guardPrdDraft(async () => {
      const res = await fetch('/api/prds/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, targetFolderPath }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || data?.message || '移动文档失败');
      }

      await loadPrdFiles();
      if (selectedPrdFile === fileName && data?.movedPath) {
        await loadPrdContent(data.movedPath);
        await loadPrdCheckpoints(data.movedPath);
      }
    });
    return result ?? undefined;
  }, [guardPrdDraft, loadPrdFiles, selectedPrdFile, loadPrdContent, loadPrdCheckpoints]);

  const handlePrdRenameFolder = useCallback(async (folderPath: string, targetName: string) => {
    const result = await guardPrdDraft(async () => {
      const res = await fetch('/api/prds/folders/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath, targetName }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || data?.message || '重命名文件夹失败');
      }

      await loadPrdFiles();
      if (selectedPrdFile && selectedPrdFile.startsWith(`${folderPath}/`) && data?.renamedPath) {
        const nextFile = selectedPrdFile.replace(`${folderPath}/`, `${data.renamedPath}/`);
        await loadPrdContent(nextFile);
        await loadPrdCheckpoints(nextFile);
      }
    });
    return result ?? undefined;
  }, [guardPrdDraft, loadPrdFiles, selectedPrdFile, loadPrdContent, loadPrdCheckpoints]);

  const handlePrdDuplicate = useCallback(async (fileName: string) => {
    const res = await fetch(`/api/prds/${encodeURIComponent(fileName)}/duplicate`, {
      method: 'POST',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || data?.message || '复制失败');
    }
    const data = await res.json().catch(() => null);
    await loadPrdFiles();
    // 自动选中新复制的文件
    if (data?.newFileName) {
      await loadPrdContent(data.newFileName);
      // 为新复制的文件加载 checkpoint 列表
      await loadPrdCheckpoints(data.newFileName);
    }
  }, [loadPrdFiles, loadPrdContent, loadPrdCheckpoints]);

  const handlePrdDelete = useCallback(async (fileName: string) => {
    const result = await guardPrdDraft(async () => {
      const res = await fetch(`/api/prds/${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || data?.message || '删除失败');
      }

      const wasSelected = selectedPrdFile === fileName;
      const oldIndex = prdFiles.findIndex((f) => f.fileName === fileName);
      const files = await loadPrdFiles();

      if (wasSelected) {
        const nextFile = files[oldIndex] || files[oldIndex - 1] || null;
        if (nextFile) {
          await loadPrdContent(nextFile.fileName);
          await loadPrdCheckpoints(nextFile.fileName);
        } else {
          setSelectedPrdFile(null);
          setPrdContent(null);
          setPrdDraftContent('');
          setPrdFrontmatter({});
          setPrdCheckpoints([]);
          setPrdActiveCheckpointId(null);
          setPrdViewingHistory(false);
          setPrdDiffLines(null);
          setPrdDiffSummary(null);
          setPrdViewMode('preview');
        }
      }
      message.success('PRD 文档已删除，删除前版本已保留');
    });
    return result ?? undefined;
  }, [guardPrdDraft, loadPrdFiles, selectedPrdFile, prdFiles, loadPrdContent, loadPrdCheckpoints]);

  const handleCreatePageWithAi = async () => {
    const suggestedParent = (() => {
      if (!fileNav.selectedFile) return '根目录';
      const segments = fileNav.selectedFile.split('/');
      segments.pop();
      return segments.length > 0 ? segments.join('/') : '根目录';
    })();

    const payload = `项目名: ${config?.projectName || 'PRDKit'}
原型目录: ${config?.prototypesDir || ''}
建议放置目录: ${suggestedParent}
当前参考页面: ${fileNav.selectedFile || '无'}

请创建一个新的原型页面，并说明：
1. 建议的页面名称
2. 页面应放置的目录
3. 需要生成的页面结构与核心内容`;

    try {
      await copySkillClipboardText(
        {
          skillCommand: config?.viewerSkills.pageCreateSkillCommand || DEFAULT_PAGE_CREATE_SKILL_COMMAND,
          payload,
        },
        {
          successPrefix: '已复制新建页面 skill 指令',
          terminalGuide: config?.viewerSkills.copyTerminalGuide || DEFAULT_COPY_TERMINAL_GUIDE,
        }
      );
    } catch (error) {
      console.error('复制新建页面 skill 失败:', error);
      message.error('复制失败');
    }
  };

  const handlePublishToCloud = async (payload: { target: 'prototype' | 'prd'; projectId: string; message: string; entryFiles: string[] }) => {
    try {
      const response = await fetch('/api/publish-cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: '发布失败' }));
        throw new Error(error.error || error.message || '发布失败');
      }

      const data = await response.json().catch(() => null);
      setCloudConfig((prev) => prev ? {
        ...prev,
        projectId: data?.project?.id || payload.projectId,
        projectName: data?.project?.name || prev.projectName,
        projectSlug: data?.project?.slug || prev.projectSlug,
      } : prev);
      message.success(data?.result?.releaseId ? `发布成功：${data.result.releaseId}` : '发布成功');
    } catch (error) {
      console.error('云端发布失败:', error);
      throw error;
    }
  };

  return (
    <AppConfigProvider value={config}>
      <Layout className="app-layout">
          <Header
            collapsed={siderCollapsed}
            onToggle={() => setSiderCollapsed(!siderCollapsed)}
            projectName={config?.projectName || 'PRDKit'}
            viewMode={appViewMode}
            onViewModeChange={handleViewModeChange}
            onOpenPublish={() => {
              if (appViewMode === 'prd') {
                void guardPrdDraft(async () => {
                  publish.open(appViewMode);
                });
                return;
              }
              publish.open(appViewMode);
            }}
            onOpenHistory={appViewMode === 'prd' ? () => {
              void guardPrdDraft(async () => {
                setPrdHistoryOpen(true);
              });
            } : checkpoint.openHistory}
            onSaveVersion={appViewMode === 'prd' ? handleSavePrdVersion : checkpoint.saveVersion}
            historyDisabled={appViewMode === 'prd' ? prdFiles.length === 0 : visibleFileList.length === 0}
            saveDisabled={appViewMode === 'prd'
              ? !prdDirty || prdViewingHistory || !selectedPrdFile || prdSaveSubmitting
              : !checkpoint.status?.hasChanges || checkpoint.historyViewActive}
            saveHasChanges={appViewMode === 'prd' ? prdDirty : Boolean(checkpoint.status?.hasChanges)}
            saveSubmitting={appViewMode === 'prd' ? prdSaveSubmitting : checkpoint.saveSubmitting}
            saveChangeCount={appViewMode === 'prd'
              ? (prdDirty ? 1 : 0)
              : checkpoint.status?.hasChanges ? checkpoint.status.changeCount : 0}
          />
          <Layout className="app-content-layout">
            <Sider
              ref={sider.panelRef}
              width={sider.width}
              theme="light"
              className="app-sider"
              collapsed={siderCollapsed}
              collapsedWidth={0}
              trigger={null}
            >
              <FileTree
                viewMode={appViewMode}
                onSelect={appViewMode === 'prd' ? (path) => {
                  if (!path) return;
                  void guardPrdDraft(async () => {
                    await loadPrdContent(path);
                  });
                } : fileNav.selectFile}
                currentIndex={appViewMode === 'prd' ? prdFiles.findIndex((f) => f.fileName === selectedPrdFile) + 1 : visibleCurrentIndex}
                totalFiles={appViewMode === 'prd' ? prdFiles.length : visibleFileList.length}
                selectedFile={appViewMode === 'prd' ? selectedPrdFile : fileNav.selectedFile}
                prdFiles={appViewMode === 'prd' ? prdFiles : undefined}
                prdFolders={appViewMode === 'prd' ? prdFolders : undefined}
                onNavigate={(direction) => {
                  if (appViewMode === 'prd') {
                    const currentIdx = selectedPrdFile ? prdFiles.findIndex((f) => f.fileName === selectedPrdFile) : -1;
                    const nextIndex = direction === 'prev'
                      ? (currentIdx <= 0 ? prdFiles.length - 1 : currentIdx - 1)
                      : (currentIdx >= prdFiles.length - 1 ? 0 : currentIdx + 1);
                    if (prdFiles[nextIndex]) {
                      void guardPrdDraft(async () => {
                        await loadPrdContent(prdFiles[nextIndex].fileName);
                      });
                    }
                    return;
                  }
                  const currentFiles = visibleFileList;
                  if (currentFiles.length === 0) return;

                  const currentIdx = fileNav.selectedFile ? currentFiles.indexOf(fileNav.selectedFile) : -1;
                  const nextIndex = direction === 'prev'
                    ? (currentIdx <= 0 ? currentFiles.length - 1 : currentIdx - 1)
                    : (currentIdx >= currentFiles.length - 1 ? 0 : currentIdx + 1);
                  fileNav.selectFile(currentFiles[nextIndex] || null);
                }}
                onDeletePrototype={handlePrototypeDelete}
                onDeleteFolder={handleFolderDelete}
                onDuplicatePrototype={handlePrototypeDuplicate}
                onRenameNode={handleRenameNode}
                onCreateFolder={handleCreateFolder}
                onMovePrototype={handleMovePrototype}
                onCreatePageWithAi={handleCreatePageWithAi}
                refreshVersion={fileNav.prototypeRefreshVersion}
                onFilesUpdate={fileNav.updateFileList}
                onPrdCreate={handlePrdCreate}
                onCreatePrdFolder={handlePrdCreateFolder}
                onDeletePrdFolder={handlePrdDeleteFolder}
                onMovePrdFile={handlePrdMove}
                onRenamePrdFolder={handlePrdRenameFolder}
                onPrdRename={handlePrdRename}
                onPrdDuplicate={handlePrdDuplicate}
                onPrdDelete={handlePrdDelete}
                readonly={Boolean(checkpoint.activePreview)}
              />
            </Sider>
            {!siderCollapsed && (
              <div
                onMouseDown={sider.handleMouseDown}
                className={`app-resize-handle ${sider.isResizing ? 'resizing' : ''}`}
                style={{ left: sider.width }}
              />
            )}
            <Content
              className="app-content"
              style={{
                pointerEvents: sider.isResizing || markPanelResize.isResizing ? 'none' : 'auto',
              }}
            >
              {appViewMode === 'prd' ? (
                <div className="prd-preview-container">
                  {prdContent ? (
                    <PrdPreview
                      content={prdContent}
                      frontmatter={prdFrontmatter}
                      fileName={selectedPrdFile || ''}
                      mode={prdViewMode}
                      draftContent={prdDraftContent}
                      onDraftChange={handlePrdDraftChange}
                      onModeChange={handlePrdModeChange}
                      editDisabled={prdViewingHistory || !selectedPrdFile}
                      viewingHistory={prdViewingHistory}
                      onReturnToCurrent={handleReturnToCurrentPrdVersion}
                      diffLines={prdDiffLines ?? undefined}
                      diffSummary={prdDiffSummary ?? undefined}
                      contextCaptureActive={prdViewMode === 'block-select'}
                      selectedContextBlocks={selectedPrdContextBlocks}
                      onContextCaptureChange={handlePrdContextCaptureChange}
                      onCopyContextBlocks={handleCopyPrdContextBlocks}
                    />
                  ) : (
                    <div className="prd-preview-empty">
                      {prdFiles.length > 0 ? '选择一个 PRD 文档开始预览' : '暂无 PRD 文档'}
                    </div>
                  )}
                </div>
              ) : (
              <Preview
                key={previewIdentity}
                filePath={renderedPreviewFilePath}
                onLinkNavigation={(path) => fileNav.selectFile(path)}
                activeTool={activeTool}
                onToolChange={handleToolChange}
                projectName={config?.projectName || 'PRDKit'}
                prototypesDir={effectivePrototypeRoot}
                wsConnected={ws.connected}
                reloadVersion={reloadVersion}
                viewerSkills={config?.viewerSkills || {
                  pageCreateSkillCommand: DEFAULT_PAGE_CREATE_SKILL_COMMAND,
                  inspectCopySkillCommand: DEFAULT_INSPECT_COPY_SKILL_COMMAND,
                  markCreateSkillCommand: DEFAULT_MARK_CREATE_SKILL_COMMAND,
                  markUpdateSkillCommand: DEFAULT_MARK_UPDATE_SKILL_COMMAND,
                  copyTerminalGuide: DEFAULT_COPY_TERMINAL_GUIDE,
                }}
                marks={marks.effectiveMarks}
                selectedMarkId={marks.selectedMarkId}
                pendingMarkInfo={marks.pendingMarkInfo}
                relinkingMarkId={marks.relinkingMarkId}
                onMarkPrepare={marks.prepareMark}
                onMarkRelink={marks.confirmRelink}
                onMarkSelect={marks.selectMark}
                onMarkCancel={marks.cancelMark}
                onMarkResolutionChange={marks.setMissingMarkIds}
                onMarkVisibilityChange={marks.setHiddenMarkIds}
                onToggleMarkPanel={markPanel.actions.toggle}
                markPanelCollapsed={markPanel.state.collapsed}
                markPanelWidth={markPanel.state.width}
                markPanelResizing={markPanelResize.isResizing}
                onMarkPanelResizeStart={markPanelResize.handleMouseDown}
                onMarkPanelCollapsedChange={(collapsed) => collapsed ? markPanel.actions.collapse() : markPanel.actions.expand()}
                onMarkCreate={marks.createMark}
                onMarkUpdate={marks.updateMark}
                onMarkDelete={marks.deleteMark}
                onMarkRelinkStart={marks.startRelink}
                onMarkRelinkCancel={marks.cancelRelink}
                onMarkRefresh={marks.loadMarks}
                missingMarkIds={marks.missingMarkIds}
                hiddenMarkIds={marks.hiddenMarkIds}
                viewportSize={DESKTOP_VIEWPORT_SIZE}
                canvasScale={viewport.canvasScale}
                canvasWidth={viewport.canvasWidth}
                canvasHeight={viewport.canvasHeight}
                panOffset={viewport.panOffset}
                isPannable={viewport.isPannable}
                isDraggingCanvas={viewport.isDraggingCanvas}
                onStageSizeChange={setPreviewStageSize}
                onCanvasContentSizeChange={setPreviewCanvasSize}
                onCanvasPanStart={viewport.startPan}
                onCanvasPanMove={viewport.updatePan}
                onCanvasPanEnd={viewport.endPan}
                onZoomReset={viewport.resetToFit}
                zoomPercent={viewport.zoomPercent}
                zoomOptions={viewport.zoomOptions}
                canZoomIn={viewport.canZoomIn}
                canZoomOut={viewport.canZoomOut}
                onZoomIn={viewport.zoomIn}
                onZoomOut={viewport.zoomOut}
                onZoomChange={viewport.setZoomPercent}
                previewUrlOverride={checkpoint.activePreview?.previewUrl ?? null}
                previewReadonly={Boolean(checkpoint.activePreview)}
                versionLabel={checkpoint.activePreview?.message ? `"${checkpoint.activePreview.message}"` : undefined}
                onReturnToCurrent={checkpoint.activePreview ? () => checkpoint.exitPreview() : undefined}
                fileList={visibleFileList}
              />
              )}
            </Content>
          </Layout>
          {appViewMode === 'prd' ? (
            <HistoryDrawer
              open={prdHistoryOpen}
              viewMode="prd"
              prdCheckpoints={prdCheckpoints}
              prdActiveCheckpointId={prdActiveCheckpointId}
              onClose={() => setPrdHistoryOpen(false)}
              onPreviewCheckpoint={(id) => {
                void guardPrdDraft(async () => {
                  await loadPrdCheckpointContent(id);
                });
              }}
              onReturnToCurrent={handleReturnToCurrentPrdVersion}
              viewingHistory={prdViewingHistory}
            />
          ) : null}
          <PublishDrawer
            open={publish.drawerOpen}
            loading={publish.loading}
            submitting={publish.submitting}
            target={publish.target}
            projectName={config?.projectName || 'PRDKit'}
            currentFile={publish.target === 'prd' ? selectedPrdFile : fileNav.selectedFile}
            fileList={publish.target === 'prd' ? prdFiles.map((item) => item.fileName) : fileNav.fileList}
            defaultOutputPath={publish.defaultPath}
            cloudConfig={cloudConfig || undefined}
            onClose={publish.close}
            onPickOutputDirectory={publish.pickDirectory}
            onSubmit={publish.submit}
            onPublishToCloud={handlePublishToCloud}
            onRefreshConfig={loadConfig}
          />
          <HistoryDrawer
            open={checkpoint.historyDrawerOpen}
            prototypePath={fileNav.selectedFile}
            refreshVersion={checkpoint.historyRefreshVersion}
            focusCheckpointId={checkpoint.historyTargetCheckpointId}
            iterations={checkpoint.iterations}
            activeIterationId={checkpoint.activeIterationId}
            onIterationChange={checkpoint.selectIteration}
            onIterationsRefresh={checkpoint.loadIterations}
            onClose={checkpoint.closeHistory}
            onPreview={checkpoint.preview}
            onPreviewGroup={checkpoint.previewGroup}
            onRestore={handleRestoreCheckpoint}
          />
          <PreferencesDrawer open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
      </Layout>
    </AppConfigProvider>
  );
}

function App() {
  return (
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <AppContent />
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;

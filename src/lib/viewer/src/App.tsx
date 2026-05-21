import { App as AntdApp, Layout, message, ConfigProvider } from 'antd';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import FileTree from './components/FileTree';
import Preview from './components/Preview';
import Header from './components/Header';
import PublishDrawer from './components/PublishDrawer';
import HistoryDrawer from './components/HistoryDrawer';
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
import type { ActiveTool, PrototypeNode, ViewerConfigResponse } from './types';
import type { AppConfig } from './contexts/AppConfigContext';
import type { CanvasViewportSize } from './types';
import { antdTheme } from './theme/antd-theme';
import './App.css';

const { Sider, Content } = Layout;
const DESKTOP_VIEWPORT_SIZE: CanvasViewportSize = { width: 1440, height: 900 };

function App() {
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

  // ========== 视图模式（使用偏好设置的默认值）==========
  const [activeTool, setActiveTool] = useState<ActiveTool>(preferences.defaultTool);
  const [previewStageSize, setPreviewStageSize] = useState<CanvasViewportSize>({ width: 0, height: 0 });
  const [previewCanvasSize, setPreviewCanvasSize] = useState<CanvasViewportSize>(DESKTOP_VIEWPORT_SIZE);
  const viewport = useCanvasViewport({
    stageSize: previewStageSize,
    canvasSize: previewCanvasSize,
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

  const ws = useWebSocket({
    url: getWebSocketUrl(),
    onMessage: (message) => {
      if (message.type === 'reload') {
        console.log('检测到文件变更，刷新预览并重新加载标记数据');
        setReloadVersion((prev) => prev + 1);
        marks.loadMarksRef.current();
        checkpoint.loadStatusRef.current();
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

  useEffect(() => {
    if (activeTool !== 'mark') {
      marks.selectMark(null);
      marks.cancelMark();
      marks.cancelRelink();
    }
  }, [activeTool]);

  const handleRestoreCheckpoint = useCallback(async (detail: Parameters<typeof checkpoint.restore>[0], versionLabel: string) => {
    await checkpoint.restore(detail, versionLabel);
    fileNav.selectFile(detail.checkpoint.prototypePath);
    fileNav.refreshPrototypes();
    await marks.loadMarks();
    setReloadVersion((prev) => prev + 1);
  }, [checkpoint, fileNav, marks]);

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
    if (checkpoint.historyViewActive) {
      message.info('历史版本预览中不可删除页面，请先退出预览');
      return;
    }

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
    if (checkpoint.historyViewActive) {
      message.info('历史版本预览中不可复制页面，请先退出预览');
      return;
    }

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
      message.success(`页面已复制为 ${data?.duplicateName || '副本'}`);
    } catch (error) {
      console.error('复制页面失败:', error);
      message.error(error instanceof Error ? error.message : '复制页面失败');
    }
  };

  const handleFolderDelete = async (folderPath: string) => {
    if (checkpoint.historyViewActive) {
      message.info('历史版本预览中不可删除文件夹，请先退出预览');
      return;
    }

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
    if (checkpoint.historyViewActive) {
      message.info('历史版本预览中不可新建文件夹，请先退出预览');
      return;
    }

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
    message.success(`已创建文件夹 ${data?.folderName || folderName}`);
  };

  const handleRenameNode = async (sourcePath: string, targetName: string) => {
    if (checkpoint.historyViewActive) {
      message.info('历史版本预览中不可重命名，请先退出预览');
      return;
    }

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
    message.success(`已重命名为 ${data?.renamedName || targetName}`);
  };

  const handleMovePrototype = async (prototypePath: string, targetFolderPath: string) => {
    if (checkpoint.historyViewActive) {
      message.info('历史版本预览中不可移动页面，请先退出预览');
      return;
    }

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
      message.success(`页面已移动到 ${targetFolderPath || '根目录'}`);
    } catch (error) {
      console.error('移动页面失败:', error);
      message.error(error instanceof Error ? error.message : '移动页面失败');
    }
  };

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

  const handlePublishToCloud = async (payload: { projectId: string; message: string; entryFiles: string[] }) => {
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
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <AppConfigProvider value={config}>
          <Layout className="app-layout">
          <Header
            collapsed={siderCollapsed}
            onToggle={() => setSiderCollapsed(!siderCollapsed)}
            projectName={config?.projectName || 'PRDKit'}
            currentFile={fileNav.selectedFile}
            currentIndex={visibleCurrentIndex}
            totalFiles={visibleFileList.length}
            onOpenPublish={publish.open}
            onOpenHistory={checkpoint.openHistory}
            onSaveVersion={checkpoint.saveVersion}
            historyDisabled={visibleFileList.length === 0}
            saveDisabled={!checkpoint.status?.hasChanges || checkpoint.historyViewActive}
            saveHasChanges={Boolean(checkpoint.status?.hasChanges)}
            saveSubmitting={checkpoint.saveSubmitting}
            saveChangeCount={checkpoint.status?.hasChanges ? checkpoint.status.changeCount : 0}
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
                onSelect={fileNav.selectFile}
                selectedFile={fileNav.selectedFile}
                onNavigate={(direction) => {
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
                fileList={visibleFileList}
              />
            </Content>
          </Layout>
          <PublishDrawer
            open={publish.drawerOpen}
            loading={publish.loading}
            submitting={publish.submitting}
            projectName={config?.projectName || 'PRDKit'}
            currentFile={fileNav.selectedFile}
            fileList={fileNav.fileList}
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
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;

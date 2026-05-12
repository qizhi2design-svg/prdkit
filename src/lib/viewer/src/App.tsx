import { DoubleRightOutlined } from '@ant-design/icons';
import { App as AntdApp, Layout, message, ConfigProvider } from 'antd';
import { useState, useEffect } from 'react';
import FileTree from './components/FileTree';
import Preview from './components/Preview';
import Header from './components/Header';
import MarkPanel from './components/MarkPanel';
import PublishDrawer from './components/PublishDrawer';
import HistoryDrawer from './components/HistoryDrawer';
import PreferencesDrawer from './components/PreferencesDrawer';
import { AppConfigProvider } from './contexts/AppConfigContext';
import { useViewerStore } from './stores/useViewerStore';
import { useTheme } from './hooks/ui/useTheme';
import { useResizablePanel } from './hooks/layout/useResizablePanel';
import { useMarkPanel } from './hooks/layout/useMarkPanel';
import { useMarks } from './hooks/data/useMarks';
import { useCheckpoint } from './hooks/data/useCheckpoint';
import { useFileNavigation } from './hooks/data/useFileNavigation';
import { useWebSocket } from './hooks/network/useWebSocket';
import { usePublish } from './hooks/features/usePublish';
import { DEFAULT_COPY_TERMINAL_GUIDE, DEFAULT_INSPECT_COPY_SKILL_COMMAND, DEFAULT_MARK_CREATE_SKILL_COMMAND, DEFAULT_MARK_UPDATE_SKILL_COMMAND, DEFAULT_PAGE_CREATE_SKILL_COMMAND } from './constants/clipboard';
import { copySkillClipboardText } from './utils/clipboard';
import type { PrototypeNode, ViewMode, ViewerConfigResponse } from './types';
import type { AppConfig } from './contexts/AppConfigContext';
import { antdTheme } from './theme/antd-theme';
import './App.css';

const { Sider, Content } = Layout;

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
  const [viewMode, setViewMode] = useState<ViewMode>(preferences.defaultViewMode);

  // ========== 文件导航 ==========
  const fileNav = useFileNavigation({ projectName: config?.projectName || 'PRDKit' });

  // ========== 版本历史 ==========
  const checkpoint = useCheckpoint({ prototypePath: fileNav.selectedFile });

  // ========== 标记管理 ==========
  const marks = useMarks({
    prototypePath: fileNav.selectedFile,
    viewMode,
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
    checkpoint.exitPreview();
  }, [fileNav.selectedFile, marks.selectMark, marks.cancelMark, checkpoint.exitPreview]);

  // 创建/选择标记时自动展开面板
  useEffect(() => {
    if ((marks.pendingMarkInfo || marks.selectedMarkId) && markPanel.state.collapsed) {
      markPanel.actions.expand();
    }
  }, [marks.pendingMarkInfo, marks.selectedMarkId, markPanel.state.collapsed, markPanel.actions.expand]);

  // ========== 文件操作处理函数 ==========
  const handlePrototypeDelete = async (prototypePath: string) => {
    if (checkpoint.activePreview) {
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
    if (checkpoint.activePreview) {
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
    if (checkpoint.activePreview) {
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
    if (checkpoint.activePreview) {
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
    if (checkpoint.activePreview) {
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
    if (checkpoint.activePreview) {
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
            currentFile={fileNav.selectedFile}
            currentIndex={fileNav.currentIndex}
            totalFiles={fileNav.fileList.length}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onOpenPublish={publish.open}
            onOpenHistory={checkpoint.openHistory}
            onSaveVersion={checkpoint.saveVersion}
            historyDisabled={!fileNav.selectedFile}
            saveDisabled={!fileNav.selectedFile || !checkpoint.status?.hasChanges || Boolean(checkpoint.activePreview)}
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
                onNavigate={(direction) => direction === 'prev' ? fileNav.navigatePrev() : fileNav.navigateNext()}
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
                marginRight: viewMode === 'mark'
                  ? (markPanel.state.collapsed ? 40 : markPanel.state.width)
                  : 0,
                transition: markPanelResize.isResizing ? 'none' : 'margin-right 0.2s',
              }}
            >
              <Preview
                filePath={fileNav.selectedFile}
                viewMode={viewMode}
                projectName={config?.projectName || 'PRDKit'}
                prototypesDir={config?.prototypesDir || ''}
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
                previewUrlOverride={checkpoint.activePreview?.prototypePath === fileNav.selectedFile ? checkpoint.activePreview.previewUrl : null}
                previewReadonly={Boolean(checkpoint.activePreview && checkpoint.activePreview.prototypePath === fileNav.selectedFile)}
              />
            </Content>
            {viewMode === 'mark' && (
              <div
                ref={markPanelResize.panelRef}
                className={`mark-panel-container ${markPanel.state.collapsed ? 'collapsed' : ''}`}
                style={{ width: markPanel.state.collapsed ? 40 : markPanel.state.width }}
              >
                {markPanel.state.collapsed ? (
                  <button
                    type="button"
                    className="mark-panel-collapsed-trigger"
                    aria-label="展开标记面板"
                    onClick={markPanel.actions.expand}
                  >
                    <DoubleRightOutlined />
                    <span>标记</span>
                  </button>
                ) : (
                  <>
                    <div
                      onMouseDown={markPanelResize.handleMouseDown}
                      className={`app-resize-handle mark-panel-resize ${markPanelResize.isResizing ? 'resizing' : ''}`}
                    />
                    <MarkPanel
                      marks={marks.effectiveMarks}
                      selectedMarkId={marks.selectedMarkId}
                      pendingMarkInfo={marks.pendingMarkInfo}
                      relinkingMarkId={marks.relinkingMarkId}
                      missingMarkIds={marks.missingMarkIds}
                      hiddenMarkIds={marks.hiddenMarkIds}
                      viewerSkills={config?.viewerSkills || {
                        pageCreateSkillCommand: DEFAULT_PAGE_CREATE_SKILL_COMMAND,
                        inspectCopySkillCommand: DEFAULT_INSPECT_COPY_SKILL_COMMAND,
                        markCreateSkillCommand: DEFAULT_MARK_CREATE_SKILL_COMMAND,
                        markUpdateSkillCommand: DEFAULT_MARK_UPDATE_SKILL_COMMAND,
                        copyTerminalGuide: DEFAULT_COPY_TERMINAL_GUIDE,
                      }}
                      onMarkSelect={marks.selectMark}
                      onMarkCreate={marks.createMark}
                      onMarkUpdate={marks.updateMark}
                      onMarkDelete={marks.deleteMark}
                      onMarkRelinkStart={marks.startRelink}
                      onMarkRelinkCancel={marks.cancelRelink}
                      onMarkCancel={marks.cancelMark}
                      onRefresh={marks.loadMarks}
                      collapsed={false}
                      onCollapsedChange={(collapsed) => collapsed ? markPanel.actions.collapse() : markPanel.actions.expand()}
                      projectName={config?.projectName || 'PRDKit'}
                      filePath={fileNav.selectedFile}
                      prototypesDir={config?.prototypesDir || ''}
                    />
                  </>
                )}
              </div>
            )}
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
            onClose={checkpoint.closeHistory}
            onPreview={checkpoint.preview}
            onRestore={checkpoint.restore}
          />
          <PreferencesDrawer open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
          </Layout>
        </AppConfigProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;

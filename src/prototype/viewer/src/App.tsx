import { Layout, message } from 'antd';
import { useState, useEffect, useRef, useCallback } from 'react';
import FileTree from './components/FileTree';
import Preview from './components/Preview';
import Header from './components/Header';
import MarkPanel from './components/MarkPanel';
import PublishDrawer from './components/PublishDrawer';
import type { ViewMode, Mark, PendingMarkInfo, PrototypeNode } from './types';
import './App.css';

const { Sider, Content } = Layout;

function App() {
  // 从 URL query 参数读取初始文件路径
  const getInitialFile = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('p');
  };

  // 从 URL query 参数读取初始项目名称
  const getInitialProjectName = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('projectname') || 'PRDKit';
  };

  const [selectedFile, setSelectedFile] = useState<string | null>(getInitialFile);
  const [collapsed, setCollapsed] = useState(false);
  const [fileList, setFileList] = useState<string[]>([]);
  const [projectName, setProjectName] = useState<string>(getInitialProjectName);
  const [prototypesDir, setPrototypesDir] = useState<string>('');
  const [siderWidth, setSiderWidth] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [marks, setMarks] = useState<Mark[]>([]);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [pendingMarkInfo, setPendingMarkInfo] = useState<PendingMarkInfo | null>(null);
  const [markPanelWidth, setMarkPanelWidth] = useState(250);
  const [isResizingMarkPanel, setIsResizingMarkPanel] = useState(false);
  const [markPanelCollapsed, setMarkPanelCollapsed] = useState(false);
  const [savedMarkPanelWidth, setSavedMarkPanelWidth] = useState(250);
  const siderRef = useRef<HTMLDivElement>(null);
  const markPanelRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const loadMarksRef = useRef<() => void>(() => {});
  const [wsConnected, setWsConnected] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [publishDrawerOpen, setPublishDrawerOpen] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [defaultPublishPath, setDefaultPublishPath] = useState('');

  // 获取文件列表
  useEffect(() => {
    const loadData = async () => {
      try {
        // 从 API 加载配置和原型数据
        const configRes = await fetch('/api/config', { cache: 'no-store' });
        const configData = await configRes.json();
        const loadedProjectName = configData.projectName || 'PRDKit';
        setProjectName(loadedProjectName);
        setPrototypesDir(configData.prototypesDir || '');

        const prototypesRes = await fetch('/api/prototypes', { cache: 'no-store' });
        const prototypesData: PrototypeNode = await prototypesRes.json();

        const files: string[] = [];
        const extractFiles = (nodes: PrototypeNode[]) => {
          nodes.forEach(node => {
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
        setFileList(files);

        // 如果 URL 中没有指定文件且有文件列表，自动选中第一个
        const urlParams = new URLSearchParams(window.location.search);
        const urlFile = urlParams.get('p');
        if (!urlFile && files.length > 0) {
          setSelectedFile(files[0]);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
      }
    };

    loadData();
  }, []);

  // 当项目名称变化时，同步更新 URL
  useEffect(() => {
    if (selectedFile && projectName) {
      const url = new URL(window.location.href);
      url.searchParams.set('projectname', projectName);
      window.history.replaceState({}, '', url);
    }
  }, [projectName, selectedFile]);

  // 当选中文件变化时，更新 URL query 参数
  const handleFileSelect = (path: string | null) => {
    setSelectedFile(path);

    const url = new URL(window.location.href);
    if (path) {
      url.searchParams.set('p', path);
      url.searchParams.set('projectname', projectName);
    } else {
      url.searchParams.delete('p');
      url.searchParams.delete('projectname');
    }
    window.history.pushState({}, '', url);
  };

  // 导航到上一个/下一个文件
  const handleNavigate = (direction: 'prev' | 'next') => {
    if (fileList.length === 0) return;

    const currentIndex = selectedFile ? fileList.indexOf(selectedFile) : -1;
    let newIndex: number;

    if (direction === 'prev') {
      newIndex = currentIndex <= 0 ? fileList.length - 1 : currentIndex - 1;
    } else {
      newIndex = currentIndex >= fileList.length - 1 ? 0 : currentIndex + 1;
    }

    handleFileSelect(fileList[newIndex]);
  };

  // 处理侧边栏拖拽调整宽度
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // 处理 MarkPanel 拖拽调整宽度
  const handleMarkPanelMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingMarkPanel(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    let animationFrameId: number | null = null;
    let latestMouseX = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      latestMouseX = e.clientX;

      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(() => {
          const newWidth = latestMouseX;
          if (newWidth >= 200 && newWidth <= 600) {
            setSiderWidth(newWidth);
          }
          animationFrameId = null;
        });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isResizing]);

  // MarkPanel 拖拽效果
  useEffect(() => {
    let animationFrameId: number | null = null;
    let latestMouseX = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingMarkPanel) return;

      latestMouseX = e.clientX;

      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(() => {
          const newWidth = window.innerWidth - latestMouseX;
          if (newWidth >= 300 && newWidth <= 800) {
            setMarkPanelWidth(newWidth);
          }
          animationFrameId = null;
        });
      }
    };

    const handleMouseUp = () => {
      setIsResizingMarkPanel(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    if (isResizingMarkPanel) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isResizingMarkPanel]);

  // 加载标记数据的函数
  const loadMarks = useCallback(async () => {
    if (!selectedFile || viewMode !== 'mark') return;

    // 从文件路径提取原型名称（例如：dashboard/index.html -> dashboard）
    const prototypeName = selectedFile.split('/')[0];

    try {
      // 从 API 加载
      const response = await fetch(`/api/marks/${prototypeName}?t=${Date.now()}`, {
        cache: 'no-store'
      });
      const data = await response.json();
      setMarks(data.marks || []);
    } catch (error) {
      console.error('加载标记失败:', error);
      setMarks([]);
    }
  }, [selectedFile, viewMode]);

  useEffect(() => {
    loadMarksRef.current = loadMarks;
  }, [loadMarks]);

  // 加载标记数据
  useEffect(() => {
    loadMarks();
  }, [loadMarks]);

  // WebSocket 连接用于文件热重载
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let unmounted = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = (() => {
      if (!import.meta.env.DEV) {
        return `${protocol}//${window.location.host}`;
      }

      const currentPort = parseInt(window.location.port, 10) || 3000;
      const apiPort = currentPort + 1;
      return `${protocol}//${window.location.hostname}:${apiPort}`;
    })();

    const connect = () => {
      if (unmounted) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket 已连接');
        setWsConnected(true);
        reconnectAttempt = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'reload') {
            console.log('检测到文件变更，刷新预览并重新加载标记数据');
            setReloadVersion(prev => prev + 1);
            loadMarksRef.current();
          }
        } catch (error) {
          console.error('解析 WebSocket 消息失败:', error);
        }
      };

      ws.onerror = () => {
        // onerror 之后通常会进入 onclose，这里不重复输出噪音日志
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;

        if (!unmounted) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
          reconnectAttempt += 1;
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // 切换页面时，退出创建视图和详情视图
  useEffect(() => {
    setSelectedMarkId(null);
    setPendingMarkInfo(null);
  }, [selectedFile]);

  // 处理 MarkPanel 折叠状态变化
  useEffect(() => {
    if (markPanelCollapsed) {
      // 折叠时保存当前宽度，并设置为 40px
      setSavedMarkPanelWidth(markPanelWidth);
      setMarkPanelWidth(40);
    } else {
      // 展开时恢复之前的宽度
      setMarkPanelWidth(savedMarkPanelWidth);
    }
  }, [markPanelCollapsed]);

  // 当创建标记或选择标记时，自动展开 MarkPanel
  useEffect(() => {
    if ((pendingMarkInfo || selectedMarkId) && markPanelCollapsed) {
      setMarkPanelCollapsed(false);
    }
  }, [pendingMarkInfo, selectedMarkId]);

  // 处理标记选择
  const handleMarkSelect = (markId: string) => {
    setSelectedMarkId(markId);
    // 选择已存在的标记时，清空待创建的标记
    setPendingMarkInfo(null);
  };

  // 处理标记更新
  const handleMarkUpdate = (markId: string, title: string, description: string) => {
    const prototypeName = selectedFile?.split('/')[0];
    if (!prototypeName) return;

    fetch(`/api/marks/${prototypeName}/${markId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    })
      .then(res => res.json())
      .then(() => {
        // 重新加载标记数据以确保与文件系统同步
        loadMarks();
      })
      .catch(error => {
        console.error('更新标记失败:', error);
      });
  };

  // 处理标记删除
  const handleMarkDelete = (markId: string) => {
    const prototypeName = selectedFile?.split('/')[0];
    if (!prototypeName) return;

    fetch(`/api/marks/${prototypeName}/${markId}`, {
      method: 'DELETE',
    })
      .then(() => {
        if (selectedMarkId === markId) {
          setSelectedMarkId(null);
        }
        // 重新加载标记数据以确保与文件系统同步
        loadMarks();
      })
      .catch(error => {
        console.error('删除标记失败:', error);
      });
  };

  // 处理新增标记
  const handleMarkCreate = (title: string, description: string) => {
    if (!pendingMarkInfo) return;

    const prototypeName = selectedFile?.split('/')[0];
    if (!prototypeName) return;

    const markPayload = {
      title,
      ...pendingMarkInfo,
      description,
    };

    fetch(`/api/marks/${prototypeName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(markPayload),
    })
      .then(res => res.json())
      .then((data) => {
        setSelectedMarkId(data?.mark?.id || null);
        setPendingMarkInfo(null);
        // 重新加载标记数据以确保与文件系统同步
        loadMarks();
      })
      .catch(error => {
        console.error('创建标记失败:', error);
      });
  };

  // 处理准备创建标记
  const handleMarkPrepare = (info: PendingMarkInfo) => {
    setPendingMarkInfo(info);
  };

  // 处理取消创建标记
  const handleMarkCancel = () => {
    setPendingMarkInfo(null);
  };

  // 处理切换 MarkPanel 折叠状态
  const handleToggleMarkPanel = () => {
    setMarkPanelCollapsed(prev => !prev);
  };

  const handleOpenPublish = async () => {
    setPublishDrawerOpen(true);
    setPublishLoading(true);

    try {
      const response = await fetch(`/api/publish/options?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '读取发布配置失败');
      }

      setDefaultPublishPath(data.suggestedOutputPath || '');
    } catch (error) {
      console.error('读取发布配置失败:', error);
      message.error(error instanceof Error ? error.message : '读取发布配置失败');
    } finally {
      setPublishLoading(false);
    }
  };

  const handlePublishSubmit = async ({
    outputPath,
    entryFiles,
    openAfterPublish,
  }: {
    outputPath: string;
    entryFiles: string[];
    openAfterPublish: boolean;
  }) => {
    setPublishSubmitting(true);

    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputPath,
          entryFiles,
          projectName,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '发布失败');
      }

      if (openAfterPublish) {
        const openResponse = await fetch('/api/system/open-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPath: data.outputDir }),
        });

        if (!openResponse.ok) {
          const openData = await openResponse.json().catch(() => null);
          throw new Error(openData?.message || openData?.error || '发布成功，但打开输出目录失败');
        }
      }

      message.success(`发布完成：${data.outputDir}`);
      setPublishDrawerOpen(false);
    } catch (error) {
      console.error('发布失败:', error);
      message.error(error instanceof Error ? error.message : '发布失败');
    } finally {
      setPublishSubmitting(false);
    }
  };

  const handlePickPublishDirectory = async (currentOutputPath: string) => {
    try {
      const response = await fetch('/api/system/select-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPath: currentOutputPath || defaultPublishPath }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '打开目录选择器失败');
      }

      if (data.canceled || !data.path) {
        return null;
      }

      const currentName = extractPathBasename(currentOutputPath || defaultPublishPath || 'prototype-artifact');
      return joinPathSegments(data.path, currentName);
    } catch (error) {
      console.error('打开目录选择器失败:', error);
      message.error(error instanceof Error ? error.message : '打开目录选择器失败');
      return null;
    }
  };

  const currentIndex = selectedFile ? fileList.indexOf(selectedFile) + 1 : 0;

  return (
    <Layout className="app-layout">
      <Header
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        currentFile={selectedFile}
        currentIndex={currentIndex}
        totalFiles={fileList.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenPublish={handleOpenPublish}
      />
      <Layout className="app-content-layout">
        <Sider
          ref={siderRef}
          width={siderWidth}
          theme="light"
          className="app-sider"
          collapsed={collapsed}
          collapsedWidth={0}
          trigger={null}
        >
          <FileTree
            onSelect={handleFileSelect}
            selectedFile={selectedFile}
            onNavigate={handleNavigate}
          />
        </Sider>
        {!collapsed && (
          <div
            onMouseDown={handleMouseDown}
            className={`app-resize-handle ${isResizing ? 'resizing' : ''}`}
            style={{
              left: siderWidth,
            }}
          />
        )}
        <Content
          className="app-content"
          style={{
            pointerEvents: isResizing || isResizingMarkPanel ? 'none' : 'auto',
            marginRight: viewMode === 'mark' ? markPanelWidth : 0,
            transition: isResizingMarkPanel ? 'none' : 'margin-right 0.2s'
          }}
        >
          <Preview
            filePath={selectedFile}
            viewMode={viewMode}
            projectName={projectName}
            prototypesDir={prototypesDir}
            wsConnected={wsConnected}
            reloadVersion={reloadVersion}
            marks={marks}
            selectedMarkId={selectedMarkId}
            pendingMarkInfo={pendingMarkInfo}
            onMarkPrepare={handleMarkPrepare}
            onMarkSelect={handleMarkSelect}
            onMarkCancel={handleMarkCancel}
            onToggleMarkPanel={handleToggleMarkPanel}
          />
        </Content>
        {viewMode === 'mark' && (
          <div ref={markPanelRef} className="mark-panel-container" style={{ width: markPanelWidth }}>
            <div
              onMouseDown={handleMarkPanelMouseDown}
              className={`app-resize-handle mark-panel-resize ${isResizingMarkPanel ? 'resizing' : ''}`}
            />
            <MarkPanel
              marks={marks}
              selectedMarkId={selectedMarkId}
              pendingMarkInfo={pendingMarkInfo}
              onMarkSelect={handleMarkSelect}
              onMarkCreate={handleMarkCreate}
              onMarkUpdate={handleMarkUpdate}
              onMarkDelete={handleMarkDelete}
              onMarkCancel={handleMarkCancel}
              onRefresh={loadMarks}
              collapsed={markPanelCollapsed}
              onCollapsedChange={setMarkPanelCollapsed}
              projectName={projectName}
              filePath={selectedFile}
              prototypesDir={prototypesDir}
            />
          </div>
        )}
      </Layout>
      <PublishDrawer
        open={publishDrawerOpen}
        loading={publishLoading}
        submitting={publishSubmitting}
        projectName={projectName}
        currentFile={selectedFile}
        fileList={fileList}
        defaultOutputPath={defaultPublishPath}
        onClose={() => setPublishDrawerOpen(false)}
        onPickOutputDirectory={handlePickPublishDirectory}
        onSubmit={handlePublishSubmit}
      />
    </Layout>
  );
}

export default App;

function extractPathBasename(targetPath: string): string {
  const normalized = targetPath.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || normalized;
}

function joinPathSegments(directoryPath: string, entryName: string): string {
  const separator = directoryPath.includes('\\') ? '\\' : '/';
  const trimmedPath = directoryPath.replace(/[\\/]+$/, '');
  return `${trimmedPath}${separator}${entryName}`;
}

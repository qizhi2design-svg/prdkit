import { Layout } from 'antd';
import { useState, useEffect, useRef, useCallback } from 'react';
import FileTree from './components/FileTree';
import Preview from './components/Preview';
import Header from './components/Header';
import MarkPanel from './components/MarkPanel';
import PublishDrawer from './components/PublishDrawer';
import type { ViewMode, Mark, PendingMarkInfo, PrototypeNode } from './types';
import './App.css';

const { Sider, Content } = Layout;

// 检测是否为只读模式
const isReadonlyMode = import.meta.env.VITE_READONLY_MODE === 'true';

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
  const [publishDrawerOpen, setPublishDrawerOpen] = useState(false);
  const [prototypeTree, setPrototypeTree] = useState<PrototypeNode[]>([]);
  const siderRef = useRef<HTMLDivElement>(null);
  const markPanelRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // 获取文件列表
  useEffect(() => {
    const loadData = async () => {
      try {
        // 根据模式选择数据源
        if (isReadonlyMode) {
          // 只读模式：从内联数据加载
          const response = await fetch('/data.json');
          const data = await response.json();

          setProjectName(data.config.projectName || 'PRDKit');
          setPrototypesDir('');

          // 提取文件列表
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
          if (data.prototypes.children) {
            extractFiles(data.prototypes.children);
          }
          setFileList(files);

          // 如果没有选中文件且有文件列表，自动选中第一个
          if (!selectedFile && files.length > 0) {
            handleFileSelect(files[0]);
          }
        } else {
          // 开发模式：从 API 加载
          const configRes = await fetch('/api/config');
          const configData = await configRes.json();
          setProjectName(configData.projectName || 'PRDKit');
          setPrototypesDir(configData.prototypesDir || '');

          const prototypesRes = await fetch('/api/prototypes');
          const prototypesData: PrototypeNode = await prototypesRes.json();

          // 保存原型树用于发布功能
          setPrototypeTree(prototypesData.children || []);

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

          // 如果没有选中文件且有文件列表，自动选中第一个
          if (!selectedFile && files.length > 0) {
            handleFileSelect(files[0]);
          }
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
      if (isReadonlyMode) {
        // 只读模式：从内联数据加载
        const response = await fetch('/data.json');
        const data = await response.json();
        setMarks(data.marks[prototypeName] || []);
      } else {
        // 开发模式：从 API 加载
        const response = await fetch(`/api/marks/${prototypeName}`);
        const data = await response.json();
        setMarks(data.marks || []);
      }
    } catch (error) {
      console.error('加载标记失败:', error);
      setMarks([]);
    }
  }, [selectedFile, viewMode]);

  // 加载标记数据
  useEffect(() => {
    loadMarks();
  }, [selectedFile, viewMode]);

  // WebSocket 连接用于文件热重载
  useEffect(() => {
    // 只读模式下不建立 WebSocket 连接
    if (isReadonlyMode) return;

    // 在开发模式下，使用 /ws 代理路径；在生产模式下，使用根路径
    const isDev = import.meta.env.DEV;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = isDev
      ? `${protocol}//${window.location.host}/ws`
      : `${protocol}//${window.location.host}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket 已连接');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'reload') {
          console.log('检测到文件变更，重新加载标记数据');
          // 重新加载标记数据（如果当前在 mark 模式）
          loadMarks();
        }
      } catch (error) {
        console.error('解析 WebSocket 消息失败:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket 已断开');
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [loadMarks]); // 依赖 loadMarks，确保使用最新版本

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
    // 只读模式下禁用编辑
    if (isReadonlyMode) return;

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
    // 只读模式下禁用删除
    if (isReadonlyMode) return;

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
    // 只读模式下禁用创建
    if (isReadonlyMode) return;
    if (!pendingMarkInfo) return;

    const prototypeName = selectedFile?.split('/')[0];
    if (!prototypeName) return;

    const mark: Mark = {
      id: `mark-${Date.now()}`,
      title,
      ...pendingMarkInfo,
      description,
      timestamp: Date.now(),
    };

    fetch(`/api/marks/${prototypeName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mark),
    })
      .then(res => res.json())
      .then(() => {
        setSelectedMarkId(mark.id);
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
    // 只读模式下禁用创建
    if (isReadonlyMode) return;
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

  // 处理打开发布 Drawer
  const handleOpenPublish = () => {
    setPublishDrawerOpen(true);
  };

  // 处理关闭发布 Drawer
  const handleClosePublish = () => {
    setPublishDrawerOpen(false);
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
        isReadonly={isReadonlyMode}
        onPublish={handleOpenPublish}
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
            marks={marks}
            selectedMarkId={selectedMarkId}
            pendingMarkInfo={pendingMarkInfo}
            onMarkPrepare={handleMarkPrepare}
            onMarkSelect={handleMarkSelect}
            onMarkCancel={handleMarkCancel}
            onToggleMarkPanel={handleToggleMarkPanel}
            isReadonly={isReadonlyMode}
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
              isReadonly={isReadonlyMode}
            />
          </div>
        )}
      </Layout>

      <PublishDrawer
        open={publishDrawerOpen}
        onClose={handleClosePublish}
        prototypes={prototypeTree}
      />
    </Layout>
  );
}

export default App;

import { Tree, Input, Tooltip, Button, Popconfirm, Modal, message } from 'antd';
import { FileOutlined, FolderOutlined, SearchOutlined, LeftOutlined, RightOutlined, DeleteOutlined, CopyOutlined, FolderAddOutlined, FileAddOutlined, EditOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import type { DataNode } from 'antd/es/tree';
import './FileTree.css';

interface FileTreeProps {
  onSelect: (path: string | null) => void;
  selectedFile: string | null;
  onNavigate: (direction: 'prev' | 'next') => void;
  onDeletePrototype: (path: string) => Promise<void> | void;
  onDeleteFolder: (path: string) => Promise<void> | void;
  onDuplicatePrototype: (path: string) => Promise<void> | void;
  onRenameNode: (sourcePath: string, targetName: string) => Promise<void> | void;
  onCreateFolder: (folderName: string) => Promise<void> | void;
  onMovePrototype: (prototypePath: string, targetFolderPath: string) => Promise<void> | void;
  onCreatePageWithAi: () => Promise<void> | void;
  refreshVersion?: number;
  onFilesUpdate?: (files: string[]) => void;
}

interface PrototypeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: PrototypeNode[];
}

function convertToTreeData(
  node: PrototypeNode,
  searchValue: string,
  onFolderClick?: (key: string) => void,
  onDeletePrototype?: (path: string) => Promise<void> | void,
  onDuplicatePrototype?: (path: string) => Promise<void> | void,
  onDeleteFolder?: (path: string) => Promise<void> | void,
  onRenameNode?: (path: string, name: string, type: 'file' | 'folder') => void
): DataNode | null {
  const isFolder = node.type === 'folder';
  const matchesSearch = !searchValue || node.name.toLowerCase().includes(searchValue.toLowerCase());

  // 递归处理子节点
  const children = node.children
    ?.map(child => convertToTreeData(child, searchValue, onFolderClick, onDeletePrototype, onDuplicatePrototype, onDeleteFolder, onRenameNode))
    .filter(Boolean) as DataNode[];

  // 如果是文件夹，只有当自己或子节点匹配时才显示
  if (isFolder && !matchesSearch && (!children || children.length === 0)) {
    return null;
  }

  // 如果是文件，只有匹配时才显示
  if (!isFolder && !matchesSearch) {
    return null;
  }

  const nodeKey = node.path || 'root';
  const isFile = node.type === 'file';

  return {
    key: nodeKey,
    title: (
      <Tooltip title={node.name} placement="right">
        <div className="file-tree-node-row">
          <div
            className="file-tree-node-title"
            onClick={(e) => {
              if (isFolder && onFolderClick) {
                e.stopPropagation();
                onFolderClick(nodeKey);
              }
            }}
          >
            {node.name}
          </div>
          {isFile && (
            <div className="file-tree-node-actions">
              {onRenameNode && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  className="file-tree-edit-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRenameNode(node.path, node.name, 'file');
                  }}
                  title="重命名页面"
                />
              )}
              {onDuplicatePrototype && (
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  className="file-tree-copy-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDuplicatePrototype(node.path);
                  }}
                  title="复制页面"
                />
              )}
              {onDeletePrototype && (
                <Popconfirm
                  title="删除页面"
                  description="将删除页面目录及页面下的标记文件，确认继续？"
                  placement="rightTop"
                  overlayClassName="file-tree-popconfirm"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    return onDeletePrototype(node.path);
                  }}
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    className="file-tree-delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  />
                </Popconfirm>
              )}
            </div>
          )}
          {isFolder && node.path && onDeleteFolder && (
            <div className="file-tree-node-actions">
              {onRenameNode && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  className="file-tree-edit-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRenameNode(node.path, node.name, 'folder');
                  }}
                  title="重命名文件夹"
                />
              )}
              <Popconfirm
                title="删除文件夹"
                description="将删除该文件夹以及下面的所有页面和标记文件，确认继续？"
                placement="rightTop"
                overlayClassName="file-tree-popconfirm"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={(e) => {
                  e?.stopPropagation();
                  return onDeleteFolder(node.path);
                }}
              >
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  className="file-tree-delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
              </Popconfirm>
            </div>
          )}
        </div>
      </Tooltip>
    ),
    icon: isFolder ? <FolderOutlined /> : <FileOutlined />,
    children: children && children.length > 0 ? children : undefined,
    isLeaf: !isFolder,
    selectable: !isFolder,
  };
}

export default function FileTree({
  onSelect,
  selectedFile,
  onNavigate,
  onDeletePrototype,
  onDeleteFolder,
  onDuplicatePrototype,
  onRenameNode,
  onCreateFolder,
  onMovePrototype,
  onCreatePageWithAi,
  refreshVersion = 0,
  onFilesUpdate,
}: FileTreeProps) {
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [originalData, setOriginalData] = useState<PrototypeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [projectName, setProjectName] = useState('PRDKit');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string; type: 'file' | 'folder' } | null>(null);
  const [draggingPrototypePath, setDraggingPrototypePath] = useState<string | null>(null);
  const [rootDropActive, setRootDropActive] = useState(false);
  const [createPageModalOpen, setCreatePageModalOpen] = useState(false);
  const [createPageSubmitting, setCreatePageSubmitting] = useState(false);

  useEffect(() => {
    fetchPrototypes();
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchPrototypes();
  }, [refreshVersion]);

  useEffect(() => {
    // 当搜索值变化时，重新过滤树数据
    if (originalData.length > 0) {
      const filtered = originalData
        .map(node => convertToTreeData(node, searchValue, handleFolderClick, onDeletePrototype, onDuplicatePrototype, onDeleteFolder, handleStartRename))
        .filter(Boolean) as DataNode[];
      setTreeData(filtered);
    }
  }, [searchValue, originalData, onDeletePrototype, onDuplicatePrototype, onDeleteFolder]);

  const handleFolderClick = (key: string) => {
    setExpandedKeys(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' });
      const data = await response.json();
      setProjectName(data.projectName || 'PRDKit');
    } catch (error) {
      console.error('获取配置失败:', error);
    }
  };

  const fetchPrototypes = async () => {
    try {
      const response = await fetch('/api/prototypes', { cache: 'no-store' });
      const data: PrototypeNode = await response.json();

      if (data.children) {
        setOriginalData(data.children);
        const treeNodes = data.children
          .map(node => convertToTreeData(node, '', handleFolderClick, onDeletePrototype, onDuplicatePrototype, onDeleteFolder, handleStartRename))
          .filter(Boolean) as DataNode[];
        setTreeData(treeNodes);

        const files: string[] = [];
        const collectFiles = (nodes: PrototypeNode[]) => {
          nodes.forEach((node) => {
            if (node.type === 'file' && node.path) {
              files.push(node.path);
            }
            if (node.children) {
              collectFiles(node.children);
            }
          });
        };
        collectFiles(data.children);
        onFilesUpdate?.(files);

        // 默认展开所有节点
        const allKeys: React.Key[] = [];
        const collectKeys = (nodes: PrototypeNode[]) => {
          nodes.forEach(node => {
            if (node.type === 'folder') {
              allKeys.push(node.path || 'root');
              if (node.children) {
                collectKeys(node.children);
              }
            }
          });
        };
        collectKeys(data.children);
        setExpandedKeys(allKeys);
      } else {
        setOriginalData([]);
        setTreeData([]);
        onFilesUpdate?.([]);
      }
    } catch (error) {
      console.error('获取原型列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (selectedKeys: React.Key[]) => {
    if (selectedKeys.length > 0) {
      const path = selectedKeys[0] as string;
      onSelect(path);
    }
  };

  const findNodeByPath = (nodes: PrototypeNode[], targetPath: string): PrototypeNode | null => {
    for (const node of nodes) {
      if (node.path === targetPath) {
        return node;
      }
      if (node.children) {
        const result = findNodeByPath(node.children, targetPath);
        if (result) {
          return result;
        }
      }
    }

    return null;
  };

  const handleCreateFolderSubmit = async () => {
    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      message.warning('请输入文件夹名称');
      return;
    }

    try {
      setFolderSubmitting(true);
      await onCreateFolder(trimmedName);
      await fetchPrototypes();
      setCreateFolderModalOpen(false);
      setNewFolderName('');
    } catch (error) {
      console.error('新建文件夹失败:', error);
      message.error(error instanceof Error ? error.message : '新建文件夹失败');
    } finally {
      setFolderSubmitting(false);
    }
  };

  const handleStartRename = (path: string, name: string, type: 'file' | 'folder') => {
    setRenameTarget({ path, name, type });
    setRenameValue(name);
    setRenameModalOpen(true);
  };

  const handleRenameSubmit = async () => {
    const trimmedName = renameValue.trim();
    if (!renameTarget) return;

    if (!trimmedName) {
      message.warning(`请输入${renameTarget.type === 'file' ? '页面' : '文件夹'}名称`);
      return;
    }

    try {
      setRenameSubmitting(true);
      await onRenameNode(renameTarget.path, trimmedName);
      await fetchPrototypes();
      setRenameModalOpen(false);
      setRenameTarget(null);
      setRenameValue('');
    } catch (error) {
      console.error('重命名失败:', error);
      message.error(error instanceof Error ? error.message : '重命名失败');
    } finally {
      setRenameSubmitting(false);
    }
  };

  const handleCreatePageCopy = async () => {
    try {
      setCreatePageSubmitting(true);
      await onCreatePageWithAi();
    } catch (error) {
      console.error('复制新建页面 skill 失败:', error);
      message.error(error instanceof Error ? error.message : '复制失败');
    } finally {
      setCreatePageSubmitting(false);
    }
  };

  const handleDrop = async (info: any) => {
    const dragPath = String(info.dragNode?.key || '');
    const targetPath = String(info.node?.key || '');

    if (!dragPath || !targetPath) {
      return;
    }

    const dragNode = findNodeByPath(originalData, dragPath);
    const targetNode = findNodeByPath(originalData, targetPath);

    if (!dragNode || dragNode.type !== 'file') {
      message.info('当前仅支持拖动页面');
      return;
    }

    let targetFolderPath = '';

    if (info.dropToGap) {
      if (!targetNode) {
        return;
      }

      const parentSegments = targetNode.path.split('/');
      parentSegments.pop();
      targetFolderPath = parentSegments.join('/');
    } else {
      if (!targetNode || targetNode.type !== 'folder') {
        message.info('请将页面拖到目标文件夹上');
        return;
      }
      targetFolderPath = targetPath;
    }

    await onMovePrototype(dragPath, targetFolderPath);
    setDraggingPrototypePath(null);
    setRootDropActive(false);
  };

  if (loading) {
    return <div className="file-tree-loading">加载中...</div>;
  }

  return (
    <div className="file-tree-container">
      {/* 搜索栏和导航按钮 */}
      <div className="file-tree-toolbar">
        {!searchExpanded ? (
          <>
            <SearchOutlined
              className="file-tree-search-icon"
              onClick={() => setSearchExpanded(true)}
            />
            <div className="file-tree-search-spacer" />
          </>
        ) : (
          <Input
            placeholder="搜索文件或文件夹"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onBlur={() => {
              if (!searchValue) {
                setSearchExpanded(false);
              }
            }}
            autoFocus
            allowClear
            prefix={<SearchOutlined />}
            className="file-tree-search-input"
          />
        )}
        <LeftOutlined
          className="file-tree-nav-icon"
          onClick={() => onNavigate('prev')}
        />
        <RightOutlined
          className="file-tree-nav-icon"
          onClick={() => onNavigate('next')}
        />
      </div>

      {/* 项目名称 */}
      <div className="file-tree-project-name">
        <div
          className={`file-tree-project-header ${rootDropActive ? 'root-drop-active' : ''}`}
          onDragOver={(e) => {
            if (!draggingPrototypePath) return;
            e.preventDefault();
            setRootDropActive(true);
          }}
          onDragLeave={() => {
            setRootDropActive(false);
          }}
          onDrop={() => {
            if (!draggingPrototypePath) return;
            void onMovePrototype(draggingPrototypePath, '');
            setDraggingPrototypePath(null);
            setRootDropActive(false);
          }}
        >
          <Tooltip title={projectName} placement="right">
            <h2 className="file-tree-project-title">
              {projectName}
            </h2>
          </Tooltip>
          <div className="file-tree-project-actions">
            <Button
              type="text"
              size="small"
              icon={<FolderAddOutlined />}
              className="file-tree-project-action"
              title="新建文件夹"
              onClick={() => setCreateFolderModalOpen(true)}
            />
            <Button
              type="text"
              size="small"
              icon={<FileAddOutlined />}
              className="file-tree-project-action file-tree-project-action-ai"
              title="新建页面（复制给 AI）"
              onClick={() => setCreatePageModalOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* 文件树 */}
      <div className="file-tree-content">
        <Tree
          showIcon
          draggable={{ icon: false }}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys)}
          treeData={treeData}
          onSelect={handleSelect}
          selectedKeys={selectedFile ? [selectedFile] : []}
          onDragStart={(info) => {
            setDraggingPrototypePath(String(info.node.key || ''));
          }}
          onDragEnd={() => {
            setDraggingPrototypePath(null);
            setRootDropActive(false);
          }}
          onDrop={(info) => {
            void handleDrop(info);
          }}
        />
      </div>

      <div className="file-tree-brand">
        <span className="file-tree-brand-label">Powered by</span>
        <img src="/logo.svg" alt="PRDKit Design" className="file-tree-brand-logo" />
      </div>

      <Modal
        title="新建文件夹"
        open={createFolderModalOpen}
        onCancel={() => {
          if (folderSubmitting) return;
          setCreateFolderModalOpen(false);
          setNewFolderName('');
        }}
        onOk={() => {
          void handleCreateFolderSubmit();
        }}
        okText="创建"
        cancelText="取消"
        confirmLoading={folderSubmitting}
      >
        <Input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="请输入文件夹名称"
          onPressEnter={() => {
            void handleCreateFolderSubmit();
          }}
          autoFocus
        />
      </Modal>

      <Modal
        title={renameTarget?.type === 'file' ? '重命名页面' : '重命名文件夹'}
        open={renameModalOpen}
        onCancel={() => {
          if (renameSubmitting) return;
          setRenameModalOpen(false);
          setRenameTarget(null);
          setRenameValue('');
        }}
        onOk={() => {
          void handleRenameSubmit();
        }}
        okText="保存"
        cancelText="取消"
        confirmLoading={renameSubmitting}
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder={renameTarget?.type === 'file' ? '请输入页面名称' : '请输入文件夹名称'}
          onPressEnter={() => {
            void handleRenameSubmit();
          }}
          autoFocus
        />
      </Modal>

      <Modal
        title={null}
        open={createPageModalOpen}
        footer={null}
        closable={false}
        centered
        width={560}
        className="file-tree-create-page-modal"
        onCancel={() => {
          if (createPageSubmitting) return;
          setCreatePageModalOpen(false);
        }}
      >
        <div className="file-tree-create-page-shell">
          <div className="file-tree-create-page-header">
            <div>
              <div className="file-tree-create-page-eyebrow">新建页面</div>
              <h2 className="file-tree-create-page-title">复制给 AI 继续生成页面</h2>
              <p className="file-tree-create-page-description">
                我们会帮你复制一条带有 skill 指令的创建页面提示词。复制后，切换到 AI 对话或终端粘贴使用，再把生成的页面放回原型目录。
              </p>
            </div>
            <Button
              type="text"
              onClick={() => setCreatePageModalOpen(false)}
              disabled={createPageSubmitting}
            >
              关闭
            </Button>
          </div>

          <div className="file-tree-create-page-content">
            <div className="file-tree-create-page-card">
              <div className="file-tree-create-page-step">1. 点击下方按钮复制给 AI</div>
              <div className="file-tree-create-page-step">2. 粘贴到 Claude / ChatGPT / AI 终端</div>
              <div className="file-tree-create-page-step">3. 根据返回结果创建页面目录与页面文件</div>
            </div>

            <div className="file-tree-create-page-actions">
              <Button
                type="primary"
                size="large"
                className="file-tree-create-page-copy-button"
                loading={createPageSubmitting}
                onClick={() => {
                  void handleCreatePageCopy();
                }}
              >
                复制给 AI
              </Button>
              <div className="file-tree-create-page-hint">
                已自动附带 skill 指令，可直接粘贴到 AI 中使用
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

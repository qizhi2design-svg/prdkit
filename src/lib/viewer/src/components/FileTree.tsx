import { CaretDownOutlined, CopyOutlined, DeleteOutlined, EditOutlined, FileAddOutlined, FileOutlined, FolderAddOutlined, FolderFilled, LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Input, Tooltip, Button, Popconfirm, Modal } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { PrdFileInfo, PrdFolderInfo } from '../types/common';
import { message } from '../utils/message';
import './FileTree.css';

interface FileTreeProps {
  onSelect: (path: string | null) => void;
  selectedFile: string | null;
  currentIndex: number;
  totalFiles: number;
  viewMode?: 'prototype' | 'prd';
  prdFiles?: PrdFileInfo[];
  prdFolders?: PrdFolderInfo[];
  onNavigate: (direction: 'prev' | 'next') => void;
  onDeletePrototype: (path: string) => Promise<void> | void;
  onDeleteFolder: (path: string) => Promise<void> | void;
  onDuplicatePrototype: (path: string) => Promise<void> | void;
  onRenameNode: (sourcePath: string, targetName: string) => Promise<void> | void;
  onCreateFolder: (folderName: string) => Promise<void> | void;
  onMovePrototype: (prototypePath: string, targetFolderPath: string) => Promise<void> | void;
  onCreatePageWithAi: () => Promise<void> | void;
  onPrdCreate?: (title: string) => Promise<void>;
  onCreatePrdFolder?: (folderName: string) => Promise<void>;
  onDeletePrdFolder?: (folderPath: string) => Promise<void>;
  onMovePrdFile?: (fileName: string, targetFolderPath: string) => Promise<void>;
  onRenamePrdFolder?: (folderPath: string, targetName: string) => Promise<void>;
  refreshVersion?: number;
  onFilesUpdate?: (files: string[]) => void;
  // PRD 操作
  onPrdRename?: (fileName: string, newTitle: string) => Promise<void>;
  onPrdDuplicate?: (fileName: string) => Promise<void>;
  onPrdDelete?: (fileName: string) => Promise<void>;
}

interface PrototypeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: PrototypeNode[];
}

export default function FileTree({
  onSelect,
  selectedFile,
  currentIndex,
  totalFiles,
  viewMode = 'prototype',
  prdFiles,
  prdFolders,
  onNavigate,
  onDeletePrototype,
  onDeleteFolder,
  onDuplicatePrototype,
  onRenameNode,
  onCreateFolder,
  onMovePrototype,
  onCreatePageWithAi,
  onPrdCreate,
  onCreatePrdFolder,
  onDeletePrdFolder,
  onMovePrdFile,
  onRenamePrdFolder,
  refreshVersion = 0,
  onFilesUpdate,
  onPrdRename,
  onPrdDuplicate,
  onPrdDelete,
}: FileTreeProps) {
  const [originalData, setOriginalData] = useState<PrototypeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string; type: 'file' | 'folder'; mode: 'prototype' | 'prd' } | null>(null);
  const [draggingPrototypePath, setDraggingPrototypePath] = useState<string | null>(null);
  const [rootDropActive, setRootDropActive] = useState(false);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [createPageModalOpen, setCreatePageModalOpen] = useState(false);
  const [createPageSubmitting, setCreatePageSubmitting] = useState(false);

  // PRD rename state
  const [prdRenameModalOpen, setPrdRenameModalOpen] = useState(false);
  const [prdRenameValue, setPrdRenameValue] = useState('');
  const [prdRenameSubmitting, setPrdRenameSubmitting] = useState(false);
  const [prdRenameTarget, setPrdRenameTarget] = useState<string | null>(null);
  const [prdCreateModalOpen, setPrdCreateModalOpen] = useState(false);
  const [prdCreateValue, setPrdCreateValue] = useState('');
  const [prdCreateSubmitting, setPrdCreateSubmitting] = useState(false);

  useEffect(() => {
    void fetchPrototypes();
  }, []);

  useEffect(() => {
    void fetchPrototypes();
  }, [refreshVersion]);

  const normalizedSearch = searchValue.trim().toLowerCase();
  const visibleNodes = useMemo(
    () => filterTreeNodes(originalData, normalizedSearch),
    [normalizedSearch, originalData]
  );
  const prdTreeNodes = useMemo(
    () => buildPrdTree(prdFiles || [], prdFolders || []),
    [prdFiles, prdFolders],
  );
  const visiblePrdNodes = useMemo(
    () => filterTreeNodes(prdTreeNodes, normalizedSearch),
    [normalizedSearch, prdTreeNodes],
  );


  const fetchPrototypes = async () => {
    try {
      const response = await fetch('/api/prototypes', { cache: 'no-store' });
      const data: { children?: PrototypeNode[] } = await response.json();

      if (data.children) {
        setOriginalData(data.children);

        const files: string[] = [];
        const folderKeys: string[] = [];
        const collect = (nodes: PrototypeNode[]) => {
          nodes.forEach((node) => {
            if (node.type === 'file' && node.path) {
              files.push(node.path);
            }
            if (node.type === 'folder') {
              folderKeys.push(node.path || node.name);
              if (node.children) {
                collect(node.children);
              }
            }
          });
        };

        collect(data.children);
        onFilesUpdate?.(files);
        setExpandedFolders((current) => {
          const next = { ...current };
          folderKeys.forEach((key) => {
            if (!(key in next)) {
              next[key] = true;
            }
          });
          return next;
        });
      } else {
        setOriginalData([]);
        onFilesUpdate?.([]);
      }
    } catch (error) {
      console.error('获取原型列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolderSubmit = async () => {
    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      message.warning('请输入文件夹名称');
      return;
    }

    try {
      setFolderSubmitting(true);
      if (viewMode === 'prd') {
        await onCreatePrdFolder?.(trimmedName);
      } else {
        await onCreateFolder(trimmedName);
        await fetchPrototypes();
      }
      setCreateFolderModalOpen(false);
      setNewFolderName('');
    } catch (error) {
      console.error('新建文件夹失败:', error);
      message.error(error instanceof Error ? error.message : '新建文件夹失败');
    } finally {
      setFolderSubmitting(false);
    }
  };

  const handleStartRename = (path: string, name: string, type: 'file' | 'folder', mode: 'prototype' | 'prd' = 'prototype') => {
    setRenameTarget({ path, name, type, mode });
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
      if (renameTarget.mode === 'prd' && renameTarget.type === 'folder') {
        await onRenamePrdFolder?.(renameTarget.path, trimmedName);
      } else {
        await onRenameNode(renameTarget.path, trimmedName);
        await fetchPrototypes();
      }
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

  const handlePrdRenameSubmit = async () => {
    const trimmedTitle = prdRenameValue.trim();
    if (!trimmedTitle || !prdRenameTarget) {
      message.warning('请输入标题');
      return;
    }

    try {
      setPrdRenameSubmitting(true);
      await onPrdRename?.(prdRenameTarget, trimmedTitle);
      setPrdRenameModalOpen(false);
      setPrdRenameTarget(null);
      setPrdRenameValue('');
    } catch (error) {
      console.error('重命名 PRD 标题失败:', error);
      message.error(error instanceof Error ? error.message : '重命名失败');
    } finally {
      setPrdRenameSubmitting(false);
    }
  };

  const handlePrdCreateSubmit = async () => {
    const trimmedTitle = prdCreateValue.trim();
    if (!trimmedTitle) {
      message.warning('请输入 PRD 标题');
      return;
    }

    try {
      setPrdCreateSubmitting(true);
      await onPrdCreate?.(trimmedTitle);
      setPrdCreateModalOpen(false);
      setPrdCreateValue('');
    } catch (error) {
      console.error('新建 PRD 失败:', error);
      message.error(error instanceof Error ? error.message : '新建 PRD 失败');
    } finally {
      setPrdCreateSubmitting(false);
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((current) => ({
      ...current,
      [path]: !current[path],
    }));
  };

  const handleFileDropToFolder = async (prototypePath: string, targetFolderPath: string) => {
    if (!prototypePath || prototypePath === targetFolderPath) return;
    await onMovePrototype(prototypePath, targetFolderPath);
    setDraggingPrototypePath(null);
    setDropTargetPath(null);
    setRootDropActive(false);
  };

  if (loading) {
    return <div className="file-tree-loading">加载中...</div>;
  }

  return (
    <div className="file-tree-container">
      <div className="file-tree-toolbar">
        <Input
          placeholder="搜索页面路径"
          prefix={<SearchOutlined />}
          allowClear
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          size="small"
          className="file-tree-search-input"
        />
        <ButtonIcon icon={<LeftOutlined />} onClick={() => onNavigate('prev')} aria-label="上一个页面" />
        <ButtonIcon icon={<RightOutlined />} onClick={() => onNavigate('next')} aria-label="下一个页面" />
      </div>

      <div className="file-tree-project-name">
        <div
          className={`file-tree-project-header ${draggingPrototypePath && rootDropActive ? 'root-drop-active' : ''}`}
          onDragOver={(event) => {
            if (!draggingPrototypePath) return;
            event.preventDefault();
            setRootDropActive(true);
            setDropTargetPath(null);
          }}
          onDragLeave={() => {
            setRootDropActive(false);
          }}
          onDrop={() => {
            if (!draggingPrototypePath) return;
            if (viewMode === 'prd') {
              void onMovePrdFile?.(draggingPrototypePath, '');
            } else {
              void onMovePrototype(draggingPrototypePath, '');
            }
            setDraggingPrototypePath(null);
            setDropTargetPath(null);
            setRootDropActive(false);
          }}
        >
          <div className="file-tree-project-heading">
            <h2 className="file-tree-project-title">{viewMode === 'prd' ? 'PRD 文档' : '页面'}</h2>
            <span className="file-tree-file-count">{currentIndex} / {totalFiles}</span>
          </div>
          {viewMode !== 'prd' ? (
            <div className="file-tree-project-actions">
              <Tooltip title="新建文件夹" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  size="small"
                  icon={<FolderAddOutlined />}
                  className="file-tree-project-action"
                  onClick={() => setCreateFolderModalOpen(true)}
                />
              </Tooltip>
              <Tooltip title="新建页面（复制给 AI）" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  size="small"
                  icon={<FileAddOutlined />}
                  className="file-tree-project-action file-tree-project-action-ai"
                  onClick={() => setCreatePageModalOpen(true)}
                />
              </Tooltip>
            </div>
          ) : (
            <div className="file-tree-project-actions">
              <Tooltip title="新建文件夹" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  size="small"
                  icon={<FolderAddOutlined />}
                  className="file-tree-project-action"
                  onClick={() => setCreateFolderModalOpen(true)}
                />
              </Tooltip>
              <Tooltip title="新建 PRD" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  size="small"
                  icon={<FileAddOutlined />}
                  className="file-tree-project-action"
                  onClick={() => setPrdCreateModalOpen(true)}
                />
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      <div
        className="file-tree-content custom-scrollbar"
        onDragOver={(event) => {
          if (!draggingPrototypePath) return;
          event.preventDefault();
          setRootDropActive(true);
          setDropTargetPath(null);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setRootDropActive(false);
        }}
        onDrop={() => {
          if (!draggingPrototypePath) return;
          if (viewMode === 'prd') {
            void onMovePrdFile?.(draggingPrototypePath, '');
          } else {
            void onMovePrototype(draggingPrototypePath, '');
          }
          setDraggingPrototypePath(null);
          setDropTargetPath(null);
          setRootDropActive(false);
        }}
      >
        <div className="file-tree-list" role="tree">
          {viewMode === 'prd' ? (
            (!prdFiles || prdFiles.length === 0) && (!prdFolders || prdFolders.length === 0) ? (
              <div className="file-tree-empty">暂无 PRD 文档</div>
            ) : (
              visiblePrdNodes.map((node) => (
                <TreeBranch
                  key={node.path || node.name}
                  node={node}
                  depth={0}
                  selectedFile={selectedFile}
                  searchValue={normalizedSearch}
                  expandedFolders={expandedFolders}
                  draggingPrototypePath={draggingPrototypePath}
                  dropTargetPath={dropTargetPath}
                  viewMode="prd"
                  onToggleFolder={toggleFolder}
                  onSelect={onSelect}
                  onDeletePrototype={onDeletePrototype}
                  onDuplicatePrototype={onDuplicatePrototype}
                  onDeleteFolder={onDeleteFolder}
                  onRenameNode={handleStartRename}
                  onDragStart={setDraggingPrototypePath}
                  onDragEnd={() => {
                    setDraggingPrototypePath(null);
                    setDropTargetPath(null);
                    setRootDropActive(false);
                  }}
                  onFolderDropActiveChange={setDropTargetPath}
                  onMovePrototype={handleFileDropToFolder}
                  onPrdRenameStart={(fileName, title) => {
                    setPrdRenameTarget(fileName);
                    setPrdRenameValue(title);
                    setPrdRenameModalOpen(true);
                  }}
                  onPrdFolderRenameStart={(folderPath, name) => handleStartRename(folderPath, name, 'folder', 'prd')}
                  onPrdDuplicate={onPrdDuplicate}
                  onPrdDelete={onPrdDelete}
                  onPrdDeleteFolder={onDeletePrdFolder}
                  onPrdMove={onMovePrdFile}
                />
              ))
            )
          ) : visibleNodes.length === 0 ? (
            <div className="file-tree-empty">未找到匹配页面</div>
          ) : (
            visibleNodes.map((node) => (
              <TreeBranch
                key={node.path || node.name}
                node={node}
                depth={0}
                selectedFile={selectedFile}
                searchValue={normalizedSearch}
                expandedFolders={expandedFolders}
                draggingPrototypePath={draggingPrototypePath}
                dropTargetPath={dropTargetPath}
                onToggleFolder={toggleFolder}
                onSelect={onSelect}
                onDeletePrototype={onDeletePrototype}
                onDuplicatePrototype={onDuplicatePrototype}
                onDeleteFolder={onDeleteFolder}
                onRenameNode={handleStartRename}
                onDragStart={setDraggingPrototypePath}
                onDragEnd={() => {
                  setDraggingPrototypePath(null);
                  setDropTargetPath(null);
                  setRootDropActive(false);
                }}
                onFolderDropActiveChange={setDropTargetPath}
                onMovePrototype={handleFileDropToFolder}
              />
            ))
          )}
        </div>
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
          </div>
          <div className="file-tree-create-page-content">
            <div className="file-tree-create-page-card">
              <div className="file-tree-create-page-step">1. 复制创建页面的 skill 指令</div>
              <div className="file-tree-create-page-step">2. 在 AI 中生成新的原型页面</div>
              <div className="file-tree-create-page-step">3. 回到 viewer 自动看到新页面</div>
            </div>
            <div className="file-tree-create-page-actions">
              <Button
                type="primary"
                className="file-tree-create-page-copy-button"
                loading={createPageSubmitting}
                onClick={() => void handleCreatePageCopy()}
              >
                复制创建页面指令
              </Button>
              <div className="file-tree-create-page-hint">
                复制后可直接粘贴到你的 AI 工作流中继续完成页面生成。
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        title="新建 PRD"
        open={prdCreateModalOpen}
        onCancel={() => {
          if (prdCreateSubmitting) return;
          setPrdCreateModalOpen(false);
          setPrdCreateValue('');
        }}
        onOk={() => {
          void handlePrdCreateSubmit();
        }}
        okText="创建"
        cancelText="取消"
        confirmLoading={prdCreateSubmitting}
      >
        <Input
          value={prdCreateValue}
          onChange={(e) => setPrdCreateValue(e.target.value)}
          placeholder="请输入 PRD 标题"
          onPressEnter={() => {
            void handlePrdCreateSubmit();
          }}
          autoFocus
        />
      </Modal>

      <Modal
        title="重命名 PRD 标题"
        open={prdRenameModalOpen}
        onCancel={() => {
          if (prdRenameSubmitting) return;
          setPrdRenameModalOpen(false);
          setPrdRenameTarget(null);
          setPrdRenameValue('');
        }}
        onOk={() => {
          void handlePrdRenameSubmit();
        }}
        okText="保存"
        cancelText="取消"
        confirmLoading={prdRenameSubmitting}
      >
        <Input
          value={prdRenameValue}
          onChange={(e) => setPrdRenameValue(e.target.value)}
          placeholder="请输入新的 PRD 标题"
          onPressEnter={() => {
            void handlePrdRenameSubmit();
          }}
          autoFocus
        />
      </Modal>
    </div>
  );
}

function TreeBranch({
  node,
  depth,
  selectedFile,
  searchValue,
  expandedFolders,
  draggingPrototypePath,
  dropTargetPath,
  viewMode = 'prototype',
  onToggleFolder,
  onSelect,
  onDeletePrototype,
  onDuplicatePrototype,
  onDeleteFolder,
  onRenameNode,
  onDragStart,
  onDragEnd,
  onFolderDropActiveChange,
  onMovePrototype,
  onPrdRenameStart,
  onPrdFolderRenameStart,
  onPrdDuplicate,
  onPrdDelete,
  onPrdDeleteFolder,
  onPrdMove,
}: {
  node: PrototypeNode;
  depth: number;
  selectedFile: string | null;
  searchValue: string;
  expandedFolders: Record<string, boolean>;
  draggingPrototypePath: string | null;
  dropTargetPath: string | null;
  viewMode?: 'prototype' | 'prd';
  onToggleFolder: (path: string) => void;
  onSelect: (path: string | null) => void;
  onDeletePrototype: (path: string) => Promise<void> | void;
  onDuplicatePrototype: (path: string) => Promise<void> | void;
  onDeleteFolder: (path: string) => Promise<void> | void;
  onRenameNode: (path: string, name: string, type: 'file' | 'folder', mode?: 'prototype' | 'prd') => void;
  onDragStart: (path: string | null) => void;
  onDragEnd: () => void;
  onFolderDropActiveChange: (path: string | null) => void;
  onMovePrototype: (prototypePath: string, targetFolderPath: string) => Promise<void>;
  onPrdRenameStart?: (fileName: string, title: string) => void;
  onPrdFolderRenameStart?: (folderPath: string, name: string) => void;
  onPrdDuplicate?: (fileName: string) => Promise<void>;
  onPrdDelete?: (fileName: string) => Promise<void>;
  onPrdDeleteFolder?: (folderPath: string) => Promise<void>;
  onPrdMove?: (fileName: string, targetFolderPath: string) => Promise<void>;
}) {
  const isFolder = node.type === 'folder';
  const nodePath = node.path || `${node.name}-${depth}`;
  const children = node.children || [];
  const hasChildren = children.length > 0;
  const expanded = searchValue ? true : expandedFolders[nodePath] ?? true;
  const selected = !isFolder && selectedFile === node.path;
  const isDropTarget = isFolder && dropTargetPath === nodePath;

  return (
    <div className="file-tree-branch">
      <Tooltip title={node.path || node.name} placement="right" getPopupContainer={() => document.body}>
        <div
          role="button"
          tabIndex={0}
          className={`file-tree-item ${isFolder ? 'folder' : 'file'} ${selected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''}`}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          draggable={!isFolder}
          onDragStart={() => {
            if (!isFolder && node.path) {
              onDragStart(node.path);
            }
          }}
          onDragEnd={onDragEnd}
          onDragOver={(event) => {
            if (!isFolder || !draggingPrototypePath || !node.path) return;
            event.preventDefault();
            onFolderDropActiveChange(nodePath);
          }}
          onDragLeave={() => {
            if (isDropTarget) {
              onFolderDropActiveChange(null);
            }
          }}
          onDrop={() => {
            if (!isFolder || !draggingPrototypePath || !node.path) return;
            if (viewMode === 'prd') {
              void onPrdMove?.(draggingPrototypePath, node.path);
              return;
            }
            void onMovePrototype(draggingPrototypePath, node.path);
          }}
          onClick={() => {
            if (isFolder) {
              onToggleFolder(nodePath);
              return;
            }
            onSelect(node.path || null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            if (isFolder) {
              onToggleFolder(nodePath);
              return;
            }
            onSelect(node.path || null);
          }}
        >
          <span className={`file-tree-item-caret ${isFolder && hasChildren ? 'visible' : ''} ${expanded ? 'expanded' : ''}`}>
            {isFolder && hasChildren ? <CaretDownOutlined /> : null}
          </span>
          <span className="file-tree-item-icon">
            {isFolder ? <FolderFilled /> : <FileOutlined />}
          </span>
          <span className="file-tree-item-label">{node.name}</span>
          <span className="file-tree-item-actions">
            {isFolder ? (
              <>
                {viewMode !== 'prd' ? (
                  <Tooltip title="重命名" getPopupContainer={() => document.body}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    className="file-tree-inline-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRenameNode(node.path, node.name, 'folder');
                    }}
                  />
                  </Tooltip>
                ) : null}
                {viewMode === 'prd' ? (
                  <Tooltip title="重命名文件夹" getPopupContainer={() => document.body}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    className="file-tree-inline-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPrdFolderRenameStart?.(node.path, node.name);
                    }}
                  />
                  </Tooltip>
                ) : null}
                <Popconfirm
                  title={viewMode === 'prd' ? '删除 PRD 文件夹' : '删除文件夹'}
                  description={viewMode === 'prd' ? '将删除该文件夹以及下面的所有 PRD 文档，确认继续？' : '将删除该文件夹以及下面的所有页面和标记文件，确认继续？'}
                  placement="rightTop"
                  overlayClassName="file-tree-popconfirm"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={(event) => {
                    event?.stopPropagation();
                    if (viewMode === 'prd') {
                      return onPrdDeleteFolder?.(node.path);
                    }
                    return onDeleteFolder(node.path);
                  }}
                >
                  <Tooltip title={viewMode === 'prd' ? '删除文件夹' : '删除文件夹'} getPopupContainer={() => document.body}>
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    className="file-tree-inline-action file-tree-inline-delete"
                    onClick={(event) => event.stopPropagation()}
                  />
                  </Tooltip>
                </Popconfirm>
              </>
            ) : (
              <>
                <Tooltip title={viewMode === 'prd' ? '重命名标题' : '重命名'} getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  className="file-tree-inline-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (viewMode === 'prd') {
                      onPrdRenameStart?.(node.path, node.name);
                      return;
                    }
                    onRenameNode(node.path, node.name, 'file');
                  }}
                />
                </Tooltip>
                <Tooltip title={viewMode === 'prd' ? '复制文档' : '复制页面'} getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  className="file-tree-inline-action file-tree-inline-copy"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (viewMode === 'prd') {
                      void onPrdDuplicate?.(node.path);
                      return;
                    }
                    void onDuplicatePrototype(node.path);
                  }}
                />
                </Tooltip>
                <Popconfirm
                  title={viewMode === 'prd' ? '删除 PRD 文档' : '删除页面'}
                  description={viewMode === 'prd' ? '将永久删除该 PRD 文档，确认继续？' : '将删除页面目录及页面下的标记文件，确认继续？'}
                  placement="rightTop"
                  overlayClassName="file-tree-popconfirm"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={(event) => {
                    event?.stopPropagation();
                    if (viewMode === 'prd') {
                      return onPrdDelete?.(node.path);
                    }
                    return onDeletePrototype(node.path);
                  }}
                >
                  <Tooltip title={viewMode === 'prd' ? '删除文档' : '删除页面'} getPopupContainer={() => document.body}>
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    className="file-tree-inline-action file-tree-inline-delete"
                    onClick={(event) => event.stopPropagation()}
                  />
                  </Tooltip>
                </Popconfirm>
              </>
            )}
          </span>
        </div>
      </Tooltip>
      {isFolder && expanded && hasChildren ? (
        <div className="file-tree-children">
          {children
            .filter((child) => matchesNode(child, searchValue))
            .map((child) => (
              <TreeBranch
                key={child.path || `${nodePath}-${child.name}`}
                node={child}
                depth={depth + 1}
                selectedFile={selectedFile}
                searchValue={searchValue}
                expandedFolders={expandedFolders}
                draggingPrototypePath={draggingPrototypePath}
                dropTargetPath={dropTargetPath}
                viewMode={viewMode}
                onToggleFolder={onToggleFolder}
                onSelect={onSelect}
                onDeletePrototype={onDeletePrototype}
                onDuplicatePrototype={onDuplicatePrototype}
                onDeleteFolder={onDeleteFolder}
                onRenameNode={onRenameNode}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onFolderDropActiveChange={onFolderDropActiveChange}
                onMovePrototype={onMovePrototype}
                onPrdRenameStart={onPrdRenameStart}
                onPrdFolderRenameStart={onPrdFolderRenameStart}
                onPrdDuplicate={onPrdDuplicate}
                onPrdDelete={onPrdDelete}
                onPrdDeleteFolder={onPrdDeleteFolder}
                onPrdMove={onPrdMove}
              />
            ))}
        </div>
      ) : null}
    </div>
  );
}

function matchesNode(node: PrototypeNode, searchValue: string): boolean {
  if (!searchValue) return true;
  if (node.name.toLowerCase().includes(searchValue)) return true;
  return (node.children || []).some((child) => matchesNode(child, searchValue));
}

function filterTreeNodes(nodes: PrototypeNode[], searchValue: string): PrototypeNode[] {
  return nodes.filter((node) => matchesNode(node, searchValue));
}

function buildPrdTree(prdFiles: PrdFileInfo[], prdFolders: PrdFolderInfo[]): PrototypeNode[] {
  const root: PrototypeNode[] = [];
  const folderMap = new Map<string, PrototypeNode>();

  const ensureFolder = (folderPath: string) => {
    if (folderMap.has(folderPath)) {
      return folderMap.get(folderPath)!;
    }

    const segments = folderPath.split('/').filter(Boolean);
    const folderName = segments[segments.length - 1] || folderPath;
    const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : '';
    const folderNode: PrototypeNode = {
      id: `prd-folder:${folderPath}`,
      name: folderName,
      type: 'folder',
      path: folderPath,
      children: [],
    };

    folderMap.set(folderPath, folderNode);
    if (parentPath) {
      ensureFolder(parentPath).children!.push(folderNode);
    } else {
      root.push(folderNode);
    }

    return folderNode;
  };

  for (const folder of prdFolders) {
    ensureFolder(folder.folderPath);
  }

  for (const file of prdFiles) {
    const normalizedPath = file.fileName.replace(/\\/g, '/');
    const segments = normalizedPath.split('/').filter(Boolean);
    const fileName = segments.pop() || normalizedPath;
    const parentPath = segments.join('/');
    const fileNode: PrototypeNode = {
      id: `prd-file:${normalizedPath}`,
      name: file.name || fileName.replace(/\.md$/, ''),
      type: 'file',
      path: normalizedPath,
    };

    if (parentPath) {
      ensureFolder(parentPath).children!.push(fileNode);
    } else {
      root.push(fileNode);
    }
  }

  const sortNodes = (nodes: PrototypeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    nodes.forEach((node) => {
      if (node.children) {
        sortNodes(node.children);
      }
    });
  };

  sortNodes(root);
  return root;
}

function ButtonIcon({ icon, onClick, 'aria-label': ariaLabel }: { icon: React.ReactNode; onClick: () => void; 'aria-label'?: string }) {
  return (
    <Tooltip title={ariaLabel} getPopupContainer={() => document.body}>
      <button type="button" className="file-tree-nav-icon" onClick={onClick} aria-label={ariaLabel}>
        {icon}
      </button>
    </Tooltip>
  );
}

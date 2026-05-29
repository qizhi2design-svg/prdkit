import { CaretDownOutlined, CopyOutlined, DeleteOutlined, EditOutlined, FileAddOutlined, FileOutlined, FolderAddOutlined, FolderFilled, LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Input, Tooltip, Button, Popconfirm, Modal, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { PrdFileInfo } from '../types/common';
import './FileTree.css';

interface FileTreeProps {
  onSelect: (path: string | null) => void;
  selectedFile: string | null;
  currentIndex: number;
  totalFiles: number;
  viewMode?: 'prototype' | 'prd';
  prdFiles?: PrdFileInfo[];
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

export default function FileTree({
  onSelect,
  selectedFile,
  currentIndex,
  totalFiles,
  viewMode = 'prototype',
  prdFiles,
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
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string; type: 'file' | 'folder' } | null>(null);
  const [draggingPrototypePath, setDraggingPrototypePath] = useState<string | null>(null);
  const [rootDropActive, setRootDropActive] = useState(false);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [createPageModalOpen, setCreatePageModalOpen] = useState(false);
  const [createPageSubmitting, setCreatePageSubmitting] = useState(false);

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
        {viewMode !== 'prd' && (
          <>
            <ButtonIcon icon={<LeftOutlined />} onClick={() => onNavigate('prev')} aria-label="上一个页面" />
            <ButtonIcon icon={<RightOutlined />} onClick={() => onNavigate('next')} aria-label="下一个页面" />
          </>
        )}
      </div>

      <div className="file-tree-project-name">
        <div className="file-tree-project-header">
          <div className="file-tree-project-heading">
            <h2 className="file-tree-project-title">{viewMode === 'prd' ? 'PRD 文档' : '页面'}</h2>
            <span className="file-tree-file-count">{currentIndex} / {totalFiles}</span>
          </div>
          {viewMode !== 'prd' && (
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
          )}
        </div>
      </div>

      <div className="file-tree-content custom-scrollbar">
        <div className="file-tree-list" role="tree">
          {viewMode === 'prd' ? (
            prdFiles && prdFiles.length === 0 ? (
              <div className="file-tree-empty">暂无 PRD 文档</div>
            ) : (
              (prdFiles || []).map((prd) => (
                <button
                  key={prd.fileName}
                  type="button"
                  className={`file-tree-item file ${selectedFile === prd.fileName ? 'selected' : ''}`}
                  style={{ paddingLeft: '12px' }}
                  onClick={() => onSelect(prd.fileName)}
                >
                  <span className="file-tree-item-icon">
                    <svg viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor">
                      <path d="M854.6 288.6L639.4 73.4c-6-6-14.1-9.4-22.6-9.4H192c-17.7 0-32 14.3-32 32v832c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V311.3c0-8.5-3.4-16.7-9.4-22.7zM790.2 326H602V137.8L790.2 326zm1.8 562H232V136h302v216a42 42 0 0042 42h216v494z" />
                    </svg>
                  </span>
                  <span className="file-tree-item-label">{prd.title || prd.fileName.replace(/\.md$/, '')}</span>
                  {prd.status && <span className="file-tree-item-tag">{prd.status}</span>}
                </button>
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
}: {
  node: PrototypeNode;
  depth: number;
  selectedFile: string | null;
  searchValue: string;
  expandedFolders: Record<string, boolean>;
  draggingPrototypePath: string | null;
  dropTargetPath: string | null;
  onToggleFolder: (path: string) => void;
  onSelect: (path: string | null) => void;
  onDeletePrototype: (path: string) => Promise<void> | void;
  onDuplicatePrototype: (path: string) => Promise<void> | void;
  onDeleteFolder: (path: string) => Promise<void> | void;
  onRenameNode: (path: string, name: string, type: 'file' | 'folder') => void;
  onDragStart: (path: string | null) => void;
  onDragEnd: () => void;
  onFolderDropActiveChange: (path: string | null) => void;
  onMovePrototype: (prototypePath: string, targetFolderPath: string) => Promise<void>;
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
                <Popconfirm
                  title="删除文件夹"
                  description="将删除该文件夹以及下面的所有页面和标记文件，确认继续？"
                  placement="rightTop"
                  overlayClassName="file-tree-popconfirm"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={(event) => {
                    event?.stopPropagation();
                    return onDeleteFolder(node.path);
                  }}
                >
                  <Tooltip title="删除文件夹" getPopupContainer={() => document.body}>
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
                <Tooltip title="重命名" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  className="file-tree-inline-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRenameNode(node.path, node.name, 'file');
                  }}
                />
                </Tooltip>
                <Tooltip title="复制页面" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  className="file-tree-inline-action file-tree-inline-copy"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onDuplicatePrototype(node.path);
                  }}
                />
                </Tooltip>
                <Popconfirm
                  title="删除页面"
                  description="将删除页面目录及页面下的标记文件，确认继续？"
                  placement="rightTop"
                  overlayClassName="file-tree-popconfirm"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={(event) => {
                    event?.stopPropagation();
                    return onDeletePrototype(node.path);
                  }}
                >
                  <Tooltip title="删除页面" getPopupContainer={() => document.body}>
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

function ButtonIcon({ icon, onClick, 'aria-label': ariaLabel }: { icon: React.ReactNode; onClick: () => void; 'aria-label'?: string }) {
  return (
    <Tooltip title={ariaLabel} getPopupContainer={() => document.body}>
      <button type="button" className="file-tree-nav-icon" onClick={onClick} aria-label={ariaLabel}>
        {icon}
      </button>
    </Tooltip>
  );
}

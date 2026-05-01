import { Tree, Input, Tooltip, Button, Popconfirm } from 'antd';
import { FileOutlined, FolderOutlined, SearchOutlined, LeftOutlined, RightOutlined, DeleteOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import type { DataNode } from 'antd/es/tree';
import './FileTree.css';

interface FileTreeProps {
  onSelect: (path: string | null) => void;
  selectedFile: string | null;
  onNavigate: (direction: 'prev' | 'next') => void;
  onDeletePrototype: (path: string) => Promise<void> | void;
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
  onDeletePrototype?: (path: string) => Promise<void> | void
): DataNode | null {
  const isFolder = node.type === 'folder';
  const matchesSearch = !searchValue || node.name.toLowerCase().includes(searchValue.toLowerCase());

  // 递归处理子节点
  const children = node.children
    ?.map(child => convertToTreeData(child, searchValue, onFolderClick))
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
          {isFile && onDeletePrototype && (
            <Popconfirm
              title="删除页面"
              description="将删除页面目录及页面下的标记文件，checkpoint 历史会保留，确认继续？"
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
        .map(node => convertToTreeData(node, searchValue, handleFolderClick, onDeletePrototype))
        .filter(Boolean) as DataNode[];
      setTreeData(filtered);
    }
  }, [searchValue, originalData, onDeletePrototype]);

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
      const response = await fetch('/api/config');
      const data = await response.json();
      setProjectName(data.projectName || 'PRDKit');
    } catch (error) {
      console.error('获取配置失败:', error);
    }
  };

  const fetchPrototypes = async () => {
    try {
      const response = await fetch('/api/prototypes');
      const data: PrototypeNode = await response.json();

      if (data.children) {
        setOriginalData(data.children);
        const treeNodes = data.children
          .map(node => convertToTreeData(node, '', handleFolderClick, onDeletePrototype))
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
    } else {
      onSelect(null);
    }
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
        <Tooltip title={projectName} placement="right">
          <h2 className="file-tree-project-title">
            {projectName}
          </h2>
        </Tooltip>
      </div>

      {/* 文件树 */}
      <div className="file-tree-content">
        <Tree
          showIcon
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys)}
          treeData={treeData}
          onSelect={handleSelect}
          selectedKeys={selectedFile ? [selectedFile] : []}
        />
      </div>

      <div className="file-tree-brand">
        <span className="file-tree-brand-label">Powered by</span>
        <img src="/logo.svg" alt="PRDKit Design" className="file-tree-brand-logo" />
      </div>
    </div>
  );
}

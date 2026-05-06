import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Tree, Typography, Radio, message } from 'antd';
import {
  FolderOpenOutlined,
  FileTextOutlined,
  FolderOutlined,
  SearchOutlined,
  SettingOutlined,
  LeftOutlined,
  RightOutlined,
  CloudUploadOutlined,
  FolderAddOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import './PublishDrawer.css';

const { Text } = Typography;

interface CloudConfig {
  serverUrl: string;
  projectId?: string;
  isLoggedIn: boolean;
}

interface PublishDrawerProps {
  open: boolean;
  loading: boolean;
  submitting: boolean;
  projectName: string;
  currentFile: string | null;
  fileList: string[];
  defaultOutputPath: string;
  cloudConfig?: CloudConfig;
  onClose: () => void;
  onPickOutputDirectory: (currentOutputPath: string) => Promise<string | null>;
  onSubmit: (payload: { outputPath: string; entryFiles: string[]; openAfterPublish: boolean }) => Promise<void>;
  onPublishToCloud?: (payload: { message: string; entryFiles: string[] }) => Promise<void>;
}

interface TreeNode extends DataNode {
  key: string;
  children?: TreeNode[];
  isLeaf?: boolean;
}

export default function PublishDrawer({
  open,
  loading,
  submitting,
  projectName,
  currentFile,
  fileList,
  defaultOutputPath,
  cloudConfig,
  onClose,
  onPickOutputDirectory,
  onSubmit,
  onPublishToCloud,
}: PublishDrawerProps) {
  const [outputPath, setOutputPath] = useState(defaultOutputPath);
  const [selectedFiles, setSelectedFiles] = useState<string[]>(fileList);
  const [searchValue, setSearchValue] = useState('');
  const [pickingDirectory, setPickingDirectory] = useState(false);
  const [openAfterPublish, setOpenAfterPublish] = useState(true);
  const [pagePanelOpen, setPagePanelOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<'local' | 'cloud'>('local');
  const [versionMessage, setVersionMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setOutputPath(defaultOutputPath);
    setSelectedFiles(fileList);
    setSearchValue('');
    setOpenAfterPublish(true);
    setPagePanelOpen(false);
    setPublishMode('local');
    setVersionMessage('');
  }, [open, defaultOutputPath, fileList]);

  const fileSet = useMemo(() => new Set(fileList), [fileList]);
  const selectedCount = selectedFiles.length;
  const publishLabel = truncateProjectName(projectName);

  const treeData = useMemo(() => {
    const root = createTreeFromPaths(fileList);
    return filterTree(root, searchValue);
  }, [fileList, searchValue]);

  const handleSubmit = async () => {
    const normalizedFiles = fileList.filter((file) => selectedFiles.includes(file));

    if (publishMode === 'cloud') {
      if (!cloudConfig?.isLoggedIn) {
        message.error('请先登录云端服务器');
        return;
      }

      if (!onPublishToCloud) {
        message.error('云端发布功能不可用');
        return;
      }

      try {
        await onPublishToCloud({
          message: versionMessage,
          entryFiles: normalizedFiles,
        });
        message.success('发布成功');
        onClose();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '发布失败');
      }
    } else {
      await onSubmit({
        outputPath: outputPath.trim(),
        entryFiles: normalizedFiles,
        openAfterPublish,
      });
    }
  };

  const handlePickDirectory = async () => {
    setPickingDirectory(true);
    try {
      const nextOutputPath = await onPickOutputDirectory(outputPath.trim());
      if (nextOutputPath) {
        setOutputPath(nextOutputPath);
      }
    } finally {
      setPickingDirectory(false);
    }
  };

  const handleTreeCheck = (checkedKeysValue: React.Key[] | { checked: React.Key[]; halfChecked: React.Key[] }) => {
    const nextCheckedKeys = Array.isArray(checkedKeysValue) ? checkedKeysValue : checkedKeysValue.checked;
    setSelectedFiles(nextCheckedKeys.filter((key): key is string => typeof key === 'string' && fileSet.has(key)));
  };

  return (
    <Modal
      title="发布项目"
      open={open}
      onCancel={onClose}
      footer={null}
      width={pagePanelOpen ? 900 : 340}
      destroyOnClose={false}
      centered
      className="publish-dialog"
    >
      <div className={`publish-dialog-layout ${pagePanelOpen ? 'with-page-panel' : ''}`}>
        <div className="publish-dialog-main">
          <div className="publish-dialog-section publish-dialog-mode-row">
            <div className="publish-dialog-summary-text">
              发布"{publishLabel}"到{publishMode === 'cloud' ? '云端' : '本地目录'}
            </div>
            <Button
              type="default"
              ghost
              className="publish-dialog-toggle-button"
              onClick={() => setPagePanelOpen((prev) => !prev)}
            >
              <SettingOutlined />
              {pagePanelOpen ? <RightOutlined /> : <LeftOutlined />}
            </Button>
          </div>

          <div className="publish-dialog-section">
            <Text strong className="publish-dialog-label">发布模式</Text>
            <Radio.Group
              value={publishMode}
              onChange={(e) => setPublishMode(e.target.value)}
              style={{ width: '100%', marginTop: 8 }}
            >
              <Radio.Button value="local" style={{ width: '50%', textAlign: 'center' }}>
                <FolderAddOutlined /> 本地
              </Radio.Button>
              <Radio.Button
                value="cloud"
                style={{ width: '50%', textAlign: 'center' }}
                disabled={!cloudConfig}
              >
                <CloudUploadOutlined /> 云端
              </Radio.Button>
            </Radio.Group>
            {publishMode === 'cloud' && !cloudConfig?.isLoggedIn && (
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                请先运行 prdkit cloud login 登录
              </Text>
            )}
          </div>

          <div className="publish-dialog-content">
            {publishMode === 'cloud' ? (
              <div className="publish-dialog-section">
                <Text strong className="publish-dialog-label">版本说明</Text>
                <Input.TextArea
                  value={versionMessage}
                  onChange={(e) => setVersionMessage(e.target.value)}
                  placeholder="描述本次更新的内容（可选）"
                  rows={3}
                  style={{ marginTop: 8 }}
                />
              </div>
            ) : (
              <div className="publish-dialog-section">
                <Text strong className="publish-dialog-label">输出路径</Text>
                <div className="publish-dialog-path-row">
                  <Input
                    value={outputPath}
                    onChange={(event) => setOutputPath(event.target.value)}
                    placeholder="请输入输出路径"
                    className="publish-dialog-path-input"
                  />
                  <Button
                    icon={<FolderOpenOutlined />}
                    onClick={handlePickDirectory}
                    loading={pickingDirectory}
                    className="publish-dialog-folder-button"
                  />
                </div>
                <button
                  type="button"
                  className="publish-dialog-default-link"
                  onClick={() => setOutputPath(defaultOutputPath)}
                >
                  使用默认
                </button>
              </div>
            )}
          </div>

          <div className="publish-dialog-footer">
            {publishMode === 'local' && (
              <Checkbox
                checked={openAfterPublish}
                onChange={(event) => setOpenAfterPublish(event.target.checked)}
                className="publish-dialog-open-checkbox"
              >
                发布之后打开输出目录
              </Checkbox>
            )}

            <Button
              type="primary"
              size="large"
              block
              loading={submitting}
              disabled={
                loading ||
                selectedCount === 0 ||
                (publishMode === 'local' && !outputPath.trim()) ||
                (publishMode === 'cloud' && !cloudConfig?.isLoggedIn)
              }
              onClick={handleSubmit}
              className="publish-dialog-submit"
            >
              {publishMode === 'cloud' ? '发布到云端' : '发布到本地'}
            </Button>
          </div>
        </div>

        {pagePanelOpen && (
          <div className="publish-dialog-page-panel">
            <div className="publish-dialog-page-panel-header">
              <div className="publish-dialog-page-panel-subtitle">按目录结构勾选需要导出的页面</div>
              <div className="publish-dialog-page-panel-count">{selectedCount} / {fileList.length}</div>
            </div>

            <div className="publish-dialog-page-panel-actions">
              <Button size="small" onClick={() => setSelectedFiles(fileList)} disabled={loading || fileList.length === 0}>
                全部页面
              </Button>
              <Button
                size="small"
                onClick={() => currentFile && setSelectedFiles([currentFile])}
                disabled={loading || !currentFile}
              >
                仅当前页
              </Button>
              <Button size="small" onClick={() => setSelectedFiles([])} disabled={loading || selectedCount === 0}>
                清空选择
              </Button>
            </div>

            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              prefix={<SearchOutlined />}
              placeholder="搜索页面路径"
              allowClear
              className="publish-dialog-search"
            />

            <div className="publish-dialog-tree-shell">
              {treeData.length === 0 ? (
                <div className="publish-dialog-empty">没有匹配的页面</div>
              ) : (
                <Tree
                  checkable
                  selectable={false}
                  checkedKeys={selectedFiles}
                  onCheck={handleTreeCheck}
                  treeData={treeData}
                  className="publish-dialog-tree"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function truncateProjectName(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 18)}...`;
}

function createTreeFromPaths(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const fullPath of paths) {
    const segments = fullPath.split('/').filter(Boolean);
    let currentNodes = root;
    let accumulatedPath = '';

    segments.forEach((segment, index) => {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;

      let node = currentNodes.find((item) => item.key === accumulatedPath);
      if (!node) {
        node = {
          key: accumulatedPath,
          title: segment,
          icon: isLeaf ? <FileTextOutlined /> : <FolderOutlined />,
          isLeaf,
          children: isLeaf ? undefined : [],
        };
        currentNodes.push(node);
      }

      if (!isLeaf) {
        if (!node.children) {
          node.children = [];
        }
        currentNodes = node.children as TreeNode[];
      }
    });
  }

  return root;
}

function filterTree(nodes: TreeNode[], keyword: string): TreeNode[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return nodes;

  const filteredNodes: TreeNode[] = [];

  for (const node of nodes) {
    const children = node.children ? filterTree(node.children as TreeNode[], keyword) : undefined;
    const selfMatches = String(node.title).toLowerCase().includes(normalizedKeyword);

    if (selfMatches || (children && children.length > 0)) {
      filteredNodes.push({
        ...node,
        children,
      });
    }
  }

  return filteredNodes;
}

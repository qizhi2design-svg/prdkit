import { useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Button, Checkbox, Input, Modal, Typography, Popover, Spin, Select, Result, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
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
  MoreOutlined,
  PlusOutlined,
  LoginOutlined,
} from '@ant-design/icons';
import './PublishDrawer.css';

const { Text } = Typography;

interface CloudConfig {
  host: string;
  projectId?: string;
  projectName?: string;
  projectSlug?: string;
  authStatus: 'loggedOut' | 'expired' | 'active';
}

interface CloudProjectSummary {
  id: string;
  name: string;
  slug: string;
}

interface PublishDrawerProps {
  open: boolean;
  loading: boolean;
  submitting: boolean;
  target: 'prototype' | 'prd';
  projectName: string;
  currentFile: string | null;
  fileList: string[];
  defaultOutputPath: string;
  cloudConfig?: CloudConfig;
  onClose: () => void;
  onPickOutputDirectory: (currentOutputPath: string) => Promise<string | null>;
  onSubmit: (payload: { target: 'prototype' | 'prd'; outputPath: string; entryFiles: string[]; openAfterPublish: boolean }) => Promise<void>;
  onPublishToCloud?: (payload: { target: 'prototype' | 'prd'; projectId: string; message: string; entryFiles: string[] }) => Promise<void>;
  onRefreshConfig?: () => Promise<void>;
}

interface TreeNode extends DataNode {
  key: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  children?: TreeNode[];
  isLeaf?: boolean;
}

async function parseApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return {
    error: text || `请求失败 (${response.status})`,
    message: text || `请求失败 (${response.status})`,
  };
}

function normalizeCloudProjects(raw: unknown): CloudProjectSummary[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      name: typeof item.name === 'string' ? item.name : '',
      slug: typeof item.slug === 'string' ? item.slug : '',
    }))
    .filter((item) => item.id && item.name);
}

export default function PublishDrawer({
  open,
  loading,
  submitting,
  target,
  currentFile,
  fileList,
  defaultOutputPath,
  cloudConfig,
  onClose,
  onPickOutputDirectory,
  onSubmit,
  onPublishToCloud,
  onRefreshConfig,
}: PublishDrawerProps) {
  const { message } = AntdApp.useApp();
  const [outputPath, setOutputPath] = useState(defaultOutputPath);
  const [selectedFiles, setSelectedFiles] = useState<string[]>(fileList);
  const [searchValue, setSearchValue] = useState('');
  const [pickingDirectory, setPickingDirectory] = useState(false);
  const [openAfterPublish, setOpenAfterPublish] = useState(true);
  const [pagePanelOpen, setPagePanelOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<'local' | 'cloud'>('local');
  const [versionMessage, setVersionMessage] = useState('');
  const [cloudProjects, setCloudProjects] = useState<CloudProjectSummary[]>([]);
  const [cloudProjectLoading, setCloudProjectLoading] = useState(false);
  const [cloudSubmitting, setCloudSubmitting] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearchValue, setProjectSearchValue] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(cloudConfig?.projectId);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOutputPath(defaultOutputPath);
    setSelectedFiles(fileList);
    setSearchValue('');
    setOpenAfterPublish(true);
    setPagePanelOpen(false);
    setPublishMode('local');
    setVersionMessage('');
    setProjectSearchValue('');
    setProjectPickerOpen(false);
    setNewProjectName('');
    setSelectedProjectId(cloudConfig?.projectId);
  }, [open, defaultOutputPath, fileList, cloudConfig?.projectId, target]);

  useEffect(() => {
    if (!open || publishMode !== 'cloud' || cloudConfig?.authStatus !== 'active') {
      return;
    }
    void loadCloudProjects();
  }, [open, publishMode, cloudConfig?.authStatus]);

  const fileSet = useMemo(() => new Set(fileList), [fileList]);
  const selectedCount = selectedFiles.length;
  const selectedProject = useMemo(
    () => cloudProjects.find((project) => project.id === selectedProjectId)
      || cloudProjects.find((project) => project.id === cloudConfig?.projectId),
    [cloudProjects, selectedProjectId, cloudConfig?.projectId]
  );

  const treeData = useMemo(() => {
    const root = createTreeFromPaths(fileList);
    return filterTree(root, searchValue);
  }, [fileList, searchValue]);

  const filteredProjects = useMemo(() => {
    const keyword = projectSearchValue.trim().toLowerCase();
    return keyword
      ? cloudProjects.filter((project) =>
        [project.name, project.slug].some((value) => value.toLowerCase().includes(keyword))
      )
      : cloudProjects;
  }, [cloudProjects, projectSearchValue]);

  const loadCloudProjects = async () => {
    setCloudProjectLoading(true);
    try {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(data.message || data.error || '读取云端项目失败');
      }

      const projects = normalizeCloudProjects(data.projects);
      setCloudProjects(projects);
      setSelectedProjectId((current) => {
        const preferredId = current || cloudConfig?.projectId;
        if (preferredId && projects.some((project) => project.id === preferredId)) {
          return preferredId;
        }
        return projects[0]?.id;
      });
    } catch (error) {
      console.error('读取云端项目失败:', error);
      message.error(error instanceof Error ? error.message : '读取云端项目失败');
    } finally {
      setCloudProjectLoading(false);
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) {
      message.error('请输入项目名称');
      return;
    }

    setCreatingProject(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(data.message || data.error || '创建项目失败');
      }

      const project = normalizeCloudProjects([data.project])[0];
      if (!project) {
        throw new Error('创建项目失败');
      }
      setCloudProjects((prev) => [project, ...prev.filter((item) => item.id !== project.id)]);
      setSelectedProjectId(project.id);
      setNewProjectName('');
      setProjectPickerOpen(false);
      message.success(data.created === false ? `项目已存在，已选中：${project.name}` : `已创建项目：${project.name}`);
    } catch (error) {
      console.error('创建项目失败:', error);
      message.error(error instanceof Error ? error.message : '创建项目失败');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleLogin = async () => {
    setLoggingIn(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        if (data.message?.includes('Unsupported method')) {
          throw new Error('API 服务未启动或端口不匹配，请先执行 prdkit serve');
        }
        throw new Error(data.message || data.error || '登录失败');
      }
      if (onRefreshConfig) {
        await onRefreshConfig();
      }

      await loadCloudProjects();
      setPublishMode('cloud');
      message.success(data.message || '登录成功');
    } catch (error) {
      console.error('登录失败:', error);
      message.error(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSubmit = async () => {
    const normalizedFiles = fileList.filter((file) => selectedFiles.includes(file));

    if (publishMode === 'cloud') {
      if (cloudConfig?.authStatus !== 'active') {
        message.error(cloudConfig?.authStatus === 'expired' ? '登录状态已过期，请重新登录' : '请先登录云端服务器');
        return;
      }

      if (!onPublishToCloud) {
        message.error('云端发布功能不可用');
        return;
      }

      if (!selectedProjectId) {
        message.error('请先选择云端项目');
        return;
      }

      if (!cloudProjects.some((project) => project.id === selectedProjectId)) {
        message.error('当前云端项目不可用，请重新选择');
        await loadCloudProjects();
        return;
      }

      setCloudSubmitting(true);
      try {
        await onPublishToCloud({
          target,
          projectId: selectedProjectId,
          message: versionMessage,
          entryFiles: normalizedFiles,
        });
        message.success('发布成功');
        onClose();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '发布失败');
      } finally {
        setCloudSubmitting(false);
      }
    } else {
      await onSubmit({
        target,
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
      title={target === 'prd' ? '发布 PRD' : '发布项目'}
      open={open}
      onCancel={onClose}
      footer={null}
      width={pagePanelOpen ? 900 : 340}
      destroyOnHidden={false}
      centered
      className="publish-dialog"
    >
      <div className={`publish-dialog-layout ${pagePanelOpen ? 'with-page-panel' : ''}`}>
        <div className="publish-dialog-main">
          <div className="publish-dialog-section publish-dialog-mode-row">
            <Select
              value={publishMode}
              onChange={(value) => setPublishMode(value)}
              className="publish-dialog-mode-select"
              size="large"
              bordered={false}
              disabled={!cloudConfig && publishMode === 'local'}
              options={[
                {
                  value: 'cloud',
                  label: (
                    <span>
                      <CloudUploadOutlined /> 发布到云端
                    </span>
                  ),
                  disabled: !cloudConfig,
                },
                {
                  value: 'local',
                  label: (
                    <span>
                      <FolderAddOutlined /> 发布到本地
                    </span>
                  ),
                },
              ]}
            />
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

          <div className="publish-dialog-content">
            {publishMode === 'cloud' ? (
              <>
                {cloudConfig?.authStatus !== 'active' ? (
                  <Result
                    status="warning"
                    title={cloudConfig?.authStatus === 'expired' ? '登录已过期' : '尚未登录'}
                    subTitle={
                      cloudConfig?.authStatus === 'expired'
                        ? '您的登录状态已过期，请重新登录以继续使用云端发布功能'
                        : '请先登录云端服务器以使用发布功能'
                    }
                    extra={
                      <Button
                        type="primary"
                        icon={<LoginOutlined />}
                        loading={loggingIn}
                        onClick={() => void handleLogin()}
                      >
                        立即登录
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <div className="publish-dialog-section">
                      <Text strong className="publish-dialog-label">项目名称</Text>
                      <div className="publish-dialog-cloud-target">
                        <div className="publish-dialog-cloud-target-main">
                          <div className="publish-dialog-cloud-target-name">
                            {selectedProject?.name || cloudConfig?.projectName || '选择云端项目'}
                          </div>
                          <div className="publish-dialog-cloud-target-meta">
                            {selectedProject?.slug || cloudConfig?.projectSlug || '通过右侧按钮选择或创建项目'}
                          </div>
                        </div>
                        <Popover
                          trigger="click"
                          placement="bottomRight"
                          open={projectPickerOpen}
                          onOpenChange={setProjectPickerOpen}
                          content={(
                            <div className="publish-dialog-project-popover">
                              <Input
                                value={projectSearchValue}
                                onChange={(event) => setProjectSearchValue(event.target.value)}
                                prefix={<SearchOutlined />}
                                placeholder="搜索项目..."
                                allowClear
                              />
                              <div className="publish-dialog-project-list-shell">
                                {cloudProjectLoading ? (
                                  <div className="publish-dialog-project-loading"><Spin size="small" /></div>
                                ) : (
                                  <div className="publish-dialog-project-list">
                                    {filteredProjects.map((project) => (
                                      <div
                                        key={project.id}
                                        className={`publish-dialog-project-item ${selectedProjectId === project.id ? 'selected' : ''}`}
                                        onClick={() => {
                                          setSelectedProjectId(project.id);
                                          setProjectPickerOpen(false);
                                        }}
                                      >
                                        <FolderOpenOutlined className="publish-dialog-project-icon" />
                                        <div className="publish-dialog-project-name">{project.name}</div>
                                      </div>
                                    ))}
                                    {filteredProjects.length === 0 && (
                                      <div className="publish-dialog-project-empty">未找到匹配的项目</div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="publish-dialog-project-create">
                                <Input
                                  value={newProjectName}
                                  onChange={(event) => setNewProjectName(event.target.value)}
                                  placeholder="输入新项目名称"
                                  onPressEnter={() => {
                                    void handleCreateProject();
                                  }}
                                />
                                <Button icon={<PlusOutlined />} loading={creatingProject} onClick={() => void handleCreateProject()}>
                                  新建
                                </Button>
                              </div>
                            </div>
                          )}
                        >
                          <Button className="publish-dialog-cloud-picker-button" icon={<MoreOutlined />} />
                        </Popover>
                      </div>
                    </div>

                    <div className="publish-dialog-section">
                      <Text strong className="publish-dialog-label">更新说明</Text>
                      <Input.TextArea
                        value={versionMessage}
                        onChange={(e) => setVersionMessage(e.target.value)}
                        placeholder="描述本次更新的内容（可选）"
                        rows={5}
                        className="publish-dialog-version-textarea"
                      />
                    </div>
                  </>
                )}
              </>
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
              loading={publishMode === 'cloud' ? cloudSubmitting : submitting}
              disabled={
                loading ||
                selectedCount === 0 ||
                (publishMode === 'local' && !outputPath.trim()) ||
                (publishMode === 'cloud' && (cloudConfig?.authStatus !== 'active' || !selectedProjectId))
              }
              onClick={handleSubmit}
              className="publish-dialog-submit"
            >
              {publishMode === 'cloud'
                ? (target === 'prd' ? '发布 PRD 到云端' : '发布到云端')
                : (target === 'prd' ? '发布 PRD 到本地' : '发布到本地')}
            </Button>
          </div>
        </div>

        {pagePanelOpen && (
          <div className="publish-dialog-page-panel">
            <div className="publish-dialog-page-panel-header">
              <div className="publish-dialog-page-panel-subtitle">
                {target === 'prd' ? '按列表勾选需要发布的 PRD 文档' : '按目录结构勾选需要导出的页面'}
              </div>
              <div className="publish-dialog-page-panel-count">{selectedCount} / {fileList.length}</div>
            </div>

            <div className="publish-dialog-page-panel-actions">
              <Button size="small" onClick={() => setSelectedFiles(fileList)} disabled={loading || fileList.length === 0}>
                {target === 'prd' ? '全部文档' : '全部页面'}
              </Button>
              <Button
                size="small"
                onClick={() => currentFile && setSelectedFiles([currentFile])}
                disabled={loading || !currentFile}
              >
                {target === 'prd' ? '仅当前文档' : '仅当前页'}
              </Button>
              <Button size="small" onClick={() => setSelectedFiles([])} disabled={loading || selectedCount === 0}>
                清空选择
              </Button>
            </div>

            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              prefix={<SearchOutlined />}
              placeholder={target === 'prd' ? '搜索文档名称' : '搜索页面路径'}
              allowClear
              className="publish-dialog-search"
            />

            <div className="publish-dialog-tree-shell">
              {treeData.length === 0 ? (
                <div className="publish-dialog-empty">{target === 'prd' ? '没有匹配的文档' : '没有匹配的页面'}</div>
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

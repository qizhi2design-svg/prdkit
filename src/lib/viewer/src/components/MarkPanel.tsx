import { useState, useEffect } from 'react';
import { Button, Input, List, Empty, Avatar, Typography, message, Popconfirm } from 'antd';
import { DeleteOutlined, EditOutlined, ArrowLeftOutlined, UpOutlined, DownOutlined, DoubleRightOutlined, DoubleLeftOutlined, SearchOutlined, CopyOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { copySkillClipboardText } from '../utils/clipboard';
import type { Mark, PendingMarkInfo, ViewerSkillConfig } from '../types';
import DomPathBreadcrumb from './DomPathBreadcrumb';
import './MarkPanel.css';

const { TextArea } = Input;
const { Text } = Typography;

type ViewMode = 'list' | 'create' | 'detail';

interface MarkPanelProps {
  marks: Mark[];
  selectedMarkId: string | null;
  pendingMarkInfo: PendingMarkInfo | null;
  viewerSkills: ViewerSkillConfig;
  onMarkSelect: (markId: string) => void;
  onMarkCreate: (title: string, description: string) => void;
  onMarkUpdate: (markId: string, title: string, description: string) => void;
  onMarkDelete: (markId: string) => void;
  onMarkCancel: () => void;
  onRefresh: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  projectName?: string;
  filePath?: string | null;
  prototypesDir?: string;
}

export default function MarkPanel({
  marks,
  selectedMarkId,
  pendingMarkInfo,
  viewerSkills,
  onMarkSelect,
  onMarkCreate,
  onMarkUpdate,
  onMarkDelete,
  onMarkCancel,
  collapsed = false,
  onCollapsedChange,
  projectName = '',
  filePath = null,
  prototypesDir = '',
}: MarkPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [newMarkTitle, setNewMarkTitle] = useState('');
  const [newMarkDescription, setNewMarkDescription] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 复制 DOM 信息
  const copyDomInfo = async () => {
    let domPath = '';
    let markFilePath = '';

    if (pendingMarkInfo) {
      domPath = pendingMarkInfo.domPath || pendingMarkInfo.selector || '';
    } else if (selectedMarkId) {
      const mark = marks.find(m => m.id === selectedMarkId);
      if (mark) {
        domPath = mark.domPath || mark.selector || '';

        // 构建标记文件的绝对路径
        if (filePath && prototypesDir) {
          markFilePath = `${prototypesDir}/${filePath}/marks/${selectedMarkId}.md`;
        }
      }
    }

    const absolutePath = filePath && prototypesDir
      ? `${prototypesDir}/${filePath}`
      : filePath || '';

    let info = `项目名: ${projectName}
文件路径: ${absolutePath}
DOM 路径: ${domPath}`;

    if (markFilePath) {
      info += `\n标记文件: ${markFilePath}`;
    }

    const isCreateMode = viewMode === 'create';
    const skillCommand = isCreateMode
      ? viewerSkills.markCreateSkillCommand
      : viewerSkills.markUpdateSkillCommand;
    const successPrefix = isCreateMode
      ? '已复制新增标记 skill 指令'
      : '已复制修改标记 skill 指令';

    try {
      await copySkillClipboardText(
        {
          skillCommand,
          payload: info,
        },
        {
          successPrefix,
          terminalGuide: viewerSkills.copyTerminalGuide,
        }
      );
    } catch (err) {
      console.error('复制失败:', err);
      message.error('复制失败');
    }
  };

  // 计算当前视图模式
  const viewMode: ViewMode = pendingMarkInfo
    ? 'create'
    : selectedMarkId
    ? 'detail'
    : 'list';

  const selectedMark = marks.find(m => m.id === selectedMarkId);

  // 当进入创建视图时，自动生成标题
  useEffect(() => {
    if (pendingMarkInfo) {
      // 找到当前最大的"标记N"编号
      const markNumbers = marks
        .map(m => {
          const match = m.title?.match(/^标记(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);

      const maxNumber = markNumbers.length > 0 ? Math.max(...markNumbers) : 0;
      setNewMarkTitle(`标记${maxNumber + 1}`);
    } else {
      // 离开创建视图时清空标题
      setNewMarkTitle('');
    }
  }, [pendingMarkInfo, marks]);

  // ESC 键监听：退出编辑模式
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEditing) {
        e.preventDefault();
        e.stopImmediatePropagation(); // 阻止其他监听器
        handleCancelEdit();
      }
    };

    // 使用 capture 阶段，优先处理
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isEditing]);

  // Delete 键监听：在详情和编辑视图下删除标记
  useEffect(() => {
    if (viewMode !== 'detail') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 检查焦点是否在输入框中
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused) {
        e.preventDefault();
        handleDeleteMark();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewMode, selectedMarkId]);

  // Ctrl/Cmd+C 键监听：复制 DOM 信息
  useEffect(() => {
    if (viewMode === 'list') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // 只在非输入框焦点时触发
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !isInputFocused) {
        e.preventDefault();
        e.stopImmediatePropagation();
        copyDomInfo();
      }
    };

    // 使用 capture 阶段，优先处理
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [viewMode, pendingMarkInfo, selectedMarkId, projectName, filePath, prototypesDir, marks, viewerSkills]);

  const handleBackToList = () => {
    if (viewMode === 'create') {
      setNewMarkTitle('');
      setNewMarkDescription('');
      onMarkCancel();
    } else if (viewMode === 'detail') {
      setIsEditing(false);
      setEditTitle('');
      setEditContent('');
      onMarkSelect('');
    }
  };

  const handleStartEdit = () => {
    if (selectedMark) {
      setIsEditing(true);
      setEditTitle(selectedMark.title);
      setEditContent(selectedMark.description);
    }
  };

  const handleSaveEdit = () => {
    if (selectedMarkId && editContent.trim()) {
      // 如果标题为空，使用原标题
      const finalTitle = editTitle.trim() || selectedMark?.title || '标记';
      onMarkUpdate(selectedMarkId, finalTitle, editContent);
      setIsEditing(false);
      setEditTitle('');
      setEditContent('');
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle('');
    setEditContent('');
  };

  const handleCreateMark = () => {
    if (!pendingMarkInfo || !newMarkDescription.trim()) {
      return;
    }

    // 如果没有输入标题，自动生成"标记N"
    let finalTitle = newMarkTitle.trim();
    if (!finalTitle) {
      // 找到当前最大的"标记N"编号
      const markNumbers = marks
        .map(m => {
          const match = m.title.match(/^标记(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);

      const maxNumber = markNumbers.length > 0 ? Math.max(...markNumbers) : 0;
      finalTitle = `标记${maxNumber + 1}`;
    }

    onMarkCreate(finalTitle, newMarkDescription);
    setNewMarkTitle('');
    setNewMarkDescription('');
  };

  const handleDeleteMark = () => {
    if (selectedMarkId) {
      onMarkDelete(selectedMarkId);
      handleBackToList();
    }
  };

  const renderAiFooterButton = () => (
    <Button
      type="primary"
      size="small"
      icon={<CopyOutlined />}
      onClick={copyDomInfo}
      title="复制给 AI (Ctrl/Cmd+C)"
      className="mark-ai-footer-button"
    >
      复制给 AI
    </Button>
  );

  // 导航到上一个/下一个标记
  const handleNavigateMark = (direction: 'prev' | 'next') => {
    if (marks.length === 0 || !selectedMarkId) return;

    const currentIndex = marks.findIndex(m => m.id === selectedMarkId);
    if (currentIndex === -1) return;

    let newIndex: number;
    if (direction === 'prev') {
      newIndex = currentIndex === 0 ? marks.length - 1 : currentIndex - 1;
    } else {
      newIndex = currentIndex === marks.length - 1 ? 0 : currentIndex + 1;
    }

    onMarkSelect(marks[newIndex].id);
  };

  // 列表视图
  const renderListView = () => {
    const filteredMarks = marks.filter(mark =>
      mark.title.toLowerCase().includes(searchKeyword.toLowerCase())
    );

    return (
      <>
        <div className="mark-panel-header">
          <h3>标记列表</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="mark-panel-count">{marks.length} 个标记</span>
            <Button
              type="text"
              size="small"
              icon={<DoubleLeftOutlined />}
              onClick={() => onCollapsedChange?.(true)}
              title="折叠面板"
            />
          </div>
        </div>
        <div style={{ padding: '8px 16px' }}>
          <Input
            placeholder="搜索标记标题..."
            prefix={<SearchOutlined />}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            allowClear
          />
        </div>
        <div className="mark-panel-content">
          {filteredMarks.length === 0 ? (
            <Empty
              description={searchKeyword ? "未找到匹配的标记" : "暂无标记"}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <List
              dataSource={filteredMarks}
              renderItem={(mark) => (
                <List.Item
                  key={mark.id}
                  className="mark-list-item"
                  onClick={() => onMarkSelect(mark.id)}
                  actions={[
                    <Popconfirm
                      key="delete"
                      title="删除标记"
                      description="将删除当前标记文件，确认继续？"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        onMarkDelete(mark.id);
                      }}
                    >
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        className="mark-list-delete-button"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      />
                    </Popconfirm>
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar size="small">
                        {marks.indexOf(mark) + 1}
                      </Avatar>
                    }
                    title={
                      <Text ellipsis={{ tooltip: mark.title }}>
                        {mark.title}
                      </Text>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </div>
      </>
    );
  };

  // 创建视图
  const renderCreateView = () => (
    <>
      <div className="mark-panel-header">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={handleBackToList}
        >
          创建新标记
        </Button>
      </div>
      <div className="mark-panel-view">
        <DomPathBreadcrumb domPath={pendingMarkInfo?.domPath || pendingMarkInfo?.selector || ''} />
        <div className="mark-panel-editor">
          <div className="mark-editor-card">
            <div className="mark-create-header">
              <Input
                value={newMarkTitle}
                onChange={(e) => setNewMarkTitle(e.target.value)}
                placeholder="例如：登录按钮、用户头像等"
                variant="borderless"
              />
              <div className="mark-create-header-actions">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={handleBackToList}
                  title="取消"
                  className="mark-ghost-icon-button"
                />
                <Button
                  type="text"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={handleCreateMark}
                  disabled={!newMarkDescription.trim()}
                  title="创建标记"
                  className="mark-ghost-icon-button mark-ghost-icon-button-primary"
                />
              </div>
            </div>
            <div className="mark-editor-divider" />
            <TextArea
              value={newMarkDescription}
              onChange={(e) => setNewMarkDescription(e.target.value)}
              placeholder="输入标记描述..."
              variant="borderless"
              autoFocus
            />
          </div>
        </div>
        <div className="mark-panel-actions">
          <div className="mark-panel-actions-leading">
            {renderAiFooterButton()}
          </div>
        </div>
      </div>
    </>
  );

  // 详情视图
  const renderDetailView = () => {
    if (!selectedMark) return null;

    // 处理描述内容，去掉开头与标题重复的部分或 h1 标题
    const processDescription = (description: string, title: string): string => {
      if (!description) return description;

      const lines = description.split('\n');
      if (lines.length === 0) return description;

      // 检查第一行
      const firstLine = lines[0].trim();

      // 情况1：第一行是 Markdown h1 格式（# 开头），直接去掉
      if (firstLine.startsWith('#')) {
        let startIndex = 1;
        // 跳过紧随其后的空行
        while (startIndex < lines.length && lines[startIndex].trim() === '') {
          startIndex++;
        }
        return lines.slice(startIndex).join('\n');
      }

      // 情况2：第一行纯文本与标题相同，去掉
      if (firstLine === title.trim()) {
        let startIndex = 1;
        // 跳过紧随其后的空行
        while (startIndex < lines.length && lines[startIndex].trim() === '') {
          startIndex++;
        }
        return lines.slice(startIndex).join('\n');
      }

      return description;
    };

    const displayDescription = processDescription(selectedMark.description, selectedMark.title);

    return (
      <>
        <div className="mark-panel-header">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={handleBackToList}
          >
            标记详情
          </Button>
          <div className="mark-navigation">
            <Button
              type="text"
              size="small"
              icon={<UpOutlined />}
              onClick={() => handleNavigateMark('prev')}
              disabled={marks.length <= 1}
              title="上一个标记"
            />
            <Button
              type="text"
              size="small"
              icon={<DownOutlined />}
              onClick={() => handleNavigateMark('next')}
              disabled={marks.length <= 1}
              title="下一个标记"
            />
          </div>
        </div>
        <div className="mark-panel-view">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <DomPathBreadcrumb domPath={selectedMark.domPath || selectedMark.selector} />
            </div>
          </div>
          <div className="mark-panel-editor">
            {isEditing ? (
              <div className="mark-editor-card">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="输入标记标题..."
                  variant="borderless"
                />
                <div className="mark-editor-divider" />
                <TextArea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="输入 Markdown 描述..."
                  variant="borderless"
                  autoFocus
                />
              </div>
            ) : (
              <div className="mark-editor-card">
                <div className="mark-detail-header">
                  <div className="mark-detail-title">{selectedMark.title}</div>
                  <div className="mark-detail-header-actions">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={handleStartEdit}
                      title="编辑"
                      className="mark-detail-icon-button"
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleDeleteMark}
                      title="删除"
                      className="mark-detail-icon-button"
                    />
                  </div>
                </div>
                <div className="mark-editor-divider" />
                <div className="mark-preview-content">
                  {displayDescription ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayDescription}</ReactMarkdown>
                  ) : (
                    <span className="mark-item-empty">暂无描述</span>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="mark-panel-actions">
            {!isEditing ? (
              <div className="mark-panel-actions-leading">
                {renderAiFooterButton()}
              </div>
            ) : null}
            <div className="mark-panel-actions-trailing">
              {isEditing ? (
                <>
                  <Button onClick={handleCancelEdit} style={{ padding: '4px 16px' }}>
                    取消
                  </Button>
                  <Button
                    type="primary"
                    onClick={handleSaveEdit}
                    disabled={!editContent.trim()}
                    style={{ padding: '4px 16px' }}
                  >
                    保存
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className={`mark-panel ${collapsed ? 'collapsed' : ''}`}>
      {collapsed ? (
        <div className="mark-panel-collapsed-trigger" onClick={() => onCollapsedChange?.(false)}>
          <DoubleRightOutlined />
          <span>标记</span>
        </div>
      ) : (
        <>
          {viewMode === 'list' && renderListView()}
          {viewMode === 'create' && renderCreateView()}
          {viewMode === 'detail' && renderDetailView()}
        </>
      )}
    </div>
  );
}

import { MenuFoldOutlined, MenuUnfoldOutlined, FileOutlined, CaretRightOutlined, HistoryOutlined } from '@ant-design/icons';
import { Badge, Button, Tooltip, Segmented } from 'antd';
import { useRef, useEffect } from 'react';
import type { ViewMode } from '../types';
import './Header.css';

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  currentFile: string | null;
  currentIndex: number;
  totalFiles: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenPublish: () => void;
  onOpenHistory: () => void;
  onSaveVersion: () => void;
  historyDisabled?: boolean;
  saveDisabled?: boolean;
  saveHasChanges?: boolean;
  saveSubmitting?: boolean;
  saveChangeCount?: number;
}

export default function Header({
  collapsed,
  onToggle,
  currentFile,
  currentIndex,
  totalFiles,
  viewMode,
  onViewModeChange,
  onOpenPublish,
  onOpenHistory,
  onSaveVersion,
  historyDisabled = false,
  saveDisabled = false,
  saveHasChanges = false,
  saveSubmitting = false,
  saveChangeCount = 0,
}: HeaderProps) {
  const segmentedRef = useRef<HTMLDivElement>(null);

  // 在捕获阶段拦截上下键，避免 antd Segmented 内置键盘导航触发模式切换
  useEffect(() => {
    const el = segmentedRef.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    el.addEventListener('keydown', handler, true);
    return () => el.removeEventListener('keydown', handler, true);
  }, []);
  // 从路径中提取文件名（去掉父级目录）
  const getFileName = (path: string | null) => {
    if (!path) return null;
    const parts = path.split('/');
    return parts[parts.length - 1];
  };

  const fileName = getFileName(currentFile);
  const displaySaveChangeCount = saveHasChanges && saveChangeCount > 0 ? saveChangeCount : 0;

  return (
    <div className="header-container">
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={onToggle}
        className="header-menu-button"
      />

      <div className="header-content">
        {fileName ? (
          <>
            <FileOutlined className="header-file-icon" />
            <Tooltip title={currentFile}>
              <span className="header-file-name">
                {fileName}
              </span>
            </Tooltip>
            <span className="header-file-count">
              {currentIndex} / {totalFiles}
            </span>
          </>
        ) : (
          <span className="header-no-file">未选择文件</span>
        )}
      </div>

      <div ref={segmentedRef} className="header-mode-segmented-wrapper">
        <Segmented
          options={['预览模式', '编辑模式', '标记模式']}
          value={viewMode === 'preview' ? '预览模式' : viewMode === 'inspect' ? '编辑模式' : '标记模式'}
          onChange={(value) => {
            const newMode: ViewMode =
              value === '预览模式' ? 'preview' :
              value === '编辑模式' ? 'inspect' :
              'mark';
            onViewModeChange(newMode);
          }}
        />
      </div>

      <div className="header-actions">
        <Button
          className="header-history-button"
          icon={<HistoryOutlined />}
          onClick={onOpenHistory}
          disabled={historyDisabled}
        >
          历史记录
        </Button>
        <Badge count={displaySaveChangeCount} size="small" offset={[-6, 6]} className="header-save-badge">
          <Button
            className="header-save-button"
            onClick={onSaveVersion}
            disabled={saveDisabled}
            loading={saveSubmitting}
          >
            更新版本
          </Button>
        </Badge>
        <Button color="primary" variant="solid" icon={<CaretRightOutlined />} iconPosition="end" onClick={onOpenPublish}>
          发布项目
        </Button>
      </div>
    </div>
  );
}

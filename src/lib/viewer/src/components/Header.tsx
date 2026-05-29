import { MenuFoldOutlined, MenuUnfoldOutlined, CaretRightOutlined, HistoryOutlined } from '@ant-design/icons';
import { Badge, Button } from 'antd';
import './Header.css';

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  projectName: string;
  viewMode?: 'prototype' | 'prd';
  onViewModeChange?: (mode: 'prototype' | 'prd') => void;
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
  projectName,
  viewMode = 'prototype',
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
  const displaySaveChangeCount = saveHasChanges && saveChangeCount > 0 ? saveChangeCount : 0;
  const saveButton = (
    <Button
      className="header-save-button"
      onClick={onSaveVersion}
      disabled={saveDisabled}
      loading={saveSubmitting}
    >
      更新版本
    </Button>
  );

  return (
    <div className="header-container">
      <div className="header-left-rail">
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
          className="header-menu-button"
        />
      </div>

      <div className="header-content">
        <div className="header-project-meta">
          <span className="header-project-title">{projectName}</span>
          <div className="header-view-mode-tabs">
            <button
              className={`header-view-mode-tab${viewMode === 'prototype' ? ' active' : ''}`}
              onClick={() => onViewModeChange?.('prototype')}
            >
              原型
            </button>
            <button
              className={`header-view-mode-tab${viewMode === 'prd' ? ' active' : ''}`}
              onClick={() => onViewModeChange?.('prd')}
            >
              PRD
            </button>
          </div>
        </div>
      </div>

      <div className="header-right">
        <div className="header-actions">
          <Button
            className="header-history-button"
            icon={<HistoryOutlined />}
            onClick={onOpenHistory}
            disabled={historyDisabled}
          >
            历史记录
          </Button>
          {displaySaveChangeCount > 0 ? (
            <Badge count={displaySaveChangeCount} size="small" offset={[-6, 6]} className="header-save-badge">
              {saveButton}
            </Badge>
          ) : saveButton}
          <Button color="primary" variant="solid" icon={<CaretRightOutlined />} iconPosition="end" onClick={onOpenPublish}>
            发布项目
          </Button>
        </div>
      </div>
    </div>
  );
}

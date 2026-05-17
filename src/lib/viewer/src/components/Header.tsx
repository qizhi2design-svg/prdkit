import { MenuFoldOutlined, MenuUnfoldOutlined, CaretRightOutlined, HistoryOutlined } from '@ant-design/icons';
import { Badge, Button, Tooltip } from 'antd';
import './Header.css';

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  projectName: string;
  currentFile: string | null;
  currentIndex: number;
  totalFiles: number;
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
  currentFile,
  currentIndex,
  totalFiles,
  onOpenPublish,
  onOpenHistory,
  onSaveVersion,
  historyDisabled = false,
  saveDisabled = false,
  saveHasChanges = false,
  saveSubmitting = false,
  saveChangeCount = 0,
}: HeaderProps) {
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
          {fileName ? (
            <div className="header-file-meta">
              <span className="header-project-divider">/</span>
              <Tooltip title={currentFile}>
                <span className="header-file-name">
                  {fileName}
                </span>
              </Tooltip>
              <span className="header-file-count">
                {currentIndex} / {totalFiles}
              </span>
            </div>
          ) : null}
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
    </div>
  );
}

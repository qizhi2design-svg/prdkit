import { MenuFoldOutlined, MenuUnfoldOutlined, FileOutlined } from '@ant-design/icons';
import { Button, Tooltip, Segmented } from 'antd';
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
}

export default function Header({ collapsed, onToggle, currentFile, currentIndex, totalFiles, viewMode, onViewModeChange }: HeaderProps) {
  // 从路径中提取文件名（去掉父级目录）
  const getFileName = (path: string | null) => {
    if (!path) return null;
    const parts = path.split('/');
    return parts[parts.length - 1];
  };

  const fileName = getFileName(currentFile);

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
        className="header-mode-segmented"
      />

      <img src="/logo.svg" alt="PRDKit" className="header-logo" />
    </div>
  );
}

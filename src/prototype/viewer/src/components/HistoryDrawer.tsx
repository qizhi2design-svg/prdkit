import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Drawer,
  Empty,
  Skeleton,
  Tag,
  Typography,
} from 'antd';
import {
  CaretRightOutlined,
  ReloadOutlined,
  RollbackOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { CheckpointDetail, CheckpointRecord } from '../types';
import './HistoryDrawer.css';

const { Title } = Typography;

interface HistoryDrawerProps {
  open: boolean;
  prototypePath: string | null;
  onClose: () => void;
  activeCheckpointId?: string | null;
  onPreview: (detail: CheckpointDetail) => void;
  onRestore: (detail: CheckpointDetail) => Promise<void>;
  onExitPreview: () => void;
}

export default function HistoryDrawer({
  open,
  prototypePath,
  onClose,
  activeCheckpointId = null,
  onPreview,
  onRestore,
  onExitPreview,
}: HistoryDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([]);
  const [detailCache, setDetailCache] = useState<Record<string, CheckpointDetail>>({});

  const activeRecord = useMemo(
    () => checkpoints.find((item) => item.id === activeCheckpointId) ?? null,
    [checkpoints, activeCheckpointId]
  );

  const loadDetail = async (checkpointId: string): Promise<CheckpointDetail> => {
    const cached = detailCache[checkpointId];
    if (cached) return cached;

    const response = await fetch(`/api/checkpoints/${encodeURIComponent(checkpointId)}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || '读取历史详情失败');
    }

    setDetailCache((prev) => ({ ...prev, [checkpointId]: data }));
    return data;
  };

  const loadHistory = async () => {
    if (!prototypePath) {
      setCheckpoints([]);
      setDetailCache({});
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/checkpoints?prototypePath=${encodeURIComponent(prototypePath)}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || '读取历史记录失败');
      }

      setCheckpoints((data.checkpoints || []) as CheckpointRecord[]);
      setDetailCache({});
    } catch (error) {
      console.error('读取历史记录失败:', error);
      setCheckpoints([]);
      setDetailCache({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadHistory();
  }, [open, prototypePath]);

  const handlePreview = async (record: CheckpointRecord) => {
    try {
      const detail = await loadDetail(record.id);
      onPreview(detail);
    } catch (error) {
      console.error('预览 checkpoint 失败:', error);
    }
  };

  const handleRestore = async (record: CheckpointRecord) => {
    try {
      setRestoringId(record.id);
      const detail = await loadDetail(record.id);
      await onRestore(detail);
      await loadHistory();
    } catch (error) {
      console.error('还原 checkpoint 失败:', error);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Drawer
      title="版本历史记录"
      open={open}
      onClose={onClose}
      width={360}
      className="history-drawer compact"
      extra={(
        <div className="history-drawer-extra">
          {activeCheckpointId && (
            <Button
              type="text"
              size="small"
              icon={<StopOutlined />}
              onClick={onExitPreview}
            >
              返回当前
            </Button>
          )}
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => void loadHistory()}
            disabled={loading || !prototypePath}
          />
        </div>
      )}
    >
      {!prototypePath ? (
        <Empty description="请先选择一个原型页面" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="history-drawer-compact-shell">
          <div className="history-drawer-compact-header">
            <Title level={5}>历史</Title>
          </div>

          {activeRecord && (
            <div className="history-drawer-active-tip">
              正在预览：
              <span>{buildVersionLabel(checkpoints, activeRecord.id)}</span>
              <Tag color="blue" className="history-current-tag">当前</Tag>
            </div>
          )}

          {loading ? (
            <div className="history-drawer-loading">
              <Skeleton active paragraph={{ rows: 8 }} />
            </div>
          ) : checkpoints.length === 0 ? (
            <Empty description="当前原型还没有历史记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="history-version-list">
              {checkpoints.map((item) => {
                const isActive = activeCheckpointId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`history-version-item ${isActive ? 'active' : ''}`}
                    onClick={() => void handlePreview(item)}
                  >
                    <div className="history-version-item-top">
                      <div className="history-version-title">
                        <CaretRightOutlined className="history-version-caret" />
                        <span>{buildVersionLabel(checkpoints, item.id)}</span>
                        {isActive && (
                          <Tag color="blue" className="history-current-tag">当前</Tag>
                        )}
                      </div>
                      <button
                        type="button"
                        className="history-version-restore"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRestore(item);
                        }}
                      >
                        <RollbackOutlined />
                        {restoringId === item.id ? '还原中' : '还原'}
                      </button>
                    </div>
                    <div className="history-version-time">{formatDateTime(item.createdAt)}</div>
                    <div className="history-version-meta">
                      <span className="history-version-dot" />
                      <span>{item.message || kindLabelMap[item.kind]}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

const kindLabelMap: Record<CheckpointRecord['kind'], string> = {
  manual: '手动保存',
  auto: '自动保存',
  'pre-restore': '还原前备份',
};

function buildVersionLabel(checkpoints: CheckpointRecord[], checkpointId: string): string {
  const index = checkpoints.findIndex((item) => item.id === checkpointId);
  if (index === -1) {
    return '版本';
  }

  return `版本${checkpoints.length - index}`;
}

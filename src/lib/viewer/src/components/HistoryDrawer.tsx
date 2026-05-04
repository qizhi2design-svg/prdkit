import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Drawer,
  Empty,
  Skeleton,
  Tag,
} from 'antd';
import {
  CaretRightOutlined,
  ReloadOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import type { CheckpointDetail, CheckpointRecord } from '../types';
import './HistoryDrawer.css';

interface HistoryDrawerProps {
  open: boolean;
  prototypePath: string | null;
  refreshVersion?: number;
  focusCheckpointId?: string | null;
  onClose: () => void;
  onPreview: (detail: CheckpointDetail) => void;
  onRestore: (detail: CheckpointDetail, versionLabel: string) => Promise<void>;
}

export default function HistoryDrawer({
  open,
  prototypePath,
  refreshVersion = 0,
  focusCheckpointId = null,
  onClose,
  onPreview,
  onRestore,
}: HistoryDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([]);
  const [detailCache, setDetailCache] = useState<Record<string, CheckpointDetail>>({});
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const lastAppliedFocusKeyRef = useRef<string | null>(null);

  const selectedRecord = useMemo(
    () => checkpoints.find((item) => item.id === selectedCheckpointId) ?? checkpoints[0] ?? null,
    [checkpoints, selectedCheckpointId]
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
      setSelectedCheckpointId((prev) => {
        const records = (data.checkpoints || []) as CheckpointRecord[];
        if (records.length === 0) return null;
        if (prev && records.some((item) => item.id === prev)) {
          return prev;
        }
        return records[0].id;
      });
    } catch (error) {
      console.error('读取历史记录失败:', error);
      setCheckpoints([]);
      setDetailCache({});
      setSelectedCheckpointId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadHistory();
  }, [open, prototypePath, refreshVersion]);

  useEffect(() => {
    if (!open || !focusCheckpointId) return;
    const focusKey = `${refreshVersion}:${focusCheckpointId}`;
    if (lastAppliedFocusKeyRef.current === focusKey) return;
    if (!checkpoints.some((item) => item.id === focusCheckpointId)) return;

    lastAppliedFocusKeyRef.current = focusKey;
    setSelectedCheckpointId(focusCheckpointId);
    void loadDetail(focusCheckpointId)
      .then((detail) => {
        onPreview(detail);
      })
      .catch((error) => {
        console.error('切换到目标 checkpoint 失败:', error);
      });
  }, [checkpoints, focusCheckpointId, onPreview, open, refreshVersion]);

  const handlePreview = async (record: CheckpointRecord) => {
    try {
      setSelectedCheckpointId(record.id);
      const detail = await loadDetail(record.id);
      onPreview(detail);
    } catch (error) {
      console.error('预览 checkpoint 失败:', error);
    }
  };

  const handleRestore = async (record: CheckpointRecord) => {
    try {
      setRestoringId(record.id);
      setSelectedCheckpointId(record.id);
      const detail = await loadDetail(record.id);
      await onRestore(detail, buildVersionLabel(checkpoints, record.id));
      await loadHistory();
    } catch (error) {
      console.error('还原 checkpoint 失败:', error);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Drawer
      title="版本记录"
      open={open}
      onClose={onClose}
      width={360}
      className="history-drawer compact"
      extra={(
        <div className="history-drawer-extra">
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
          {loading ? (
            <div className="history-drawer-loading">
              <Skeleton active paragraph={{ rows: 8 }} />
            </div>
          ) : checkpoints.length === 0 ? (
            <Empty description="当前原型还没有历史记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="history-version-list">
              {checkpoints.map((item) => {
                const isActive = selectedRecord?.id === item.id;
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Drawer,
  Empty,
  Input,
  Modal,
  Select,
  Skeleton,
  Tag,
} from 'antd';
import {
  ReloadOutlined,
  RollbackOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import type { CheckpointDetail, CheckpointRecord, IterationSummary } from '../types';
import type { PrdCheckpointListItem } from '../types/common';
import { message } from '../utils/message';
import './HistoryDrawer.css';

interface HistoryDrawerProps {
  open: boolean;
  prototypePath?: string | null;
  refreshVersion?: number;
  focusCheckpointId?: string | null;
  iterations?: IterationSummary[];
  activeIterationId?: string | null;
  onIterationChange?: (iterationId: string | null) => void;
  onIterationsRefresh?: () => Promise<void>;
  onClose: () => void;
  onPreview?: (detail: CheckpointDetail, versionLabel?: string | null) => void;
  onPreviewGroup?: (details: CheckpointDetail[], versionLabel?: string | null) => void;
  onRestore?: (detail: CheckpointDetail, versionLabel: string) => Promise<void>;
  // PRD 模式 props
  viewMode?: 'prototype' | 'prd';
  prdCheckpoints?: PrdCheckpointListItem[];
  prdActiveCheckpointId?: string | null;
  onPreviewCheckpoint?: (checkpointId: string) => void;
  onReturnToCurrent?: () => void;
  viewingHistory?: boolean;
}

interface VersionEntry {
  key: string;
  records: CheckpointRecord[];
  latestRecord: CheckpointRecord;
  iterationId: string | null;
  sessionId: string | null;
}

export default function HistoryDrawer({
  open,
  prototypePath,
  refreshVersion = 0,
  focusCheckpointId = null,
  iterations = [],
  activeIterationId = null,
  onIterationChange = () => {},
  onIterationsRefresh = async () => {},
  onClose,
  onPreview = () => {},
  onPreviewGroup = () => {},
  onRestore = async () => {},
  viewMode = 'prototype',
  prdCheckpoints = [],
  prdActiveCheckpointId = null,
  onPreviewCheckpoint = () => {},
}: HistoryDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([]);
  const [detailCache, setDetailCache] = useState<Record<string, CheckpointDetail>>({});
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [iterationModalOpen, setIterationModalOpen] = useState(false);
  const [iterationName, setIterationName] = useState('');
  const [iterationSubmitting, setIterationSubmitting] = useState(false);
  const [iterationTarget, setIterationTarget] = useState<CheckpointRecord | null>(null);
  const lastAppliedFocusKeyRef = useRef<string | null>(null);

  const versionEntries = useMemo(() => {
    const groups = new Map<string, VersionEntry>();

    checkpoints.forEach((record) => {
      const groupKey = record.iterationId
        ? `iteration:${record.iterationId}`
        : record.sessionId
          ? `session:${record.sessionId}`
          : `checkpoint:${record.id}`;
      const current = groups.get(groupKey);
      if (!current) {
        groups.set(groupKey, {
          key: groupKey,
          records: [record],
          latestRecord: record,
          iterationId: record.iterationId ?? null,
          sessionId: record.sessionId ?? null,
        });
        return;
      }

      current.records.push(record);
      if (current.latestRecord.createdAt.localeCompare(record.createdAt, 'en') < 0) {
        current.latestRecord = record;
      }
    });

    return Array.from(groups.values())
      .filter((entry) => !activeIterationId || entry.iterationId === activeIterationId)
      .sort((a, b) => b.latestRecord.createdAt.localeCompare(a.latestRecord.createdAt, 'en'));
  }, [activeIterationId, checkpoints]);

  const selectedRecord = useMemo(
    () => versionEntries.find((item) => item.records.some((record) => record.id === selectedCheckpointId)) ?? versionEntries[0] ?? null,
    [selectedCheckpointId, versionEntries],
  );

  const pickRecordForEntry = useCallback((entry: VersionEntry): CheckpointRecord => {
    if (prototypePath) {
      const exactMatch = entry.records
        .filter((record) => record.prototypePath === prototypePath)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt, 'en'))[0];
      if (exactMatch) {
        return exactMatch;
      }
    }

    return entry.latestRecord;
  }, [prototypePath]);

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
    setLoading(true);
    try {
      const response = await fetch(`/api/checkpoints?t=${Date.now()}`, {
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
        const scoped = activeIterationId ? records.filter((item) => item.iterationId === activeIterationId) : records;
        if (scoped.length === 0) return null;
        if (prev && scoped.some((item) => item.id === prev)) {
          return prev;
        }
        const firstEntry = groupCheckpointRecords(scoped)[0];
        return firstEntry ? pickRecordForEntry(firstEntry).id : null;
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
    if (!open || viewMode === 'prd') return;
    void loadHistory();
  }, [activeIterationId, open, refreshVersion, pickRecordForEntry, viewMode]);

  useEffect(() => {
    if (!open || !focusCheckpointId || viewMode === 'prd') return;
    const focusKey = `${refreshVersion}:${focusCheckpointId}`;
    if (lastAppliedFocusKeyRef.current === focusKey) return;
    if (!checkpoints.some((item) => item.id === focusCheckpointId)) return;

    lastAppliedFocusKeyRef.current = focusKey;
    setSelectedCheckpointId(focusCheckpointId);
    void loadDetail(focusCheckpointId)
      .then((detail) => {
        const entryIndex = versionEntries.findIndex((item) => item.records.some((record) => record.id === focusCheckpointId));
        const versionLabel = entryIndex >= 0 ? `版本${versionEntries.length - entryIndex}` : null;
        onPreview(detail, versionLabel);
      })
      .catch((error) => {
        console.error('切换到目标 checkpoint 失败:', error);
      });
  }, [checkpoints, focusCheckpointId, onPreview, open, refreshVersion]);

  const handlePreview = async (entry: VersionEntry) => {
    try {
      const record = pickRecordForEntry(entry);
      setSelectedCheckpointId(record.id);
      const details = await Promise.all(entry.records.map((item) => loadDetail(item.id)));
      const entryIndex = versionEntries.findIndex((item) => item.key === entry.key);
      const versionLabel = entryIndex >= 0 ? `版本${versionEntries.length - entryIndex}` : null;
      onPreviewGroup(details, versionLabel);
    } catch (error) {
      console.error('预览 checkpoint 失败:', error);
    }
  };

  const handleRestore = async (entry: VersionEntry, versionLabel: string) => {
    try {
      const record = pickRecordForEntry(entry);
      setRestoringId(record.id);
      setSelectedCheckpointId(record.id);
      const detail = await loadDetail(record.id);
      await onRestore(detail, versionLabel);
      await loadHistory();
    } catch (error) {
      console.error('还原 checkpoint 失败:', error);
    } finally {
      setRestoringId(null);
    }
  };

  const openIterationModal = (record: CheckpointRecord) => {
    const existingIteration = record.iterationId
      ? iterations.find((item) => item.id === record.iterationId)
      : null;
    setIterationTarget(record);
    setIterationName(existingIteration?.name || `迭代 ${iterations.length + 1}`);
    setIterationModalOpen(true);
  };

  const handleSubmitIteration = async () => {
    const target = iterationTarget;
    const trimmedName = iterationName.trim();
    if (!target) return;
    if (!trimmedName) {
      message.warning('请输入迭代名称');
      return;
    }

    try {
      setIterationSubmitting(true);
      const response = target.iterationId
        ? await fetch(`/api/checkpoints/iterations/${encodeURIComponent(target.iterationId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmedName }),
        })
        : await fetch('/api/checkpoints/iterations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkpointId: target.id, name: trimmedName }),
        });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || '更新迭代失败');
      }

      await onIterationsRefresh();
      await loadHistory();
      onIterationChange(data.iteration?.id || target.iterationId || null);
      setIterationModalOpen(false);
      setIterationTarget(null);
      message.success(target.iterationId ? '迭代名称已更新' : '已标记为迭代');
    } catch (error) {
      console.error('更新迭代失败:', error);
      message.error(error instanceof Error ? error.message : '更新迭代失败');
    } finally {
      setIterationSubmitting(false);
    }
  };

  return (
    <>
      <Drawer
        title="版本记录"
        open={open}
        onClose={onClose}
        placement="right"
        width={380}
        className="history-drawer compact"
        extra={viewMode !== 'prd' ? (
          <div className="history-drawer-extra">
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => {
                void onIterationsRefresh?.();
                void loadHistory();
              }}
              disabled={loading || !prototypePath}
            />
          </div>
        ) : undefined}
      >
        {viewMode === 'prd' ? (
          <div className="history-list">
            {prdCheckpoints && prdCheckpoints.length > 0 ? (
              <ul className="history-version-list">
                {prdCheckpoints.map((cp, index) => {
                  const isActive = prdActiveCheckpointId === cp.id;
                  const versionLabel = `版本${prdCheckpoints.length - index}`;
                  return (
                    <li
                      key={cp.id}
                      className={`history-version-item${isActive ? ' active' : ''}`}
                      onClick={() => onPreviewCheckpoint?.(cp.id)}
                    >
                      <div className="history-version-item-circle">
                        <p className={`history-version-dot${isActive ? ' active' : ''}`} />
                        <p className="history-version-line" />
                      </div>
                      <div className="history-version-content">
                        <div className="history-version-time-row">
                          <span className="history-version-time">
                            {new Date(cp.createdAt).toLocaleString('zh-CN')}
                          </span>
                          <Tag
                            color={cp.kind === 'manual' ? 'blue' : cp.kind === 'auto' ? 'default' : 'orange'}
                            className="history-current-tag"
                          >
                            {cp.kind === 'manual' ? '手动' : cp.kind === 'auto' ? '自动' : '预恢复'}
                          </Tag>
                        </div>
                        <p className={`history-version-title${isActive ? ' active' : ''}`}>
                          <span>{versionLabel}</span>
                          {isActive && (
                            <Tag color="blue" className="history-current-tag">当前</Tag>
                          )}
                        </p>
                        <p className="history-version-summary">
                          {cp.message || cp.title || '无描述'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="history-empty">暂无版本记录</div>
            )}
          </div>
        ) : !prototypePath ? (
          <Empty description="请先选择一个原型页面" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="history-drawer-compact-shell">
            <div className="history-iteration-filter">
              <Select
                value={activeIterationId ?? '__all__'}
                className="history-iteration-select"
                popupMatchSelectWidth={false}
                options={[
                  { value: '__all__', label: '全部版本' },
                  ...iterations.map((iteration) => ({
                    value: iteration.id,
                    label: `${iteration.name} · ${iteration.pageCount} 页`,
                  })),
                ]}
                onChange={(value) => onIterationChange(value === '__all__' ? null : value)}
              />
            </div>

            {loading ? (
              <div className="history-drawer-loading">
                <Skeleton active paragraph={{ rows: 8 }} />
              </div>
            ) : versionEntries.length === 0 ? (
              <Empty description={activeIterationId ? '该迭代下暂无版本记录' : '当前项目还没有历史记录'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <ul className="history-version-list">
                {versionEntries.map((entry, index) => {
                  const targetRecord = pickRecordForEntry(entry);
                  const isActive = selectedRecord?.key === entry.key;
                  const iteration = entry.iterationId
                    ? iterations.find((iterationEntry) => iterationEntry.id === entry.iterationId)
                    : null;
                  const versionLabel = `版本${versionEntries.length - index}`;

                  return (
                    <li
                      key={entry.key}
                      className={`history-version-item ${isActive ? 'active' : ''}`}
                    >
                      <div className="history-version-item-circle">
                        <p className={`history-version-dot ${isActive ? 'active' : ''}`} />
                        <p className="history-version-line" />
                      </div>
                      <div
                        className="history-version-content"
                        onClick={() => void handlePreview(entry)}
                      >
                        <div className="history-version-time-row">
                          <span className="history-version-time">
                            {formatDateTime(entry.latestRecord.createdAt)}
                          </span>
                          <button
                            type="button"
                            className="history-version-restore"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRestore(entry, versionLabel);
                            }}
                          >
                            <RollbackOutlined />
                            {restoringId === targetRecord.id ? '还原中' : '还原'}
                          </button>
                        </div>
                        <p className={`history-version-title ${isActive ? 'active' : ''}`}>
                          <span>{versionLabel}</span>
                          {isActive && (
                            <Tag color="blue" className="history-current-tag">当前</Tag>
                          )}
                        </p>
                        <p className="history-version-summary">
                          {formatEntrySummary(entry.latestRecord)}
                        </p>
                        <div className="history-version-meta">
                          <span className="change-dot" />
                          {iteration ? (
                            <Tag bordered={false} color="processing">{iteration.name}</Tag>
                          ) : null}
                          <Tag bordered={false}>{entry.records.length} 页</Tag>
                          {targetRecord.sessionId ? (
                            <button
                              type="button"
                              className="history-iteration-mark-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                openIterationModal(targetRecord);
                              }}
                            >
                              <TagsOutlined />
                              <span>{targetRecord.iterationId ? '改名' : '标记迭代'}</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        title={iterationTarget?.iterationId ? '修改迭代名称' : '标记迭代'}
        open={iterationModalOpen}
        onOk={() => void handleSubmitIteration()}
        onCancel={() => {
          setIterationModalOpen(false);
          setIterationTarget(null);
        }}
        confirmLoading={iterationSubmitting}
        destroyOnHidden
      >
        <Input
          value={iterationName}
          onChange={(event) => setIterationName(event.target.value)}
          placeholder="请输入迭代名称"
          maxLength={40}
        />
      </Modal>
    </>
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

function formatEntrySummary(record: CheckpointRecord): string {
  const message = record.message?.trim();
  if (!message) {
    return kindLabelMap[record.kind];
  }

  if (record.kind === 'pre-restore') {
    return '还原前备份';
  }

  if (message.startsWith('Before restoring ')) {
    return '还原前备份';
  }

  return message;
}

function groupCheckpointRecords(records: CheckpointRecord[]): VersionEntry[] {
  const groups = new Map<string, VersionEntry>();

  records.forEach((record) => {
    const groupKey = record.iterationId
      ? `iteration:${record.iterationId}`
      : record.sessionId
        ? `session:${record.sessionId}`
        : `checkpoint:${record.id}`;
    const current = groups.get(groupKey);
    if (!current) {
      groups.set(groupKey, {
        key: groupKey,
        records: [record],
        latestRecord: record,
        iterationId: record.iterationId ?? null,
        sessionId: record.sessionId ?? null,
      });
      return;
    }

    current.records.push(record);
    if (current.latestRecord.createdAt.localeCompare(record.createdAt, 'en') < 0) {
      current.latestRecord = record;
    }
  });

  return Array.from(groups.values()).sort((a, b) => b.latestRecord.createdAt.localeCompare(a.latestRecord.createdAt, 'en'));
}

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { UseCheckpointOptions, UseCheckpointReturn } from '../../types/hooks';
import type { ActiveCheckpointPreview, CheckpointDetail, CheckpointRecord, CheckpointStatus, IterationSummary } from '../../types';
import { message } from '../../utils/message';

function toActivePreview(detail: CheckpointDetail): ActiveCheckpointPreview | null {
  if (!detail.previewUrl) {
    return null;
  }

  return {
    checkpointId: detail.checkpoint.id,
    prototypePath: detail.checkpoint.prototypePath,
    previewUrl: detail.previewUrl,
    previewFsPath: detail.previewFsPath,
    marks: detail.marks || [],
    message: detail.checkpoint.message,
    iterationId: detail.checkpoint.iterationId,
  };
}

function groupCheckpointRecords(records: CheckpointRecord[]): CheckpointRecord[][] {
  const groups = new Map<string, CheckpointRecord[]>();

  records.forEach((record) => {
    const groupKey = record.iterationId
      ? `iteration:${record.iterationId}`
      : record.sessionId
        ? `session:${record.sessionId}`
        : `checkpoint:${record.id}`;
    const current = groups.get(groupKey);
    if (current) {
      current.push(record);
      return;
    }
    groups.set(groupKey, [record]);
  });

  return Array.from(groups.values())
    .map((group) => group.sort((a, b) => b.createdAt.localeCompare(a.createdAt, 'en')))
    .sort((a, b) => b[0].createdAt.localeCompare(a[0].createdAt, 'en'));
}

export function useCheckpoint(options: UseCheckpointOptions): UseCheckpointReturn {
  const { prototypePath } = options;

  const [status, setStatus] = useState<CheckpointStatus | null>(null);
  const [manualPreview, setManualPreview] = useState<ActiveCheckpointPreview | null>(null);
  const [activeVersionLabel, setActiveVersionLabel] = useState<string | null>(null);
  const [groupPreviewMap, setGroupPreviewMap] = useState<Record<string, ActiveCheckpointPreview> | null>(null);
  const [groupPreviewPages, setGroupPreviewPages] = useState<string[]>([]);
  const [detailCache, setDetailCache] = useState<Record<string, CheckpointDetail>>({});
  const [iterations, setIterations] = useState<IterationSummary[]>([]);
  const [activeIterationId, setActiveIterationId] = useState<string | null>(null);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [saveSubmitting, setSaveSubmitting] = useState(false);
  const [historyRefreshVersion, setHistoryRefreshVersion] = useState(0);
  const [historyTargetCheckpointId, setHistoryTargetCheckpointId] = useState<string | null>(null);

  const loadStatusRef = useRef<() => void>(() => {});

  const activeIteration = useMemo(
    () => iterations.find((item) => item.id === activeIterationId) ?? null,
    [activeIterationId, iterations],
  );
  const activeIterationFiles = useMemo(
    () => activeIteration?.pages || [],
    [activeIteration],
  );
  const activeIterationCheckpoint = useMemo(() => {
    if (!activeIteration || !prototypePath) return null;
    return activeIteration.checkpointsByPage[prototypePath] ?? null;
  }, [activeIteration, prototypePath]);

  const activeIterationPreview = useMemo(() => {
    if (!activeIterationCheckpoint) return null;
    const detail = detailCache[activeIterationCheckpoint.id];
    return detail ? toActivePreview(detail) : null;
  }, [activeIterationCheckpoint, detailCache]);

  const activeGroupPreview = useMemo(() => {
    if (!groupPreviewMap) return null;
    if (prototypePath && groupPreviewMap[prototypePath]) {
      return groupPreviewMap[prototypePath];
    }
    const fallbackPath = groupPreviewPages[0];
    return fallbackPath ? groupPreviewMap[fallbackPath] ?? null : null;
  }, [groupPreviewMap, groupPreviewPages, prototypePath]);

  const activeHistoryFiles = useMemo(() => {
    if (activeIterationId) {
      return activeIterationFiles;
    }
    return groupPreviewPages;
  }, [activeIterationFiles, activeIterationId, groupPreviewPages]);

  const activePreview = activeIterationId
    ? activeIterationPreview
    : activeGroupPreview ?? manualPreview;
  const historyViewActive = Boolean(activeIterationId || groupPreviewMap || manualPreview);

  const loadDetail = useCallback(async (checkpointId: string): Promise<CheckpointDetail> => {
    const cached = detailCache[checkpointId];
    if (cached) return cached;

    const response = await fetch(`/api/checkpoints/${encodeURIComponent(checkpointId)}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || '读取历史详情失败');
    }

    setDetailCache((prev) => ({ ...prev, [checkpointId]: data as CheckpointDetail }));
    return data as CheckpointDetail;
  }, [detailCache]);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/checkpoints/status?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || '读取版本状态失败');
      }
      setStatus(data as CheckpointStatus);
    } catch (error) {
      console.error('读取版本状态失败:', error);
      setStatus(null);
    }
  }, [prototypePath]);

  const loadIterations = useCallback(async () => {
    try {
      const response = await fetch(`/api/checkpoints/iterations?t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || '读取迭代列表失败');
      }
      setIterations((data.iterations || []) as IterationSummary[]);
    } catch (error) {
      console.error('读取迭代列表失败:', error);
      setIterations([]);
    }
  }, []);

  useEffect(() => {
    loadStatusRef.current = () => {
      void loadStatus();
    };
  }, [loadStatus]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    void loadIterations();
  }, [historyRefreshVersion, loadIterations]);

  useEffect(() => {
    if (!activeIterationCheckpoint) return;
    if (detailCache[activeIterationCheckpoint.id]) return;
    void loadDetail(activeIterationCheckpoint.id).catch((error) => {
      console.error('加载迭代预览失败:', error);
    });
  }, [activeIterationCheckpoint, detailCache, loadDetail]);

  useEffect(() => {
    if (!activeIterationId) return;
    if (iterations.some((item) => item.id === activeIterationId)) return;
    setActiveIterationId(null);
  }, [activeIterationId, iterations]);

  const preview = useCallback((detail: CheckpointDetail, versionLabel?: string | null) => {
    const nextPreview = toActivePreview(detail);
    if (!nextPreview) {
      message.error('该 checkpoint 暂时无法预览');
      return;
    }

    setActiveIterationId(null);
    setGroupPreviewMap(null);
    setGroupPreviewPages([]);
    setManualPreview(nextPreview);
    setActiveVersionLabel(versionLabel ?? null);
    setDetailCache((prev) => ({ ...prev, [detail.checkpoint.id]: detail }));
  }, []);

  const previewGroup = useCallback((details: CheckpointDetail[], versionLabel?: string | null) => {
    const previews = details
      .map((detail) => toActivePreview(detail))
      .filter((preview): preview is ActiveCheckpointPreview => Boolean(preview));

    if (previews.length === 0) {
      message.error('该版本暂时无法预览');
      return;
    }

    const nextGroupMap = previews.reduce<Record<string, ActiveCheckpointPreview>>((acc, preview) => {
      acc[preview.prototypePath] = preview;
      return acc;
    }, {});
    const nextGroupPages = previews
      .map((preview) => preview.prototypePath)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));

    setActiveIterationId(null);
    setManualPreview(null);
    setGroupPreviewMap(nextGroupMap);
    setGroupPreviewPages(nextGroupPages);
    setActiveVersionLabel(versionLabel ?? null);
    setDetailCache((prev) => ({
      ...prev,
      ...details.reduce<Record<string, CheckpointDetail>>((acc, detail) => {
        acc[detail.checkpoint.id] = detail;
        return acc;
      }, {}),
    }));
  }, []);

  const activateVersionGroup = useCallback(async (checkpointId?: string | null) => {
    const response = await fetch(`/api/checkpoints?t=${Date.now()}`, {
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || '读取历史记录失败');
    }

    const records = ((data.checkpoints || []) as CheckpointRecord[])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt, 'en'));
    const groups = groupCheckpointRecords(records);
    const targetGroup = checkpointId
      ? groups.find((group) => group.some((record) => record.id === checkpointId))
      : groups[0];

    if (!targetGroup || targetGroup.length === 0) {
      return;
    }

    const details = await Promise.all(targetGroup.map((record) => loadDetail(record.id)));
    const targetIndex = groups.findIndex((group) => group === targetGroup);
    const versionLabel = targetIndex >= 0 ? `版本${groups.length - targetIndex}` : null;
    setHistoryTargetCheckpointId(targetGroup[0]?.id ?? null);
    previewGroup(details, versionLabel);
    await Promise.all([loadStatus(), loadIterations()]);
  }, [loadDetail, loadIterations, loadStatus, previewGroup]);

  const notifyCheckpointCreated = useCallback(async (checkpointId?: string | null) => {
    setHistoryTargetCheckpointId(checkpointId ?? null);
    setHistoryRefreshVersion((prev) => prev + 1);
    await Promise.all([loadStatus(), loadIterations()]);
  }, [loadIterations, loadStatus]);

  const saveVersion = useCallback(async () => {
    if (!status?.hasChanges || historyViewActive) {
      return;
    }

    try {
      setSaveSubmitting(true);
      const response = await fetch('/api/checkpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '保存版本失败');
      }

      const targetCheckpointId = typeof data.record?.id === 'string' && data.record.id
        ? data.record.id
        : null;

      setHistoryTargetCheckpointId(targetCheckpointId);
      setHistoryRefreshVersion((prev) => prev + 1);
      await Promise.all([loadStatus(), loadIterations()]);

      message.success(
        data.created ? `已保存 ${data.versionLabel}` : `没有检测到新变更，当前仍是${data.versionLabel}`,
      );
    } catch (error) {
      console.error('保存版本失败:', error);
      message.error(error instanceof Error ? error.message : '保存版本失败');
    } finally {
      setSaveSubmitting(false);
    }
  }, [historyViewActive, loadIterations, loadStatus, status]);

  const restore = useCallback(
    async (detail: CheckpointDetail, versionLabel: string) => {
      try {
        const response = await fetch(
          `/api/checkpoints/${encodeURIComponent(detail.checkpoint.id)}/restore`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true }),
          },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || '还原失败');
        }

        setManualPreview(null);
        setGroupPreviewMap(null);
        setGroupPreviewPages([]);
        setActiveVersionLabel(null);
        setActiveIterationId(null);
        setHistoryTargetCheckpointId(detail.checkpoint.id);
        setHistoryRefreshVersion((prev) => prev + 1);
        await Promise.all([loadStatus(), loadIterations()]);
        message.success(`已还原 ${versionLabel}`);
      } catch (error) {
        console.error('还原 checkpoint 失败:', error);
        message.error(error instanceof Error ? error.message : '还原 checkpoint 失败');
      }
    },
    [loadIterations, loadStatus],
  );

  const exitPreview = useCallback(() => {
    setManualPreview(null);
    setGroupPreviewMap(null);
    setGroupPreviewPages([]);
    setActiveVersionLabel(null);
    setActiveIterationId(null);
  }, []);

  const selectIteration = useCallback((iterationId: string | null) => {
    setManualPreview(null);
    setGroupPreviewMap(null);
    setGroupPreviewPages([]);
    setActiveVersionLabel(null);
    setActiveIterationId(iterationId);
  }, []);

  const openHistory = useCallback(() => {
    setHistoryDrawerOpen(true);
  }, []);

  const closeHistory = useCallback(() => {
    setHistoryDrawerOpen(false);
    setManualPreview(null);
    setActiveVersionLabel(null);
  }, []);

  return {
    status,
    activePreview,
    activeVersionLabel,
    activeIterationId,
    iterations,
    historyDrawerOpen,
    saveSubmitting,
    historyRefreshVersion,
    historyTargetCheckpointId,
    activeHistoryFiles,
    activeIterationFiles,
    historyViewActive,
    loadStatus,
    loadIterations,
    activateVersionGroup,
    notifyCheckpointCreated,
    saveVersion,
    preview,
    previewGroup,
    restore,
    exitPreview,
    selectIteration,
    openHistory,
    closeHistory,
    loadStatusRef,
  };
}

import { useState, useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import type { UseCheckpointOptions, UseCheckpointReturn } from '../../types/hooks';
import type { CheckpointStatus, ActiveCheckpointPreview, CheckpointDetail } from '../../types';

export function useCheckpoint(options: UseCheckpointOptions): UseCheckpointReturn {
  const { prototypePath } = options;

  const [status, setStatus] = useState<CheckpointStatus | null>(null);
  const [activePreview, setActivePreview] = useState<ActiveCheckpointPreview | null>(null);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [saveSubmitting, setSaveSubmitting] = useState(false);
  const [historyRefreshVersion, setHistoryRefreshVersion] = useState(0);
  const [historyTargetCheckpointId, setHistoryTargetCheckpointId] = useState<string | null>(null);

  const loadStatusRef = useRef<() => void>(() => {});

  // 加载版本状态
  const loadStatus = useCallback(async () => {
    if (!prototypePath) {
      setStatus(null);
      return;
    }

    try {
      const response = await fetch(
        `/api/checkpoints/status?prototypePath=${encodeURIComponent(prototypePath)}&t=${Date.now()}`,
        { cache: 'no-store' }
      );
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

  // 更新 loadStatusRef
  useEffect(() => {
    loadStatusRef.current = () => {
      void loadStatus();
    };
  }, [loadStatus]);

  // 加载版本状态
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // 保存版本
  const saveVersion = useCallback(async () => {
    if (!prototypePath || !status?.hasChanges || activePreview) {
      return;
    }

    try {
      setSaveSubmitting(true);
      const response = await fetch('/api/checkpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prototypePath }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '保存版本失败');
      }

      const targetCheckpointId =
        typeof data.duplicateOf === 'string' && data.duplicateOf
          ? data.duplicateOf
          : typeof data.record?.id === 'string' && data.record.id
            ? data.record.id
            : null;

      setHistoryTargetCheckpointId(targetCheckpointId);
      setHistoryRefreshVersion((prev) => prev + 1);
      await loadStatus();
      message.success(
        data.created ? `已保存 ${data.versionLabel}` : `没有检测到新变更，当前仍是${data.versionLabel}`
      );
    } catch (error) {
      console.error('保存版本失败:', error);
      message.error(error instanceof Error ? error.message : '保存版本失败');
    } finally {
      setSaveSubmitting(false);
    }
  }, [prototypePath, status, activePreview, loadStatus]);

  // 预览版本
  const preview = useCallback((detail: CheckpointDetail) => {
    if (!detail.previewUrl) {
      message.error('该 checkpoint 暂时无法预览');
      return;
    }

    setActivePreview({
      checkpointId: detail.checkpoint.id,
      prototypePath: detail.checkpoint.prototypePath,
      previewUrl: detail.previewUrl,
      marks: detail.marks || [],
      message: detail.checkpoint.message,
    });
  }, []);

  // 还原版本
  const restore = useCallback(
    async (detail: CheckpointDetail, versionLabel: string) => {
      try {
        const response = await fetch(
          `/api/checkpoints/${encodeURIComponent(detail.checkpoint.id)}/restore`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true }),
          }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || '还原失败');
        }

        setActivePreview(null);
        setHistoryTargetCheckpointId(detail.checkpoint.id);
        setHistoryRefreshVersion((prev) => prev + 1);
        await loadStatus();
        message.success(`已还原 ${versionLabel}`);
      } catch (error) {
        console.error('还原 checkpoint 失败:', error);
        message.error(error instanceof Error ? error.message : '还原 checkpoint 失败');
      }
    },
    [loadStatus]
  );

  // 退出预览
  const exitPreview = useCallback(() => {
    setActivePreview(null);
  }, []);

  // 打开历史抽屉
  const openHistory = useCallback(() => {
    setHistoryDrawerOpen(true);
  }, []);

  // 关闭历史抽屉
  const closeHistory = useCallback(() => {
    setHistoryDrawerOpen(false);
    setActivePreview(null);
  }, []);

  return {
    status,
    activePreview,
    historyDrawerOpen,
    saveSubmitting,
    historyRefreshVersion,
    historyTargetCheckpointId,
    loadStatus,
    saveVersion,
    preview,
    restore,
    exitPreview,
    openHistory,
    closeHistory,
    loadStatusRef,
  };
}

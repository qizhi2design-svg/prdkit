import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { message } from 'antd';
import type { UseMarksOptions, UseMarksReturn } from '../../types/hooks';
import type { Mark, MarkUpdatePatch, PendingMarkInfo } from '../../types';

export function useMarks(options: UseMarksOptions): UseMarksReturn {
  const { prototypePath, viewMode, activeCheckpointPreview } = options;

  const [marks, setMarks] = useState<Mark[]>([]);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [pendingMarkInfo, setPendingMarkInfo] = useState<PendingMarkInfo | null>(null);
  const [relinkingMarkId, setRelinkingMarkId] = useState<string | null>(null);
  const [missingMarkIds, setMissingMarkIds] = useState<string[]>([]);

  const loadMarksRef = useRef<() => void>(() => {});

  // 加载标记数据
  const loadMarks = useCallback(async () => {
    if (!prototypePath || viewMode !== 'mark') return;

    try {
      const response = await fetch(
        `/api/marks/${encodeURIComponent(prototypePath)}?t=${Date.now()}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      setMarks(data.marks || []);
    } catch (error) {
      console.error('加载标记失败:', error);
      setMarks([]);
    }
  }, [prototypePath, viewMode]);

  // 更新 loadMarksRef
  useEffect(() => {
    loadMarksRef.current = loadMarks;
  }, [loadMarks]);

  // 加载标记数据
  useEffect(() => {
    loadMarks();
  }, [loadMarks]);

  // 计算有效标记（考虑 checkpoint 预览）
  const effectiveMarks = useMemo(() => {
    if (activeCheckpointPreview?.prototypePath === prototypePath) {
      return activeCheckpointPreview.marks;
    }
    return marks;
  }, [activeCheckpointPreview, prototypePath, marks]);

  // 选择标记
  const selectMark = useCallback((markId: string | null) => {
    setSelectedMarkId(markId);
    // 选择已存在的标记时，清空待创建的标记
    if (markId) {
      setPendingMarkInfo(null);
    }
  }, []);

  // 创建标记
  const createMark = useCallback(
    async (title: string, description: string) => {
      if (!pendingMarkInfo) return;
      if (activeCheckpointPreview) {
        message.info('历史版本预览中不可新增标记，请先还原到该版本');
        return;
      }
      if (!prototypePath) return;

      try {
        const markPayload = {
          title,
          ...pendingMarkInfo,
          description,
        };

        const response = await fetch(`/api/marks/${encodeURIComponent(prototypePath)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(markPayload),
        });
        const data = await response.json();

        setSelectedMarkId(data?.mark?.id || null);
        setPendingMarkInfo(null);
        await loadMarks();
      } catch (error) {
        console.error('创建标记失败:', error);
        message.error('创建标记失败');
      }
    },
    [pendingMarkInfo, activeCheckpointPreview, prototypePath, loadMarks]
  );

  // 更新标记
  const updateMark = useCallback(
    async (markId: string, patch: MarkUpdatePatch) => {
      if (activeCheckpointPreview) {
        message.info('历史版本预览中不可编辑标记，请先还原到该版本');
        return;
      }
      if (!prototypePath) return;

      try {
        const response = await fetch(
          `/api/marks/${encodeURIComponent(prototypePath)}/${markId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          }
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.message || data?.error || '更新标记失败');
        }

        await loadMarks();
      } catch (error) {
        console.error('更新标记失败:', error);
        message.error(error instanceof Error ? error.message : '更新标记失败');
      }
    },
    [activeCheckpointPreview, prototypePath, loadMarks]
  );

  // 删除标记
  const deleteMark = useCallback(
    async (markId: string) => {
      if (activeCheckpointPreview) {
        message.info('历史版本预览中不可删除标记，请先还原到该版本');
        return;
      }
      if (!prototypePath) return;

      try {
        await fetch(`/api/marks/${encodeURIComponent(prototypePath)}/${markId}`, {
          method: 'DELETE',
        });

        if (selectedMarkId === markId) {
          setSelectedMarkId(null);
        }
        if (relinkingMarkId === markId) {
          setRelinkingMarkId(null);
        }
        await loadMarks();
      } catch (error) {
        console.error('删除标记失败:', error);
        message.error('删除标记失败');
      }
    },
    [activeCheckpointPreview, prototypePath, selectedMarkId, relinkingMarkId, loadMarks]
  );

  // 准备创建标记
  const prepareMark = useCallback((info: PendingMarkInfo) => {
    setRelinkingMarkId(null);
    setPendingMarkInfo(info);
  }, []);

  // 取消创建标记
  const cancelMark = useCallback(() => {
    setPendingMarkInfo(null);
  }, []);

  // 开始重新链接标记
  const startRelink = useCallback(
    (markId: string) => {
      if (activeCheckpointPreview) {
        message.info('历史版本预览中不可修改标记路径，请先还原到该版本');
        return;
      }

      setSelectedMarkId(markId);
      setPendingMarkInfo(null);
      setRelinkingMarkId(markId);
      message.info('请点击页面中的新元素，更新当前标记路径');
    },
    [activeCheckpointPreview]
  );

  // 确认重新链接标记
  const confirmRelink = useCallback(
    (markId: string, info: PendingMarkInfo) => {
      const currentMark = marks.find((mark) => mark.id === markId);
      if (!currentMark) return;

      updateMark(markId, {
        title: currentMark.title,
        description: currentMark.description,
        selector: info.selector,
        domPath: info.domPath,
        position: info.position,
        rect: info.rect,
      });
      setRelinkingMarkId(null);
      setSelectedMarkId(markId);
      setPendingMarkInfo(null);
      message.success('已更新标记元素路径');
    },
    [marks, updateMark]
  );

  // 取消重新链接标记
  const cancelRelink = useCallback(() => {
    setRelinkingMarkId(null);
  }, []);

  return {
    marks,
    selectedMarkId,
    pendingMarkInfo,
    relinkingMarkId,
    missingMarkIds,
    effectiveMarks,
    loadMarks,
    selectMark,
    createMark,
    updateMark,
    deleteMark,
    prepareMark,
    cancelMark,
    startRelink,
    confirmRelink,
    cancelRelink,
    setMissingMarkIds,
    loadMarksRef,
  };
}

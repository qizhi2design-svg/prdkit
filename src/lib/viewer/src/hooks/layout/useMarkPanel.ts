import { useRef, useEffect } from 'react';
import { useViewerStore } from '../../stores/useViewerStore';
import type { MarkPanelReturn } from '../../types/hooks';

export function useMarkPanel(initialWidth: number): MarkPanelReturn {
  const collapsed = useViewerStore((state) => state.markPanelCollapsed);
  const setCollapsed = useViewerStore((state) => state.setMarkPanelCollapsed);
  const width = useViewerStore((state) => state.markPanelWidth);
  const setWidth = useViewerStore((state) => state.setMarkPanelWidth);

  const savedWidthRef = useRef(initialWidth);

  // 处理折叠状态变化
  useEffect(() => {
    if (collapsed) {
      // 折叠时保存当前宽度，并设置为 40px
      savedWidthRef.current = width;
      setWidth(40);
    } else {
      // 展开时恢复之前的宽度
      setWidth(savedWidthRef.current);
    }
  }, [collapsed, width, setWidth]);

  return {
    state: {
      collapsed,
      width,
      savedWidth: savedWidthRef.current,
    },
    actions: {
      toggle: () => setCollapsed(!collapsed),
      expand: () => setCollapsed(false),
      collapse: () => setCollapsed(true),
      setWidth,
    },
  };
}

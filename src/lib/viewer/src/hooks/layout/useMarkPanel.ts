import { useRef, useEffect } from 'react';
import { useViewerStore } from '../../stores/useViewerStore';
import type { MarkPanelReturn } from '../../types/hooks';

export function useMarkPanel(initialWidth: number): MarkPanelReturn {
  const collapsed = useViewerStore((state) => state.markPanelCollapsed);
  const setCollapsed = useViewerStore((state) => state.setMarkPanelCollapsed);
  const width = useViewerStore((state) => state.markPanelWidth);
  const setWidth = useViewerStore((state) => state.setMarkPanelWidth);

  const savedWidthRef = useRef(initialWidth);

  useEffect(() => {
    if (!collapsed && width > 40) {
      savedWidthRef.current = width;
    }
  }, [collapsed, width]);

  const restoreWidthIfNeeded = () => {
    if (width <= 40) {
      setWidth(savedWidthRef.current > 40 ? savedWidthRef.current : initialWidth);
    }
  };

  return {
    state: {
      collapsed,
      width,
      savedWidth: savedWidthRef.current,
    },
    actions: {
      toggle: () => {
        if (collapsed) {
          restoreWidthIfNeeded();
        }
        setCollapsed(!collapsed);
      },
      expand: () => {
        restoreWidthIfNeeded();
        setCollapsed(false);
      },
      collapse: () => setCollapsed(true),
      setWidth,
    },
  };
}

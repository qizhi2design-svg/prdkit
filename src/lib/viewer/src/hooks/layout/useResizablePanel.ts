import { useState, useRef, useEffect, useCallback } from 'react';
import { useViewerStore } from '../../stores/useViewerStore';
import type { ResizablePanelOptions, ResizablePanelReturn } from '../../types/hooks';

export function useResizablePanel(options: ResizablePanelOptions): ResizablePanelReturn {
  const { initialWidth, minWidth, maxWidth, direction, persistKey } = options;

  // 如果指定了 persistKey，从 store 读取/写入
  const storeWidth = useViewerStore((state) =>
    persistKey ? state[persistKey] : undefined
  );
  const setStoreWidth = useViewerStore((state) =>
    persistKey === 'siderWidth'
      ? state.setSiderWidth
      : persistKey === 'markPanelWidth'
        ? state.setMarkPanelWidth
        : undefined
  );

  const [localWidth, setLocalWidth] = useState(storeWidth ?? initialWidth);
  const width = storeWidth ?? localWidth;

  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleWidthChange = useCallback(
    (newWidth: number) => {
      if (setStoreWidth) {
        setStoreWidth(newWidth); // 持久化到 store
      } else {
        setLocalWidth(newWidth); // 仅本地状态
      }
    },
    [setStoreWidth]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    let animationFrameId: number | null = null;
    let latestMouseX = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      latestMouseX = e.clientX;

      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(() => {
          let newWidth: number;

          if (direction === 'left') {
            // 从左边拖拽
            newWidth = latestMouseX;
          } else {
            // 从右边拖拽
            newWidth = window.innerWidth - latestMouseX;
          }

          if (newWidth >= minWidth && newWidth <= maxWidth) {
            handleWidthChange(newWidth);
          }
          animationFrameId = null;
        });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isResizing, direction, minWidth, maxWidth, handleWidthChange]);

  return {
    width,
    isResizing,
    panelRef,
    handleMouseDown,
  };
}

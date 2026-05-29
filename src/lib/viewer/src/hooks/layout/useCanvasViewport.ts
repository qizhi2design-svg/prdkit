import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type CanvasViewportSize = {
  width: number;
  height: number;
};

export type CanvasPanOffset = {
  x: number;
  y: number;
};

type DragPoint = {
  x: number;
  y: number;
};

type UseCanvasViewportOptions = {
  stageSize: CanvasViewportSize;
  canvasSize: CanvasViewportSize;
  defaultZoomPercent?: number;
  zoomOptions?: number[];
};

export const DEFAULT_ZOOM_OPTIONS = [50, 75, 100, 125, 150, 200];
export const PREVIEW_FRAME_SHELL_BORDER_PX = 2;

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getCanvasViewportMetrics(
  stageSize: CanvasViewportSize,
  canvasSize: CanvasViewportSize,
  zoomPercent: number
) {
  const availableWidth = Math.max(stageSize.width, 0);
  const availableHeight = Math.max(stageSize.height, 0);
  const fitScale = stageSize.width > 0 && stageSize.height > 0
    ? Math.min(availableWidth / canvasSize.width, availableHeight / canvasSize.height)
    : 1;
  const minZoom = Math.min(fitScale * 100, 50);
  const maxZoom = 200;
  const canvasScale = zoomPercent / 100;
  const visualCanvasWidth = canvasSize.width + PREVIEW_FRAME_SHELL_BORDER_PX;
  const visualCanvasHeight = canvasSize.height + PREVIEW_FRAME_SHELL_BORDER_PX;
  const canvasWidth = visualCanvasWidth * canvasScale;
  const canvasHeight = visualCanvasHeight * canvasScale;
  const overflowX = Math.max(canvasWidth - availableWidth, 0);
  const overflowY = Math.max(canvasHeight - availableHeight, 0);

  return {
    availableWidth,
    availableHeight,
    fitScale,
    minZoom,
    maxZoom,
    canvasScale,
    canvasWidth,
    canvasHeight,
    isPannable: zoomPercent > fitScale * 100,
    panBounds: {
      minX: -overflowX,
      maxX: 0,
      minY: -overflowY,
      maxY: 0,
    },
  };
}

export function clampPanOffset(
  panOffset: CanvasPanOffset,
  panBounds: { minX: number; maxX: number; minY: number; maxY: number }
) {
  return {
    x: clampNumber(panOffset.x, panBounds.minX, panBounds.maxX),
    y: clampNumber(panOffset.y, panBounds.minY, panBounds.maxY),
  };
}

export function useCanvasViewport({
  stageSize,
  canvasSize,
  defaultZoomPercent = 100,
  zoomOptions = DEFAULT_ZOOM_OPTIONS,
}: UseCanvasViewportOptions) {
  const [zoomPercentState, setZoomPercentState] = useState(defaultZoomPercent);
  const [panOffset, setPanOffset] = useState<CanvasPanOffset>({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const dragStartRef = useRef<{ point: DragPoint; origin: CanvasPanOffset } | null>(null);
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 当面板尺寸变化时重新适配视图（如打开/拖动标记列表、拖动页面列表）
  useEffect(() => {
    if (stageSize.width > 0 && stageSize.height > 0 && canvasSize.width > 0 && canvasSize.height > 0) {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
      fitTimerRef.current = setTimeout(() => {
        const fitScale = Math.min(stageSize.width / canvasSize.width, stageSize.height / canvasSize.height);
        setZoomPercentState(Math.round(fitScale * 100));
        setPanOffset({ x: 0, y: 0 });
      }, 150);
    }
    return () => {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    };
  }, [stageSize, canvasSize]);
  const fitMetrics = useMemo(
    () => getCanvasViewportMetrics(stageSize, canvasSize, defaultZoomPercent),
    [canvasSize, defaultZoomPercent, stageSize]
  );
  const zoomPercent = clampNumber(
    zoomPercentState,
    Math.min(fitMetrics.minZoom, fitMetrics.maxZoom),
    fitMetrics.maxZoom
  );

  const metrics = useMemo(
    () => getCanvasViewportMetrics(stageSize, canvasSize, zoomPercent),
    [canvasSize, stageSize, zoomPercent]
  );
  const normalizedPanOffset = useMemo(() => (
    metrics.isPannable
      ? clampPanOffset(panOffset, metrics.panBounds)
      : { x: 0, y: 0 }
  ), [metrics.isPannable, metrics.panBounds, panOffset]);

  const applyZoom = useCallback((nextZoomPercent: number) => {
    const normalizedMin = Math.min(fitMetrics.minZoom, fitMetrics.maxZoom);
    const next = clampNumber(nextZoomPercent, normalizedMin, fitMetrics.maxZoom);
    setZoomPercentState(next);
  }, [fitMetrics.maxZoom, fitMetrics.minZoom]);

  const centerCanvas = useCallback(() => {
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const resetToFit = useCallback(() => {
    const fitZoomPercent = metrics.fitScale * 100;
    setZoomPercentState(fitZoomPercent);
    setPanOffset({ x: 0, y: 0 });
  }, [metrics.fitScale]);

  const zoomIn = useCallback(() => {
    const nextOption = zoomOptions.find((option) => option > zoomPercent + 0.01);
    applyZoom(nextOption ?? metrics.maxZoom);
  }, [applyZoom, metrics.maxZoom, zoomOptions, zoomPercent]);

  const zoomOut = useCallback(() => {
    const reversedOptions = [...zoomOptions].reverse();
    const prevOption = reversedOptions.find((option) => option < zoomPercent - 0.01);
    applyZoom(prevOption ?? metrics.minZoom);
  }, [applyZoom, metrics.minZoom, zoomOptions, zoomPercent]);

  const startPan = useCallback((point: DragPoint) => {
    if (!metrics.isPannable) return;
    dragStartRef.current = { point, origin: normalizedPanOffset };
    setIsDraggingCanvas(true);
  }, [metrics.isPannable, normalizedPanOffset]);

  const updatePan = useCallback((point: DragPoint) => {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;

    const nextOffset = clampPanOffset({
      x: dragStart.origin.x + (point.x - dragStart.point.x),
      y: dragStart.origin.y + (point.y - dragStart.point.y),
    }, metrics.panBounds);

    setPanOffset((current) => (
      Math.abs(current.x - nextOffset.x) < 0.01 && Math.abs(current.y - nextOffset.y) < 0.01
        ? current
        : nextOffset
    ));
  }, [metrics.panBounds]);

  const endPan = useCallback(() => {
    dragStartRef.current = null;
    setIsDraggingCanvas(false);
  }, []);
  const roundedZoomPercent = Math.round(zoomPercent);

  return {
    zoomOptions,
    zoomPercent,
    roundedZoomPercent,
    minZoom: metrics.minZoom,
    maxZoom: metrics.maxZoom,
    fitScale: metrics.fitScale,
    canvasScale: metrics.canvasScale,
    canvasWidth: metrics.canvasWidth,
    canvasHeight: metrics.canvasHeight,
    isPannable: metrics.isPannable,
    panOffset: normalizedPanOffset,
    isDraggingCanvas,
    canZoomIn: zoomPercent < metrics.maxZoom - 0.01,
    canZoomOut: zoomPercent > metrics.minZoom + 0.01,
    setZoomPercent: applyZoom,
    setPanOffset,
    zoomIn,
    zoomOut,
    resetToFit,
    centerCanvas,
    startPan,
    updatePan,
    endPan,
  };
}

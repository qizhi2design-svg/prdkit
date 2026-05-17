import { CompressOutlined, CopyOutlined } from '@ant-design/icons';
import { Button, Dropdown, Empty, Tooltip, message, type MenuProps } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { getElementInfo, getElementPath, formatMultipleElementsInfo, generateUniqueSelector, findElementBySelector, isElementVisible, isElementCovered, type ElementInfo } from '../utils/domUtils';
import { getModifierKey } from '../utils/platform';
import { copySkillClipboardText } from '../utils/clipboard';
import MarkPanel from './MarkPanel';
import { computePreviewOverlayRect } from './previewGeometry';
import type { ActiveTool, Mark, PendingMarkInfo, ViewerSkillConfig, MarkUpdatePatch, CanvasPanOffset, CanvasViewportSize } from '../types';
import './Preview.css';

interface PreviewProps {
  filePath: string | null;
  activeTool: ActiveTool;
  onToolChange: (tool: ActiveTool) => void;
  projectName: string;
  prototypesDir: string;
  wsConnected: boolean;
  reloadVersion: number;
  viewerSkills: ViewerSkillConfig;
  marks: Mark[];
  selectedMarkId: string | null;
  pendingMarkInfo: PendingMarkInfo | null;
  relinkingMarkId: string | null;
  onMarkPrepare: (info: PendingMarkInfo) => void;
  onMarkRelink: (markId: string, info: PendingMarkInfo) => void;
  onMarkSelect: (markId: string | null) => void;
  onMarkCancel: () => void;
  onMarkResolutionChange: (missingMarkIds: string[]) => void;
  onMarkVisibilityChange?: (hiddenMarkIds: string[]) => void;
  onToggleMarkPanel?: () => void;
  markPanelCollapsed?: boolean;
  markPanelWidth?: number;
  markPanelResizing?: boolean;
  onMarkPanelResizeStart?: (e: React.MouseEvent) => void;
  onMarkPanelCollapsedChange?: (collapsed: boolean) => void;
  onMarkCreate: (title: string, description: string) => void;
  onMarkUpdate: (markId: string, patch: MarkUpdatePatch) => void;
  onMarkDelete: (markId: string) => void;
  onMarkRelinkStart: (markId: string) => void;
  onMarkRelinkCancel: () => void;
  onMarkRefresh: () => void;
  missingMarkIds: string[];
  hiddenMarkIds: string[];
  viewportSize: CanvasViewportSize;
  canvasScale: number;
  canvasWidth: number;
  canvasHeight: number;
  panOffset: CanvasPanOffset;
  isPannable: boolean;
  isDraggingCanvas: boolean;
  onStageSizeChange: (size: CanvasViewportSize) => void;
  onCanvasContentSizeChange?: (size: CanvasViewportSize) => void;
  onCanvasPanStart: (point: { x: number; y: number }) => void;
  onCanvasPanMove: (point: { x: number; y: number }) => void;
  onCanvasPanEnd: () => void;
  onZoomReset?: () => void;
  zoomPercent?: number;
  zoomOptions?: number[];
  canZoomIn?: boolean;
  canZoomOut?: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomChange?: (zoomPercent: number) => void;
  previewUrlOverride?: string | null;
  previewReadonly?: boolean;
  fileList?: string[];
  onLinkNavigation?: (filePath: string) => void;
}

type SelectedElement = ElementInfo;
const TOOL_CYCLE_ORDER: ActiveTool[] = ['none', 'inspect', 'mark'];

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== 'string') return false;

  const tagName = element.tagName;
  return tagName === 'INPUT'
    || tagName === 'TEXTAREA'
    || tagName === 'SELECT'
    || element.isContentEditable;
}

function isMarkInteractionTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest('.preview-mark-highlight, .preview-mark-number'));
}

function getFallbackOverlayRect(mark: Mark, canvasScale: number) {
  const borderCompensation = 2;

  return {
    display: 'block',
    left: Math.max((mark.rect?.left ?? 0) * canvasScale - borderCompensation / 2, 0),
    top: Math.max((mark.rect?.top ?? 0) * canvasScale - borderCompensation / 2, 0),
    width: Math.max((mark.rect?.width ?? 0) * canvasScale + borderCompensation, 18),
    height: Math.max((mark.rect?.height ?? 0) * canvasScale + borderCompensation, 18),
  };
}

export default function Preview({
  filePath,
  activeTool,
  onToolChange,
  projectName,
  prototypesDir,
  wsConnected,
  reloadVersion,
  viewerSkills,
  marks,
  selectedMarkId,
  pendingMarkInfo,
  relinkingMarkId,
  onMarkPrepare,
  onMarkRelink,
  onMarkSelect,
  onMarkCancel,
  onMarkResolutionChange,
  onMarkVisibilityChange,
  onToggleMarkPanel,
  markPanelCollapsed = true,
  markPanelWidth = 350,
  markPanelResizing = false,
  onMarkPanelResizeStart,
  onMarkPanelCollapsedChange,
  onMarkCreate,
  onMarkUpdate,
  onMarkDelete,
  onMarkRelinkStart,
  onMarkRelinkCancel,
  onMarkRefresh,
  missingMarkIds,
  hiddenMarkIds,
  viewportSize,
  canvasScale,
  canvasWidth,
  canvasHeight,
  panOffset,
  isPannable,
  isDraggingCanvas,
  onStageSizeChange,
  onCanvasContentSizeChange,
  onCanvasPanStart,
  onCanvasPanMove,
  onCanvasPanEnd,
  onZoomReset,
  zoomPercent = 100,
  zoomOptions = [],
  canZoomIn = false,
  canZoomOut = false,
  onZoomIn,
  onZoomOut,
  onZoomChange,
  previewUrlOverride = null,
  previewReadonly = false,
  fileList,
  onLinkNavigation,
}: PreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const unmountedRef = useRef(false);

  const activeToolRef = useRef(activeTool);
  const marksRef = useRef(marks);
  const relinkingMarkIdRef = useRef(relinkingMarkId);
  const onMarkPrepareRef = useRef(onMarkPrepare);
  const onMarkRelinkRef = useRef(onMarkRelink);
  const onMarkSelectRef = useRef(onMarkSelect);
  const previewReadonlyRef = useRef(previewReadonly);
  const projectNameRef = useRef(projectName);
  const prototypesDirRef = useRef(prototypesDir);
  const selectionModeRef = useRef<'single' | 'multiple'>('single');
  const viewerSkillsRef = useRef(viewerSkills);
  const selectedMarkIdRef = useRef(selectedMarkId);
  const pendingMarkInfoRef = useRef(pendingMarkInfo);
  const onMarkCancelRef = useRef(onMarkCancel);
  const onToggleMarkPanelRef = useRef(onToggleMarkPanel);
  const onToolChangeRef = useRef(onToolChange);
  const filePathRef = useRef(filePath);
  const onCanvasPanMoveRef = useRef(onCanvasPanMove);
  const onCanvasPanEndRef = useRef(onCanvasPanEnd);
  const fileListRef = useRef(fileList);
  const onLinkNavigationRef = useRef(onLinkNavigation);

  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('single');
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([]);
  const selectedElementsRef = useRef(selectedElements);
  const [marksVisible, setMarksVisible] = useState(true);
  const [overlayRefreshTick, setOverlayRefreshTick] = useState(0);
  const [iframeReloadToken, setIframeReloadToken] = useState(0);
  const [spacePressed, setSpacePressed] = useState(false);

  const [showDisconnected, setShowDisconnected] = useState(false);
  useEffect(() => {
    if (!wsConnected) {
      const timer = setTimeout(() => setShowDisconnected(true), 2000);
      return () => clearTimeout(timer);
    }
    setShowDisconnected(false);
  }, [wsConnected]);

  useEffect(() => {
    activeToolRef.current = activeTool;
    marksRef.current = marks;
    relinkingMarkIdRef.current = relinkingMarkId;
    onMarkPrepareRef.current = onMarkPrepare;
    onMarkRelinkRef.current = onMarkRelink;
    onMarkSelectRef.current = onMarkSelect;
    onMarkCancelRef.current = onMarkCancel;
    onToggleMarkPanelRef.current = onToggleMarkPanel;
    onToolChangeRef.current = onToolChange;
    previewReadonlyRef.current = previewReadonly;
    projectNameRef.current = projectName;
    prototypesDirRef.current = prototypesDir;
    selectionModeRef.current = selectionMode;
    viewerSkillsRef.current = viewerSkills;
    selectedMarkIdRef.current = selectedMarkId;
    pendingMarkInfoRef.current = pendingMarkInfo;
    selectedElementsRef.current = selectedElements;
    filePathRef.current = filePath;
    onCanvasPanMoveRef.current = onCanvasPanMove;
    onCanvasPanEndRef.current = onCanvasPanEnd;
    fileListRef.current = fileList;
    onLinkNavigationRef.current = onLinkNavigation;
  });

  const inspectToolActive = activeTool === 'inspect';
  const markToolActive = activeTool === 'mark';
  const marksVisibleInCurrentMode = markToolActive ? marksVisible : false;
  const markOverlaysVisible = markToolActive && marksVisible;
  const isPanModeActive = isPannable && spacePressed;
  const shouldRenderMarkPanel = markToolActive;
  const zoomMenuItems: MenuProps['items'] = zoomOptions.map((option) => ({
    key: String(option),
    label: (
      <div className="preview-zoom-menu-item">
        <span>{option}%</span>
        <span className="preview-zoom-menu-check">{Math.abs(option - zoomPercent) < 0.5 ? '✓' : ''}</span>
      </div>
    ),
    onClick: () => onZoomChange?.(option),
  }));

  const requestOverlayRefresh = () => {
    if (unmountedRef.current) return;
    setOverlayRefreshTick((prev) => prev + 1);
  };

  const cycleTool = (currentTool: ActiveTool) => {
    const currentIndex = TOOL_CYCLE_ORDER.indexOf(currentTool);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % TOOL_CYCLE_ORDER.length;
    return TOOL_CYCLE_ORDER[nextIndex];
  };

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (reloadVersion === 0) return;
    if (unmountedRef.current) return;
    setIframeReloadToken(Date.now());
  }, [reloadVersion]);

  useEffect(() => {
    requestOverlayRefresh();
  }, [canvasScale]);

  useEffect(() => {
    if (!isPanModeActive && isDraggingCanvas) {
      onCanvasPanEndRef.current();
    }
  }, [isDraggingCanvas, isPanModeActive]);

  useEffect(() => {
    const iframe = iframeRef.current;

    const handleToolHotkey = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.key !== 'Tab') return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      onToolChangeRef.current(cycleTool(activeToolRef.current));
    };

    const bindIframeListeners = () => {
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
      const iframeWindow = iframe?.contentWindow;
      if (!iframeDoc || !iframeWindow) return;

      iframeWindow.addEventListener('keydown', handleToolHotkey, true);
      iframeDoc.addEventListener('keydown', handleToolHotkey, true);
    };

    const unbindIframeListeners = () => {
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
      const iframeWindow = iframe?.contentWindow;
      if (!iframeDoc || !iframeWindow) return;

      iframeWindow.removeEventListener('keydown', handleToolHotkey, true);
      iframeDoc.removeEventListener('keydown', handleToolHotkey, true);
    };

    window.addEventListener('keydown', handleToolHotkey, true);
    iframe?.addEventListener('load', bindIframeListeners);
    bindIframeListeners();

    return () => {
      window.removeEventListener('keydown', handleToolHotkey, true);
      iframe?.removeEventListener('load', bindIframeListeners);
      unbindIframeListeners();
    };
  }, []);

  // iframe 超链接拦截：依赖 fileList，确保文件列表就绪后才绑定
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!fileList || fileList.length === 0) return;
    if (!iframe) return;

    const handleLinkClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a');
      if (!link || !link.href) return;

      try {
        const url = new URL(link.href);
        if (url.origin !== window.location.origin) return;

        const pathname = url.pathname.replace(/\/$/, '');
        const files = fileListRef.current;
        if (!files || files.length === 0) return;

        const match = files.find((f) => {
          const normalized = f.replace(/\/index\.html$/, '');
          return normalized === pathname || `/${normalized}` === pathname;
        });
        if (match) {
          event.preventDefault();
          event.stopPropagation();
          onLinkNavigationRef.current?.(match);
        }
      } catch {
        // 忽略非 URL 或无效的 href
      }
    };

    const setupIframeListener = () => {
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
      if (!iframeDoc) return;
      iframeDoc.addEventListener('click', handleLinkClick, true);
    };

    const cleanupIframeListener = () => {
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
      if (!iframeDoc) return;
      iframeDoc.removeEventListener('click', handleLinkClick, true);
    };

    setupIframeListener();
    iframe.addEventListener('load', setupIframeListener);

    return () => {
      cleanupIframeListener();
      iframe.removeEventListener('load', setupIframeListener);
    };
  }, [fileList]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      setSpacePressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      setSpacePressed(false);
    };

    const iframe = iframeRef.current;

    const bindIframeListeners = () => {
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
      const iframeWindow = iframe?.contentWindow;
      if (!iframeDoc || !iframeWindow) return;

      iframeWindow.addEventListener('keydown', handleKeyDown, true);
      iframeDoc.addEventListener('keydown', handleKeyDown, true);
      iframeWindow.addEventListener('keyup', handleKeyUp, true);
      iframeDoc.addEventListener('keyup', handleKeyUp, true);
      iframeWindow.addEventListener('blur', () => setSpacePressed(false));
    };

    const unbindIframeListeners = () => {
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
      const iframeWindow = iframe?.contentWindow;
      if (!iframeDoc || !iframeWindow) return;

      iframeWindow.removeEventListener('keydown', handleKeyDown, true);
      iframeDoc.removeEventListener('keydown', handleKeyDown, true);
      iframeWindow.removeEventListener('keyup', handleKeyUp, true);
      iframeDoc.removeEventListener('keyup', handleKeyUp, true);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', () => setSpacePressed(false));
    iframe?.addEventListener('load', bindIframeListeners);
    bindIframeListeners();

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      iframe?.removeEventListener('load', bindIframeListeners);
      unbindIframeListeners();
    };
  }, []);

  useEffect(() => {
    if (!isDraggingCanvas) return;

    const handlePointerMove = (event: PointerEvent) => {
      onCanvasPanMoveRef.current({ x: event.clientX, y: event.clientY });
    };

    const handlePointerEnd = () => {
      onCanvasPanEndRef.current();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [isDraggingCanvas]);

  useEffect(() => {
    onCanvasContentSizeChange?.(viewportSize);
  }, [onCanvasContentSizeChange, viewportSize]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateStageSize = () => {
      const caption = stage.querySelector<HTMLElement>('.preview-stage-caption');
      const stageStyle = window.getComputedStyle(stage);
      const paddingLeft = Number.parseFloat(stageStyle.paddingLeft || '0') || 0;
      const paddingRight = Number.parseFloat(stageStyle.paddingRight || '0') || 0;
      const paddingBottom = Number.parseFloat(stageStyle.paddingBottom || '0') || 0;
      const captionHeight = caption?.offsetHeight ?? 0;
      const captionMarginBottom = caption
        ? Number.parseFloat(window.getComputedStyle(caption).marginBottom || '0') || 0
        : 0;

      onStageSizeChange({
        width: Math.max(stage.clientWidth - paddingLeft - paddingRight, 0),
        height: Math.max(stage.clientHeight - captionHeight - captionMarginBottom - paddingBottom, 0),
      });
    };

    const resizeObserver = new ResizeObserver(updateStageSize);
    resizeObserver.observe(stage);
    updateStageSize();

    return () => {
      resizeObserver.disconnect();
    };
  }, [onStageSizeChange]);

  useEffect(() => {
    const iframe = iframeRef.current;
    const stage = stageRef.current;
    if (!iframe || !stage) return;

    let frameId: number | null = null;
    let transitionLoopId: number | null = null;
    let iframeObserversCleanup: (() => void) | null = null;

    const scheduleRefresh = () => {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        requestOverlayRefresh();
      });
    };

    const cleanupIframeObservers = () => {
      if (iframeObserversCleanup) {
        iframeObserversCleanup();
        iframeObserversCleanup = null;
      }
    };

    const stopTransitionLoop = () => {
      if (transitionLoopId !== null) {
        cancelAnimationFrame(transitionLoopId);
        transitionLoopId = null;
      }
    };

    const startTransitionLoop = () => {
      if (unmountedRef.current || transitionLoopId !== null) return;

      const tick = () => {
        scheduleRefresh();
        transitionLoopId = requestAnimationFrame(tick);
      };

      tick();
    };

    const setupIframeObservers = () => {
      if (unmountedRef.current) return;
      cleanupIframeObservers();

      const iframeWindow = iframe.contentWindow;
      const iframeDoc = iframe.contentDocument || iframeWindow?.document;
      if (!iframeWindow || !iframeDoc) return;

      const updateCanvasContentSize = () => {
        const docEl = iframeDoc.documentElement;
        const body = iframeDoc.body;
        const contentWidth = Math.max(
          viewportSize.width,
          docEl?.scrollWidth ?? 0,
          docEl?.offsetWidth ?? 0,
          body?.scrollWidth ?? 0,
          body?.offsetWidth ?? 0
        );
        const contentHeight = Math.max(
          viewportSize.height,
          docEl?.scrollHeight ?? 0,
          docEl?.offsetHeight ?? 0,
          body?.scrollHeight ?? 0,
          body?.offsetHeight ?? 0
        );

        onCanvasContentSizeChange?.({
          width: contentWidth,
          height: contentHeight,
        });
      };

      const resizeObserver = new ResizeObserver(() => {
        updateCanvasContentSize();
        scheduleRefresh();
      });
      resizeObserver.observe(iframeDoc.documentElement);
      if (iframeDoc.body) {
        resizeObserver.observe(iframeDoc.body);
      }

      const mutationObserver = new MutationObserver(() => {
        updateCanvasContentSize();
        scheduleRefresh();
      });
      mutationObserver.observe(iframeDoc.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });

      iframeWindow.addEventListener('scroll', scheduleRefresh, { passive: true });
      iframeDoc.addEventListener('scroll', scheduleRefresh, { passive: true, capture: true });
      iframeWindow.addEventListener('resize', scheduleRefresh);

      iframeObserversCleanup = () => {
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        iframeWindow.removeEventListener('scroll', scheduleRefresh);
        iframeDoc.removeEventListener('scroll', scheduleRefresh, true);
        iframeWindow.removeEventListener('resize', scheduleRefresh);
      };

      updateCanvasContentSize();
      scheduleRefresh();
    };

    const outerResizeObserver = new ResizeObserver(() => {
      scheduleRefresh();
    });
    outerResizeObserver.observe(stage);
    outerResizeObserver.observe(iframe);

    const transitionTargets = [
      stage,
      iframe,
      stage.closest('.app-content') as HTMLElement | null,
      stage.closest('.app-content-layout') as HTMLElement | null,
      stage.closest('.app-layout') as HTMLElement | null,
    ].filter((target): target is HTMLElement => Boolean(target));

    const handleTransitionRun = () => {
      startTransitionLoop();
    };

    const handleTransitionStop = () => {
      stopTransitionLoop();
      scheduleRefresh();
    };

    transitionTargets.forEach((target) => {
      target.addEventListener('transitionrun', handleTransitionRun);
      target.addEventListener('transitionstart', handleTransitionRun);
      target.addEventListener('transitionend', handleTransitionStop);
      target.addEventListener('transitioncancel', handleTransitionStop);
    });

    window.addEventListener('resize', scheduleRefresh);
    window.addEventListener('scroll', scheduleRefresh, { passive: true });
    iframe.addEventListener('load', setupIframeObservers);

    setupIframeObservers();

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      stopTransitionLoop();
      cleanupIframeObservers();
      outerResizeObserver.disconnect();
      transitionTargets.forEach((target) => {
        target.removeEventListener('transitionrun', handleTransitionRun);
        target.removeEventListener('transitionstart', handleTransitionRun);
        target.removeEventListener('transitionend', handleTransitionStop);
        target.removeEventListener('transitioncancel', handleTransitionStop);
      });
      window.removeEventListener('resize', scheduleRefresh);
      window.removeEventListener('scroll', scheduleRefresh);
      iframe.removeEventListener('load', setupIframeObservers);
    };
  }, [filePath, onCanvasContentSizeChange, viewportSize.height, viewportSize.width]);

  const getOverlayRect = (element: Element) => {
    const iframe = iframeRef.current;
    const canvas = canvasRef.current;
    if (!iframe || !canvas) return null;

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return null;

    return computePreviewOverlayRect({
      elementRect: element.getBoundingClientRect(),
      iframeRect: iframe.getBoundingClientRect(),
      canvasRect: canvas.getBoundingClientRect(),
      iframeViewportWidth: iframeDoc.documentElement?.clientWidth || iframe.clientWidth || viewportSize.width,
      iframeViewportHeight: iframeDoc.documentElement?.clientHeight || iframe.clientHeight || viewportSize.height,
    });
  };

  useEffect(() => {
    const iframe = iframeRef.current;
    const isInteractiveMode = inspectToolActive || (markToolActive && marksVisibleInCurrentMode);

    if (!iframe || !isInteractiveMode) {
      setHoveredElement(null);
      return;
    }

    let currentCleanup: (() => void) | null = null;

    const setupInspectMode = () => {
      if (unmountedRef.current) return;
      if (currentCleanup) {
        currentCleanup();
        currentCleanup = null;
      }

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc || !iframeDoc.head) return;

      const handleMouseMove = (e: MouseEvent) => {
        if (unmountedRef.current) return;
        const target = e.target as HTMLElement;
        if (target && target !== iframeDoc.body && target !== iframeDoc.documentElement) {
          setHoveredElement(target);
        } else {
          setHoveredElement(null);
        }
      };

      const handleClick = async (e: MouseEvent) => {
        if (unmountedRef.current) return;
        e.preventDefault();
        e.stopPropagation();

        const target = e.target as HTMLElement;
        if (!target) return;

        const currentActiveTool = activeToolRef.current;
        const currentMarks = marksRef.current;
        const currentRelinkingMarkId = relinkingMarkIdRef.current;
        const currentOnMarkPrepare = onMarkPrepareRef.current;
        const currentOnMarkRelink = onMarkRelinkRef.current;
        const currentOnMarkSelect = onMarkSelectRef.current;
        const currentPreviewReadonly = previewReadonlyRef.current;
        const currentProjectName = projectNameRef.current;
        const currentPrototypesDir = prototypesDirRef.current;
        const currentSelectionMode = selectionModeRef.current;
        const currentViewerSkills = viewerSkillsRef.current;
        const wantsMultiSelect = currentSelectionMode === 'multiple' || e.shiftKey;

        if (currentActiveTool === 'mark') {
          const selector = generateUniqueSelector(target);

          if (currentRelinkingMarkId) {
            const duplicatedMark = currentMarks.find((mark) => mark.selector === selector && mark.id !== currentRelinkingMarkId);
            if (duplicatedMark) {
              message.warning(`该元素已绑定到标记”${duplicatedMark.title}”`);
              return;
            }

            const rect = target.getBoundingClientRect();
            currentOnMarkRelink(currentRelinkingMarkId, {
              selector,
              domPath: getElementPath(target),
              position: {
                x: e.clientX,
                y: e.clientY,
              },
              rect: {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              },
            });
            return;
          }

          const existingMark = currentMarks.find((mark) => mark.selector === selector);
          if (existingMark) {
            currentOnMarkSelect(existingMark.id);
            return;
          }

          if (currentPreviewReadonly) {
            message.info('历史版本预览中不可新增标记，请先还原到该版本');
            return;
          }

          const rect = target.getBoundingClientRect();
          currentOnMarkPrepare({
            selector,
            domPath: getElementPath(target),
            position: {
              x: e.clientX,
              y: e.clientY,
            },
            rect: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            },
          });
          return;
        }

        const info = getElementInfo(target, currentProjectName, currentPrototypesDir, filePath);

        if (!wantsMultiSelect) {
          try {
            await copySkillClipboardText(
              {
                skillCommand: currentViewerSkills.inspectCopySkillCommand,
                payload: info,
              },
              {
                successPrefix: '已复制 DOM skill 指令',
                terminalGuide: currentViewerSkills.copyTerminalGuide,
              }
            );
          } catch (error) {
            console.error('复制失败:', error);
            message.error('复制失败，请检查浏览器权限');
          }
        } else {
          if (currentSelectionMode !== 'multiple') {
            setSelectionMode('multiple');
          }
          setSelectedElements((prev) => {
            const isSelected = prev.some((item) => item.element === target);
            if (isSelected) {
              return prev.filter((item) => item.element !== target);
            }
            return [...prev, { element: target, info }];
          });
        }
      };

      const handleMouseLeave = () => {
        if (unmountedRef.current) return;
        setHoveredElement(null);
      };

      iframeDoc.addEventListener('mousemove', handleMouseMove);
      iframeDoc.addEventListener('click', handleClick, true);
      iframe.addEventListener('mouseleave', handleMouseLeave);

      const style = iframeDoc.createElement('style');
      style.textContent = '* { cursor: crosshair !important; }';
      iframeDoc.head.appendChild(style);

      currentCleanup = () => {
        iframeDoc.removeEventListener('mousemove', handleMouseMove);
        iframeDoc.removeEventListener('click', handleClick, true);
        iframe.removeEventListener('mouseleave', handleMouseLeave);
        style.remove();
      };
    };

    setupInspectMode();
    iframe.addEventListener('load', setupInspectMode);

    return () => {
      iframe.removeEventListener('load', setupInspectMode);
      if (currentCleanup) {
        currentCleanup();
      }
    };
  }, [inspectToolActive, markToolActive, filePath, marksVisibleInCurrentMode]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const updateMarkStates = () => {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      const nextMissingMarkIds: string[] = [];
      const nextHiddenMarkIds: string[] = [];

      for (const mark of marks) {
        const element = findElementBySelector(iframeDoc, mark.selector);
        if (!element) {
          nextMissingMarkIds.push(mark.id);
        } else if (!isElementVisible(element, iframeDoc) || isElementCovered(element, iframeDoc)) {
          nextHiddenMarkIds.push(mark.id);
        }
      }

      onMarkResolutionChange(nextMissingMarkIds);
      onMarkVisibilityChange?.(nextHiddenMarkIds);
    };

    updateMarkStates();
    iframe.addEventListener('load', updateMarkStates);

    return () => {
      iframe.removeEventListener('load', updateMarkStates);
    };
  }, [marks, onMarkResolutionChange, onMarkVisibilityChange, reloadVersion, filePath, overlayRefreshTick]);

  useEffect(() => {
    if (!inspectToolActive || selectionMode !== 'multiple') {
      setSelectedElements([]);
    }
  }, [inspectToolActive, selectionMode]);

  useEffect(() => {
    setSelectedElements([]);
    setHoveredElement(null);
  }, [filePath]);

  useEffect(() => {
    if (!inspectToolActive) return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    let currentCleanup: (() => void) | null = null;

    const setupKeyboardListeners = () => {
      if (currentCleanup) {
        currentCleanup();
        currentCleanup = null;
      }

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      const iframeWindow = iframe.contentWindow;
      if (!iframeDoc || !iframeWindow) return;

      const handleKeyDown = async (e: KeyboardEvent) => {
        if (isEditableTarget(e.target)) {
          return;
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
          if (selectionModeRef.current === 'multiple' && selectedElementsRef.current.length > 0) {
            e.preventDefault();

            const combinedInfo = formatMultipleElementsInfo(
              selectedElementsRef.current,
              projectNameRef.current,
              prototypesDirRef.current,
              filePathRef.current
            );

            try {
              await copySkillClipboardText(
                {
                  skillCommand: viewerSkillsRef.current.inspectCopySkillCommand,
                  payload: combinedInfo,
                },
                {
                  successPrefix: `已复制 ${selectedElementsRef.current.length} 个元素的 skill 指令`,
                  terminalGuide: viewerSkillsRef.current.copyTerminalGuide,
                }
              );
            } catch (error) {
              console.error('复制失败:', error);
              message.error('复制失败，请检查浏览器权限');
            }
          }
        }

        if (e.key === 'Escape') {
          if (selectionModeRef.current === 'multiple') {
            e.preventDefault();
            setSelectedElements([]);
            setSelectionMode('single');
            message.info(selectedElementsRef.current.length > 0 ? '已清空选择并退出批量选择' : '已退出批量选择');
          }
        }

      };

      window.addEventListener('keydown', handleKeyDown, true);
      iframeWindow.addEventListener('keydown', handleKeyDown, true);

      currentCleanup = () => {
        window.removeEventListener('keydown', handleKeyDown, true);
        iframeWindow.removeEventListener('keydown', handleKeyDown, true);
      };
    };

    setupKeyboardListeners();
    iframe.addEventListener('load', setupKeyboardListeners);

    return () => {
      iframe.removeEventListener('load', setupKeyboardListeners);
      if (currentCleanup) {
        currentCleanup();
      }
    };
  }, [inspectToolActive]);

  useEffect(() => {
    if (!markToolActive) return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    let currentCleanup: (() => void) | null = null;

    const setup = () => {
      if (currentCleanup) {
        currentCleanup();
        currentCleanup = null;
      }

      const iframeWin = iframe.contentWindow;
      if (!iframeWin) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        const isInputFocused = isEditableTarget(e.target);

        if ((e.code === 'KeyX' || e.key === 'x' || e.key === 'X') && !isInputFocused) {
          e.preventDefault();
          setMarksVisible((prev) => !prev);
        }

        if (e.key === 'ArrowUp' && !isInputFocused) {
          e.preventDefault();
          const currentMarks = marksRef.current;
          if (currentMarks.length === 0) return;

          const currentIndex = selectedMarkIdRef.current
            ? currentMarks.findIndex((m) => m.id === selectedMarkIdRef.current)
            : -1;
          const prevIndex = currentIndex <= 0 ? currentMarks.length - 1 : currentIndex - 1;
          onMarkSelectRef.current(currentMarks[prevIndex].id);
        }

        if (e.key === 'ArrowDown' && !isInputFocused) {
          e.preventDefault();
          const currentMarks = marksRef.current;
          if (currentMarks.length === 0) return;

          const currentIndex = selectedMarkIdRef.current
            ? currentMarks.findIndex((m) => m.id === selectedMarkIdRef.current)
            : -1;
          const nextIndex = currentIndex >= currentMarks.length - 1 ? 0 : currentIndex + 1;
          onMarkSelectRef.current(currentMarks[nextIndex].id);
        }

        if (e.key === 'Escape') {
          if (pendingMarkInfoRef.current) {
            e.preventDefault();
            onMarkCancelRef.current();
          } else if (selectedMarkIdRef.current) {
            e.preventDefault();
            onMarkSelectRef.current(null);
          }
        }

        if ((e.key === 'h' || e.key === 'H') && !isInputFocused) {
          e.preventDefault();
          onToggleMarkPanelRef.current?.();
        }
      };

      window.addEventListener('keydown', handleKeyDown, true);
      iframeWin.addEventListener('keydown', handleKeyDown, true);

      currentCleanup = () => {
        window.removeEventListener('keydown', handleKeyDown, true);
        iframeWin.removeEventListener('keydown', handleKeyDown, true);
      };
    };

    setup();
    iframe.addEventListener('load', setup);

    return () => {
      iframe.removeEventListener('load', setup);
      if (currentCleanup) {
        currentCleanup();
      }
    };
  }, [markToolActive]);

  useEffect(() => {
    if (!inspectToolActive) {
      setSelectedElements([]);
      setSelectionMode('single');
    }
  }, [inspectToolActive]);

  useEffect(() => {
    if (!markToolActive) {
      setHoveredElement(null);
      setMarksVisible(true);
    }
  }, [markToolActive]);

  // auto-expand 逻辑由 App.tsx 统一处理

  const handleCopyAll = async () => {
    if (selectedElements.length === 0) {
      message.warning('请先选择元素');
      return;
    }

    const combinedInfo = formatMultipleElementsInfo(
      selectedElements,
      projectName,
      prototypesDir,
      filePath
    );

    try {
      await copySkillClipboardText(
        {
          skillCommand: viewerSkills.inspectCopySkillCommand,
          payload: combinedInfo,
        },
        {
          successPrefix: `已复制 ${selectedElements.length} 个元素的 skill 指令`,
          terminalGuide: viewerSkills.copyTerminalGuide,
        }
      );
    } catch (error) {
      console.error('复制失败:', error);
      message.error('复制失败，请检查浏览器权限');
    }
  };

  if (!filePath) {
    return (
      <div className="preview-empty">
        <Empty
          description={(
            <span>
              当前还没有可预览的页面
              <br />
              选择或创建一个原型页面后，这里会显示正常预览画布
            </span>
          )}
        />
      </div>
    );
  }

  const previewBasePath = import.meta.env.DEV ? '/preview' : '/prototypes';
  const previewUrl = previewUrlOverride
    ? `${previewUrlOverride}${iframeReloadToken ? `${previewUrlOverride.includes('?') ? '&' : '?'}t=${iframeReloadToken}` : ''}`
    : `${previewBasePath}/${filePath}/index.html${iframeReloadToken ? `?t=${iframeReloadToken}` : ''}`;
  return (
    <div className="preview-container">
      <div className={`preview-inspect-banner${markToolActive ? ' mark-mode' : ''}`}>
        <div className="preview-inspect-banner-text">
          <div className="preview-inspect-banner-left">
              <div className="preview-tool-toggle-group" aria-label="预览工具切换">
                <Tooltip title="预览模式" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  className={`preview-tool-toggle-btn${activeTool === 'none' ? ' active' : ''}`}
                  onClick={() => onToolChange('none')}
                >
                  预览
                </Button>
                </Tooltip>
                <Tooltip title="编辑模式 (Shift+Tab 切换)" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  className={`preview-tool-toggle-btn${inspectToolActive ? ' active' : ''}`}
                  onClick={() => onToolChange('inspect')}
                >
                  编辑
                </Button>
                </Tooltip>
                <Tooltip title="标记模式 (Shift+Tab 切换)" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  className={`preview-tool-toggle-btn${markToolActive ? ' active' : ''}`}
                  onClick={() => onToolChange('mark')}
                >
                  标记
                </Button>
                </Tooltip>
              </div>
{inspectToolActive ? (
              <>
                {selectionMode === 'multiple' && selectedElements.length > 0 ? (
                  <span className="preview-inspect-banner-count">已选 {selectedElements.length} 个元素</span>
                ) : null}
                <span className="preview-inspect-banner-status">
                  点击元素复制 · <kbd className="hotkey-key">Shift</kbd>+点击多选 · <kbd className="hotkey-key">空格</kbd>拖拽画布
                </span>
              </>
            ) : markToolActive ? (
              <>
                <span className="preview-inspect-banner-status">
                  {previewReadonly
                    ? (marksVisible ? '历史版本预览中，仅支持查看标记' : '历史版本预览中')
                    : relinkingMarkId
                      ? '请点击页面中的新元素，重新绑定当前标记'
                      : (marksVisible ? '点击页面元素创建标记或查看详情' : '标记已隐藏')}
                  · <kbd className="hotkey-key">空格</kbd>拖拽画布
                </span>
              </>
            ) : (
              <>
                <span className="preview-inspect-banner-status">
                  只读预览画布，支持缩放与平移浏览 · <kbd className="hotkey-key">空格</kbd>拖拽画布
                </span>
              </>
            )}
          </div>
          <div className="preview-inspect-banner-hotkeys">
            {showDisconnected ? (
              <div className="preview-ws-disconnected">
                热更新已断开
              </div>
            ) : null}
            <div className="preview-inspect-banner-controls">
              {inspectToolActive ? (
                <>
                  <Tooltip title="开启后连续点击即可多选，Shift+点击也可临时多选" getPopupContainer={() => document.body}>
                    <Button
                      type="text"
                      className={`preview-selection-toggle-btn${selectionMode === 'multiple' ? ' active' : ''}`}
                      onClick={() => {
                        setSelectionMode((currentMode) => {
                          const nextMode = currentMode === 'multiple' ? 'single' : 'multiple';
                          if (nextMode === 'single') {
                            setSelectedElements([]);
                          }
                          return nextMode;
                        });
                      }}
                    >
                      {selectionMode === 'multiple' ? '退出批量选择' : '批量选择'}
                    </Button>
                  </Tooltip>
                  {selectionMode === 'multiple' ? (
                    <>
                      <Tooltip title={'复制 (' + getModifierKey() + '+C)'} getPopupContainer={() => document.body}>
                        <Button
                          type="text"
                          className="preview-copy-batch-button"
                          icon={<CopyOutlined />}
                          onClick={handleCopyAll}
                          disabled={selectedElements.length === 0}
                        >
                          复制给 AI
                        </Button>
                      </Tooltip>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
            <span className="preview-inspect-banner-hotkey-divider" />
            <div className="preview-zoom-controls" aria-label="预览缩放控制">
              <Tooltip title="缩小 (⌘/Ctrl -)" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  className="preview-zoom-step-button"
                  onClick={onZoomOut}
                  disabled={!canZoomOut}
                >
                  -
                </Button>
              </Tooltip>
              <Dropdown placement="bottom" menu={{ items: zoomMenuItems }} trigger={['click']}>
                <button type="button" className="preview-zoom-value-button" aria-label="选择缩放比例">
                  <span>{Math.round(zoomPercent)}%</span>
                  <span className="preview-zoom-value-icon">⌄</span>
                </button>
              </Dropdown>
              <Tooltip title="放大 (⌘/Ctrl +)" getPopupContainer={() => document.body}>
                <Button
                  type="text"
                  className="preview-zoom-step-button"
                  onClick={onZoomIn}
                  disabled={!canZoomIn}
                >
                  +
                </Button>
              </Tooltip>
              {onZoomReset ? (
                <Tooltip title="适应屏幕 (⌘/Ctrl 0)" getPopupContainer={() => document.body}>
                  <Button type="text" icon={<CompressOutlined />} onClick={onZoomReset} />
                </Tooltip>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="preview-body">
        <div
          ref={stageRef}
          className={`preview-stage desktop ${isPanModeActive ? 'pannable' : ''} ${isDraggingCanvas ? 'dragging' : ''}`}
        >
          <div className="preview-stage-caption">
            <span className="preview-stage-caption-line" />
            <span className="preview-stage-caption-text">
              {previewReadonly ? '历史版本只读预览' : '当前原型预览'}
            </span>
          </div>

          <div
            ref={canvasRef}
            className="preview-canvas"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            }}
            onPointerDown={(event) => {
              if (!isPannable || isMarkInteractionTarget(event.target)) return;
              event.preventDefault();
              onCanvasPanStart({ x: event.clientX, y: event.clientY });
            }}
          >
            <div
              className="preview-frame-shell desktop"
              style={{
                width: viewportSize.width,
                height: viewportSize.height,
                transform: `scale(${canvasScale})`,
              }}
            >
              <iframe
                ref={iframeRef}
                src={previewUrl}
                className="preview-iframe"
                title="原型预览"
              />
              <div
                className={`preview-pan-surface ${isPanModeActive ? 'active' : ''}`}
                onPointerDown={(event) => {
                  if (!isPanModeActive || isMarkInteractionTarget(event.target)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onCanvasPanStart({ x: event.clientX, y: event.clientY });
                }}
                onPointerUp={() => {
                  if (isDraggingCanvas) {
                    onCanvasPanEnd();
                  }
                }}
              />
            </div>

            {inspectToolActive && selectionMode === 'multiple' && selectedElements.map(({ element }, index) => {
              try {
                const overlayRect = getOverlayRect(element);
                if (!overlayRect) return null;

                return (
                  <div
                    key={index}
                    className="preview-highlight-overlay selected"
                    style={{ ...overlayRect, display: 'block' }}
                  >
                    <div className="preview-highlight-tag selected">
                      {element.tagName.toLowerCase()}
                      {element.id && `#${element.id}`}
                      {element.className && `.${element.className.split(' ')[0]}`}
                    </div>
                  </div>
                );
              } catch (error) {
                console.error('Error rendering selected element:', error);
                return null;
              }
            })}

            {(inspectToolActive || (markToolActive && marksVisibleInCurrentMode)) && hoveredElement && !pendingMarkInfo && (() => {
              const overlayRect = getOverlayRect(hoveredElement);
              if (!overlayRect) return null;

              return (
                <div
                  className={`preview-highlight-overlay ${markToolActive ? 'mark-mode' : ''}`}
                  style={{ ...overlayRect, display: 'block' }}
                >
                  <div className={`preview-highlight-tag ${markToolActive ? 'mark-mode' : ''}`}>
                    {hoveredElement.tagName.toLowerCase()}
                    {hoveredElement.id && `#${hoveredElement.id}`}
                    {hoveredElement.className && `.${hoveredElement.className.split(' ')[0]}`}
                  </div>
                </div>
              );
            })()}

            {markToolActive && marksVisibleInCurrentMode && pendingMarkInfo && (() => {
              try {
                const iframe = iframeRef.current;
                if (!iframe) return null;

                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc) return null;

                const element = findElementBySelector(iframeDoc, pendingMarkInfo.selector);
                if (!element) return null;

                const overlayRect = getOverlayRect(element);
                if (!overlayRect) return null;

                const computedStyle = iframeDoc.defaultView?.getComputedStyle(element);
                const elementZIndex = computedStyle?.zIndex;
                const zIndexValue = elementZIndex && elementZIndex !== 'auto'
                  ? parseInt(elementZIndex, 10)
                  : 1;

                return (
                  <div
                    className="preview-mark-highlight pending"
                    style={{
                      ...overlayRect,
                      display: 'block',
                      zIndex: zIndexValue,
                    }}
                  >
                    <div className="preview-mark-number pending">
                      {marks.length + 1}
                    </div>
                  </div>
                );
              } catch (error) {
                console.error('Error rendering pending mark highlight:', error);
                return null;
              }
            })()}

            {markToolActive && markOverlaysVisible && marks.map((mark, index) => {
              try {
                const iframe = iframeRef.current;
                if (!iframe) return (
                  <div
                    key={mark.id}
                    data-mark-id={mark.id}
                    className={`preview-mark-highlight ${selectedMarkId === mark.id ? 'selected' : ''}`}
                    style={getFallbackOverlayRect(mark, canvasScale)}
                    onClick={() => onMarkSelect(mark.id)}
                  >
                    <div className={`preview-mark-number ${selectedMarkId === mark.id ? 'selected' : ''}`}>
                      {index + 1}
                    </div>
                  </div>
                );

                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc) return null;

                const element = findElementBySelector(iframeDoc, mark.selector);
                if (!element || !isElementVisible(element, iframeDoc) || isElementCovered(element, iframeDoc)) return null;

                const overlayRect = getOverlayRect(element);
                if (!overlayRect) return null;

                const computedStyle = iframeDoc.defaultView?.getComputedStyle(element);
                const elementZIndex = computedStyle?.zIndex;
                const zIndexValue = elementZIndex && elementZIndex !== 'auto'
                  ? parseInt(elementZIndex, 10)
                  : 1;

                return (
                  <div
                    key={mark.id}
                    data-mark-id={mark.id}
                    className={`preview-mark-highlight ${selectedMarkId === mark.id ? 'selected' : ''}`}
                    style={{
                      ...overlayRect,
                      display: 'block',
                      zIndex: zIndexValue,
                    }}
                    onClick={() => onMarkSelect(mark.id)}
                  >
                    <div className={`preview-mark-number ${selectedMarkId === mark.id ? 'selected' : ''}`}>
                      {index + 1}
                    </div>
                  </div>
                );
              } catch (error) {
                console.error('Error rendering mark:', error);
                return null;
              }
            })}
          </div>

        </div>

        {shouldRenderMarkPanel ? (
          <div
            className={`preview-mark-floating-panel ${markPanelCollapsed ? 'collapsed' : ''}`}
            style={markPanelCollapsed ? undefined : { width: markPanelWidth }}
          >
            {!markPanelCollapsed ? (
              <div
                onMouseDown={onMarkPanelResizeStart}
                className={`app-resize-handle mark-panel-resize ${markPanelResizing ? 'resizing' : ''}`}
              />
            ) : null}
            <MarkPanel
              marks={marks}
              selectedMarkId={selectedMarkId}
              pendingMarkInfo={pendingMarkInfo}
              relinkingMarkId={relinkingMarkId}
              missingMarkIds={missingMarkIds}
              hiddenMarkIds={hiddenMarkIds}
              viewerSkills={viewerSkills}
              onMarkSelect={onMarkSelect}
              onMarkCreate={onMarkCreate}
              onMarkUpdate={onMarkUpdate}
              onMarkDelete={onMarkDelete}
              onMarkRelinkStart={onMarkRelinkStart}
              onMarkRelinkCancel={onMarkRelinkCancel}
              onMarkCancel={onMarkCancel}
              onRefresh={onMarkRefresh}
              collapsed={markPanelCollapsed}
              onCollapsedChange={(collapsed) => onMarkPanelCollapsedChange?.(collapsed)}
              projectName={projectName}
              filePath={filePath}
              prototypesDir={prototypesDir}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

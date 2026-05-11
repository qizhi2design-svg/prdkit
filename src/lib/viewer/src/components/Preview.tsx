import { useEffect, useRef, useState } from 'react';
import { Empty, message, Segmented, Button } from 'antd';
import './Preview.css';
import { getElementInfo, getElementPath, formatMultipleElementsInfo, generateUniqueSelector, findElementBySelector, type ElementInfo } from '../utils/domUtils';
import { getModifierKey } from '../utils/platform';
import { copySkillClipboardText } from '../utils/clipboard';
import Hotkey from './Hotkey';
import type { ViewMode, Mark, PendingMarkInfo, ViewerSkillConfig } from '../types';

interface PreviewProps {
  filePath: string | null;
  viewMode: ViewMode;
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
  onMarkSelect: (markId: string) => void;
  onMarkCancel: () => void;
  onMarkResolutionChange: (missingMarkIds: string[]) => void;
  onToggleMarkPanel?: () => void;
  markPanelCollapsed?: boolean;
  htmlContent?: string; // 用于发布模式的 HTML 内容
  previewUrlOverride?: string | null;
  previewReadonly?: boolean;
}

type SelectedElement = ElementInfo;
type PreviewViewport = 'desktop' | 'mobile';

const VIEWPORT_DIMENSIONS: Record<PreviewViewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

export default function Preview({
  filePath,
  viewMode,
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
  onToggleMarkPanel,
  markPanelCollapsed = true,
  previewUrlOverride = null,
  previewReadonly = false,
}: PreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const unmountedRef = useRef(false);

  // 使用 ref 存储最新的 props 和状态，避免频繁重新注册事件监听器
  const viewModeRef = useRef(viewMode);
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
  const filePathRef = useRef(filePath);

  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('single');
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([]);
  const selectedElementsRef = useRef(selectedElements);
  const [marksVisible, setMarksVisible] = useState(true); // 标记是否可见
  const [previewViewport] = useState<PreviewViewport>('desktop');
  const [zoomPercent] = useState(100);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [, setOverlayRefreshTick] = useState(0);
  const [iframeReloadToken, setIframeReloadToken] = useState(0);

  // WebSocket 断开提示增加 2s 延迟，避免初次加载时闪烁
  const [showDisconnected, setShowDisconnected] = useState(false);
  useEffect(() => {
    if (!wsConnected) {
      const timer = setTimeout(() => setShowDisconnected(true), 2000);
      return () => clearTimeout(timer);
    }
    setShowDisconnected(false);
  }, [wsConnected]);

  // 更新 refs
  useEffect(() => {
    viewModeRef.current = viewMode;
    marksRef.current = marks;
    relinkingMarkIdRef.current = relinkingMarkId;
    onMarkPrepareRef.current = onMarkPrepare;
    onMarkRelinkRef.current = onMarkRelink;
    onMarkSelectRef.current = onMarkSelect;
    onMarkCancelRef.current = onMarkCancel;
    onToggleMarkPanelRef.current = onToggleMarkPanel;
    previewReadonlyRef.current = previewReadonly;
    projectNameRef.current = projectName;
    prototypesDirRef.current = prototypesDir;
    selectionModeRef.current = selectionMode;
    viewerSkillsRef.current = viewerSkills;
    selectedMarkIdRef.current = selectedMarkId;
    pendingMarkInfoRef.current = pendingMarkInfo;
    selectedElementsRef.current = selectedElements;
    filePathRef.current = filePath;
  });

  const marksVisibleInCurrentMode = viewMode === 'mark' ? marksVisible : false;
  const markOverlaysVisible = viewMode === 'mark' && marksVisible;

  const isEditableTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    if (!element || typeof element.tagName !== 'string') return false;

    const tagName = element.tagName;
    return tagName === 'INPUT'
      || tagName === 'TEXTAREA'
      || tagName === 'SELECT'
      || element.isContentEditable;
  };

  const isToggleMarksKey = (event: KeyboardEvent) => {
    return event.code === 'KeyX' || event.key === 'x' || event.key === 'X';
  };

  const requestOverlayRefresh = () => {
    if (unmountedRef.current) return;
    setOverlayRefreshTick(prev => prev + 1);
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
    console.log('收到刷新通知，重新加载预览');
    setIframeReloadToken(Date.now());
  }, [reloadVersion]);

  useEffect(() => {
    requestOverlayRefresh();
  }, [previewViewport, zoomPercent]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateStageSize = () => {
      setStageSize({
        width: stage.clientWidth,
        height: stage.clientHeight,
      });
    };

    const resizeObserver = new ResizeObserver(updateStageSize);
    resizeObserver.observe(stage);
    updateStageSize();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // 当预览容器、iframe 尺寸或 iframe 内部滚动/重排变化时，强制重绘 overlay
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
      if (unmountedRef.current) return;
      if (transitionLoopId !== null) return;

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

      const resizeObserver = new ResizeObserver(() => {
        scheduleRefresh();
      });
      resizeObserver.observe(iframeDoc.documentElement);
      if (iframeDoc.body) {
        resizeObserver.observe(iframeDoc.body);
      }

      const mutationObserver = new MutationObserver(() => {
        scheduleRefresh();
      });
      mutationObserver.observe(iframeDoc.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });

      iframeWindow.addEventListener('scroll', scheduleRefresh, { passive: true });
      iframeWindow.addEventListener('resize', scheduleRefresh);

      iframeObserversCleanup = () => {
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        iframeWindow.removeEventListener('scroll', scheduleRefresh);
        iframeWindow.removeEventListener('resize', scheduleRefresh);
      };

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
  }, [filePath]);

  // 元素检查模式和标记模式
  useEffect(() => {
    const iframe = iframeRef.current;
    const isInteractiveMode = viewMode === 'inspect' || (viewMode === 'mark' && marksVisibleInCurrentMode);

    if (!iframe || !isInteractiveMode) {
      setHoveredElement(null);
      return;
    }

    // 等待 iframe 加载完成后再添加事件监听器
    let currentCleanup: (() => void) | null = null;

    const setupInspectMode = () => {
      if (unmountedRef.current) return;
      // 先清理旧的监听器
      if (currentCleanup) {
        currentCleanup();
        currentCleanup = null;
      }

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc || !iframeDoc.head) return;

    // 鼠标移动事件
    const handleMouseMove = (e: MouseEvent) => {
      if (unmountedRef.current) return;
      const target = e.target as HTMLElement;
      if (target && target !== iframeDoc.body && target !== iframeDoc.documentElement) {
        setHoveredElement(target);
      } else {
        // 鼠标移到 body 或 documentElement 时清除高亮
        setHoveredElement(null);
      }
    };

    // 点击事件
    const handleClick = async (e: MouseEvent) => {
      if (unmountedRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const target = e.target as HTMLElement;
      if (!target) return;

      // 从 ref 读取最新值
      const currentViewMode = viewModeRef.current;
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

      // 标记模式：检查是否已有标记，有则显示详情，无则准备创建
      if (currentViewMode === 'mark') {
        // 生成唯一选择器
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

        // 检查是否已经有标记使用这个选择器
        const existingMark = currentMarks.find(mark => mark.selector === selector);

        if (existingMark) {
          // 如果已有标记，切换到详情视图
          currentOnMarkSelect(existingMark.id);
          return;
        }

        if (currentPreviewReadonly) {
          message.info('历史版本预览中不可新增标记，请先还原到该版本');
          return;
        }

        // 如果没有标记，准备创建新标记
        const rect = target.getBoundingClientRect();
        const domPath = getElementPath(target);

        // 调用 onMarkPrepare 传递待创建标记信息
        currentOnMarkPrepare({
          selector: selector,
          domPath: domPath,
          position: {
            x: e.clientX,
            y: e.clientY
          },
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }
        });
        return;
      }

      // 编辑模式：复制 DOM 信息
      const info = getElementInfo(target, currentProjectName, currentPrototypesDir, filePath);

      if (currentSelectionMode === 'single') {
        // 单选模式：直接复制
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
        // 多选模式：添加到选中列表
        setSelectedElements(prev => {
          // 检查是否已选中
          const isSelected = prev.some(item => item.element === target);
          if (isSelected) {
            // 取消选中
            return prev.filter(item => item.element !== target);
          } else {
            // 添加选中
            return [...prev, { element: target, info }];
          }
        });
      }
    };

    // 鼠标移出 iframe 时清除高亮
    const handleMouseLeave = () => {
      if (unmountedRef.current) return;
      setHoveredElement(null);
    };

    // 添加事件监听
      iframeDoc.addEventListener('mousemove', handleMouseMove);
      iframeDoc.addEventListener('click', handleClick, true);
      iframe.addEventListener('mouseleave', handleMouseLeave);

      // 添加样式来改变鼠标指针
      const style = iframeDoc.createElement('style');
      style.textContent = '* { cursor: crosshair !important; }';
      iframeDoc.head.appendChild(style);

      // 保存 cleanup 函数
      currentCleanup = () => {
        iframeDoc.removeEventListener('mousemove', handleMouseMove);
        iframeDoc.removeEventListener('click', handleClick, true);
        iframe.removeEventListener('mouseleave', handleMouseLeave);
        style.remove();
      };
    };

    // 立即尝试设置（如果 iframe 已加载）
    setupInspectMode();

    // 监听 iframe load 事件（处理文件切换的情况）
    iframe.addEventListener('load', setupInspectMode);

    return () => {
      iframe.removeEventListener('load', setupInspectMode);
      if (currentCleanup) {
        currentCleanup();
      }
    };
  }, [viewMode, filePath, marksVisibleInCurrentMode]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const updateMissingMarks = () => {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      const nextMissingMarkIds = marks
        .filter((mark) => {
          return !findElementBySelector(iframeDoc, mark.selector);
        })
        .map((mark) => mark.id);

      onMarkResolutionChange(nextMissingMarkIds);
    };

    updateMissingMarks();
    iframe.addEventListener('load', updateMissingMarks);

    return () => {
      iframe.removeEventListener('load', updateMissingMarks);
    };
  }, [marks, onMarkResolutionChange, reloadVersion, filePath]);

  // 清理选中元素（当切换模式时）
  useEffect(() => {
    if (viewMode !== 'inspect' || selectionMode !== 'multiple') {
      setSelectedElements([]);
    }
  }, [viewMode, selectionMode]);

  // 切换文件时清空选中元素
  useEffect(() => {
    setSelectedElements([]);
    setHoveredElement(null);
  }, [filePath]);

  // 编辑模式键盘快捷键监听（通过 ref 读取数据，仅 viewMode 变化时重建）
  useEffect(() => {
    if (viewMode !== 'inspect') return;

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

        // Ctrl/Cmd+C: 复制选中的元素
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

        // ESC: 清空选择
        if (e.key === 'Escape') {
          if (selectedElementsRef.current.length > 0) {
            e.preventDefault();
            setSelectedElements([]);
            message.info('已清空选择');
          }
        }

        // Shift+Tab: 切换单选/多选模式
        if (e.shiftKey && e.key === 'Tab') {
          e.preventDefault();
          const newMode = selectionModeRef.current === 'single' ? 'multiple' : 'single';
          setSelectionMode(newMode);
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

    // 监听 iframe load 事件，重新加载后自动重注册
    iframe.addEventListener('load', setupKeyboardListeners);

    return () => {
      iframe.removeEventListener('load', setupKeyboardListeners);
      if (currentCleanup) {
        currentCleanup();
      }
    };
  }, [viewMode]);

  // 标记模式键盘快捷键监听（通过 ref 读取数据，仅 viewMode 变化时重建）
  useEffect(() => {
    if (viewMode !== 'mark') return;

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

        // X 键: 切换标记显示/隐藏
        if (isToggleMarksKey(e)) {
          if (!isInputFocused) {
            e.preventDefault();
            setMarksVisible(prev => !prev);
          }
        }

        // 上箭头: 选择上一个标记（不在输入框中时）
        if (e.key === 'ArrowUp' && !isInputFocused) {
          e.preventDefault();
          const marks = marksRef.current;
          if (marks.length === 0) return;

          const currentIndex = selectedMarkIdRef.current
            ? marks.findIndex(m => m.id === selectedMarkIdRef.current)
            : -1;

          const prevIndex = currentIndex <= 0 ? marks.length - 1 : currentIndex - 1;
          onMarkSelectRef.current(marks[prevIndex].id);
        }

        // 下箭头: 选择下一个标记（不在输入框中时）
        if (e.key === 'ArrowDown' && !isInputFocused) {
          e.preventDefault();
          const marks = marksRef.current;
          if (marks.length === 0) return;

          const currentIndex = selectedMarkIdRef.current
            ? marks.findIndex(m => m.id === selectedMarkIdRef.current)
            : -1;

          const nextIndex = currentIndex >= marks.length - 1 ? 0 : currentIndex + 1;
          onMarkSelectRef.current(marks[nextIndex].id);
        }

        // ESC: 退出详情/新增，返回列表（任何时候都可以）
        if (e.key === 'Escape') {
          if (pendingMarkInfoRef.current) {
            e.preventDefault();
            onMarkCancelRef.current();
          } else if (selectedMarkIdRef.current) {
            e.preventDefault();
            onMarkSelectRef.current('');
          }
        }

        // H 键: 返回列表并折叠面板
        if (e.key === 'h' || e.key === 'H') {
          if (!isInputFocused) {
            e.preventDefault();
            if (pendingMarkInfoRef.current) {
              onMarkCancelRef.current();
            } else if (selectedMarkIdRef.current) {
              onMarkSelectRef.current('');
            }
            onToggleMarkPanelRef.current?.();
          }
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

    // iframe 重新加载后自动重注册
    iframe.addEventListener('load', setup);

    return () => {
      iframe.removeEventListener('load', setup);
      if (currentCleanup) {
        currentCleanup();
      }
    };
  }, [viewMode]);

  // 复制所有选中的元素信息
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

  // 清空选择
  const handleClearSelection = () => {
    setSelectedElements([]);
    message.info('已清空选择');
  };

  // 切换选择模式时清空选择
  const handleSelectionModeChange = (mode: 'single' | 'multiple') => {
    setSelectionMode(mode);
    if (mode === 'single') {
      setSelectedElements([]);
    }
  };

  if (!filePath) {
    return (
      <div className="preview-empty">
        <Empty description="请选择一个原型文件" />
      </div>
    );
  }

  const previewBasePath = import.meta.env.DEV ? '/preview' : '/prototypes';
  const previewUrl = previewUrlOverride
    ? `${previewUrlOverride}${iframeReloadToken ? `${previewUrlOverride.includes('?') ? '&' : '?'}t=${iframeReloadToken}` : ''}`
    : `${previewBasePath}/${filePath}/index.html${iframeReloadToken ? `?t=${iframeReloadToken}` : ''}`;
  const stageHasBanner = viewMode !== 'preview';
  const viewportSize = VIEWPORT_DIMENSIONS[previewViewport];
  const horizontalPadding = previewViewport === 'mobile' ? 64 : 48;
  const verticalPadding = 96;
  const availableWidth = Math.max(stageSize.width - horizontalPadding, 0);
  const availableHeight = Math.max(stageSize.height - verticalPadding, 0);
  const fitScale = stageSize.width && stageSize.height
    ? Math.min(
        availableWidth / viewportSize.width,
        availableHeight / viewportSize.height
      )
    : 1;
  const canvasScale = Math.max(fitScale, 0.1) * (zoomPercent / 100);
  const scaledCanvasWidth = viewportSize.width * canvasScale;
  const scaledCanvasHeight = viewportSize.height * canvasScale;

  const getOverlayRect = (element: Element) => {
    const iframe = iframeRef.current;
    const canvas = canvasRef.current;
    if (!iframe || !canvas) return null;

    const elementRect = element.getBoundingClientRect();
    const iframeRect = iframe.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    const iframeViewportWidth = iframeDoc?.documentElement?.clientWidth || iframe.clientWidth || viewportSize.width;
    const iframeViewportHeight = iframeDoc?.documentElement?.clientHeight || iframe.clientHeight || viewportSize.height;
    const scaleX = iframeViewportWidth > 0 ? iframeRect.width / iframeViewportWidth : 1;
    const scaleY = iframeViewportHeight > 0 ? iframeRect.height / iframeViewportHeight : 1;

    const left = iframeRect.left - canvasRect.left + (elementRect.left * scaleX);
    const top = iframeRect.top - canvasRect.top + (elementRect.top * scaleY);
    const width = elementRect.width * scaleX;
    const height = elementRect.height * scaleY;
    const borderCompensation = 2;

    return {
      // overlay 直接挂到 preview-canvas 上，避免 stage 的 padding / 居中布局带入额外 left 偏移
      // 同时把矩形向外补一点，避免 2px/3px 边框都画在元素内部，导致视觉上“左边没贴齐”
      left: Math.max(left - borderCompensation / 2, 0),
      top: Math.max(top - borderCompensation / 2, 0),
      width: width + borderCompensation,
      height: height + borderCompensation,
    };
  };

  return (
    <div className="preview-container">
      {/* 检查模式提示条 */}
      {viewMode === 'inspect' && (
        <div className="preview-inspect-banner">
          <span className="preview-inspect-banner-text">
            点击页面元素复制 DOM 信息
            <Hotkey keys={['Shift', 'Tab']} description="切换模式" />
            {selectionMode === 'multiple' && (
              <>
                <Hotkey keys={[getModifierKey(), 'C']} description="复制" />
                <Hotkey keys={['ESC']} description="清空" />
              </>
            )}
          </span>

          <div className="preview-inspect-banner-controls">
            <Segmented
              options={[
                { label: '单选', value: 'single' },
                { label: '多选', value: 'multiple' }
              ]}
              value={selectionMode}
              onChange={(value) => handleSelectionModeChange(value as 'single' | 'multiple')}
              size="small"
            />

            {selectionMode === 'multiple' && (
              <>
                {selectedElements.length > 0 && (
                  <span className="preview-inspect-banner-count">
                    已选: {selectedElements.length} 个元素
                  </span>
                )}
                <Button
                  type="primary"
                  size="small"
                  onClick={handleCopyAll}
                  disabled={selectedElements.length === 0}
                  className="preview-ai-action-button"
                >
                  复制所有给 AI
                </Button>
                <Button
                  size="small"
                  onClick={handleClearSelection}
                  disabled={selectedElements.length === 0}
                >
                  清空
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 标记模式提示条 */}
      {viewMode === 'mark' && (
        <div className="preview-inspect-banner mark-mode">
          <span className="preview-inspect-banner-text">
            {previewReadonly
              ? (marksVisible ? '历史版本预览中，仅支持查看标记' : '历史版本预览中')
              : relinkingMarkId
                ? '请点击页面中的新元素，重新绑定当前标记'
                : (marksVisible ? '点击页面元素创建标记' : '预览模式')}
            {marks.length > 0 && marksVisible && (
              <>
                <Hotkey keys={['↑']} description="上一个" />
                <Hotkey keys={['↓']} description="下一个" />
              </>
            )}
            {(selectedMarkId || pendingMarkInfo) && (
              <Hotkey keys={['ESC']} description="返回列表" />
            )}
            {selectedMarkId && (
              <Hotkey keys={['Delete']} description="删除标记" />
            )}
            <Hotkey keys={['X']} description={marksVisible ? '隐藏标记' : '显示标记'} />
            <Hotkey keys={['H']} description={markPanelCollapsed ? '展开面板' : '折叠面板'} />
          </span>

          <div className="preview-inspect-banner-controls">
            <Button
              size="small"
              onClick={() => setMarksVisible(prev => !prev)}
            >
              {marksVisible ? '隐藏标记' : '显示标记'}
            </Button>
            <Button
              size="small"
              onClick={onToggleMarkPanel}
            >
              {markPanelCollapsed ? '展开面板' : '折叠面板'}
            </Button>
          </div>
        </div>
      )}

      {showDisconnected && (
        <div className="preview-floating-status">
          <div className="preview-ws-disconnected">
            热更新已断开
          </div>
        </div>
      )}

      <div
        ref={stageRef}
        className={`preview-stage ${stageHasBanner ? 'with-banner' : ''} ${previewViewport}`}
      >
        <div
          ref={canvasRef}
          className="preview-canvas"
          style={{
            width: scaledCanvasWidth,
            height: scaledCanvasHeight,
          }}
        >
          <div
            className={`preview-frame-shell ${previewViewport}`}
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
          </div>
          {/* 选中元素的高亮覆盖层（绿色） */}
          {viewMode === 'inspect' && selectionMode === 'multiple' && selectedElements.map(({ element }, index) => {
            try {
              const overlayRect = getOverlayRect(element);
              if (!overlayRect) return null;

              return (
                <div
                  key={index}
                  className="preview-highlight-overlay selected"
                  style={overlayRect}
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

          {/* 悬停元素的高亮覆盖层（编辑模式：蓝色，标记模式：绿色） */}
          {((viewMode === 'inspect') || (viewMode === 'mark' && marksVisibleInCurrentMode)) && hoveredElement && !pendingMarkInfo && (() => {
            const overlayRect = getOverlayRect(hoveredElement);
            if (!overlayRect) return null;

            return (
              <div
                className={`preview-highlight-overlay ${viewMode === 'mark' ? 'mark-mode' : ''}`}
                style={overlayRect}
              >
                <div className={`preview-highlight-tag ${viewMode === 'mark' ? 'mark-mode' : ''}`}>
                  {hoveredElement.tagName.toLowerCase()}
                  {hoveredElement.id && `#${hoveredElement.id}`}
                  {hoveredElement.className && `.${hoveredElement.className.split(' ')[0]}`}
                </div>
              </div>
            );
          })()}

          {/* 待创建标记的高亮框 */}
          {viewMode === 'mark' && marksVisibleInCurrentMode && pendingMarkInfo && (() => {
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

          {/* 标记高亮框覆盖层 */}
          {(viewMode === 'mark') && markOverlaysVisible && marks.map((mark) => {
            try {
              const iframe = iframeRef.current;
              if (!iframe) return null;

              const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (!iframeDoc) return null;

              const element = findElementBySelector(iframeDoc, mark.selector);
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
                  key={mark.id}
                  className={`preview-mark-highlight ${selectedMarkId === mark.id ? 'selected' : ''}`}
                  style={{
                    ...overlayRect,
                    zIndex: zIndexValue,
                  }}
                  onClick={viewMode === 'mark' ? () => onMarkSelect(mark.id) : undefined}
                >
                  <div className="preview-mark-number">
                    {marks.indexOf(mark) + 1}
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
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Empty, message, Segmented, Button, Select } from 'antd';
import { DesktopOutlined, MobileOutlined } from '@ant-design/icons';
import './Preview.css';
import { getElementInfo, getElementPath, formatMultipleElementsInfo, generateUniqueSelector, type ElementInfo } from '../utils/domUtils';
import { getModifierKey } from '../utils/platform';
import Hotkey from './Hotkey';
import type { ViewMode, Mark, PendingMarkInfo } from '../types';

interface PreviewProps {
  filePath: string | null;
  viewMode: ViewMode;
  projectName: string;
  prototypesDir: string;
  wsConnected: boolean;
  reloadVersion: number;
  marks: Mark[];
  selectedMarkId: string | null;
  pendingMarkInfo: PendingMarkInfo | null;
  onMarkPrepare: (info: PendingMarkInfo) => void;
  onMarkSelect: (markId: string) => void;
  onMarkCancel: () => void;
  onToggleMarkPanel?: () => void;
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

const ZOOM_OPTIONS = [
  { label: '50%', value: 50 },
  { label: '75%', value: 75 },
  { label: '100%', value: 100 },
  { label: '125%', value: 125 },
  { label: '150%', value: 150 },
];

export default function Preview({
  filePath,
  viewMode,
  projectName,
  prototypesDir,
  wsConnected,
  reloadVersion,
  marks,
  selectedMarkId,
  pendingMarkInfo,
  onMarkPrepare,
  onMarkSelect,
  onMarkCancel,
  onToggleMarkPanel,
  previewUrlOverride = null,
  previewReadonly = false,
}: PreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('single');
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([]);
  const [marksVisible, setMarksVisible] = useState(true); // 标记是否可见
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>('desktop');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [, setOverlayRefreshTick] = useState(0);
  const [iframeReloadToken, setIframeReloadToken] = useState(0);

  const requestOverlayRefresh = () => {
    setOverlayRefreshTick(prev => prev + 1);
  };

  useEffect(() => {
    if (reloadVersion === 0) return;
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
      if (transitionLoopId !== null) return;

      const tick = () => {
        scheduleRefresh();
        transitionLoopId = requestAnimationFrame(tick);
      };

      tick();
    };

    const setupIframeObservers = () => {
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
    const isInteractiveMode = (viewMode === 'inspect') || (viewMode === 'mark' && marksVisible);

    if (!iframe || !isInteractiveMode) {
      setHoveredElement(null);
      return;
    }

    // 等待 iframe 加载完成后再添加事件监听器
    let currentCleanup: (() => void) | null = null;

    const setupInspectMode = () => {
      // 先清理旧的监听器
      if (currentCleanup) {
        currentCleanup();
        currentCleanup = null;
      }

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc || !iframeDoc.head) return;

    // 鼠标移动事件
    const handleMouseMove = (e: MouseEvent) => {
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
      e.preventDefault();
      e.stopPropagation();

      const target = e.target as HTMLElement;
      if (!target) return;

      // 标记模式：检查是否已有标记，有则显示详情，无则准备创建
      if (viewMode === 'mark') {
        // 生成唯一选择器
        const selector = generateUniqueSelector(target);

        // 检查是否已经有标记使用这个选择器
        const existingMark = marks.find(mark => mark.selector === selector);

        if (existingMark) {
          // 如果已有标记，切换到详情视图
          onMarkSelect(existingMark.id);
          return;
        }

        if (previewReadonly) {
          message.info('历史版本预览中不可新增标记，请先还原到该版本');
          return;
        }

        // 如果没有标记，准备创建新标记
        const rect = target.getBoundingClientRect();
        const domPath = getElementPath(target);

        // 调用 onMarkPrepare 传递待创建标记信息
        onMarkPrepare({
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
      const info = getElementInfo(target, projectName, prototypesDir, filePath);

      if (selectionMode === 'single') {
        // 单选模式：直接复制
        try {
          await navigator.clipboard.writeText(info);
          message.success('DOM 信息已复制到剪贴板');
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

    // 添加事件监听
      iframeDoc.addEventListener('mousemove', handleMouseMove);
      iframeDoc.addEventListener('click', handleClick, true);

      // 添加样式来改变鼠标指针
      const style = iframeDoc.createElement('style');
      style.textContent = '* { cursor: crosshair !important; }';
      iframeDoc.head.appendChild(style);

      // 保存 cleanup 函数
      currentCleanup = () => {
        iframeDoc.removeEventListener('mousemove', handleMouseMove);
        iframeDoc.removeEventListener('click', handleClick, true);
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
  }, [viewMode, filePath, projectName, prototypesDir, selectionMode, marksVisible, onMarkPrepare, previewReadonly, marks, onMarkSelect]);

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

  // 编辑模式键盘快捷键监听
  useEffect(() => {
    if (viewMode !== 'inspect') return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    const setupKeyboardListeners = () => {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      const handleKeyDown = async (e: KeyboardEvent) => {
        // Ctrl/Cmd+C: 复制选中的元素
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
          // 只在多选模式且有选中元素时触发
          if (selectionMode === 'multiple' && selectedElements.length > 0) {
            e.preventDefault();

            const combinedInfo = formatMultipleElementsInfo(
              selectedElements,
              projectName,
              prototypesDir,
              filePath
            );

            try {
              await navigator.clipboard.writeText(combinedInfo);
              message.success(`已复制 ${selectedElements.length} 个元素的信息到剪贴板`);
            } catch (error) {
              console.error('复制失败:', error);
              message.error('复制失败，请检查浏览器权限');
            }
          }
        }

        // ESC: 清空选择
        if (e.key === 'Escape') {
          if (selectedElements.length > 0) {
            e.preventDefault();
            setSelectedElements([]);
            message.info('已清空选择');
          }
        }

        // Shift+Tab: 切换单选/多选模式
        if (e.shiftKey && e.key === 'Tab') {
          e.preventDefault();
          const newMode = selectionMode === 'single' ? 'multiple' : 'single';
          setSelectionMode(newMode);
        }
      };

      iframeDoc.addEventListener('keydown', handleKeyDown);

      return () => {
        iframeDoc.removeEventListener('keydown', handleKeyDown);
      };
    };

    // 立即尝试设置
    const cleanup = setupKeyboardListeners();

    // 监听 iframe load 事件
    iframe.addEventListener('load', setupKeyboardListeners);

    return () => {
      iframe.removeEventListener('load', setupKeyboardListeners);
      if (cleanup) cleanup();
    };
  }, [viewMode, selectionMode, selectedElements, prototypesDir, filePath, projectName]);

  // 标记模式键盘快捷键监听
  useEffect(() => {
    if (viewMode !== 'mark') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 检查焦点是否在输入框中
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // X 键: 切换标记显示/隐藏
      if (e.key === 'x' || e.key === 'X') {
        if (!isInputFocused) {
          e.preventDefault();
          setMarksVisible(prev => !prev);
        }
      }

      // 上箭头: 选择上一个标记（不在输入框中时）
      if (e.key === 'ArrowUp' && !isInputFocused) {
        e.preventDefault();
        if (marks.length === 0) return;

        const currentIndex = selectedMarkId
          ? marks.findIndex(m => m.id === selectedMarkId)
          : -1;

        const prevIndex = currentIndex <= 0 ? marks.length - 1 : currentIndex - 1;
        onMarkSelect(marks[prevIndex].id);
      }

      // 下箭头: 选择下一个标记（不在输入框中时）
      if (e.key === 'ArrowDown' && !isInputFocused) {
        e.preventDefault();
        if (marks.length === 0) return;

        const currentIndex = selectedMarkId
          ? marks.findIndex(m => m.id === selectedMarkId)
          : -1;

        const nextIndex = currentIndex >= marks.length - 1 ? 0 : currentIndex + 1;
        onMarkSelect(marks[nextIndex].id);
      }

      // ESC: 退出详情/新增，返回列表（任何时候都可以）
      if (e.key === 'Escape') {
        if (pendingMarkInfo) {
          // 如果在创建视图，取消创建
          e.preventDefault();
          onMarkCancel();
        } else if (selectedMarkId) {
          // 如果在详情视图，返回列表
          e.preventDefault();
          onMarkSelect('');
        }
      }

      // H 键: 返回列表并折叠面板
      if (e.key === 'h' || e.key === 'H') {
        if (!isInputFocused) {
          e.preventDefault();
          // 如果有选中的标记或待创建的标记，先返回列表
          if (pendingMarkInfo) {
            onMarkCancel();
          } else if (selectedMarkId) {
            onMarkSelect('');
          }
          // 折叠面板
          onToggleMarkPanel?.();
        }
      }
    };

    const iframe = iframeRef.current;

    // 在 window 级别监听
    window.addEventListener('keydown', handleKeyDown);

    // 同时在 iframe 中监听
    const setupIframeListener = () => {
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.addEventListener('keydown', handleKeyDown);
      }
    };

    // 立即设置 iframe 监听
    setupIframeListener();

    // iframe 加载后重新设置
    iframe?.addEventListener('load', setupIframeListener);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.removeEventListener('keydown', handleKeyDown);
      }
      iframe?.removeEventListener('load', setupIframeListener);
    };
  }, [viewMode, marks, selectedMarkId, pendingMarkInfo, onMarkSelect, onMarkCancel]);

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
      await navigator.clipboard.writeText(combinedInfo);
      message.success(`已复制 ${selectedElements.length} 个元素的信息到剪贴板`);
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
    const stage = stageRef.current;
    if (!iframe || !stage) return null;

    const elementRect = element.getBoundingClientRect();
    const iframeRect = iframe.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    const iframeViewportWidth = iframeDoc?.documentElement.clientWidth || iframe.clientWidth || viewportSize.width;
    const iframeViewportHeight = iframeDoc?.documentElement.clientHeight || iframe.clientHeight || viewportSize.height;
    const scaleX = iframeViewportWidth > 0 ? iframeRect.width / iframeViewportWidth : 1;
    const scaleY = iframeViewportHeight > 0 ? iframeRect.height / iframeViewportHeight : 1;

    return {
      left: iframeRect.left - stageRect.left + (elementRect.left * scaleX),
      top: iframeRect.top - stageRect.top + (elementRect.top * scaleY),
      width: elementRect.width * scaleX,
      height: elementRect.height * scaleY,
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
                >
                  复制所有
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
              ? (marksVisible ? '历史版本预览中，仅支持查看标记' : '历史版本预览中（标记已隐藏）')
              : (marksVisible ? '点击页面元素创建标记' : '预览模式（标记已隐藏）')}
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
            <Hotkey keys={['H']} description="折叠面板" />
          </span>

          <div className="preview-inspect-banner-controls">
            <Button
              size="small"
              onClick={() => setMarksVisible(prev => !prev)}
            >
              {marksVisible ? '隐藏标记' : '显示标记'}
            </Button>
          </div>
        </div>
      )}

      <div className="preview-floating-toolbar">
        <div className="preview-stage-toolbar-group">
          <Segmented
            size="small"
            value={previewViewport}
            onChange={(value) => setPreviewViewport(value as PreviewViewport)}
            options={[
              { label: 'PC端', value: 'desktop', icon: <DesktopOutlined /> },
              { label: '移动端', value: 'mobile', icon: <MobileOutlined /> },
            ]}
          />
          <Select
            size="small"
            value={zoomPercent}
            onChange={setZoomPercent}
            options={ZOOM_OPTIONS}
            className="preview-zoom-select"
            suffixIcon={null}
          />
        </div>
      </div>

      {!wsConnected && (
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
        {((viewMode === 'inspect') || (viewMode === 'mark' && marksVisible)) && hoveredElement && !pendingMarkInfo && (() => {
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
        {viewMode === 'mark' && marksVisible && pendingMarkInfo && (() => {
          try {
            const iframe = iframeRef.current;
            if (!iframe) return null;

            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc) return null;

            const element = iframeDoc.querySelector(pendingMarkInfo.selector);
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
        {viewMode === 'mark' && marksVisible && marks.map((mark) => {
          try {
            const iframe = iframeRef.current;
            if (!iframe) return null;

            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc) return null;

            const element = iframeDoc.querySelector(mark.selector);
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
                onClick={() => onMarkSelect(mark.id)}
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
  );
}

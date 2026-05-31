import { Children, isValidElement, lazy, Suspense, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { Tooltip } from 'antd';
import MermaidRenderer from './MermaidRenderer';
import Hotkey from './Hotkey';
import PrdDiffViewer from './PrdDiffViewer';
import './PrdPreview.css';
import type { PrdContextBlock } from '../types/prd';
import { getModifierKey } from '../utils/platform';
import { parseMarkdownBlocksFromText, toggleBlockSelection } from '../utils/markdownBlocks';

const CodeMirrorEditor = lazy(() => import('./CodeMirrorEditor'));

export type DiffLine = { type: 'added'; value: string } | { type: 'removed'; value: string } | { type: 'unchanged'; value: string };

interface PrdPreviewProps {
  content: string;
  frontmatter?: Record<string, unknown>;
  fileName: string;
  mode?: 'preview' | 'edit' | 'block-select';
  draftContent?: string;
  onDraftChange?: (content: string) => void;
  onModeChange?: (mode: 'preview' | 'edit' | 'block-select') => void;
  editDisabled?: boolean;
  viewingHistory?: boolean;
  onReturnToCurrent?: () => void;
  diffLines?: DiffLine[];
  diffSummary?: { lineAdded: number; lineDeleted: number; changed: boolean } | null;
  contextCaptureActive?: boolean;
  selectedContextBlocks?: PrdContextBlock[];
  onContextCaptureChange?: (active: boolean, blocks: PrdContextBlock[]) => void;
  onCopyContextBlocks?: (blocks?: PrdContextBlock[]) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== 'string') return false;
  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable;
}

const MODE_CYCLE: Array<'preview' | 'edit' | 'block-select'> = ['preview', 'edit', 'block-select'];

/** react-markdown 自定义组件，拦截 mermaid 代码块 */
function createMarkdownComponents(previewable: boolean): Components {
  return {
    pre({ children }) {
      const child = Children.only(children);
      if (
        isValidElement<{ className?: string; children?: string }>(child) &&
        child.props?.className === 'language-mermaid'
      ) {
        const code = String(child.props.children).replace(/\n$/, '');
        return <MermaidRenderer code={code} previewable={previewable} />;
      }
      return <pre>{children}</pre>;
    },
  };
}

export default function PrdPreview({
  content,
  frontmatter,
  fileName,
  mode = 'preview',
  draftContent,
  onDraftChange,
  onModeChange,
  editDisabled = false,
  viewingHistory = false,
  onReturnToCurrent,
  diffLines,
  diffSummary,
  contextCaptureActive = false,
  selectedContextBlocks = [],
  onContextCaptureChange,
  onCopyContextBlocks,
}: PrdPreviewProps) {
  const title = (frontmatter?.title as string) || fileName.split('/').pop()?.replace(/\.md$/, '') || fileName;
  const renderedContent = viewingHistory ? content : (draftContent ?? content);
  const editing = !viewingHistory && mode === 'edit';
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('single');

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onModeChangeRef = useRef(onModeChange);
  onModeChangeRef.current = onModeChange;
  const previewBlocks = useMemo(() => parseMarkdownBlocksFromText(renderedContent), [renderedContent]);
  const selectedBlockIds = useMemo(() => new Set(selectedContextBlocks.map((block) => block.id)), [selectedContextBlocks]);
  const markdownComponents = useMemo(() => createMarkdownComponents(!contextCaptureActive), [contextCaptureActive]);

  // 进入块选择模式时重置为单选
  useEffect(() => {
    if (mode === 'block-select') {
      setSelectionMode('single');
    }
  }, [mode]);

  // Shift+Tab 切换预览/编辑/块选择模式
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.key !== 'Tab') return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      const currentMode = modeRef.current;
      const currentIndex = MODE_CYCLE.indexOf(currentMode);
      const nextIndex = (currentIndex + 1) % MODE_CYCLE.length;
      onModeChangeRef.current?.(MODE_CYCLE[nextIndex]);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  useEffect(() => {
    if (viewingHistory || mode !== 'block-select') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (selectionMode === 'multiple') {
          // 批量模式 → 退回单选，清空选择
          setSelectionMode('single');
          onContextCaptureChange?.(true, []);
        } else {
          // 单选模式 → 退出块选择
          onContextCaptureChange?.(false, []);
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && (event.key === 'c' || event.key === 'C') && selectedContextBlocks.length > 0) {
        event.preventDefault();
        onCopyContextBlocks?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [contextCaptureActive, mode, onContextCaptureChange, onCopyContextBlocks, selectedContextBlocks.length, selectionMode, viewingHistory]);

  const handlePreviewBlockClick = (event: MouseEvent<HTMLDivElement>, block: PrdContextBlock) => {
    if (!contextCaptureActive) return;
    event.preventDefault();

    if (selectionMode === 'multiple' || event.shiftKey) {
      // 多选模式 或 Shift+点击：切换选中状态
      if (selectionMode === 'single' && event.shiftKey) {
        // Shift+点击从单选进入多选
        setSelectionMode('multiple');
      }
      onContextCaptureChange?.(true, toggleBlockSelection(selectedContextBlocks, block));
    } else {
      // 单选模式：复制该 block 内容
      onContextCaptureChange?.(true, [block]);
      onCopyContextBlocks?.([block]);
    }
  };

  return (
    <div className="prd-preview-screen">
      {!viewingHistory && (
        <div className="prd-preview-topbar">
          <div className="prd-context-capture-banner-copy">
            <div className="prd-context-capture-toggle-group" aria-label="PRD 工具切换">
              <Tooltip title="预览模式" getPopupContainer={() => document.body}>
                <button
                  type="button"
                  className={`prd-context-capture-toggle-pill${mode === 'preview' ? ' active' : ''}`}
                  onClick={() => onModeChange?.('preview')}
                >
                  预览
                </button>
              </Tooltip>
              <Tooltip title="编辑模式 (Shift+Tab 切换)" getPopupContainer={() => document.body}>
                <button
                  type="button"
                  className={`prd-context-capture-toggle-pill${mode === 'edit' ? ' active' : ''}`}
                  onClick={() => !editDisabled && onModeChange?.('edit')}
                  disabled={editDisabled}
                >
                  编辑
                </button>
              </Tooltip>
              <Tooltip title="块选择模式 (Shift+Tab 切换)" getPopupContainer={() => document.body}>
                <button
                  type="button"
                  className={`prd-context-capture-toggle-pill${mode === 'block-select' ? ' active' : ''}`}
                  onClick={() => onModeChange?.('block-select')}
                >
                  块选择
                </button>
              </Tooltip>
            </div>
            {(mode === 'preview' || mode === 'block-select') ? (
              <>
                {contextCaptureActive && selectionMode === 'multiple' && selectedContextBlocks.length > 0 ? (
                  <span className="prd-context-capture-banner-count">已选 {selectedContextBlocks.length} 个块</span>
                ) : null}
                <span className="prd-context-capture-banner-hint">
                  {contextCaptureActive ? (
                    selectionMode === 'multiple' ? (
                      <>
                        点击切换选中 · <Hotkey keys={['Esc']} inline /> 退出 · <Hotkey keys={[getModifierKey()]} inline />+<Hotkey keys={['C']} inline /> 复制
                      </>
                    ) : (
                      <>
                        点击复制 · <Hotkey keys={['Shift']} inline />+点击 批量选择 · <Hotkey keys={['Esc']} inline /> 退出
                      </>
                    )
                  ) : (
                    <>
                      预览文档
                    </>
                  )}
                </span>
              </>
            ) : (
              <span className="prd-context-capture-banner-hint">
                Markdown 编辑模式，支持连续编辑与行级交互
              </span>
            )}
          </div>
          {mode === 'block-select' ? (
            <div className="prd-context-capture-banner-actions">
              {selectionMode === 'multiple' ? (
                <>
                  <button
                    type="button"
                    className="prd-context-capture-exit-button active"
                    onClick={() => { setSelectionMode('single'); onContextCaptureChange?.(true, []); }}
                  >
                    退出批量选择
                  </button>
                  <button
                    type="button"
                    className="prd-context-capture-copy-button"
                    onClick={() => onCopyContextBlocks?.()}
                    disabled={selectedContextBlocks.length === 0}
                  >
                    复制给 AI
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`prd-context-capture-exit-button`}
                  onClick={() => setSelectionMode('multiple')}
                >
                  批量选择
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}

      <div className={`prd-preview${editing ? ' prd-preview--editing' : ''}${viewingHistory ? ' prd-preview--history' : ''}`}>
        {viewingHistory && (
          <div className="prd-preview-history-banner">
            <span>正在查看历史版本</span>
            {diffSummary && (
              <span className="prd-preview-diff-summary">
                {diffSummary.lineDeleted > 0 && <span className="diff-removed-count">-{diffSummary.lineDeleted}</span>}
                {diffSummary.lineAdded > 0 && <span className="diff-added-count">+{diffSummary.lineAdded}</span>}
              </span>
            )}
            {onReturnToCurrent && (
              <button
                type="button"
                className="prd-preview-history-return"
                onClick={onReturnToCurrent}
              >
                返回当前版本
              </button>
            )}
          </div>
        )}

        <div className="prd-preview-body">
          {viewingHistory && diffLines ? (
            <PrdDiffViewer diffLines={diffLines} />
          ) : editing ? (
            <Suspense fallback={<textarea className="prd-preview-editor" disabled value={draftContent ?? content} />}>
              <CodeMirrorEditor
                value={draftContent ?? content}
                onChange={onDraftChange}
                fileName={fileName}
                title={title}
                contextCaptureActive={false}
                selectedContextBlocks={[]}
              />
            </Suspense>
          ) : (
            <div className={`prd-preview-block-list${contextCaptureActive ? ' is-context-capture-active' : ''}`}>
              {previewBlocks.map((block) => (
                <div
                  key={block.id}
                  className={`prd-preview-block${contextCaptureActive ? ' is-selectable' : ''}${selectedBlockIds.has(block.id) ? ' is-selected' : ''}`}
                  onClick={(event) => handlePreviewBlockClick(event, block)}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {block.text}
                  </ReactMarkdown>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

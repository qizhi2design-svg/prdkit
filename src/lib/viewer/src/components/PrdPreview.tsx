import { Children, isValidElement, lazy, Suspense, useEffect, useMemo, type MouseEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import MermaidRenderer from './MermaidRenderer';
import Hotkey from './Hotkey';
import PrdDiffViewer from './PrdDiffViewer';
import './PrdPreview.css';
import type { PrdContextBlock } from '../types/prd';
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
  onCopyContextBlocks?: () => void;
}

/** react-markdown 自定义组件，拦截 mermaid 代码块 */
const markdownComponents: Components = {
  pre({ children }) {
    const child = Children.only(children);
    if (
      isValidElement<{ className?: string; children?: string }>(child) &&
      child.props?.className === 'language-mermaid'
    ) {
      const code = String(child.props.children).replace(/\n$/, '');
      return <MermaidRenderer code={code} />;
    }
    return <pre>{children}</pre>;
  },
};

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
  const previewBlocks = useMemo(() => parseMarkdownBlocksFromText(renderedContent), [renderedContent]);
  const selectedBlockIds = useMemo(() => new Set(selectedContextBlocks.map((block) => block.id)), [selectedContextBlocks]);

  useEffect(() => {
    if (viewingHistory || mode !== 'block-select') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onContextCaptureChange?.(false, []);
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
  }, [contextCaptureActive, mode, onContextCaptureChange, onCopyContextBlocks, selectedContextBlocks.length, viewingHistory]);

  const handlePreviewBlockClick = (event: MouseEvent<HTMLDivElement>, block: PrdContextBlock) => {
    if (!contextCaptureActive) {
      if (!event.shiftKey) return;
      event.preventDefault();
      onContextCaptureChange?.(true, [block]);
      return;
    }

    event.preventDefault();
    onContextCaptureChange?.(true, toggleBlockSelection(selectedContextBlocks, block));
  };

  return (
    <div className="prd-preview-screen">
      {!viewingHistory && (
        <div className="prd-preview-topbar">
          <div className="prd-context-capture-banner-copy">
            <div className="prd-context-capture-toggle-group" aria-label="PRD 工具切换">
              <button
                type="button"
                className={`prd-context-capture-toggle-pill${mode === 'preview' ? ' active' : ''}`}
                onClick={() => onModeChange?.('preview')}
              >
                预览
              </button>
              <button
                type="button"
                className={`prd-context-capture-toggle-pill${mode === 'edit' ? ' active' : ''}`}
                onClick={() => !editDisabled && onModeChange?.('edit')}
                disabled={editDisabled}
              >
                编辑
              </button>
              <button
                type="button"
                className={`prd-context-capture-toggle-pill${mode === 'block-select' ? ' active' : ''}`}
                onClick={() => onModeChange?.('block-select')}
              >
                块选择
              </button>
            </div>
            {(mode === 'preview' || mode === 'block-select') ? (
              <>
                {contextCaptureActive && selectedContextBlocks.length > 0 ? (
                  <span className="prd-context-capture-banner-count">已选 {selectedContextBlocks.length} 个块</span>
                ) : null}
                <span className="prd-context-capture-banner-hint">
                  {contextCaptureActive ? (
                    <>
                      点击 block 选取 · <Hotkey keys={['Shift']} inline />+点击 可直接开启 · <Hotkey keys={['Esc']} inline /> 退出 · <Hotkey keys={['⌘/Ctrl']} inline />+<Hotkey keys={['C']} inline /> 复制
                    </>
                  ) : (
                    <>
                      预览文档 · <Hotkey keys={['Shift']} inline />+点击 进入块选择
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
          {mode !== 'edit' ? (
            <div className="prd-context-capture-banner-actions">
              <button
                type="button"
                className={`prd-context-capture-exit-button${contextCaptureActive ? ' active' : ''}`}
                onClick={() => onContextCaptureChange?.(!contextCaptureActive, contextCaptureActive ? [] : selectedContextBlocks)}
              >
                {contextCaptureActive ? '退出批量选择' : '批量选择'}
              </button>
              {contextCaptureActive ? (
                <button
                  type="button"
                  className="prd-context-capture-copy-button"
                  onClick={onCopyContextBlocks}
                  disabled={selectedContextBlocks.length === 0}
                >
                  复制给 AI
                </button>
              ) : null}
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

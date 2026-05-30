import { Children, isValidElement } from 'react';
import { Button } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import MermaidRenderer from './MermaidRenderer';
import './PrdPreview.css';

export type DiffLine = { type: 'added'; value: string } | { type: 'removed'; value: string } | { type: 'unchanged'; value: string };

interface PrdPreviewProps {
  content: string;
  frontmatter?: Record<string, unknown>;
  fileName: string;
  mode?: 'preview' | 'edit';
  draftContent?: string;
  onDraftChange?: (content: string) => void;
  onModeChange?: (mode: 'preview' | 'edit') => void;
  editDisabled?: boolean;
  viewingHistory?: boolean;
  onReturnToCurrent?: () => void;
  diffLines?: DiffLine[];
  diffSummary?: { lineAdded: number; lineDeleted: number; changed: boolean } | null;
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
}: PrdPreviewProps) {
  const title = (frontmatter?.title as string) || fileName.split('/').pop()?.replace(/\.md$/, '') || fileName;
  const status = frontmatter?.status as string | undefined;
  const version = frontmatter?.version as string | undefined;
  const author = frontmatter?.author as string | undefined;
  const date = frontmatter?.date as string | undefined;
  const renderedContent = viewingHistory ? content : (draftContent ?? content);
  const editing = !viewingHistory && mode === 'edit';

  return (
    <div className="prd-preview">
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

      <div className="prd-preview-header">
        <div className="prd-preview-header-main">
          <div>
            <h1 className="prd-preview-title">{title}</h1>
            <div className="prd-preview-meta">
              {author && <span className="prd-preview-meta-item">作者: {author}</span>}
              {status && <span className="prd-preview-meta-item">状态: {status}</span>}
              {version && <span className="prd-preview-meta-item">版本: {version}</span>}
              {date && <span className="prd-preview-meta-item">日期: {date}</span>}
            </div>
          </div>
          {!viewingHistory && (
            <div className="prd-preview-mode-switch">
              <Button
                type={mode === 'preview' ? 'primary' : 'default'}
                onClick={() => onModeChange?.('preview')}
              >
                预览
              </Button>
              <Button
                type={mode === 'edit' ? 'primary' : 'default'}
                onClick={() => onModeChange?.('edit')}
                disabled={editDisabled}
              >
                编辑
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="prd-preview-body">
        {viewingHistory && diffLines ? (
          <div className="prd-diff-view">
            {diffLines.map((line, i) => (
              <div key={i} className={`prd-diff-line prd-diff-${line.type}`}>
                <span className="prd-diff-marker">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                <span className="prd-diff-text">{line.value}</span>
              </div>
            ))}
          </div>
        ) : editing ? (
          <textarea
            className="prd-preview-editor"
            value={draftContent ?? content}
            onChange={(event) => onDraftChange?.(event.target.value)}
            spellCheck={false}
          />
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {renderedContent}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

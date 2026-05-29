import { Children, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import MermaidRenderer from './MermaidRenderer';
import './PrdPreview.css';

interface PrdPreviewProps {
  content: string;
  frontmatter?: Record<string, unknown>;
  fileName: string;
  viewingHistory?: boolean;
  onReturnToCurrent?: () => void;
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
  viewingHistory = false,
  onReturnToCurrent,
}: PrdPreviewProps) {
  const title = (frontmatter?.title as string) || fileName.replace(/\.md$/, '');
  const status = frontmatter?.status as string | undefined;
  const version = frontmatter?.version as string | undefined;
  const author = frontmatter?.author as string | undefined;
  const date = frontmatter?.date as string | undefined;

  return (
    <div className="prd-preview">
      {viewingHistory && (
        <div className="prd-preview-history-banner">
          <span>正在查看历史版本</span>
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
        <h1 className="prd-preview-title">{title}</h1>
        <div className="prd-preview-meta">
          {author && <span className="prd-preview-meta-item">作者: {author}</span>}
          {status && <span className="prd-preview-meta-item">状态: {status}</span>}
          {version && <span className="prd-preview-meta-item">版本: {version}</span>}
          {date && <span className="prd-preview-meta-item">日期: {date}</span>}
        </div>
      </div>

      <div className="prd-preview-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

import { Children, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { DiffLine } from './PrdPreview';
import MermaidRenderer from './MermaidRenderer';

/** react-markdown 自定义组件（与 PrdPreview 共享） */
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

/** 将连续同类行合并为 chunk */
function groupDiffLines(lines: DiffLine[]): { type: DiffLine['type']; content: string; lineCount: number }[] {
  const chunks: { type: DiffLine['type']; content: string; lineCount: number }[] = [];
  for (const line of lines) {
    const prev = chunks[chunks.length - 1];
    if (prev && prev.type === line.type) {
      prev.content += '\n' + line.value;
      prev.lineCount += 1;
    } else {
      chunks.push({ type: line.type, content: line.value, lineCount: 1 });
    }
  }
  return chunks;
}

interface PrdDiffViewerProps {
  diffLines: DiffLine[];
}

export default function PrdDiffViewer({ diffLines }: PrdDiffViewerProps) {
  const chunks = groupDiffLines(diffLines);
  const labels: Record<DiffLine['type'], string> = {
    added: '新增内容',
    removed: '删除内容',
    unchanged: '上下文',
  };

  return (
    <div className="diff-viewer">
      {chunks.map((chunk, i) => (
        <div key={i} className={`diff-chunk diff-chunk--${chunk.type}`}>
          <div className="diff-chunk-header">
            <span className={`diff-chunk-badge diff-chunk-badge--${chunk.type}`}>{labels[chunk.type]}</span>
            <span className="diff-chunk-count">{chunk.lineCount} 行</span>
          </div>
          <div className="diff-chunk-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {chunk.content}
            </ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}

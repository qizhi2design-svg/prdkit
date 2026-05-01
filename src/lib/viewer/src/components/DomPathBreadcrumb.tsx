import { useState } from 'react';
import './DomPathBreadcrumb.css';

interface DomPathBreadcrumbProps {
  domPath: string;
}

export default function DomPathBreadcrumb({ domPath }: DomPathBreadcrumbProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const parts = domPath.split(' > ');

  return (
    <div
      className={`dom-path-breadcrumb ${isExpanded ? 'expanded' : 'collapsed'}`}
      onClick={() => setIsExpanded(!isExpanded)}
      title={isExpanded ? '点击折叠' : '点击展开'}
    ><span className="dom-path-breadcrumb-item">元素路径:</span>
      {parts.map((part, index) => (
        <span key={index} className="dom-path-breadcrumb-item">
          {part}
          {index < parts.length - 1 && (
            <span className="dom-path-breadcrumb-separator">/</span>
          )}
        </span>
      ))}
    </div>
  );
}

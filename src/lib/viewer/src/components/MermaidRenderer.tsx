import { Image } from "antd";
import { useEffect, useRef, useState } from "react";

interface MermaidRendererProps {
  code: string;
  previewable?: boolean;
}

const KNOWN_DIAGRAM_PREFIXES = [
  'graph',
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
  'gitGraph',
  'quadrantChart',
  'requirementDiagram',
  'c4Context',
  'c4Container',
  'c4Component',
  'c4Dynamic',
  'c4Deployment',
  'architecture-beta',
  'kanban',
  'block-beta',
  'zenuml',
  'packet-beta',
  'xychart-beta',
  'sankey-beta',
].map((item) => item.toLowerCase());

function normalizeMermaidCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return input;

  const firstNonEmptyLine = trimmed.split(/\r?\n/).find((line) => line.trim());
  if (!firstNonEmptyLine) return input;

  const normalizedFirstLine = firstNonEmptyLine.trim().toLowerCase();
  if (KNOWN_DIAGRAM_PREFIXES.some((prefix) => normalizedFirstLine.startsWith(prefix))) {
    return trimmed;
  }

  const looksLikeSequence =
    /^[A-Za-z0-9_\u4e00-\u9fa5-]+\s*[-=]+>+[-=]*\s*[A-Za-z0-9_\u4e00-\u9fa5-]+\s*:/.test(normalizedFirstLine);
  if (looksLikeSequence) {
    return `sequenceDiagram\n${trimmed}`;
  }

  const looksLikeFlow =
    /^[A-Za-z0-9_\u4e00-\u9fa5-]+\s*--?>\s*[A-Za-z0-9_\u4e00-\u9fa5-]+/.test(normalizedFirstLine);
  if (looksLikeFlow) {
    return `flowchart TD\n${trimmed}`;
  }

  return trimmed;
}

function withWhiteSvgBackground(svg: string): string {
  if (!svg.trim()) return svg;

  if (svg.includes('data-prdkit-mermaid-bg="white"')) {
    return svg;
  }

  return svg.replace(
    /(<svg\b[^>]*>)/i,
    '$1<rect data-prdkit-mermaid-bg="white" width="100%" height="100%" fill="#ffffff"></rect>'
  );
}

type RenderState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

export default function MermaidRenderer({ code, previewable = true }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RenderState>({ status: "loading" });
  const svgRef = useRef("");
  const blobUrlRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    idRef.current += 1;
    const id = `mermaid-${idRef.current}`;
    const normalizedCode = normalizeMermaidCode(code);

    const render = async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
          themeVariables: {
            background: "#ffffff",
          },
        });

        const { svg } = await mermaid.render(id, normalizedCode);
        const svgWithBg = withWhiteSvgBackground(svg);
        if (!cancelled) {
          svgRef.current = svgWithBg;
          setState({ status: "ready", svg: svgWithBg });

          const blob = new Blob([svgWithBg], { type: "image/svg+xml" });
          objectUrl = URL.createObjectURL(blob);
          blobUrlRef.current = objectUrl;
          setDataUrl(objectUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "渲染失败",
          });
        }
      }
    };

    setState({ status: "loading" });
    render();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        blobUrlRef.current = null;
      }
    };
  }, [code]);

  if (state.status === "loading") {
    return (
      <div className="mermaid-container mermaid-loading">
        <span>渲染图中...</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mermaid-container mermaid-error" title={state.message}>
        <pre><code>{normalizeMermaidCode(code)}</code></pre>
      </div>
    );
  }

  return (
    <div>
      <div
        className="mermaid-container"
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: state.svg }}
        onClick={previewable ? (e) => { e.stopPropagation(); setPreviewOpen(true); } : undefined}
        style={{ cursor: previewable ? "pointer" : "default" }}
      />
      {dataUrl ? (
        <Image
          src={dataUrl}
          preview={{
            visible: previewOpen,
            onVisibleChange: setPreviewOpen,
          }}
          width={1}
          height={1}
          style={{ position: "fixed", left: -99990, top: 0, opacity: 0, pointerEvents: "none" }}
        />
      ) : null}
    </div>
  );
}

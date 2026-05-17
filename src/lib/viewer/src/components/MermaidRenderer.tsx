import { Image } from "antd";
import { useEffect, useRef, useState } from "react";

interface MermaidRendererProps {
  code: string;
}

type RenderState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

export default function MermaidRenderer({ code }: MermaidRendererProps) {
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

    const render = async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
        });

        const { svg } = await mermaid.render(id, code);
        if (!cancelled) {
          svgRef.current = svg;
          setState({ status: "ready", svg });

          const svgWithBg = svg;
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
        <pre><code>{code}</code></pre>
      </div>
    );
  }

  return (
    <div>
      <div
        className="mermaid-container"
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: state.svg }}
        onClick={() => setPreviewOpen(true)}
        style={{ cursor: "pointer" }}
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

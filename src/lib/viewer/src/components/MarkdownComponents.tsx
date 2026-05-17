import { Children, isValidElement } from "react";
import type { Components } from "react-markdown";
import MermaidRenderer from "./MermaidRenderer";

export const markdownComponents: Components = {
  pre({ children }) {
    const child = Children.only(children);
    if (
      isValidElement<{ className?: string; children?: string }>(child) &&
      child.props?.className === "language-mermaid"
    ) {
      const code = String(child.props.children).replace(/\n$/, "");
      return <MermaidRenderer code={code} />;
    }
    return <pre>{children}</pre>;
  },
};

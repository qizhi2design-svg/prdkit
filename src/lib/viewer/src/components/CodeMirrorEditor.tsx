import { useMemo } from 'react';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';
import type { PrdContextBlock } from '../types/prd';
import { findBlockAtPosition, parseMarkdownBlocksFromText, toggleBlockSelection } from '../utils/markdownBlocks';

const viewerTheme = EditorView.theme({
  '&': {
    backgroundColor: '#fffdf9',
    color: '#2f2a24',
    height: '100%',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-family-base)',
    lineHeight: '1.75',
    paddingTop: '24px',
  },
  '.cm-editor': {
    height: '100%',
  },
  '.cm-cursor': {
    borderLeftColor: '#2f7a72',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(47, 122, 114, 0.14) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(47, 122, 114, 0.14) !important',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(196, 164, 132, 0.18)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(167, 181, 161, 0.12)',
    borderRadius: '8px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(167, 181, 161, 0.18)',
    color: '#5f6f65',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(196, 164, 132, 0.22)',
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: '#f6f1e8',
    borderRight: '1px solid #e7ded0',
    color: '#a59a8b',
  },
  '.cm-foldGutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    padding: '0 8px',
    color: '#938879',
    cursor: 'pointer',
    transition: 'color 0.16s ease, background-color 0.16s ease',
    borderRadius: '6px',
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: '#2f7a72',
    backgroundColor: 'rgba(47, 122, 114, 0.1)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    boxSizing: 'border-box',
    color: 'inherit',
    fontSize: '11px',
    padding: '0 6px 0 10px',
    minWidth: '28px',
  },
  '.cm-content': {
    padding: '0 16px 24px 10px',
    caretColor: '#2f7a72',
    fontFamily: 'var(--font-family-base)',
  },
  '.cm-line': {
    padding: '0 2px',
  },
  '.cm-md-heading': {
    color: '#2f2a24',
    fontWeight: '700',
    letterSpacing: '-0.01em',
  },
  '.cm-md-heading-1': {
    fontSize: '2rem',
    lineHeight: '1.3',
    marginTop: '10px',
    marginBottom: '8px',
  },
  '.cm-md-heading-2': {
    fontSize: '1.55rem',
    lineHeight: '1.4',
    marginTop: '8px',
    marginBottom: '6px',
  },
  '.cm-md-heading-3': {
    fontSize: '1.2rem',
    lineHeight: '1.45',
    marginTop: '6px',
  },
  '.cm-md-heading-4, .cm-md-heading-5, .cm-md-heading-6': {
    fontSize: '1rem',
    lineHeight: '1.5',
  },
  '.cm-md-blockquote': {
    paddingLeft: '12px',
    borderLeft: '3px solid rgba(22, 119, 255, 0.3)',
    backgroundColor: 'rgba(22, 119, 255, 0.05)',
    color: '#5f6f65',
  },
  '.cm-md-list-line': {
    paddingLeft: '6px',
  },
  '.cm-md-table-line': {
    fontFamily: 'var(--font-family-code)',
    fontSize: '13px',
    backgroundColor: 'rgba(246, 241, 232, 0.62)',
  },
  '.cm-md-table-header': {
    fontWeight: '600',
    color: '#2f2a24',
    backgroundColor: 'rgba(232, 224, 213, 0.82)',
  },
  '.cm-md-table-divider': {
    color: '#b6a894',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#f3ede2',
    border: '1px solid #dfd2c0',
    color: '#7f7468',
    borderRadius: '999px',
    padding: '0 8px',
  },
  '.cm-md-codeblock-line': {
    backgroundColor: '#f4efe7',
    fontFamily: 'var(--font-family-code)',
  },
  '.cm-md-codeblock-start': {
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
    marginTop: '4px',
  },
  '.cm-md-codeblock-end': {
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
    marginBottom: '4px',
  },
  '.cm-md-context-hover': {
    backgroundColor: 'rgba(22, 119, 255, 0.1)',
    boxShadow: 'inset 2px 0 0 rgba(22, 119, 255, 0.26), inset 0 0 0 1px rgba(22, 119, 255, 0.16)',
  },
  '.cm-md-context-selected': {
    backgroundColor: 'rgba(22, 119, 255, 0.18)',
    boxShadow: 'inset 4px 0 0 #1677ff, inset 0 0 0 1px rgba(22, 119, 255, 0.24)',
  },
  '.cm-md-context-start': {
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
  },
  '.cm-md-context-end': {
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
  },
  '.cm-md-context-selected.cm-md-context-start': {
    boxShadow: 'inset 4px 0 0 #1677ff, inset 0 1px 0 rgba(22, 119, 255, 0.34), inset 0 0 0 1px rgba(22, 119, 255, 0.24)',
  },
  '.cm-md-context-selected.cm-md-context-end': {
    boxShadow: 'inset 4px 0 0 #1677ff, inset 0 -1px 0 rgba(22, 119, 255, 0.34), inset 0 0 0 1px rgba(22, 119, 255, 0.24)',
  },
  '.cm-placeholder': {
    color: '#b2a79a',
  },
  '.cm-panels': {
    backgroundColor: '#fffdf9',
    color: '#6e6459',
  },
  '.cm-editor.cm-focused .cm-line::selection': {
    backgroundColor: 'rgba(47, 122, 114, 0.14)',
  },
});

const viewerSyntaxHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading, color: '#2f2a24', fontWeight: '700' },
    { tag: t.emphasis, fontStyle: 'italic', color: '#6f665c' },
    { tag: t.strong, fontWeight: '700', color: '#2f2a24' },
    { tag: t.strikethrough, color: '#b2a79a', textDecoration: 'line-through' },
    { tag: t.link, color: '#2f7a72' },
    { tag: t.url, color: '#8c7f73', textDecoration: 'underline' },
    { tag: t.monospace, color: '#9c4330', fontFamily: 'Monaco, Menlo, Consolas, monospace' },
    { tag: t.list, color: '#8c7f73' },
    { tag: t.quote, color: '#8c7f73', fontStyle: 'italic' },
    { tag: t.contentSeparator, color: '#ddd2c4' },
    { tag: t.separator, color: '#ddd2c4' },
    { tag: t.escape, color: '#2f7a72' },
    { tag: t.comment, color: '#a59a8b' },
    { tag: t.processingInstruction, color: '#a59a8b' },
    { tag: t.meta, color: '#a59a8b' },
    { tag: t.keyword, color: '#2f7a72', fontWeight: '600' },
  ]),
);

interface CodeMirrorEditorProps {
  value: string;
  onChange?: (value: string) => void;
  fileName: string;
  title?: string;
  contextCaptureActive: boolean;
  selectedContextBlocks: PrdContextBlock[];
  onContextCaptureChange?: (active: boolean, blocks: PrdContextBlock[]) => void;
  onCopyContextBlocks?: () => void;
}

const HEADING_RE = /^\s{0,3}#{1,6}\s+\S/;
const LIST_RE = /^(\s*)([-+*]|\d+[.)])\s+/;
const BLOCKQUOTE_RE = /^>\s?/;
const TABLE_DIVIDER_RE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;

function isTableRow(text: string): boolean {
  return text.includes('|');
}

function getHeadingLevel(text: string): number | null {
  const match = text.match(/^\s{0,3}(#{1,6})\s+\S/);
  return match ? match[1].length : null;
}

function buildDecorations(
  view: EditorView,
  active: boolean,
  selectedIds: Set<string>,
  hoveredId: string | null
): DecorationSet {
  const blocks = parseMarkdownBlocksFromText(view.state.doc.toString());
  const lineClasses = new Map<number, Set<string>>();

  const addLineClass = (lineNumber: number, className: string) => {
    const existing = lineClasses.get(lineNumber) ?? new Set<string>();
    existing.add(className);
    lineClasses.set(lineNumber, existing);
  };

  for (const block of blocks) {
    if (HEADING_RE.test(block.text)) {
      const headingLevel = getHeadingLevel(block.text);
      addLineClass(block.startLine, 'cm-md-heading');
      if (headingLevel) {
        addLineClass(block.startLine, `cm-md-heading-${headingLevel}`);
      }
    }

    if (BLOCKQUOTE_RE.test(block.text)) {
      for (let lineNumber = block.startLine; lineNumber <= block.endLine; lineNumber += 1) {
        addLineClass(lineNumber, 'cm-md-blockquote');
      }
    }

    if (LIST_RE.test(block.text)) {
      for (let lineNumber = block.startLine; lineNumber <= block.endLine; lineNumber += 1) {
        addLineClass(lineNumber, 'cm-md-list-line');
      }
    }

    if (
      isTableRow(view.state.doc.line(block.startLine).text)
      && block.startLine + 1 <= view.state.doc.lines
      && TABLE_DIVIDER_RE.test(view.state.doc.line(block.startLine + 1).text)
    ) {
      for (let lineNumber = block.startLine; lineNumber <= block.endLine; lineNumber += 1) {
        addLineClass(lineNumber, 'cm-md-table-line');
      }
      addLineClass(block.startLine, 'cm-md-table-header');
      addLineClass(block.startLine + 1, 'cm-md-table-divider');
    }

    const codeFence = block.text.trimStart().match(/^(```+|~~~+)/);
    if (codeFence) {
      for (let lineNumber = block.startLine; lineNumber <= block.endLine; lineNumber += 1) {
        addLineClass(lineNumber, 'cm-md-codeblock-line');
      }
      addLineClass(block.startLine, 'cm-md-codeblock-start');
      addLineClass(block.endLine, 'cm-md-codeblock-end');
    }

    if (!active) continue;

    const isSelected = selectedIds.has(block.id);
    const isHovered = hoveredId === block.id && !isSelected;
    if (!isSelected && !isHovered) continue;

    for (let lineNumber = block.startLine; lineNumber <= block.endLine; lineNumber += 1) {
      addLineClass(lineNumber, isSelected ? 'cm-md-context-selected' : 'cm-md-context-hover');
    }
    addLineClass(block.startLine, 'cm-md-context-start');
    addLineClass(block.endLine, 'cm-md-context-end');
  }

  const decorations = [];
  for (const [lineNumber, classes] of lineClasses.entries()) {
    const line = view.state.doc.line(lineNumber);
    decorations.push(
      Decoration.line({
        attributes: {
          class: Array.from(classes).join(' '),
        },
      }).range(line.from)
    );
  }

  return Decoration.set(decorations, true);
}

function createContextCapturePlugin(
  active: boolean,
  selectedBlocks: PrdContextBlock[],
  onContextCaptureChange?: (active: boolean, blocks: PrdContextBlock[]) => void,
  onCopyContextBlocks?: () => void
) {
  const selectedIds = new Set(selectedBlocks.map((block) => block.id));

  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    hoveredBlockId: string | null = null;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view, active, selectedIds, this.hoveredBlockId);
    }

    refresh(view: EditorView) {
      this.decorations = buildDecorations(view, active, selectedIds, this.hoveredBlockId);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.refresh(update.view);
      }
    }
  }, {
    decorations: (value) => value.decorations,
    eventHandlers: {
      keydown(event) {
        if (event.key === 'Escape' && active) {
          event.preventDefault();
          onContextCaptureChange?.(false, []);
          return true;
        }

        if ((event.metaKey || event.ctrlKey) && (event.key === 'c' || event.key === 'C') && active && selectedBlocks.length > 0) {
          event.preventDefault();
          onCopyContextBlocks?.();
          return true;
        }

        return false;
      },
      mousemove(this: { hoveredBlockId: string | null; refresh: (view: EditorView) => void }, event, view) {
        if (!active) return false;

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const hoveredBlock = pos == null ? null : findBlockAtPosition(parseMarkdownBlocksFromText(view.state.doc.toString()), pos);
        const nextHoveredId = hoveredBlock?.id ?? null;
        if (this.hoveredBlockId !== nextHoveredId) {
          this.hoveredBlockId = nextHoveredId;
          this.refresh(view);
        }
        return false;
      },
      mouseleave(this: { hoveredBlockId: string | null; refresh: (view: EditorView) => void }, _event, view) {
        if (!this.hoveredBlockId) return false;
        this.hoveredBlockId = null;
        this.refresh(view);
        return false;
      },
      mousedown(event, view) {
        if (event.button !== 0) return false;
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;
        if (target.closest('.cm-gutters')) return false;

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;

        const targetBlock = findBlockAtPosition(parseMarkdownBlocksFromText(view.state.doc.toString()), pos);
        if (!targetBlock) return false;

        if (!active) {
          if (!event.shiftKey) return false;
          event.preventDefault();
          onContextCaptureChange?.(true, [targetBlock]);
          return true;
        }

        event.preventDefault();
        onContextCaptureChange?.(true, toggleBlockSelection(selectedBlocks, targetBlock));
        return true;
      },
    },
  });
}

export default function CodeMirrorEditor({
  value,
  onChange,
  fileName: _fileName,
  title: _title,
  contextCaptureActive,
  selectedContextBlocks,
  onContextCaptureChange,
  onCopyContextBlocks,
}: CodeMirrorEditorProps) {
  const contextCapturePlugin = useMemo(
    () => createContextCapturePlugin(
      contextCaptureActive,
      selectedContextBlocks,
      onContextCaptureChange,
      onCopyContextBlocks,
    ),
    [contextCaptureActive, onContextCaptureChange, onCopyContextBlocks, selectedContextBlocks],
  );

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      viewerTheme,
      viewerSyntaxHighlight,
      contextCapturePlugin,
    ],
    [contextCapturePlugin],
  );

  return (
    <CodeMirror
      className={`prd-preview-editor${contextCaptureActive ? ' is-context-capture-active' : ''}`}
      value={value}
      onChange={(val) => onChange?.(val)}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        bracketMatching: true,
        closeBrackets: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        indentOnInput: true,
        tabSize: 2,
      }}
    />
  );
}

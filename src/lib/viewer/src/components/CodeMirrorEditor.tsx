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
    backgroundColor: 'var(--color-prd-bg)',
    color: 'var(--color-prd-text)',
    height: '100%',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-family-base)',
    fontSize: 'var(--font-size-md)',
    lineHeight: 'var(--line-height-loose)',
    paddingTop: 'var(--spacing-6)',
  },
  '.cm-editor': {
    height: '100%',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--color-prd-accent)',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgb(var(--color-prd-accent-rgb) / 0.14) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgb(var(--color-prd-accent-rgb) / 0.14) !important',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--color-prd-selection-match-bg)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--color-prd-active-line-bg)',
    borderRadius: 'var(--radius-lg)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--color-prd-active-line-gutter-bg)',
    color: 'var(--color-prd-text-muted)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'var(--color-prd-matching-bracket-bg)',
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-prd-gutter-bg)',
    borderRight: '1px solid var(--color-prd-gutter-border)',
    color: 'var(--color-prd-text-gutter)',
  },
  '.cm-foldGutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    padding: '0 var(--spacing-2)',
    color: 'var(--color-prd-gutter-element)',
    cursor: 'pointer',
    transition: 'color var(--transition-fast), background-color var(--transition-fast)',
    borderRadius: 'var(--radius-base)',
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: 'var(--color-prd-accent)',
    backgroundColor: 'rgb(var(--color-prd-accent-rgb) / 0.1)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    boxSizing: 'border-box',
    color: 'inherit',
    fontSize: 'var(--font-size-sm)',
    padding: '0 6px 0 10px',
    minWidth: '28px',
  },
  '.cm-content': {
    padding: '0 var(--spacing-4) var(--spacing-6) 10px',
    caretColor: 'var(--color-prd-accent)',
    fontFamily: 'var(--font-family-base)',
    fontSize: 'var(--font-size-md)',
  },
  '.cm-line': {
    padding: '0 2px',
  },
  '.cm-md-heading': {
    color: 'var(--color-prd-text)',
    fontWeight: 'var(--font-weight-bold)',
    fontSize: 'var(--font-size-md)',
    lineHeight: 'var(--line-height-loose)',
    letterSpacing: '0',
  },
  '.cm-md-heading-1': {
    boxShadow: 'inset 0 -1px 0 rgb(var(--color-prd-accent-rgb) / 0.16)',
  },
  '.cm-md-heading-2': {
    color: 'var(--color-prd-heading-2)',
  },
  '.cm-md-heading-3': {
    color: 'var(--color-prd-heading-3)',
  },
  '.cm-md-blockquote': {
    paddingLeft: 'var(--spacing-3)',
    borderLeft: '3px solid rgb(var(--color-prd-accent-rgb) / 0.22)',
    backgroundColor: 'rgb(var(--color-prd-accent-rgb) / 0.06)',
    color: 'var(--color-prd-text-muted)',
  },
  '.cm-md-list-line': {
    paddingLeft: '6px',
  },
  '.cm-md-table-line': {
    fontFamily: 'var(--font-family-code)',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    backgroundColor: 'var(--color-prd-table-line-bg)',
  },
  '.cm-md-table-header': {
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-prd-text)',
    backgroundColor: 'var(--color-prd-table-header-bg)',
  },
  '.cm-md-table-divider': {
    color: 'var(--color-prd-table-divider)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--color-prd-fold-bg)',
    border: '1px solid var(--color-prd-fold-border)',
    color: 'var(--color-prd-fold-text)',
    borderRadius: 'var(--radius-full)',
    padding: '0 var(--spacing-2)',
  },
  '.cm-md-codeblock-line': {
    backgroundColor: 'var(--color-prd-codeblock-bg)',
    fontFamily: 'var(--font-family-code)',
    fontSize: 'inherit',
    lineHeight: 'inherit',
  },
  '.cm-md-codeblock-start': {
    borderTopLeftRadius: 'var(--radius-lg)',
    borderTopRightRadius: 'var(--radius-lg)',
  },
  '.cm-md-codeblock-end': {
    borderBottomLeftRadius: 'var(--radius-lg)',
    borderBottomRightRadius: 'var(--radius-lg)',
  },
  '.cm-md-context-hover': {
    backgroundColor: 'rgb(var(--color-prd-accent-rgb) / 0.08)',
    boxShadow: 'inset 2px 0 0 rgb(var(--color-prd-accent-rgb) / 0.24), inset 0 0 0 1px rgb(var(--color-prd-accent-rgb) / 0.14)',
  },
  '.cm-md-context-selected': {
    backgroundColor: 'rgb(var(--color-prd-accent-rgb) / 0.13)',
    boxShadow: 'inset 4px 0 0 var(--color-prd-accent), inset 0 0 0 1px rgb(var(--color-prd-accent-rgb) / 0.2)',
  },
  '.cm-md-context-start': {
    borderTopLeftRadius: 'var(--radius-lg)',
    borderTopRightRadius: 'var(--radius-lg)',
  },
  '.cm-md-context-end': {
    borderBottomLeftRadius: 'var(--radius-lg)',
    borderBottomRightRadius: 'var(--radius-lg)',
  },
  '.cm-md-context-selected.cm-md-context-start': {
    boxShadow: 'inset 4px 0 0 var(--color-prd-accent), inset 0 1px 0 rgb(var(--color-prd-accent-rgb) / 0.28), inset 0 0 0 1px rgb(var(--color-prd-accent-rgb) / 0.2)',
  },
  '.cm-md-context-selected.cm-md-context-end': {
    boxShadow: 'inset 4px 0 0 var(--color-prd-accent), inset 0 -1px 0 rgb(var(--color-prd-accent-rgb) / 0.28), inset 0 0 0 1px rgb(var(--color-prd-accent-rgb) / 0.2)',
  },
  '.cm-placeholder': {
    color: 'var(--color-text-quaternary)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--color-prd-bg)',
    color: 'var(--color-prd-text-panel)',
  },
  '.cm-editor.cm-focused .cm-line::selection': {
    backgroundColor: 'rgb(var(--color-prd-accent-rgb) / 0.14)',
  },
});

const viewerSyntaxHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading, color: 'var(--color-prd-text)', fontWeight: 'var(--font-weight-bold)' },
    { tag: t.emphasis, fontStyle: 'italic', color: 'var(--color-prd-text-dim)' },
    { tag: t.strong, fontWeight: 'var(--font-weight-bold)', color: 'var(--color-prd-text)' },
    { tag: t.strikethrough, color: 'var(--color-prd-text-placeholder)', textDecoration: 'line-through' },
    { tag: t.link, color: 'var(--color-prd-accent)' },
    { tag: t.url, color: 'var(--color-prd-text-dim)', textDecoration: 'underline' },
    { tag: t.monospace, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-code)' },
    { tag: t.list, color: 'var(--color-prd-text-dim)' },
    { tag: t.quote, color: 'var(--color-prd-text-dim)', fontStyle: 'italic' },
    { tag: t.contentSeparator, color: 'var(--color-prd-separator)' },
    { tag: t.separator, color: 'var(--color-prd-separator)' },
    { tag: t.escape, color: 'var(--color-prd-accent)' },
    { tag: t.comment, color: 'var(--color-prd-text-gutter)' },
    { tag: t.processingInstruction, color: 'var(--color-prd-text-gutter)' },
    { tag: t.meta, color: 'var(--color-prd-text-gutter)' },
    { tag: t.keyword, color: 'var(--color-prd-accent)', fontWeight: 'var(--font-weight-semibold)' },
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

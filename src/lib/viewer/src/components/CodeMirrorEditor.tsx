import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';

// ==================== 自定义主题 ====================
//
// 对齐 viewer 设计语言（tokens.css）：
//   主色 #1677ff | 文本 #262626/#595959/#8c8c8c/#bfbfbf
//   背景 #ffffff | 二级背景 #fafafa | 三级背景 #f5f5f5

/** 结构样式：背景、游标、选区、gutter、激活行 */
const viewerTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#262626',
  },
  '&.cm-focused': { outline: 'none' },

  /* 游标 */
  '.cm-cursor': { borderLeftColor: '#1677ff' },

  /* 选区 */
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(22, 119, 255, 0.12) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(22, 119, 255, 0.12) !important',
  },

  /* 搜索匹配 */
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(22, 119, 255, 0.12)',
  },

  /* 激活行 */
  '.cm-activeLine': {
    backgroundColor: 'rgba(22, 119, 255, 0.04)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(22, 119, 255, 0.06)',
  },

  /* 匹配括号 */
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(22, 119, 255, 0.18)',
    outline: 'none',
  },

  /* Gutter（行号区） */
  '.cm-gutters': {
    backgroundColor: '#fafafa',
    borderRight: '1px solid #f0f0f0',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    color: '#bfbfbf',
    fontSize: '11px',
    padding: '0 8px 0 12px',
  },

  /* 内容内边距 */
  '.cm-content': {
    padding: '22px 24px',
    caretColor: '#1677ff',
  },

  /* 尾部空白区域着色 */
  '.cm-editor.cm-focused .cm-line::selection': {
    backgroundColor: 'rgba(22, 119, 255, 0.12)',
  },
});

/** 语法高亮色：对齐 viewer 色彩系统 */
const viewerSyntaxHighlight = syntaxHighlighting(
  HighlightStyle.define([
    /* 标题 */
    { tag: t.heading, color: '#1f1f1f', fontWeight: '600' },

    /* 强调 / 加粗 / 删除 */
    { tag: t.emphasis, fontStyle: 'italic', color: '#595959' },
    { tag: t.strong, fontWeight: '700', color: '#1f1f1f' },
    { tag: t.strikethrough, color: '#bfbfbf', textDecoration: 'line-through' },

    /* 链接 */
    { tag: t.link, color: '#1677ff' },
    { tag: t.url, color: '#8c8c8c', textDecoration: 'underline' },

    /* 代码 */
    { tag: t.monospace, color: '#d73a49', fontFamily: 'Monaco, Menlo, Consolas, monospace' },

    /* 列表 / 引用 */
    { tag: t.list, color: '#8c8c8c' },
    { tag: t.quote, color: '#595959', fontStyle: 'italic' },

    /* 分隔线 */
    { tag: t.contentSeparator, color: '#e8e8e8' },
    { tag: t.separator, color: '#e8e8e8' },

    /* 转义 / 注释 */
    { tag: t.escape, color: '#1677ff' },
    { tag: t.comment, color: '#8c8c8c' },

    /* 标记高亮 */
    { tag: t.processingInstruction, color: '#8c8c8c' },
    { tag: t.meta, color: '#8c8c8c' },
  ]),
);

// ==================== 组件 ====================

interface CodeMirrorEditorProps {
  value: string;
  onChange?: (value: string) => void;
}

export default function CodeMirrorEditor({ value, onChange }: CodeMirrorEditorProps) {
  return (
    <CodeMirror
      className="prd-preview-editor"
      value={value}
      onChange={(val) => onChange?.(val)}
      extensions={[
        markdown(),
        EditorView.lineWrapping,
        viewerTheme,
        viewerSyntaxHighlight,
      ]}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
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

import { useRef, useMemo, useEffect, useState } from 'react';
import { useCodeMirror } from './useCodeMirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { LanguageDescription, HighlightStyle, syntaxHighlighting, foldCode, unfoldAll } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { keymap, lineNumbers, drawSelection } from '@codemirror/view';
import { EditorState, Extension } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';

export type MarkdownActionType =
  | 'insert-table'
  | 'insert-task-list'
  | 'insert-code-block'
  | 'fold-heading'
  | 'unfold-all';

export interface MarkdownEditorAction {
  type: MarkdownActionType;
  seq: number;
}

interface SourceEditorProps {
  content: string;
  onChange: (text: string) => void;
  filePath: string | null;
  readOnly?: boolean;
  markdownAction?: MarkdownEditorAction | null;
}

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg-base)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--accent-primary)' },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--bg-divider)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--accent-primary)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--bg-overlay)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--bg-overlay)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-overlay)' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
  '.cm-scroller': { overflow: 'auto', height: '100%', scrollbarGutter: 'stable both-edges' },
  '.cm-formatting': { color: 'var(--md-syntax)' },
  '.cm-formatting-header': { color: 'var(--md-syntax)' },
  '.cm-formatting-em': { color: 'var(--md-syntax)' },
  '.cm-formatting-strong': { color: 'var(--md-syntax)' },
  '.cm-formatting-code': { color: 'var(--md-syntax)' },
  '.cm-formatting-link': { color: 'var(--md-syntax)' },
  '.cm-heading': { color: 'var(--md-heading)', fontWeight: '600' },
  '.cm-emphasis': { color: 'var(--md-emphasis)' },
  '.cm-strong': { color: 'var(--md-strong)' },
  '.cm-url, .cm-link, .cm-link .cm-url': {
    color: 'var(--text-link)',
    textDecoration: 'underline',
  },
});

const editorHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier], color: 'var(--syntax-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syntax-string)' },
  { tag: [t.number, t.integer, t.float, t.bool, t.null], color: 'var(--syntax-number)' },
  { tag: [t.typeName, t.className], color: 'var(--syntax-type)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syntax-func)' },
  { tag: [t.variableName, t.propertyName], color: 'var(--text-primary)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--text-muted)' },
  { tag: [t.operator, t.punctuation], color: 'var(--text-secondary)' },
  { tag: [t.link, t.url], color: 'var(--text-link)', textDecoration: 'underline' },
  { tag: [t.heading], color: 'var(--md-heading)', fontWeight: '600' },
  { tag: [t.strong], color: 'var(--md-strong)', fontWeight: '700' },
  { tag: [t.emphasis], color: 'var(--md-emphasis)', fontStyle: 'italic' },
  { tag: [t.monospace], color: 'var(--md-inline-code)' },
  { tag: [t.list, t.quote, t.separator], color: 'var(--md-syntax)' },
]);

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function getLanguageFilename(path: string | null): string | null {
  if (!path) return null;
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

export function SourceEditor({ content, onChange, filePath, readOnly = false, markdownAction = null }: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [languageExtension, setLanguageExtension] = useState<Extension>([]);
  const fileName = getLanguageFilename(filePath);
  const isMarkdownFile = !!fileName && ['.md', '.markdown', '.mdx'].some(ext => fileName.toLowerCase().endsWith(ext));

  const applyInsert = (view: EditorView, text: string) => {
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: text },
      selection: { anchor: selection.from + text.length },
      scrollIntoView: true,
    });
    view.focus();
  };

  const applyCodeBlockInsert = (view: EditorView) => {
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    const body = selected.length > 0 ? selected : '';
    const insertText = `\`\`\`\n${body}\n\`\`\`\n`;
    const anchor = selection.from + 4;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: insertText },
      selection: { anchor },
      scrollIntoView: true,
    });
    view.focus();
  };

  const applyMarkdownAction = (view: EditorView, action: MarkdownActionType) => {
    if (readOnly || !isMarkdownFile) return;
    switch (action) {
      case 'insert-table':
        applyInsert(view, '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n');
        return;
      case 'insert-task-list':
        applyInsert(view, '- [ ] Task 1\n- [ ] Task 2\n');
        return;
      case 'insert-code-block':
        applyCodeBlockInsert(view);
        return;
      case 'fold-heading':
        foldCode(view);
        return;
      case 'unfold-all':
        unfoldAll(view);
        return;
      default:
        return;
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function resolveLanguage() {
      const fileName = getLanguageFilename(filePath);
      if (!fileName) {
        setLanguageExtension([]);
        return;
      }
      const description = LanguageDescription.matchFilename(languages, fileName);
      if (!description) {
        setLanguageExtension([]);
        return;
      }
      try {
        const support = await description.load();
        if (!cancelled) setLanguageExtension(support.extension);
      } catch {
        if (!cancelled) setLanguageExtension([]);
      }
    }

    resolveLanguage();
    return () => { cancelled = true; };
  }, [filePath]);

  const extensions = useMemo(() => [
    history(),
    lineNumbers(),
    drawSelection(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    syntaxHighlighting(editorHighlightStyle, { fallback: true }),
    isMarkdownFile
      ? EditorView.domEventHandlers({
          paste: (event, view) => {
            if (readOnly) return false;
            const text = event.clipboardData?.getData('text/plain');
            if (!text) return false;
            const selection = view.state.selection.main;
            const selected = view.state.sliceDoc(selection.from, selection.to);
            const trimmed = text.trim();
            const isUrl = /^https?:\/\/\S+$/i.test(trimmed);
            if (selected && isUrl) {
              event.preventDefault();
              applyInsert(view, `[${selected}](${trimmed})`);
              return true;
            }
            const isCodeLike =
              text.includes('\n')
              && (/\t| {2,}/.test(text) || /[{}()[\];=<>]/.test(text) || /\b(class|function|const|let|import|export)\b/.test(text));
            if (isCodeLike) {
              event.preventDefault();
              const safe = text.replace(/\r\n/g, '\n');
              const codeBlock = `\`\`\`\n${safe}\n\`\`\``;
              applyInsert(view, codeBlock);
              return true;
            }
            return false;
          },
        })
      : [],
    isMarkdownFile ? markdown({ base: markdownLanguage, codeLanguages: languages }) : languageExtension,
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    baseTheme,
    EditorView.lineWrapping,
  ], [isMarkdownFile, languageExtension, readOnly]);

  const viewRef = useCodeMirror({ containerRef, value: content, onChange, extensions });

  useEffect(() => {
    if (!markdownAction?.seq) return;
    const view = viewRef.current;
    if (!view) return;
    applyMarkdownAction(view, markdownAction.type);
  }, [markdownAction, viewRef, readOnly, isMarkdownFile]);

  return <div ref={containerRef} className="h-full overflow-hidden" />;
}

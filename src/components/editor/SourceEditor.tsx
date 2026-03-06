import { useRef, useMemo, useEffect, useState } from 'react';
import { useCodeMirror } from './useCodeMirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { LanguageDescription, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { keymap, lineNumbers, drawSelection } from '@codemirror/view';
import { EditorState, Extension } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';

interface SourceEditorProps {
  content: string;
  onChange: (text: string) => void;
  filePath: string | null;
  readOnly?: boolean;
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
  '.cm-formatting': { color: 'var(--text-secondary)' },
  '.cm-formatting-header': { color: 'var(--text-secondary)' },
  '.cm-formatting-em': { color: 'var(--text-secondary)' },
  '.cm-formatting-strong': { color: 'var(--text-secondary)' },
  '.cm-formatting-code': { color: 'var(--text-secondary)' },
  '.cm-formatting-link': { color: 'var(--text-secondary)' },
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

export function SourceEditor({ content, onChange, filePath, readOnly = false }: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [languageExtension, setLanguageExtension] = useState<Extension>([]);
  const fileName = getLanguageFilename(filePath);
  const isMarkdownFile = !!fileName && ['.md', '.markdown', '.mdx'].some(ext => fileName.toLowerCase().endsWith(ext));

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
    isMarkdownFile ? markdown({ base: markdownLanguage, codeLanguages: languages }) : languageExtension,
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    baseTheme,
    EditorView.lineWrapping,
  ], [isMarkdownFile, languageExtension, readOnly]);

  useCodeMirror({ containerRef, value: content, onChange, extensions });

  return <div ref={containerRef} className="h-full overflow-hidden" />;
}

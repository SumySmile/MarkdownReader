import { useRef, useMemo, useEffect, useState, type CSSProperties } from 'react';
import { useCodeMirror } from './useCodeMirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, foldCode, unfoldAll } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { keymap, lineNumbers, drawSelection } from '@codemirror/view';
import { EditorState, Extension } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import { getFileVisualType, type FileVisualType } from '../../lib/fileVisualType';

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
  contentZoomPct?: number;
  getScrollPosition?: (path: string) => number;
  setScrollPosition?: (path: string, top: number) => void;
}

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg-base)',
    color: 'var(--text-primary)',
    fontSize: 'calc(15px * var(--content-zoom, 1))',
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
  '.cm-formatting': { color: 'var(--md-marker)' },
  '.cm-formatting-header': { color: 'var(--md-marker)' },
  '.cm-formatting-em': { color: 'var(--md-marker)' },
  '.cm-formatting-strong': { color: 'var(--md-marker)' },
  '.cm-formatting-code': { color: 'var(--md-marker)' },
  '.cm-formatting-link': { color: 'var(--md-marker)' },
  '.cm-quote, .cm-hr': { color: 'var(--md-marker)' },
  '.cm-heading': { color: 'var(--md-heading)', fontWeight: '600' },
  '.cm-emphasis': { color: 'var(--md-emphasis)' },
  '.cm-strong': { color: 'var(--md-strong)' },
  '.cm-url, .cm-link, .cm-link .cm-url': {
    color: 'var(--text-link)',
    textDecoration: 'underline',
  },
});

type SourceHighlightProfile = 'markdown' | 'code' | 'config' | 'script' | 'data' | 'docs' | 'plain';

function toSourceProfile(fileVisualType: FileVisualType): SourceHighlightProfile {
  switch (fileVisualType) {
    case 'markdown':
    case 'code':
    case 'config':
    case 'script':
    case 'data':
    case 'docs':
    case 'plain':
      return fileVisualType;
    default:
      return 'plain';
  }
}

function profileColor(profile: SourceHighlightProfile, token: 'keyword' | 'string' | 'number' | 'type' | 'func' | 'comment'): string {
  const variants: Record<SourceHighlightProfile, Record<'keyword' | 'string' | 'number' | 'type' | 'func' | 'comment', string>> = {
    markdown: {
      keyword: 'var(--syntax-keyword)',
      string: 'var(--md-inline-code)',
      number: 'var(--syntax-number)',
      type: 'var(--md-heading)',
      func: 'var(--text-link)',
      comment: 'var(--md-marker)',
    },
    code: {
      keyword: 'var(--syntax-keyword)',
      string: 'var(--syntax-string)',
      number: 'var(--syntax-number)',
      type: 'var(--syntax-type)',
      func: 'var(--syntax-func)',
      comment: 'var(--text-muted)',
    },
    config: {
      keyword: 'var(--syntax-type)',
      string: 'var(--syntax-string)',
      number: 'var(--syntax-number)',
      type: 'var(--syntax-keyword)',
      func: 'var(--text-link)',
      comment: 'var(--text-muted)',
    },
    script: {
      keyword: 'var(--syntax-func)',
      string: 'var(--syntax-string)',
      number: 'var(--syntax-number)',
      type: 'var(--syntax-type)',
      func: 'var(--syntax-keyword)',
      comment: 'var(--text-muted)',
    },
    data: {
      keyword: 'var(--syntax-type)',
      string: 'var(--syntax-string)',
      number: 'var(--syntax-number)',
      type: 'var(--syntax-keyword)',
      func: 'var(--syntax-func)',
      comment: 'var(--text-muted)',
    },
    docs: {
      keyword: 'var(--text-secondary)',
      string: 'var(--md-inline-code)',
      number: 'var(--syntax-number)',
      type: 'var(--text-primary)',
      func: 'var(--text-link)',
      comment: 'var(--text-muted)',
    },
    plain: {
      keyword: 'var(--text-secondary)',
      string: 'var(--text-primary)',
      number: 'var(--text-secondary)',
      type: 'var(--text-primary)',
      func: 'var(--text-primary)',
      comment: 'var(--text-muted)',
    },
  };
  return variants[profile][token];
}

function createEditorHighlightStyle(profile: SourceHighlightProfile): HighlightStyle {
  return HighlightStyle.define([
    { tag: [t.keyword, t.modifier], color: profileColor(profile, 'keyword') },
    { tag: [t.string, t.special(t.string)], color: profileColor(profile, 'string') },
    { tag: [t.number, t.integer, t.float, t.bool, t.null], color: profileColor(profile, 'number') },
    { tag: [t.typeName, t.className], color: profileColor(profile, 'type') },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: profileColor(profile, 'func') },
    { tag: [t.variableName, t.propertyName], color: 'var(--text-primary)' },
    { tag: [t.comment, t.lineComment, t.blockComment], color: profileColor(profile, 'comment') },
    { tag: [t.operator, t.punctuation], color: 'var(--text-secondary)' },
    { tag: [t.link, t.url], color: 'var(--text-link)', textDecoration: 'underline' },
    { tag: [t.heading], color: 'var(--md-heading)', fontWeight: '600' },
    { tag: [t.strong], color: 'var(--md-strong)', fontWeight: '700' },
    { tag: [t.emphasis], color: 'var(--md-emphasis)', fontStyle: 'italic' },
    { tag: [t.monospace], color: 'var(--md-inline-code)' },
    { tag: [t.list, t.quote, t.separator], color: 'var(--md-marker)' },
  ]);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function getLanguageFilename(path: string | null): string | null {
  if (!path) return null;
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0 || idx === fileName.length - 1) return '';
  return fileName.slice(idx).toLowerCase();
}

async function loadLanguageExtension(fileName: string): Promise<Extension> {
  const ext = getFileExtension(fileName);
  if (!ext) return [];

  try {
    if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs' || ext === '.ts' || ext === '.tsx') {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({
        typescript: ext === '.ts' || ext === '.tsx',
        jsx: ext === '.jsx' || ext === '.tsx',
      });
    }
    if (ext === '.json' || ext === '.jsonc') {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    if (ext === '.py') {
      const { python } = await import('@codemirror/lang-python');
      return python();
    }
    if (ext === '.yaml' || ext === '.yml') {
      const { yaml } = await import('@codemirror/lang-yaml');
      return yaml();
    }
    if (ext === '.sql') {
      const { sql } = await import('@codemirror/lang-sql');
      return sql();
    }
    if (ext === '.html' || ext === '.htm' || ext === '.xml') {
      const { html } = await import('@codemirror/lang-html');
      return html();
    }
    if (ext === '.css') {
      const { css } = await import('@codemirror/lang-css');
      return css();
    }
  } catch {
    return [];
  }
  return [];
}

export function SourceEditor({
  content,
  onChange,
  filePath,
  readOnly = false,
  markdownAction = null,
  contentZoomPct = 110,
  getScrollPosition,
  setScrollPosition,
}: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [languageExtension, setLanguageExtension] = useState<Extension>([]);
  const prevFilePathRef = useRef<string | null>(null);
  const fileName = getLanguageFilename(filePath);
  const isMarkdownFile = !!fileName && ['.md', '.markdown', '.mdx'].some(ext => fileName.toLowerCase().endsWith(ext));
  const highlightProfile = useMemo(
    () => toSourceProfile(getFileVisualType(filePath)),
    [filePath],
  );
  const editorHighlightStyle = useMemo(
    () => createEditorHighlightStyle(highlightProfile),
    [highlightProfile],
  );

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
      const extension = await loadLanguageExtension(fileName);
      if (!cancelled) setLanguageExtension(extension);
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
    isMarkdownFile ? markdown({ base: markdownLanguage }) : languageExtension,
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    baseTheme,
    EditorView.lineWrapping,
  ], [isMarkdownFile, languageExtension, readOnly]);

  const viewRef = useCodeMirror({ containerRef, value: content, onChange, extensions });

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const scroller = view.scrollDOM;
    if (!scroller) return;
    const onScroll = () => {
      if (!filePath || !setScrollPosition) return;
      setScrollPosition(filePath, scroller.scrollTop);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [filePath, setScrollPosition, viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const scroller = view.scrollDOM;
    if (!scroller) return;

    const prevFile = prevFilePathRef.current;
    if (prevFile && prevFile !== filePath && setScrollPosition) {
      setScrollPosition(prevFile, scroller.scrollTop);
    }

    prevFilePathRef.current = filePath;

    if (!filePath) {
      scroller.scrollTop = 0;
      return;
    }

    const nextTop = getScrollPosition ? getScrollPosition(filePath) : 0;
    requestAnimationFrame(() => {
      scroller.scrollTop = Math.max(0, nextTop);
    });
  }, [filePath, getScrollPosition, setScrollPosition, viewRef]);

  useEffect(() => {
    if (!markdownAction?.seq) return;
    const view = viewRef.current;
    if (!view) return;
    applyMarkdownAction(view, markdownAction.type);
  }, [markdownAction, viewRef, readOnly, isMarkdownFile]);

  const zoomStyle: CSSProperties = {
    ['--content-zoom' as string]: `${Math.max(90, Math.min(130, contentZoomPct)) / 100}`,
  };

  return <div ref={containerRef} className="h-full overflow-hidden" style={zoomStyle} />;
}

import { useRef, useMemo } from 'react';
import { useCodeMirror } from './useCodeMirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { keymap, lineNumbers, drawSelection } from '@codemirror/view';

interface SourceEditorProps {
  content: string;
  onChange: (text: string) => void;
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
  '.cm-scroller': { overflow: 'auto', height: '100%' },
});

export function SourceEditor({ content, onChange }: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const extensions = useMemo(() => [
    history(),
    lineNumbers(),
    drawSelection(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    baseTheme,
    EditorView.lineWrapping,
  ], []);

  useCodeMirror({ containerRef, value: content, onChange, extensions });

  return <div ref={containerRef} className="h-full overflow-hidden" />;
}

import { useEffect } from 'react';
import { Code2, Columns2, Eye, Moon, Cherry, Leaf, Save, Circle, Link2, Unlink2, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SaveState } from '../../hooks/useActiveFile';

export type EditorMode = 'source' | 'preview';
export type Theme = 'dark' | 'light' | 'mint' | 'gray';

interface ToolbarProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  isMarkdownFile: boolean;
  sourceSplitEnabled: boolean;
  onToggleSourceSplit: () => void;
  isEditable: boolean;
  readonlyReason: string | null;
  theme: Theme;
  onThemeToggle: () => void;
  syncScroll: boolean;
  onToggleSyncScroll: () => void;
  saveState: SaveState;
  onSave: () => void;
  fileName: string | null;
}

const SAVE_STATE_LABEL: Record<SaveState, string> = {
  clean: '',
  dirty: 'Unsaved',
  saving: 'Saving...',
  saved: 'Saved',
  error: 'Save failed',
};

const SAVE_STATE_COLOR: Record<SaveState, string> = {
  clean: '',
  dirty: 'var(--accent-warning)',
  saving: 'var(--text-muted)',
  saved: 'var(--accent-success)',
  error: 'var(--accent-error)',
};

const THEME_CYCLE: Theme[] = ['dark', 'mint', 'light', 'gray'];
const THEME_NEXT: Record<Theme, Theme> = {
  dark: 'mint',
  mint: 'light',
  light: 'gray',
  gray: 'dark',
};
const THEME_ICON: Record<Theme, typeof Moon> = {
  dark: Moon,
  mint: Leaf,
  light: Cherry,
  gray: Circle,
};
const THEME_TEXT: Record<Theme, string> = {
  dark: 'Dark',
  mint: 'Mint',
  light: 'Rose',
  gray: 'Gray',
};

export function Toolbar({
  mode,
  onModeChange,
  isMarkdownFile,
  sourceSplitEnabled,
  onToggleSourceSplit,
  isEditable,
  readonlyReason,
  theme,
  onThemeToggle,
  syncScroll,
  onToggleSyncScroll,
  saveState,
  onSave,
  fileName,
}: ToolbarProps) {
  const sourceDisabled = !isEditable;
  const showSplitToggle = mode === 'source' && isMarkdownFile;
  const showSyncToggle = showSplitToggle && sourceSplitEnabled;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isEditable) return;
        onSave();
      }
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        onModeChange(mode === 'source' ? 'preview' : 'source');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditable, mode, onModeChange, onSave]);

  const ThemeIcon = THEME_ICON[theme];

  const modes: { id: EditorMode; icon: typeof Code2; label: string }[] = [
    { id: 'source', icon: Code2, label: 'Source' },
    { id: 'preview', icon: Eye, label: 'Preview' },
  ];

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-1.5 border-b"
      style={{ borderColor: 'var(--bg-divider)', backgroundColor: 'var(--bg-surface)' }}
    >
      <div className="min-w-0">
        <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
          {fileName ? fileName.split(/[\\/]/).pop() : 'No file open'}
        </span>
      </div>

      <div className="justify-self-center flex items-center gap-0.5 rounded p-0.5" style={{ backgroundColor: 'var(--bg-overlay)' }}>
        {modes.map(({ id, icon: Icon, label }) => {
          const disabled = id === 'source' ? sourceDisabled : false;
          return (
            <button
              key={id}
              onClick={() => !disabled && onModeChange(id)}
              aria-pressed={mode === id}
              disabled={disabled}
              title={label}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                mode === id
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                disabled && 'opacity-50 cursor-not-allowed hover:text-[var(--text-muted)]',
              )}
              style={mode === id ? { backgroundColor: 'var(--bg-surface)' } : {}}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="justify-self-end flex items-center gap-2">
        {readonlyReason && (
          <span className="text-xs" style={{ color: 'var(--accent-warning)' }}>
            {readonlyReason}
          </span>
        )}
        {showSyncToggle && (
          <button
            onClick={onToggleSyncScroll}
            title={syncScroll ? 'Disable sync scroll' : 'Enable sync scroll'}
            aria-label={syncScroll ? 'Disable sync scroll' : 'Enable sync scroll'}
            className="p-1.5 rounded hover:bg-[var(--bg-overlay)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {syncScroll ? <Link2 size={14} /> : <Unlink2 size={14} />}
          </button>
        )}
        {showSplitToggle && (
          <button
            onClick={onToggleSourceSplit}
            title={sourceSplitEnabled ? 'Disable split view' : 'Enable split view'}
            aria-label={sourceSplitEnabled ? 'Disable split view' : 'Enable split view'}
            className="p-1.5 rounded hover:bg-[var(--bg-overlay)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {sourceSplitEnabled ? <Columns2 size={14} /> : <Square size={14} />}
          </button>
        )}
        <div className="w-16 text-right">
          {!readonlyReason && saveState !== 'clean' ? (
            <span className="text-xs" style={{ color: SAVE_STATE_COLOR[saveState] }}>
              {SAVE_STATE_LABEL[saveState]}
            </span>
          ) : (
            <button
              onClick={() => isEditable && onSave()}
              title={isEditable ? 'Save (Ctrl+S)' : 'Read-only file'}
              disabled={!isEditable}
              className="p-1 rounded hover:bg-[var(--bg-overlay)]"
              style={{ color: 'var(--text-muted)', opacity: isEditable ? 1 : 0.45 }}
            >
              <Save size={14} />
            </button>
          )}
        </div>
        <button
          onClick={onThemeToggle}
          title="Switch theme"
          className="flex items-center gap-1 px-2 py-1 rounded text-xs"
          style={{ color: 'var(--accent-primary)', backgroundColor: 'var(--bg-overlay)' }}
        >
          <ThemeIcon size={13} />
          <span>{THEME_TEXT[theme]}</span>
        </button>
      </div>
    </div>
  );
}

export { THEME_CYCLE, THEME_NEXT };

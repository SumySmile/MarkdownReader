import { useEffect } from 'react';
import { Code2, Columns2, Eye, Moon, Cherry, Leaf, Save } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SaveState } from '../../hooks/useActiveFile';

export type EditorMode = 'source' | 'split' | 'preview';
export type Theme = 'dark' | 'light' | 'mint';

interface ToolbarProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  theme: Theme;
  onThemeToggle: () => void;
  saveState: SaveState;
  isDirty: boolean;
  onSave: () => void;
  fileName: string | null;
}

const SAVE_STATE_LABEL: Record<SaveState, string> = {
  clean: '',
  dirty: 'Unsaved',
  saving: 'Saving...',
  saved: 'Saved ✓',
  error: 'Save failed ✕',
};

const SAVE_STATE_COLOR: Record<SaveState, string> = {
  clean: '',
  dirty: 'var(--accent-warning)',
  saving: 'var(--text-muted)',
  saved: 'var(--accent-success)',
  error: 'var(--accent-error)',
};

const THEME_CYCLE: Theme[] = ['dark', 'mint', 'light'];
const THEME_NEXT: Record<Theme, Theme> = { dark: 'mint', mint: 'light', light: 'dark' };
const THEME_ICON: Record<Theme, typeof Moon> = { dark: Moon, mint: Leaf, light: Cherry };
const THEME_LABEL: Record<Theme, string> = { dark: '切换薄荷', mint: '切换草莓', light: '切换深色' };

export function Toolbar({ mode, onModeChange, theme, onThemeToggle, saveState, isDirty, onSave, fileName }: ToolbarProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); onSave(); }
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        onModeChange(mode === 'source' ? 'split' : 'source');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, onModeChange, onSave]);

  const ThemeIcon = THEME_ICON[theme];

  const modes: { id: EditorMode; icon: typeof Code2; label: string }[] = [
    { id: 'source', icon: Code2, label: 'Source' },
    { id: 'split', icon: Columns2, label: 'Split' },
    { id: 'preview', icon: Eye, label: 'Preview' },
  ];

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 border-b"
      style={{ borderColor: 'var(--bg-divider)', backgroundColor: 'var(--bg-surface)' }}
    >
      {/* Left: file name + dirty indicator */}
      <div className="flex items-center gap-2 min-w-0">
        {isDirty && (
          <span style={{ color: 'var(--accent-warning)', fontSize: 18, lineHeight: 1 }}>●</span>
        )}
        <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
          {fileName ? fileName.split('/').pop() : 'No file open'}
        </span>
      </div>

      {/* Center: mode toggle */}
      <div className="flex items-center gap-0.5 rounded p-0.5" style={{ backgroundColor: 'var(--bg-overlay)' }}>
        {modes.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onModeChange(id)}
            aria-pressed={mode === id}
            title={label}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
              mode === id
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
            style={mode === id ? { backgroundColor: 'var(--bg-surface)' } : {}}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Right: save state + theme cycle */}
      <div className="flex items-center gap-2">
        {saveState !== 'clean' && (
          <span className="text-xs" style={{ color: SAVE_STATE_COLOR[saveState] }}>
            {SAVE_STATE_LABEL[saveState]}
          </span>
        )}
        <button
          onClick={onSave}
          title="Save (Ctrl+S)"
          className="p-1 rounded"
          style={{ color: 'var(--text-muted)' }}
        >
          <Save size={14} />
        </button>
        <button
          onClick={onThemeToggle}
          title={THEME_LABEL[theme]}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs"
          style={{ color: 'var(--accent-primary)', backgroundColor: 'var(--bg-overlay)' }}
        >
          <ThemeIcon size={13} />
          <span>{theme === 'dark' ? '夜' : theme === 'mint' ? '薄荷' : '草莓'}</span>
        </button>
      </div>
    </div>
  );
}

export { THEME_CYCLE, THEME_NEXT };

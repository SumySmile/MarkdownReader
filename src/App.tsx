import { useEffect, useRef, useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { WysiwygEditorHandle } from './components/editor/WysiwygEditor';
import { useActiveFile } from './hooks/useActiveFile';
import { useFileWatcher } from './hooks/useFileWatcher';
import { storeGet, storeSet } from './lib/store';
import { readFile } from './lib/fs';
import type { EditorMode, Theme } from './components/layout/Toolbar';
import { THEME_NEXT } from './components/layout/Toolbar';

function App() {
  const [pinnedDirs, setPinnedDirs] = useState<string[]>([]);
  const [mode, setMode] = useState<EditorMode>('split');
  const [theme, setTheme] = useState<Theme>('dark');
  const wysiwygRef = useRef<WysiwygEditorHandle | null>(null);
  const { filePath, content, saveState, isDirty, isSelfWritingRef, openFile, handleChange, saveNow } = useActiveFile();

  // Restore persisted state on startup
  useEffect(() => {
    async function restore() {
      const dirs = await storeGet<string[]>('pinnedDirs');
      if (dirs?.length) setPinnedDirs(dirs);

      const savedMode = await storeGet<EditorMode>('editorMode');
      if (savedMode) setMode(savedMode);

      const savedTheme = await storeGet<Theme>('theme');
      if (savedTheme) setTheme(savedTheme);

      const lastFile = await storeGet<string>('lastOpenedFile');
      if (lastFile) {
        try {
          await openFile(lastFile);
        } catch { /* file no longer exists */ }
      }
    }
    restore();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // File watcher for external changes
  const watchDir = filePath ? filePath.substring(0, filePath.lastIndexOf('/')) : null;
  useFileWatcher(watchDir, filePath, isSelfWritingRef, () => {
    if (!filePath) return;
    readFile(filePath).then(text => {
      if (text !== content) {
        openFile(filePath);
      }
    }).catch(console.error);
  });

  // Keyboard shortcut: Ctrl+F → focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder="Filter files..."]')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handlePinDir = async (path: string) => {
    const next = pinnedDirs.includes(path) ? pinnedDirs : [...pinnedDirs, path];
    setPinnedDirs(next);
    await storeSet('pinnedDirs', next);
  };

  const handleUnpinDir = async (path: string) => {
    const next = pinnedDirs.filter(d => d !== path);
    setPinnedDirs(next);
    await storeSet('pinnedDirs', next);
  };

  const handleModeChange = async (newMode: EditorMode) => {
    setMode(newMode);
    await storeSet('editorMode', newMode);
  };

  const handleThemeToggle = async () => {
    const next: Theme = THEME_NEXT[theme];
    setTheme(next);
    await storeSet('theme', next);
  };

  return (
    <AppLayout
      pinnedDirs={pinnedDirs}
      onPinDir={handlePinDir}
      onUnpinDir={handleUnpinDir}
      activeFile={filePath}
      content={content}
      saveState={saveState}
      isDirty={isDirty}
      mode={mode}
      theme={theme}
      onSelectFile={openFile}
      onContentChange={handleChange}
      onModeChange={handleModeChange}
      onThemeToggle={handleThemeToggle}
      onSave={saveNow}
      wysiwygRef={wysiwygRef}
    />
  );
}

export default App;

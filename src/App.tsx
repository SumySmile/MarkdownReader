import { useEffect, useRef, useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { WysiwygEditorHandle } from './components/editor/WysiwygEditor';
import { useActiveFile } from './hooks/useActiveFile';
import { useFileWatcher } from './hooks/useFileWatcher';
import { storeGet, storeSet } from './lib/store';
import { getLaunchArgs, pickMarkdownFiles, readFile } from './lib/fs';
import { isMarkdownPath } from './lib/markdown';
import type { EditorMode, Theme } from './components/layout/Toolbar';
import { THEME_NEXT } from './components/layout/Toolbar';

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function mergeUniquePaths(existing: string[], incoming: string[]): string[] {
  const map = new Map<string, string>();
  for (const item of existing) {
    const normalized = normalizePath(item);
    map.set(normalized.toLowerCase(), normalized);
  }
  for (const item of incoming) {
    const normalized = normalizePath(item);
    map.set(normalized.toLowerCase(), normalized);
  }
  return Array.from(map.values());
}

function App() {
  const [pinnedDirs, setPinnedDirs] = useState<string[]>([]);
  const [pinnedFiles, setPinnedFiles] = useState<string[]>([]);
  const [starredFiles, setStarredFiles] = useState<string[]>([]);
  const [filesPanelOpen, setFilesPanelOpen] = useState<boolean>(true);
  const [mode, setMode] = useState<EditorMode>('split');
  const [theme, setTheme] = useState<Theme>('gray');
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const wysiwygRef = useRef<WysiwygEditorHandle | null>(null);
  const { filePath, content, saveState, isDirty, isSelfWritingRef, openFile, handleChange, saveNow } = useActiveFile();

  useEffect(() => {
    async function restore() {
      const dirs = await storeGet<string[]>('pinnedDirs');
      if (dirs?.length) setPinnedDirs(dirs.map(normalizePath));

      const files = await storeGet<string[]>('pinnedFiles');
      if (files?.length) setPinnedFiles(files.map(normalizePath));

      const stars = await storeGet<string[]>('starredFiles');
      if (stars?.length) setStarredFiles(stars.map(normalizePath));

      const savedFilesPanelOpen = await storeGet<boolean>('filesPanelOpen');
      if (typeof savedFilesPanelOpen === 'boolean') setFilesPanelOpen(savedFilesPanelOpen);

      const savedMode = await storeGet<EditorMode>('editorMode');
      if (savedMode) setMode(savedMode);

      const savedTheme = await storeGet<Theme>('theme');
      if (savedTheme) setTheme(savedTheme);

      const savedSyncScroll = await storeGet<boolean>('syncScroll');
      if (typeof savedSyncScroll === 'boolean') setSyncScroll(savedSyncScroll);

      const args = await getLaunchArgs();
      const launchPath = args.map(normalizePath).find(arg => isMarkdownPath(arg));
      if (launchPath) {
        try {
          await openFile(launchPath);
          setPinnedFiles(prev => {
            if (prev.includes(launchPath)) return prev;
            const next = [...prev, launchPath];
            storeSet('pinnedFiles', next);
            return next;
          });
          return;
        } catch {
          // ignore invalid launch argument
        }
      }

      const lastFile = await storeGet<string>('lastOpenedFile');
      if (lastFile) {
        try {
          await openFile(normalizePath(lastFile));
        } catch {
          // file no longer exists
        }
      }
    }
    restore();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const watchDir = filePath
    ? filePath.replace(/\\/g, '/').substring(0, filePath.replace(/\\/g, '/').lastIndexOf('/'))
    : null;
  useFileWatcher(watchDir, filePath, isSelfWritingRef, () => {
    if (!filePath) return;
    readFile(filePath).then(text => {
      if (text !== content) {
        openFile(filePath);
      }
    }).catch(console.error);
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        pickMarkdownFiles().then(async paths => {
          if (!paths.length) return;
          const normalized = paths.map(normalizePath);
          setPinnedFiles(prev => {
            const merged = mergeUniquePaths(prev, normalized);
            storeSet('pinnedFiles', merged);
            return merged;
          });
          await openFile(normalized[normalized.length - 1]);
        }).catch(console.error);
      }
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder="Filter files..."]')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openFile]);

  const handlePinDir = async (path: string) => {
    const normalized = normalizePath(path);
    const next = pinnedDirs.includes(normalized) ? pinnedDirs : [...pinnedDirs, normalized];
    setPinnedDirs(next);
    await storeSet('pinnedDirs', next);
  };

  const handleUnpinDir = async (path: string) => {
    const normalized = normalizePath(path);
    const next = pinnedDirs.filter(d => d !== normalized);
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

  const handleToggleSyncScroll = async () => {
    const next = !syncScroll;
    setSyncScroll(next);
    await storeSet('syncScroll', next);
  };

  const handleAddFiles = async () => {
    const selected = await pickMarkdownFiles();
    if (!selected.length) return;
    const normalized = selected.map(normalizePath);
    const merged = mergeUniquePaths(pinnedFiles, normalized);
    setPinnedFiles(merged);
    await storeSet('pinnedFiles', merged);
    await openFile(normalized[normalized.length - 1]);
  };

  const handleToggleFileStar = async (path: string) => {
    const normalized = normalizePath(path);
    const next = starredFiles.includes(normalized)
      ? starredFiles.filter(p => p !== normalized)
      : [...starredFiles, normalized];
    setStarredFiles(next);
    await storeSet('starredFiles', next);
  };

  const handleToggleFilesPanel = async () => {
    const next = !filesPanelOpen;
    setFilesPanelOpen(next);
    await storeSet('filesPanelOpen', next);
  };

  const handleRemovePinnedFile = async (path: string) => {
    const normalized = normalizePath(path);
    const nextFiles = pinnedFiles.filter(p => p.toLowerCase() !== normalized.toLowerCase());
    setPinnedFiles(nextFiles);
    await storeSet('pinnedFiles', nextFiles);

    const nextStars = starredFiles.filter(p => p.toLowerCase() !== normalized.toLowerCase());
    setStarredFiles(nextStars);
    await storeSet('starredFiles', nextStars);
  };

  const handleClearUnstarredFiles = async () => {
    const starSet = new Set(starredFiles.map(p => p.toLowerCase()));
    const nextFiles = pinnedFiles.filter(p => starSet.has(p.toLowerCase()));
    setPinnedFiles(nextFiles);
    await storeSet('pinnedFiles', nextFiles);
  };

  return (
    <AppLayout
      pinnedDirs={pinnedDirs}
      pinnedFiles={pinnedFiles}
      starredFiles={starredFiles}
      filesPanelOpen={filesPanelOpen}
      onPinDir={handlePinDir}
      onUnpinDir={handleUnpinDir}
      onAddFiles={handleAddFiles}
      onToggleFileStar={handleToggleFileStar}
      onToggleFilesPanel={handleToggleFilesPanel}
      onRemovePinnedFile={handleRemovePinnedFile}
      onClearUnstarredFiles={handleClearUnstarredFiles}
      activeFile={filePath}
      content={content}
      saveState={saveState}
      isDirty={isDirty}
      mode={mode}
      theme={theme}
      syncScroll={syncScroll}
      onSelectFile={openFile}
      onContentChange={handleChange}
      onModeChange={handleModeChange}
      onThemeToggle={handleThemeToggle}
      onToggleSyncScroll={handleToggleSyncScroll}
      onSave={saveNow}
      wysiwygRef={wysiwygRef}
    />
  );
}

export default App;

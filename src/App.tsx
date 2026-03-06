import { useEffect, useRef, useState, useCallback } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { WysiwygEditorHandle } from './components/editor/WysiwygEditor';
import { useActiveFile } from './hooks/useActiveFile';
import { useFileWatcher } from './hooks/useFileWatcher';
import { storeGet, storeSet } from './lib/store';
import { getLaunchArgs, openContainingFolder, pickOpenableTextFiles, readFile } from './lib/fs';
import { getFileKind, isEditablePath, isOpenablePath, isReadonlyPreviewPath, type FileKind } from './lib/markdown';
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

function removePathCaseInsensitive(paths: string[], target: string): string[] {
  const lower = target.toLowerCase();
  return paths.filter(item => item.toLowerCase() !== lower);
}

const MAX_EDITABLE_BYTES = 1 * 1024 * 1024;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function getReadonlyReason(path: string, content: string): string | null {
  if (byteLength(content) > MAX_EDITABLE_BYTES) return 'Read-only: file too large (>1MB)';
  if (!isOpenablePath(path)) return 'Read-only: unsupported file type';
  if (isReadonlyPreviewPath(path)) return 'Read-only: protected file type/path';
  if (!isEditablePath(path)) return 'Read-only: non-editable file type';
  return null;
}

function App() {
  const [pinnedDirs, setPinnedDirs] = useState<string[]>([]);
  const [pinnedFiles, setPinnedFiles] = useState<string[]>([]);
  const [starredFiles, setStarredFiles] = useState<string[]>([]);
  const [filesPanelOpen, setFilesPanelOpen] = useState<boolean>(true);
  const [mode, setMode] = useState<EditorMode>('source');
  const [sourceSplitEnabled, setSourceSplitEnabled] = useState<boolean>(true);
  const [theme, setTheme] = useState<Theme>('gray');
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const [activeFileKind, setActiveFileKind] = useState<FileKind | null>(null);
  const [activeFileEditable, setActiveFileEditable] = useState<boolean>(true);
  const [readonlyReason, setReadonlyReason] = useState<string | null>(null);
  const wysiwygRef = useRef<WysiwygEditorHandle | null>(null);
  const activeFilePathRef = useRef<string | null>(null);
  const activeContentRef = useRef('');
  const { filePath, content, saveState, isDirty, isSelfWritingRef, openFile, handleChange, saveNow } = useActiveFile();

  useEffect(() => {
    activeFilePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    activeContentRef.current = content;
  }, [content]);

  const openFileByPath = useCallback(async (path: string) => {
    const normalized = normalizePath(path);
    if (!isOpenablePath(normalized)) return;

    const result = await openFile(normalized);
    if (!result.opened) return;
    const kind = getFileKind(normalized);
    setActiveFileKind(kind);
    const reason = getReadonlyReason(normalized, result.content ?? '');
    setReadonlyReason(reason);
    setActiveFileEditable(!reason);

    if (reason) {
      setMode('preview');
      storeSet('editorMode', 'preview');
    }
  }, [openFile]);

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

      const savedMode = await storeGet<string>('editorMode');
      if (savedMode === 'source' || savedMode === 'preview') {
        setMode(savedMode);
      } else if (savedMode === 'split') {
        setMode('source');
        setSourceSplitEnabled(true);
      }

      const savedSplitEnabled = await storeGet<boolean>('sourceSplitEnabled');
      if (typeof savedSplitEnabled === 'boolean') setSourceSplitEnabled(savedSplitEnabled);

      const savedTheme = await storeGet<Theme>('theme');
      if (savedTheme) setTheme(savedTheme);

      const savedSyncScroll = await storeGet<boolean>('syncScroll');
      if (typeof savedSyncScroll === 'boolean') setSyncScroll(savedSyncScroll);

      const args = await getLaunchArgs();
      const launchPath = args.map(normalizePath).find(isOpenablePath);
      if (launchPath) {
        try {
          await openFileByPath(launchPath);
          setPinnedFiles(prev => {
            const merged = mergeUniquePaths(prev, [launchPath]);
            storeSet('pinnedFiles', merged);
            return merged;
          });
          return;
        } catch {
          // ignore invalid launch argument
        }
      }

      const lastFile = await storeGet<string>('lastOpenedFile');
      if (lastFile) {
        try {
          await openFileByPath(lastFile);
        } catch {
          // file no longer exists
        }
      }
    }
    restore();
  }, [openFileByPath]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const watchDir = filePath
    ? filePath.replace(/\\/g, '/').substring(0, filePath.replace(/\\/g, '/').lastIndexOf('/'))
    : null;
  useFileWatcher(watchDir, filePath, isSelfWritingRef, () => {
    const targetPath = activeFilePathRef.current;
    if (!targetPath) return;
    readFile(targetPath)
      .then(text => {
        // Ignore stale watcher callbacks after active file has changed.
        if (activeFilePathRef.current !== targetPath) return;
        if (text !== activeContentRef.current) {
          openFileByPath(targetPath);
        }
      })
      .catch(console.error);
  });

  useEffect(() => {
    if (!filePath) {
      setActiveFileKind(null);
      setActiveFileEditable(true);
      setReadonlyReason(null);
      return;
    }
    setActiveFileKind(getFileKind(filePath));
  }, [filePath]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        pickOpenableTextFiles()
          .then(async paths => {
            if (!paths.length) return;
            const normalized = paths.map(normalizePath).filter(isOpenablePath);
            if (!normalized.length) return;
            setPinnedFiles(prev => {
              const merged = mergeUniquePaths(prev, normalized);
              storeSet('pinnedFiles', merged);
              return merged;
            });
            await openFileByPath(normalized[normalized.length - 1]);
          })
          .catch(console.error);
      }
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder="Filter files..."]')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openFileByPath]);

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
    if (!activeFileEditable && newMode === 'source') {
      setMode('preview');
      await storeSet('editorMode', 'preview');
      return;
    }
    setMode(newMode);
    await storeSet('editorMode', newMode);
  };

  const handleToggleSourceSplit = async () => {
    const next = !sourceSplitEnabled;
    setSourceSplitEnabled(next);
    await storeSet('sourceSplitEnabled', next);
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
    const selected = await pickOpenableTextFiles();
    if (!selected.length) return;

    const normalized = selected
      .map(normalizePath)
      .filter(isOpenablePath);

    if (!normalized.length) return;

    const merged = mergeUniquePaths(pinnedFiles, normalized);
    setPinnedFiles(merged);
    await storeSet('pinnedFiles', merged);
    await openFileByPath(normalized[normalized.length - 1]);
  };

  const handleToggleFileStar = async (path: string) => {
    const normalized = normalizePath(path);
    const lower = normalized.toLowerCase();
    const exists = starredFiles.some(item => item.toLowerCase() === lower);
    const next = exists
      ? starredFiles.filter(item => item.toLowerCase() !== lower)
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
    const nextFiles = removePathCaseInsensitive(pinnedFiles, normalized);
    setPinnedFiles(nextFiles);
    await storeSet('pinnedFiles', nextFiles);

    const nextStars = removePathCaseInsensitive(starredFiles, normalized);
    setStarredFiles(nextStars);
    await storeSet('starredFiles', nextStars);
  };

  const handleRemoveOtherPinnedFiles = async (path: string) => {
    const normalized = normalizePath(path);
    const keepFile = pinnedFiles.find(item => item.toLowerCase() === normalized.toLowerCase()) ?? normalized;
    const nextFiles = [keepFile];
    const keepLower = keepFile.toLowerCase();
    const nextStars = starredFiles.filter(item => item.toLowerCase() === keepLower);

    setPinnedFiles(nextFiles);
    setStarredFiles(nextStars);
    await storeSet('pinnedFiles', nextFiles);
    await storeSet('starredFiles', nextStars);

    await openFileByPath(keepFile);
  };

  const handleClearUnstarredFiles = async () => {
    const starSet = new Set(starredFiles.map(p => p.toLowerCase()));
    const nextFiles = pinnedFiles.filter(p => starSet.has(p.toLowerCase()));
    setPinnedFiles(nextFiles);
    await storeSet('pinnedFiles', nextFiles);
  };

  const handleCopyFullPath = async (path: string) => {
    const normalized = normalizePath(path);
    try {
      await navigator.clipboard.writeText(normalized);
    } catch (error) {
      console.error('[App] copy full path failed', error);
    }
  };

  const handleOpenContainingFolder = async (path: string) => {
    try {
      await openContainingFolder(normalizePath(path));
    } catch (error) {
      console.error('[App] open containing folder failed', error);
    }
  };

  const handleContentChange = (text: string) => {
    if (!activeFileEditable) return;
    handleChange(text);
  };

  const handleSave = () => {
    if (!activeFileEditable) return;
    saveNow();
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
      onRemoveOtherPinnedFiles={handleRemoveOtherPinnedFiles}
      onClearUnstarredFiles={handleClearUnstarredFiles}
      onCopyFullPath={handleCopyFullPath}
      onOpenContainingFolder={handleOpenContainingFolder}
      activeFile={filePath}
      activeFileKind={activeFileKind}
      activeFileEditable={activeFileEditable}
      readonlyReason={readonlyReason}
      content={content}
      saveState={saveState}
      isDirty={isDirty}
      mode={mode}
      sourceSplitEnabled={sourceSplitEnabled}
      theme={theme}
      syncScroll={syncScroll}
      onSelectFile={openFileByPath}
      onContentChange={handleContentChange}
      onModeChange={handleModeChange}
      onToggleSourceSplit={handleToggleSourceSplit}
      onThemeToggle={handleThemeToggle}
      onToggleSyncScroll={handleToggleSyncScroll}
      onSave={handleSave}
      wysiwygRef={wysiwygRef}
    />
  );
}

export default App;

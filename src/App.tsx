import { useEffect, useRef, useState, useCallback } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { useActiveFile } from './hooks/useActiveFile';
import { useFileWatcher } from './hooks/useFileWatcher';
import { storeGet, storeSet } from './lib/store';
import { getLaunchArgs, hasOpenableFilesInDirectory, openContainingFolder, openDirectory, pickOpenableTextFiles, readFile, renamePath } from './lib/fs';
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

async function filterValidPinnedDirs(paths: string[]): Promise<string[]> {
  const normalized = paths.map(normalizePath);
  const checks = await Promise.all(normalized.map(path => hasOpenableFilesInDirectory(path)));
  return normalized.filter((_, idx) => checks[idx]);
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
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(true);
  const [expandedDirs, setExpandedDirs] = useState<string[]>([]);
  const [activeFileKind, setActiveFileKind] = useState<FileKind | null>(null);
  const [activeFileEditable, setActiveFileEditable] = useState<boolean>(true);
  const [readonlyReason, setReadonlyReason] = useState<string | null>(null);
  const activeFilePathRef = useRef<string | null>(null);
  const activeContentRef = useRef('');
  const { filePath, content, saveState, isSelfWritingRef, openFile, handleChange, saveNow } = useActiveFile();

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

    if (kind === 'text') {
      const forcedMode: EditorMode = reason ? 'preview' : 'source';
      setMode(forcedMode);
      storeSet('editorMode', forcedMode);
    } else if (reason) {
      setMode('preview');
      storeSet('editorMode', 'preview');
    }
  }, [openFile]);

  useEffect(() => {
    async function restore() {
      const dirs = await storeGet<string[]>('pinnedDirs');
      if (dirs?.length) {
        const validDirs = await filterValidPinnedDirs(dirs);
        setPinnedDirs(validDirs);
        if (validDirs.length !== dirs.length) {
          await storeSet('pinnedDirs', validDirs);
        }
      }

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

      const savedSidebarVisible = await storeGet<boolean>('sidebarVisible');
      if (typeof savedSidebarVisible === 'boolean') setSidebarVisible(savedSidebarVisible);

      const savedExpandedDirs = await storeGet<string[]>('expandedDirs');
      if (savedExpandedDirs?.length) setExpandedDirs(savedExpandedDirs.map(normalizePath));

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
          setPinnedFiles(prev => {
            const merged = mergeUniquePaths(prev, [normalizePath(lastFile)]);
            storeSet('pinnedFiles', merged);
            return merged;
          });
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
    const hasOpenable = await hasOpenableFilesInDirectory(normalized);
    if (!hasOpenable) {
      console.info('[App] skip pinning directory without openable files', normalized);
      return;
    }
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
    if (activeFileKind === 'text') {
      const forcedMode: EditorMode = activeFileEditable ? 'source' : 'preview';
      setMode(forcedMode);
      await storeSet('editorMode', forcedMode);
      return;
    }
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

  const handleToggleSidebar = async () => {
    const next = !sidebarVisible;
    setSidebarVisible(next);
    await storeSet('sidebarVisible', next);
  };

  const handleExpandedDirsChange = async (paths: string[]) => {
    const normalized = paths.map(normalizePath);
    setExpandedDirs(normalized);
    await storeSet('expandedDirs', normalized);
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
    let becameStarred = false;
    let nextStars: string[] = [];
    setStarredFiles(prev => {
      const exists = prev.some(item => item.toLowerCase() === lower);
      becameStarred = !exists;
      nextStars = exists
        ? prev.filter(item => item.toLowerCase() !== lower)
        : [...prev, normalized];
      return nextStars;
    });
    await storeSet('starredFiles', nextStars);

    if (becameStarred) {
      let nextPinned: string[] = [];
      setPinnedFiles(prev => {
        nextPinned = mergeUniquePaths(prev, [normalized]);
        return nextPinned;
      });
      await storeSet('pinnedFiles', nextPinned);
    }
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

  const handleCopyDirectoryPath = async (path: string) => {
    await handleCopyFullPath(path);
  };

  const handleOpenContainingFolder = async (path: string) => {
    try {
      await openContainingFolder(normalizePath(path));
    } catch (error) {
      console.error('[App] open containing folder failed', error);
    }
  };

  const handleOpenDirectory = async (path: string) => {
    try {
      await openDirectory(normalizePath(path));
    } catch (error) {
      console.error('[App] open directory failed', error);
    }
  };

  const handleRenameFile = async (path: string) => {
    const normalized = normalizePath(path);
    const oldName = normalized.split('/').pop() ?? normalized;
    const slash = normalized.lastIndexOf('/');
    const dir = slash >= 0 ? normalized.slice(0, slash) : '';
    const input = window.prompt('Rename file (include extension):', oldName);
    if (!input) return;
    const trimmed = input.trim();
    if (!trimmed || trimmed === oldName) return;
    if (trimmed.includes('/') || trimmed.includes('\\')) return;

    const nextPath = `${dir}/${trimmed}`;
    try {
      await renamePath(normalized, nextPath);

      setPinnedFiles(prev => {
        const next = prev.map(item => item.toLowerCase() === normalized.toLowerCase() ? nextPath : item);
        storeSet('pinnedFiles', next);
        return next;
      });
      setStarredFiles(prev => {
        const next = prev.map(item => item.toLowerCase() === normalized.toLowerCase() ? nextPath : item);
        storeSet('starredFiles', next);
        return next;
      });

      if (filePath && normalizePath(filePath).toLowerCase() === normalized.toLowerCase()) {
        await openFileByPath(nextPath);
      }
    } catch (error) {
      console.error('[App] rename file failed', error);
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
      onCopyDirectoryPath={handleCopyDirectoryPath}
      onOpenContainingFolder={handleOpenContainingFolder}
      onOpenDirectory={handleOpenDirectory}
      onRenameFile={handleRenameFile}
      activeFile={filePath}
      activeFileKind={activeFileKind}
      activeFileEditable={activeFileEditable}
      readonlyReason={readonlyReason}
      content={content}
      saveState={saveState}
      mode={mode}
      sourceSplitEnabled={sourceSplitEnabled}
      theme={theme}
      syncScroll={syncScroll}
      sidebarVisible={sidebarVisible}
      expandedDirs={expandedDirs}
      onSelectFile={openFileByPath}
      onContentChange={handleContentChange}
      onModeChange={handleModeChange}
      onToggleSourceSplit={handleToggleSourceSplit}
      onThemeToggle={handleThemeToggle}
      onToggleSyncScroll={handleToggleSyncScroll}
      onToggleSidebar={handleToggleSidebar}
      onExpandedDirsChange={handleExpandedDirsChange}
      onSave={handleSave}
    />
  );
}

export default App;

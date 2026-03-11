import { useEffect, useRef, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AppLayout } from './components/layout/AppLayout';
import { useActiveFile } from './hooks/useActiveFile';
import { useFileWatcher } from './hooks/useFileWatcher';
import { storeGet, storeSet } from './lib/store';
import { deletePath, getLaunchArgs, hasOpenableFilesInDirectory, openContainingFolder, openDirectory, pickOpenableTextFiles, readFile, renamePath, writeFile } from './lib/fs';
import { getFileKind, isEditablePath, isOpenablePath, isReadonlyPreviewPath, isSizeLimitExemptPath, type FileKind } from './lib/markdown';
import { normalizePath, pathKey } from './lib/path';
import type { EditorMode, Theme } from './components/layout/Toolbar';
import { THEME_NEXT } from './components/layout/Toolbar';

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
  const targetKey = pathKey(target);
  return paths.filter(item => pathKey(item) !== targetKey);
}

function getAncestorDirs(filePath: string): string[] {
  const normalized = normalizePath(filePath);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return [];

  const ancestors: string[] = [];
  let cursor = '';
  for (let i = 0; i < parts.length - 1; i += 1) {
    const segment = parts[i];
    if (i === 0 && /^[a-zA-Z]:$/.test(segment)) {
      cursor = `${segment}/`;
    } else if (!cursor) {
      cursor = segment;
    } else if (cursor.endsWith('/')) {
      cursor = `${cursor}${segment}`;
    } else {
      cursor = `${cursor}/${segment}`;
    }
    ancestors.push(normalizePath(cursor));
  }
  return ancestors;
}

function mergeUniqueNormalizedPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of paths) {
    const normalized = normalizePath(item);
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function splitBaseNameAndExtension(fileName: string): { baseName: string; extension: string } {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return { baseName: fileName, extension: '' };
  }
  return {
    baseName: fileName.slice(0, lastDot),
    extension: fileName.slice(lastDot),
  };
}

function stripWrappedQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function decodeMaybeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractPathCandidateFromArg(arg: string): string[] {
  const trimmed = stripWrappedQuotes(arg);
  if (!trimmed) return [];

  const candidates = new Set<string>();
  candidates.add(trimmed);

  // Support launch args like --path=E:\a\b.md or /path=E:\a\b.md
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex > 1) {
    const key = trimmed.slice(0, eqIndex);
    const value = stripWrappedQuotes(trimmed.slice(eqIndex + 1));
    if ((key.startsWith('--') || key.startsWith('/')) && value) {
      candidates.add(value);
    }
  }

  // Support file:// URIs and percent-encoded paths.
  if (/^file:\/\//i.test(trimmed)) {
    candidates.add(decodeMaybeUri(trimmed));
  } else {
    candidates.add(decodeMaybeUri(trimmed));
  }

  return Array.from(candidates)
    .map(normalizePath)
    .filter(candidate => candidate && !candidate.startsWith('--') && !candidate.startsWith('/?'));
}

function getOpenableLaunchPath(args: string[]): string | null {
  for (const arg of args) {
    const candidates = extractPathCandidateFromArg(arg);
    for (const candidate of candidates) {
      if (isOpenablePath(candidate)) return candidate;
    }
  }
  return null;
}

async function filterValidPinnedDirs(paths: string[]): Promise<string[]> {
  const normalized = paths.map(normalizePath);
  const checks = await Promise.all(normalized.map(path => hasOpenableFilesInDirectory(path)));
  return normalized.filter((_, idx) => checks[idx]);
}

const MAX_EDITABLE_BYTES = 1 * 1024 * 1024;
const CONTENT_ZOOM_MIN = 90;
const CONTENT_ZOOM_MAX = 130;
const CONTENT_ZOOM_STEP = 10;
const CONTENT_ZOOM_DEFAULT = 110;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function getReadonlyReason(path: string, content: string): string | null {
  if (byteLength(content) > MAX_EDITABLE_BYTES && !isSizeLimitExemptPath(path)) return 'Read-only: file too large (>1MB)';
  if (!isOpenablePath(path)) return 'Read-only: unsupported file type';
  if (isReadonlyPreviewPath(path)) return 'Read-only: protected file';
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
  const [markdownToolsCollapsed, setMarkdownToolsCollapsed] = useState<boolean>(true);
  const [theme, setTheme] = useState<Theme>('gray');
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(true);
  const [contentZoomPct, setContentZoomPct] = useState<number>(CONTENT_ZOOM_DEFAULT);
  const [expandedDirs, setExpandedDirs] = useState<string[]>([]);
  const [activeFileKind, setActiveFileKind] = useState<FileKind | null>(null);
  const [activeFileEditable, setActiveFileEditable] = useState<boolean>(true);
  const [readonlyReason, setReadonlyReason] = useState<string | null>(null);
  const sourceScrollByFileRef = useRef<Map<string, number>>(new Map());
  const previewScrollByFileRef = useRef<Map<string, number>>(new Map());
  const activeFilePathRef = useRef<string | null>(null);
  const activeContentRef = useRef('');
  const { filePath, content, saveState, isOpening, isSelfWritingRef, openFile, handleChange, saveNow } = useActiveFile();

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

    const ancestors = getAncestorDirs(normalized);
    if (ancestors.length) {
      setExpandedDirs(prev => {
        const next = mergeUniqueNormalizedPaths([...prev, ...ancestors]);
        void storeSet('expandedDirs', next);
        return next;
      });
    }
  }, [openFile]);

  const openFromLaunchArgs = useCallback(async (args: string[]): Promise<boolean> => {
    const launchPath = getOpenableLaunchPath(args);
    if (!launchPath) return false;

    setPinnedFiles(prev => {
      const merged = mergeUniquePaths(prev, [launchPath]);
      void storeSet('pinnedFiles', merged);
      return merged;
    });
    await openFileByPath(launchPath);
    return true;
  }, [openFileByPath]);

  useEffect(() => {
    async function restore() {
      let restoredPinnedFiles: string[] = [];

      const dirs = await storeGet<string[]>('pinnedDirs');
      if (dirs?.length) {
        const validDirs = await filterValidPinnedDirs(dirs);
        setPinnedDirs(validDirs);
        if (validDirs.length !== dirs.length) {
          await storeSet('pinnedDirs', validDirs);
        }
      }

      const files = await storeGet<string[]>('pinnedFiles');
      if (files?.length) {
        restoredPinnedFiles = files.map(normalizePath);
        setPinnedFiles(restoredPinnedFiles);
      }

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

      const savedMarkdownToolsCollapsed = await storeGet<boolean>('markdownToolsCollapsed');
      if (typeof savedMarkdownToolsCollapsed === 'boolean') setMarkdownToolsCollapsed(savedMarkdownToolsCollapsed);

      const savedSyncScroll = await storeGet<boolean>('syncScroll');
      if (typeof savedSyncScroll === 'boolean') setSyncScroll(savedSyncScroll);

      const savedSidebarVisible = await storeGet<boolean>('sidebarVisible');
      if (typeof savedSidebarVisible === 'boolean') setSidebarVisible(savedSidebarVisible);
      const savedContentZoomPct = await storeGet<number>('contentZoomPct');
      if (typeof savedContentZoomPct === 'number' && Number.isFinite(savedContentZoomPct)) {
        const clamped = Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, Math.round(savedContentZoomPct)));
        setContentZoomPct(clamped);
      }

      setExpandedDirs([]);

      const args = await getLaunchArgs();
      const launchPath = getOpenableLaunchPath(args);
      if (launchPath) {
        try {
          await openFromLaunchArgs(args);
          const nextExpanded = getAncestorDirs(launchPath);
          setExpandedDirs(nextExpanded);
          await storeSet('expandedDirs', nextExpanded);
          return;
        } catch {
          // ignore invalid launch argument
        }
      }

      const lastFile = await storeGet<string>('lastOpenedFile');
      if (lastFile) {
        try {
          await openFileByPath(lastFile);
          const nextExpanded = getAncestorDirs(lastFile);
          setExpandedDirs(nextExpanded);
          await storeSet('expandedDirs', nextExpanded);
        } catch {
          // file no longer exists
        }
      }
    }
    restore();
  }, [openFileByPath, openFromLaunchArgs]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let closed = false;

    void (async () => {
      unlisten = await listen<string[]>('app-launch-args', async event => {
        if (closed) return;
        const payload = event.payload;
        if (!Array.isArray(payload)) return;

        try {
          await openFromLaunchArgs(payload);
        } catch (error) {
          console.error('[App] handle app-launch-args failed', error);
        }
      });
    })();

    return () => {
      closed = true;
      if (unlisten) unlisten();
    };
  }, [openFromLaunchArgs]);

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
    const clampZoom = (value: number) => Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, value));
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd')) {
        e.preventDefault();
        setContentZoomPct(prev => {
          const next = clampZoom(prev + CONTENT_ZOOM_STEP);
          void storeSet('contentZoomPct', next);
          return next;
        });
        return;
      }
      if (e.ctrlKey && (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract')) {
        e.preventDefault();
        setContentZoomPct(prev => {
          const next = clampZoom(prev - CONTENT_ZOOM_STEP);
          void storeSet('contentZoomPct', next);
          return next;
        });
        return;
      }
      if (e.ctrlKey && (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0')) {
        e.preventDefault();
        setContentZoomPct(CONTENT_ZOOM_DEFAULT);
        void storeSet('contentZoomPct', CONTENT_ZOOM_DEFAULT);
        return;
      }
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

  const getSourceScrollPosition = useCallback((path: string): number => {
    return sourceScrollByFileRef.current.get(pathKey(path)) ?? 0;
  }, []);

  const setSourceScrollPosition = useCallback((path: string, top: number) => {
    sourceScrollByFileRef.current.set(pathKey(path), Math.max(0, top));
  }, []);

  const getPreviewScrollPosition = useCallback((path: string): number => {
    return previewScrollByFileRef.current.get(pathKey(path)) ?? 0;
  }, []);

  const setPreviewScrollPosition = useCallback((path: string, top: number) => {
    previewScrollByFileRef.current.set(pathKey(path), Math.max(0, top));
  }, []);

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
    const lower = pathKey(normalized);
    let nextStars: string[] = [];
    setStarredFiles(prev => {
      const exists = prev.some(item => pathKey(item) === lower);
      nextStars = exists
        ? prev.filter(item => pathKey(item) !== lower)
        : [...prev, normalized];
      return nextStars;
    });
    await storeSet('starredFiles', nextStars);
  };

  const handleToggleMarkdownToolsCollapsed = async () => {
    const next = !markdownToolsCollapsed;
    setMarkdownToolsCollapsed(next);
    await storeSet('markdownToolsCollapsed', next);
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
    const normalizedKey = pathKey(normalized);
    const keepFile = pinnedFiles.find(item => pathKey(item) === normalizedKey) ?? normalized;
    const nextFiles = [keepFile];
    const keepLower = pathKey(keepFile);
    const nextStars = starredFiles.filter(item => pathKey(item) === keepLower);

    setPinnedFiles(nextFiles);
    setStarredFiles(nextStars);
    await storeSet('pinnedFiles', nextFiles);
    await storeSet('starredFiles', nextStars);

    await openFileByPath(keepFile);
  };

  const handleClearUnstarredFiles = async () => {
    const starSet = new Set(starredFiles.map(pathKey));
    const nextFiles = pinnedFiles.filter(p => starSet.has(pathKey(p)));
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

  const handleRenameFile = async (path: string, nextBaseName: string) => {
    const normalized = normalizePath(path);
    const oldName = normalized.split('/').pop() ?? normalized;
    const { baseName, extension } = splitBaseNameAndExtension(oldName);
    const slash = normalized.lastIndexOf('/');
    const dir = slash >= 0 ? normalized.slice(0, slash) : '';
    const trimmed = nextBaseName.trim();
    if (!trimmed || trimmed === baseName) return;
    if (trimmed.includes('/') || trimmed.includes('\\')) throw new Error('Invalid file name.');

    const nextName = `${trimmed}${extension}`;
    if (nextName === oldName) return;
    const nextPath = `${dir}/${nextName}`;
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
      throw new Error(toErrorMessage(error, 'Rename failed.'));
    }
  };

  const handleDuplicateFile = async (path: string, nextBaseName: string) => {
    const normalized = normalizePath(path);
    const oldName = normalized.split('/').pop() ?? normalized;
    const { extension } = splitBaseNameAndExtension(oldName);
    const slash = normalized.lastIndexOf('/');
    const dir = slash >= 0 ? normalized.slice(0, slash) : '';
    const trimmed = nextBaseName.trim();
    if (!trimmed) return;
    if (trimmed.includes('/') || trimmed.includes('\\')) throw new Error('Invalid file name.');

    const nextPath = `${dir}/${trimmed}${extension}`;
    if (pathKey(nextPath) === pathKey(normalized)) return;
    try {
      let targetExists = false;
      try {
        await readFile(nextPath);
        targetExists = true;
      } catch {
        // continue when target does not exist
      }
      if (targetExists) throw new Error('A file with this name already exists.');

      const text = await readFile(normalized);
      await writeFile(nextPath, text);
      await openFileByPath(nextPath);
    } catch (error) {
      console.error('[App] duplicate file failed', error);
      throw new Error(toErrorMessage(error, 'Duplicate failed.'));
    }
  };

  const handleCreateFile = async (dirPath: string, fileName: string) => {
    const dir = normalizePath(dirPath);
    const trimmed = fileName.trim();
    if (!trimmed) throw new Error('File name cannot be empty.');
    if (trimmed.includes('/') || trimmed.includes('\\')) throw new Error('Invalid file name.');
    const resolvedName = trimmed.includes('.') ? trimmed : `${trimmed}.md`;
    const nextPath = `${dir.replace(/\/+$/, '')}/${resolvedName}`;
    try {
      let targetExists = false;
      try {
        await readFile(nextPath);
        targetExists = true;
      } catch {
        // continue
      }
      if (targetExists) throw new Error('A file with this name already exists.');
      await writeFile(nextPath, '');
      await openFileByPath(nextPath);
    } catch (error) {
      console.error('[App] create file failed', error);
      throw new Error(toErrorMessage(error, 'Create file failed.'));
    }
  };

  const handleDeleteFile = async (path: string) => {
    const normalized = normalizePath(path);
    await deletePath(normalized);

    const nextFiles = removePathCaseInsensitive(pinnedFiles, normalized);
    const nextStars = removePathCaseInsensitive(starredFiles, normalized);
    setPinnedFiles(nextFiles);
    setStarredFiles(nextStars);
    await storeSet('pinnedFiles', nextFiles);
    await storeSet('starredFiles', nextStars);

    if (filePath && pathKey(filePath) === pathKey(normalized)) {
      const fallback = nextFiles[0];
      if (fallback) {
        await openFileByPath(fallback);
      }
    }
  };

  const handleContentChange = (text: string) => {
    if (isOpening) return;
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
      onCreateFile={handleCreateFile}
      onRenameFile={handleRenameFile}
      onDuplicateFile={handleDuplicateFile}
      onDeleteFile={handleDeleteFile}
      activeFile={filePath}
      activeFileKind={activeFileKind}
      activeFileEditable={activeFileEditable}
      readonlyReason={readonlyReason}
      content={content}
      saveState={saveState}
      mode={mode}
      sourceSplitEnabled={sourceSplitEnabled}
      markdownToolsCollapsed={markdownToolsCollapsed}
      theme={theme}
      syncScroll={syncScroll}
      sidebarVisible={sidebarVisible}
      expandedDirs={expandedDirs}
      onSelectFile={openFileByPath}
      onContentChange={handleContentChange}
      onModeChange={handleModeChange}
      onToggleSourceSplit={handleToggleSourceSplit}
      onToggleMarkdownToolsCollapsed={handleToggleMarkdownToolsCollapsed}
      onThemeToggle={handleThemeToggle}
      onToggleSyncScroll={handleToggleSyncScroll}
      onToggleSidebar={handleToggleSidebar}
      onExpandedDirsChange={handleExpandedDirsChange}
      onSave={handleSave}
      contentZoomPct={contentZoomPct}
      getSourceScrollPosition={getSourceScrollPosition}
      setSourceScrollPosition={setSourceScrollPosition}
      getPreviewScrollPosition={getPreviewScrollPosition}
      setPreviewScrollPosition={setPreviewScrollPosition}
    />
  );
}

export default App;


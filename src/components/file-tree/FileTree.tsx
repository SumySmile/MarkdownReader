import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { Tree, TreeApi, NodeApi, NodeRendererProps } from 'react-arborist';
import { useFileTreeStore, TreeNode, DirectoryNode } from '../../stores/fileTreeStore';
import { pickDirectory } from '../../lib/fs';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  RefreshCw,
  Star,
  Pencil,
  CopyPlus,
  Trash2,
  Files,
  FileCode2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { isOpenablePath } from '../../lib/markdown';
import { normalizePath, pathKey, pathKeyNoDrive } from '../../lib/path';

interface FileTreeProps {
  pinnedDirs: string[];
  pinnedFiles: string[];
  starredFiles: string[];
  filesPanelOpen: boolean;
  onPinDir: (path: string) => void;
  onUnpinDir: (path: string) => void;
  onAddFiles: () => Promise<void> | void;
  onToggleFileStar: (path: string) => void;
  onToggleFilesPanel: () => void;
  onRemovePinnedFile: (path: string) => Promise<void> | void;
  onRemoveOtherPinnedFiles: (path: string) => Promise<void> | void;
  onClearUnstarredFiles: () => Promise<void> | void;
  onCopyFullPath: (path: string) => Promise<void> | void;
  onCopyDirectoryPath: (path: string) => Promise<void> | void;
  onOpenContainingFolder: (path: string) => Promise<void> | void;
  onOpenDirectory: (path: string) => Promise<void> | void;
  onCreateFile: (dirPath: string, fileName: string) => Promise<void> | void;
  onRenameFile: (path: string, nextBaseName: string) => Promise<void> | void;
  onDuplicateFile: (path: string, nextBaseName: string) => Promise<void> | void;
  onDeleteFile: (path: string) => Promise<void> | void;
  expandedDirs: string[];
  onExpandedDirsChange: (paths: string[]) => void;
  onSelectFile: (path: string) => Promise<void> | void;
  activeFile?: string | null;
}

type ContextMenuState =
  | { x: number; y: number; kind: 'dir'; path: string; pinned: boolean }
  | { x: number; y: number; kind: 'file'; source: 'files' | 'folders'; path: string; starred: boolean }
  | { x: number; y: number; kind: 'files-panel' }
  | null;
type ContextMenuKind = 'dir' | 'file' | 'files-panel';

interface RenameDialogState {
  path: string;
  baseName: string;
  extension: string;
  value: string;
  error: string | null;
}

interface DuplicateDialogState {
  path: string;
  baseName: string;
  extension: string;
  value: string;
  error: string | null;
}

interface NewFileDialogState {
  dirPath: string;
  value: string;
  error: string | null;
}

function estimateContextMenuSize(kind: ContextMenuKind, source?: 'files' | 'folders'): { width: number; height: number } {
  if (kind === 'file') {
    return source === 'files' ? { width: 178, height: 290 } : { width: 170, height: 220 };
  }
  if (kind === 'dir') return { width: 170, height: 198 };
  return { width: 162, height: 50 };
}

function clampContextMenuPoint(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  };
}

function anchorContextMenu(
  menu: Exclude<ContextMenuState, null>,
  anchorRect?: DOMRect,
  measuredSize?: { width: number; height: number }
): { x: number; y: number } {
  const margin = 8;
  const source = menu.kind === 'file' ? menu.source : undefined;
  const estimated = measuredSize ?? estimateContextMenuSize(menu.kind, source);
  const gap = 3;
  const pointerX = menu.x;

  // Keep menu on the right side of the mouse focus by default.
  const rightX = pointerX + gap;
  const leftFallbackX = pointerX - estimated.width - gap;
  const preferredX = rightX + estimated.width + margin <= window.innerWidth ? rightX : leftFallbackX;

  // Vertical placement must snap to row edges only: below edge or above edge.
  let preferredY = menu.y;
  if (anchorRect) {
    const belowY = anchorRect.bottom + 1;
    const aboveY = anchorRect.top - estimated.height - 1;
    const canOpenBelow = belowY + estimated.height + margin <= window.innerHeight;
    preferredY = canOpenBelow ? belowY : aboveY;
  } else if (preferredY + estimated.height + margin > window.innerHeight) {
    preferredY = window.innerHeight - estimated.height - margin;
  }

  return clampContextMenuPoint(preferredX, preferredY, estimated.width, estimated.height);
}

function pathName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function parentDir(path: string): string | null {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf('/');
  if (slash <= 0) return null;
  return normalized.slice(0, slash);
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

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx');
}

function EmptyState({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="flex h-full min-h-16 flex-col items-center justify-center px-3 py-3 text-center">
      <p className="text-[var(--text-muted)] text-sm">{title}</p>
      {subtitle ? <p className="text-[var(--text-muted)] text-xs mt-1">{subtitle}</p> : null}
    </div>
  );
}

function NodeRow({
  node,
  style,
  starred = false,
  hasStarredDescendant = false,
}: NodeRendererProps<TreeNode> & { starred?: boolean; hasStarredDescendant?: boolean }) {
  const isDir = node.data.isDirectory;
  const isOpen = node.isOpen;
  const Icon = isDir ? (isOpen ? FolderOpen : Folder) : File;

  return (
    <div
      data-menu-anchor="true"
      style={style}
      className={cn(
        'grid w-full min-w-0 grid-cols-[12px_14px_minmax(0,1fr)_14px] items-center gap-1 overflow-hidden px-2 py-0.5 rounded cursor-pointer select-none text-sm',
        'hover:bg-[var(--explorer-row-hover)]',
      )}
      onClick={() => {
        if (isDir) node.toggle();
      }}
    >
      <span className="w-3">
        {isDir && (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </span>
      <Icon size={14} className={cn(isDir ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]')} />
      <span
        className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-secondary)]"
        title={node.data.path}
      >
        {node.data.name}
      </span>
      <span className="w-3.5 text-right justify-self-end">
        {!isDir && starred ? <Star size={12} className="text-[var(--accent-warning)] fill-current" /> : null}
        {isDir && hasStarredDescendant ? <span className="text-[10px] leading-none text-[var(--accent-warning)] opacity-90">*</span> : null}
      </span>
    </div>
  );
}

function resolveMenuAnchor(currentTarget: HTMLElement, target: EventTarget | null): HTMLElement {
  if (target instanceof HTMLElement) {
    const rowAnchor = target.closest<HTMLElement>('[data-menu-anchor="true"]');
    if (rowAnchor && currentTarget.contains(rowAnchor)) return rowAnchor;
  }
  return currentTarget;
}

function updateNodeChildren(nodes: TreeNode[], path: string, children: TreeNode[]): TreeNode[] {
  return nodes.map(node => {
    if (node.path === path && node.isDirectory) {
      return { ...node, children } as DirectoryNode;
    }
    if (node.isDirectory && node.children) {
      return { ...node, children: updateNodeChildren(node.children, path, children) } as DirectoryNode;
    }
    return node;
  });
}

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.isDirectory && node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

export function FileTree({
  pinnedDirs,
  pinnedFiles,
  starredFiles,
  filesPanelOpen,
  onPinDir,
  onUnpinDir,
  onAddFiles,
  onToggleFileStar,
  onToggleFilesPanel,
  onRemovePinnedFile,
  onRemoveOtherPinnedFiles,
  onClearUnstarredFiles,
  onCopyFullPath,
  onCopyDirectoryPath,
  onOpenContainingFolder,
  onOpenDirectory,
  onCreateFile,
  onRenameFile,
  onDuplicateFile,
  onDeleteFile,
  expandedDirs,
  onExpandedDirsChange,
  onSelectFile,
  activeFile,
}: FileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);
  const [width, setWidth] = useState(320);
  const { getOrFetch, invalidate } = useFileTreeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMdOnly, setFilterMdOnly] = useState(false);
  const [filterStarOnly, setFilterStarOnly] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<DuplicateDialogState | null>(null);
  const [newFileDialog, setNewFileDialog] = useState<NewFileDialogState | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const duplicateInputRef = useRef<HTMLInputElement>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuAnchorRectRef = useRef<DOMRect | undefined>(undefined);
  const contextMenuSeqRef = useRef(0);
  const treeRef = useRef<TreeApi<TreeNode> | undefined>(undefined);
  const syncingTreeOpenStateRef = useRef(false);
  const renameOpen = !!renameDialog;
  const duplicateOpen = !!duplicateDialog;
  const newFileOpen = !!newFileDialog;

  const [treeData, setTreeData] = useState<TreeNode[]>([]);

  useEffect(() => {
    setTreeData(prev => {
      const existing = new Map(prev.map(n => [n.path, n]));
      return pinnedDirs.map(dir => {
        const ex = existing.get(dir);
        if (ex) return ex;
        return {
          id: dir,
          name: dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? dir,
          path: dir,
          isDirectory: true,
          children: null,
        } as DirectoryNode;
      });
    });
  }, [pinnedDirs]);

  useEffect(() => {
    if (!containerRef.current) return;
    let rafId: number;
    const updateSize = (rawHeight: number, rawWidth: number) => {
      const nextHeight = Math.max(1, Math.round(rawHeight));
      const nextWidth = Math.max(1, Math.round(rawWidth));
      setHeight(prev => (prev === nextHeight ? prev : nextHeight));
      setWidth(prev => (prev === nextWidth ? prev : nextWidth));
    };

    {
      const rect = containerRef.current.getBoundingClientRect();
      updateSize(rect.height, rect.width);
    }

    const ro = new ResizeObserver(entries => {
      rafId = requestAnimationFrame(() => {
        const contentRect = entries[0]?.contentRect;
        updateSize(contentRect?.height ?? 400, contentRect?.width ?? 320);
      });
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  const handleToggle = useCallback(async (id: string) => {
    if (syncingTreeOpenStateRef.current) return;
    const normalized = normalizePath(id);
    const lower = normalized.toLowerCase();
    const nextExpanded = expandedDirs.some(path => path.toLowerCase() === lower)
      ? expandedDirs.filter(path => path.toLowerCase() !== lower)
      : [...expandedDirs, normalized];
    onExpandedDirsChange(nextExpanded);

    const node = findNode(treeData, id);
    if (!node || !node.isDirectory || node.children !== null) return;
    try {
      const children = await getOrFetch(id);
      setTreeData(prev => updateNodeChildren(prev, id, children));
    } catch (err) {
      console.error('[FileTree] loadChildren failed', id, err);
    }
  }, [expandedDirs, onExpandedDirsChange, treeData, getOrFetch]);

  const handleRefreshDir = useCallback(async (path: string) => {
    invalidate(path);
    const node = findNode(treeData, path);
    if (!node || !node.isDirectory || node.children === null) return;
    try {
      const children = await getOrFetch(path);
      setTreeData(prev => updateNodeChildren(prev, path, children));
    } catch (err) {
      console.error('[FileTree] refreshChildren failed', path, err);
    }
  }, [treeData, getOrFetch, invalidate]);

  useEffect(() => {
    const targets = expandedDirs.map(normalizePath);
    if (!targets.length) return;
    let canceled = false;

    const ensureLoaded = async () => {
      for (const dirPath of targets) {
        const node = findNode(treeData, dirPath);
        if (!node || !node.isDirectory || node.children !== null) continue;
        try {
          const children = await getOrFetch(dirPath);
          if (canceled) return;
          setTreeData(prev => updateNodeChildren(prev, dirPath, children));
        } catch (err) {
          console.error('[FileTree] preload expanded dir failed', dirPath, err);
        }
      }
    };

    ensureLoaded();
    return () => {
      canceled = true;
    };
  }, [expandedDirs, treeData, getOrFetch]);

  useEffect(() => {
    const tree = treeRef.current;
    if (!tree || !expandedDirs.length) return;
    syncingTreeOpenStateRef.current = true;
    try {
      for (const path of expandedDirs) {
        tree.open(normalizePath(path));
      }
    } finally {
      requestAnimationFrame(() => {
        syncingTreeOpenStateRef.current = false;
      });
    }
  }, [expandedDirs, treeData]);

  const handlePinDir = useCallback(async () => {
    const path = await pickDirectory();
    if (path) onPinDir(normalizePath(path));
  }, [onPinDir]);

  const openFile = useCallback((path: string) => {
    Promise.resolve(onSelectFile(normalizePath(path))).catch(err => {
      console.error('[FileTree] open file failed', path, err);
    });
  }, [onSelectFile]);

  const handleSelect = useCallback((nodes: NodeApi<TreeNode>[]) => {
    const node = nodes[0];
    if (node && !node.data.isDirectory && isOpenablePath(node.data.path)) {
      openFile(node.data.path);
    }
  }, [openFile]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  useEffect(() => {
    if (!contextMenu) return;
    document.addEventListener('click', closeContextMenu);
    return () => document.removeEventListener('click', closeContextMenu);
  }, [contextMenu, closeContextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleViewportOrContainerChange = () => closeContextMenu();
    window.addEventListener('resize', handleViewportOrContainerChange);
    document.addEventListener('scroll', handleViewportOrContainerChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportOrContainerChange);
      document.removeEventListener('scroll', handleViewportOrContainerChange, true);
    };
  }, [contextMenu, closeContextMenu]);

  const openContextMenu = useCallback((menu: Exclude<ContextMenuState, null>, anchorEl?: HTMLElement | null) => {
    const seq = ++contextMenuSeqRef.current;
    const anchorRect = anchorEl?.getBoundingClientRect();
    contextMenuAnchorRectRef.current = anchorRect;
    const next = anchorEl
      ? anchorContextMenu(menu, anchorRect)
      : clampContextMenuPoint(
        menu.x,
        menu.y,
        estimateContextMenuSize(menu.kind, menu.kind === 'file' ? menu.source : undefined).width,
        estimateContextMenuSize(menu.kind, menu.kind === 'file' ? menu.source : undefined).height
      );
    setContextMenu({ ...menu, x: next.x, y: next.y });

    requestAnimationFrame(() => {
      if (contextMenuSeqRef.current !== seq) return;
      const menuEl = contextMenuRef.current;
      if (!menuEl) return;
      const measured = { width: menuEl.offsetWidth, height: menuEl.offsetHeight };
      const corrected = anchorContextMenu(menu, contextMenuAnchorRectRef.current, measured);
      setContextMenu(prev => {
        if (!prev || contextMenuSeqRef.current !== seq) return prev;
        if (prev.x === corrected.x && prev.y === corrected.y) return prev;
        return { ...prev, x: corrected.x, y: corrected.y };
      });
    });
  }, []);

  useEffect(() => {
    if (!renameOpen) return;
    const id = window.setTimeout(() => {
      const input = renameInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }, 0);
    return () => window.clearTimeout(id);
  }, [renameOpen]);

  useEffect(() => {
    if (!duplicateOpen) return;
    const id = window.setTimeout(() => {
      const input = duplicateInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }, 0);
    return () => window.clearTimeout(id);
  }, [duplicateOpen]);

  useEffect(() => {
    if (!newFileOpen) return;
    const id = window.setTimeout(() => {
      const input = newFileInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(0, end);
    }, 0);
    return () => window.clearTimeout(id);
  }, [newFileOpen]);

  const openRenameDialog = useCallback((path: string) => {
    const oldName = pathName(path);
    const { baseName, extension } = splitBaseNameAndExtension(oldName);
    setRenameDialog({
      path,
      baseName,
      extension,
      value: baseName,
      error: null,
    });
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameDialog) return;
    const nextBaseName = renameDialog.value.trim();
    if (!nextBaseName) {
      setRenameDialog(prev => prev ? { ...prev, error: 'Name cannot be empty.' } : prev);
      return;
    }
    if (nextBaseName.includes('/') || nextBaseName.includes('\\')) {
      setRenameDialog(prev => prev ? { ...prev, error: 'Name cannot contain path separators.' } : prev);
      return;
    }
    if (nextBaseName === renameDialog.baseName) {
      setRenameDialog(null);
      return;
    }

    try {
      await Promise.resolve(onRenameFile(renameDialog.path, nextBaseName));
      const dir = parentDir(renameDialog.path);
      if (dir) {
        void handleRefreshDir(dir);
      }
      setRenameDialog(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rename failed.';
      setRenameDialog(prev => prev ? { ...prev, error: message } : prev);
    }
  }, [handleRefreshDir, onRenameFile, renameDialog]);

  const openDuplicateDialog = useCallback((path: string) => {
    const oldName = pathName(path);
    const { baseName, extension } = splitBaseNameAndExtension(oldName);
    setDuplicateDialog({
      path,
      baseName,
      extension,
      value: `${baseName}-copy`,
      error: null,
    });
  }, []);

  const submitDuplicate = useCallback(async () => {
    if (!duplicateDialog) return;
    const nextBaseName = duplicateDialog.value.trim();
    if (!nextBaseName) {
      setDuplicateDialog(prev => prev ? { ...prev, error: 'Name cannot be empty.' } : prev);
      return;
    }
    if (nextBaseName.includes('/') || nextBaseName.includes('\\')) {
      setDuplicateDialog(prev => prev ? { ...prev, error: 'Name cannot contain path separators.' } : prev);
      return;
    }
    if (nextBaseName === duplicateDialog.baseName) {
      setDuplicateDialog(prev => prev ? { ...prev, error: 'Use a different name for duplicate.' } : prev);
      return;
    }

    try {
      await Promise.resolve(onDuplicateFile(duplicateDialog.path, nextBaseName));
      const dir = parentDir(duplicateDialog.path);
      if (dir) {
        void handleRefreshDir(dir);
      }
      setDuplicateDialog(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Duplicate failed.';
      setDuplicateDialog(prev => prev ? { ...prev, error: message } : prev);
    }
  }, [duplicateDialog, handleRefreshDir, onDuplicateFile]);

  const openNewFileDialog = useCallback((dirPath: string) => {
    setNewFileDialog({
      dirPath,
      value: 'new.md',
      error: null,
    });
  }, []);

  const submitNewFile = useCallback(async () => {
    if (!newFileDialog) return;
    const nextName = newFileDialog.value.trim();
    if (!nextName) {
      setNewFileDialog(prev => prev ? { ...prev, error: 'Name cannot be empty.' } : prev);
      return;
    }
    if (nextName.includes('/') || nextName.includes('\\')) {
      setNewFileDialog(prev => prev ? { ...prev, error: 'Name cannot contain path separators.' } : prev);
      return;
    }

    try {
      await Promise.resolve(onCreateFile(newFileDialog.dirPath, nextName));
      await handleRefreshDir(newFileDialog.dirPath);
      setNewFileDialog(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Create file failed.';
      setNewFileDialog(prev => prev ? { ...prev, error: message } : prev);
    }
  }, [handleRefreshDir, newFileDialog, onCreateFile]);

  const starredPathSet = useMemo(() => {
    return new Set(starredFiles.map(pathKey));
  }, [starredFiles]);
  const starredPathNoDriveSet = useMemo(() => {
    return new Set(starredFiles.map(pathKeyNoDrive));
  }, [starredFiles]);

  const isStarredPath = useCallback((path: string) => {
    const key = pathKey(path);
    if (starredPathSet.has(key)) return true;
    return starredPathNoDriveSet.has(pathKeyNoDrive(path));
  }, [starredPathNoDriveSet, starredPathSet]);

  const starredAncestorDirs = useMemo(() => {
    const dirs = new Set<string>();
    for (const file of starredFiles) {
      const normalized = normalizePath(file);
      const parts = normalized.split('/').filter(Boolean);
      if (parts.length <= 1) continue;

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
        dirs.add(pathKey(cursor));
      }
    }
    return dirs;
  }, [starredFiles]);

  const pathMatchesQuickFilters = useCallback((path: string) => {
    if (filterMdOnly && !isMarkdownPath(path)) return false;
    if (filterStarOnly && !isStarredPath(path)) return false;
    return true;
  }, [filterMdOnly, filterStarOnly, isStarredPath]);

  const filterTreeByQuickFilters = useCallback((nodes: TreeNode[]): TreeNode[] => {
    if (!filterMdOnly && !filterStarOnly) return nodes;

    const visit = (node: TreeNode): TreeNode | null => {
      if (!node.isDirectory) {
        return pathMatchesQuickFilters(node.path) ? node : null;
      }

      const nodeIsStarredAncestor = starredAncestorDirs.has(pathKey(node.path));

      if (node.children === null) {
        if (filterStarOnly && !nodeIsStarredAncestor) return null;
        return node;
      }

      const nextChildren = node.children
        .map(visit)
        .filter((child): child is TreeNode => child !== null);
      if (nextChildren.length === 0 && !(filterStarOnly && nodeIsStarredAncestor)) return null;

      return { ...node, children: nextChildren } as DirectoryNode;
    };

    return nodes
      .map(visit)
      .filter((node): node is TreeNode => node !== null);
  }, [filterMdOnly, filterStarOnly, pathMatchesQuickFilters, starredAncestorDirs]);

  const visibleTreeData = useMemo(() => {
    return filterTreeByQuickFilters(treeData);
  }, [filterTreeByQuickFilters, treeData]);
  const searchMatch = useCallback((node: NodeApi<TreeNode>, term: string) => {
    if (!term) return true;
    return node.data.name.toLowerCase().includes(term.toLowerCase());
  }, []);

  const filteredFiles = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();

    return pinnedFiles
      .map(normalizePath)
      .filter(isOpenablePath)
      .filter(pathMatchesQuickFilters)
      .filter(path => {
        if (!term) return true;
        const name = pathName(path).toLowerCase();
        return path.toLowerCase().includes(term) || name.includes(term);
      })
      .sort((a, b) => {
        const aStar = isStarredPath(a);
        const bStar = isStarredPath(b);
        if (aStar !== bStar) return aStar ? -1 : 1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });
  }, [isStarredPath, pathMatchesQuickFilters, pinnedFiles, searchQuery]);

  const normalizedActive = normalizePath(activeFile ?? '');
  const activeRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!normalizedActive) return;
    const id = window.setTimeout(() => {
      activeRowRef.current?.scrollIntoView({ block: 'nearest' });
    }, 0);
    return () => window.clearTimeout(id);
  }, [normalizedActive, filesPanelOpen, treeData]);

  const menuItemClass = 'w-full text-left px-2 py-1 text-xs whitespace-nowrap text-[var(--text-secondary)] hover:bg-[var(--bg-divider)]';
  const menuDangerItemClass = `${menuItemClass} text-[var(--accent-error)]`;
  const sectionCardClass = 'rounded-md border border-[var(--explorer-card-border)] bg-[var(--explorer-card-bg)]';
  const sectionHeaderClass = 'w-full flex items-center gap-1 px-2 py-1 text-xs uppercase tracking-wide text-[var(--text-muted)] hover:bg-[var(--explorer-row-hover)]';
  const fileRowClass = 'grid min-w-0 grid-cols-[12px_14px_minmax(0,1fr)_14px] items-center gap-1 px-1.5 py-1 rounded text-sm cursor-pointer text-[var(--text-secondary)] border border-transparent';
  const contextMenuWidth = contextMenu
    ? estimateContextMenuSize(
      contextMenu.kind,
      contextMenu.kind === 'file' ? contextMenu.source : undefined
    ).width
    : 170;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--bg-divider)]">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Explorer</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onAddFiles}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]"
              title="Import files"
              aria-label="Import files"
            >
              <FilePlus size={14} />
            </button>
            <button
              onClick={handlePinDir}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]"
              title="Pin directory"
              aria-label="Pin directory"
            >
              <FolderPlus size={14} />
            </button>
          </div>
          <span className="h-4 w-px bg-[var(--bg-divider)]" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterMdOnly(v => !v)}
              className={cn(
                'p-1 rounded transition-colors',
                filterMdOnly
                  ? 'text-[var(--accent-primary)] bg-[var(--bg-overlay)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]'
              )}
              title={filterMdOnly ? 'Markdown filter: on' : 'Markdown filter: off'}
              aria-label={filterMdOnly ? 'Turn off markdown filter' : 'Turn on markdown filter'}
            >
              <FileCode2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => setFilterStarOnly(v => !v)}
              className={cn(
                'p-1 rounded transition-colors',
                filterStarOnly
                  ? 'text-[var(--accent-warning)] bg-[var(--bg-overlay)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]'
              )}
              title={filterStarOnly ? 'Star filter: on' : 'Star filter: off'}
              aria-label={filterStarOnly ? 'Turn off star filter' : 'Turn on star filter'}
            >
              <Star size={14} className={filterStarOnly ? 'fill-current' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-2 py-1 border-b border-[var(--bg-divider)]">
        <input
          type="text"
          placeholder="Filter files..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-[var(--bg-overlay)] text-[var(--text-primary)] text-xs px-2 py-1 rounded outline-none placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--accent-primary)]"
        />
      </div>

      <div className="flex-1 overflow-hidden p-2">
        <div className="flex h-full min-h-0 flex-col gap-2">
          <section className={sectionCardClass}>
            <button
              onClick={onToggleFilesPanel}
              onContextMenu={e => {
                e.preventDefault();
                openContextMenu({ x: e.clientX, y: e.clientY, kind: 'files-panel' }, e.currentTarget);
              }}
              className={sectionHeaderClass}
              title={filesPanelOpen ? 'Collapse files' : 'Expand files'}
            >
              {filesPanelOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Files size={12} />
              <span>Files</span>
              <span className="ml-auto normal-case">{filteredFiles.length}</span>
            </button>

            {filesPanelOpen && (
              <div className="max-h-44 overflow-auto app-scrollbar px-1 pb-1">
                {filteredFiles.length === 0 ? (
                  <EmptyState
                    title="No imported files."
                    subtitle={<span className="inline-flex items-center gap-1">Click <FilePlus size={14} /> above</span>}
                  />
                ) : (
                  filteredFiles.map(path => {
                    const isStarred = isStarredPath(path);
                    const isActive = normalizedActive === path;
                    return (
                      <div
                        key={path}
                        ref={isActive ? activeRowRef : null}
                        className={cn(
                          fileRowClass,
                          'relative',
                          'hover:bg-[var(--explorer-row-hover)]',
                          isActive && 'bg-[var(--explorer-row-active)]',
                          contextMenu?.kind === 'file'
                          && contextMenu.source === 'files'
                          && pathKey(contextMenu.path) === pathKey(path)
                          && 'z-10 ring-1 ring-[var(--accent-primary)]'
                        )}
                        title={path}
                        onClick={() => openFile(path)}
                        onContextMenu={e => {
                          e.preventDefault();
                          openContextMenu({ x: e.clientX, y: e.clientY, kind: 'file', source: 'files', path, starred: isStarred }, e.currentTarget);
                        }}
                      >
                        <span className="w-3" />
                        <File size={13} />
                        <span
                          className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                          title={path}
                        >
                          {pathName(path)}
                        </span>
                        <span className="w-3.5 text-right justify-self-end">
                          {isStarred ? <Star size={12} className="text-[var(--accent-warning)] fill-current" /> : null}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>

          <section className={cn(sectionCardClass, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
            <div className={sectionHeaderClass}>
              <span className="w-3" />
              <Folder size={12} />
              <span>Folders</span>
              <span className="ml-auto normal-case">{pinnedDirs.length}</span>
            </div>

            <div ref={containerRef} className="flex-1 overflow-hidden app-scrollbar">
              {pinnedDirs.length === 0 ? (
                <EmptyState
                  title="No folders pinned."
                  subtitle={<span className="inline-flex items-center gap-1">Click <FolderPlus size={14} /> above</span>}
                />
              ) : (
                <Tree<TreeNode>
                  ref={treeRef}
                  data={visibleTreeData}
                  height={height}
                  width={width}
                  rowHeight={24}
                  childrenAccessor="children"
                  onSelect={handleSelect}
                  onToggle={handleToggle}
                  searchTerm={searchQuery}
                  searchMatch={searchMatch}
                  openByDefault={false}
                  initialOpenState={Object.fromEntries(expandedDirs.map(path => [normalizePath(path), true]))}
                  disableDrag
                  disableDrop
                  disableEdit
                >
                  {props => (
                    <div
                      ref={!props.node.data.isDirectory && normalizePath(props.node.data.path) === normalizedActive ? activeRowRef : null}
                      data-id={props.node.data.path}
                      className={cn(
                        'relative min-w-0 overflow-hidden rounded',
                        !props.node.data.isDirectory && normalizePath(props.node.data.path) === normalizedActive && 'bg-[var(--explorer-row-active)]',
                        props.node.data.isDirectory
                        && contextMenu?.kind === 'dir'
                        && pathKey(contextMenu.path) === pathKey(props.node.data.path)
                        && 'z-10 ring-1 ring-[var(--accent-primary)]',
                        !props.node.data.isDirectory
                        && contextMenu?.kind === 'file'
                        && contextMenu.source === 'folders'
                        && pathKey(contextMenu.path) === pathKey(props.node.data.path)
                        && 'z-10 ring-1 ring-[var(--accent-primary)]'
                      )}
                      onClick={() => {
                        if (!props.node.data.isDirectory && isOpenablePath(props.node.data.path)) {
                          openFile(props.node.data.path);
                        }
                      }}
                      onContextMenu={e => {
                        const anchorEl = resolveMenuAnchor(e.currentTarget, e.target);
                        if (props.node.data.isDirectory) {
                          e.preventDefault();
                          const normalized = normalizePath(props.node.data.path).toLowerCase();
                          const pinned = pinnedDirs.some(dir => normalizePath(dir).toLowerCase() === normalized);
                          openContextMenu({ x: e.clientX, y: e.clientY, kind: 'dir', path: props.node.data.path, pinned }, anchorEl);
                        } else {
                          e.preventDefault();
                          const starred = isStarredPath(props.node.data.path);
                          openContextMenu({ x: e.clientX, y: e.clientY, kind: 'file', source: 'folders', path: props.node.data.path, starred }, anchorEl);
                        }
                      }}
                    >
                      <NodeRow
                        {...props}
                        starred={!props.node.data.isDirectory && isStarredPath(props.node.data.path)}
                        hasStarredDescendant={props.node.data.isDirectory && starredAncestorDirs.has(pathKey(props.node.data.path))}
                      />
                    </div>
                  )}
                </Tree>
              )}
            </div>
          </section>
        </div>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          data-filetree-context-menu="true"
          className="fixed z-50 bg-[var(--bg-overlay)] border border-[var(--bg-divider)] rounded-md shadow-md py-1 text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y, width: contextMenuWidth }}
        >
          {contextMenu.kind === 'dir' && (
            <>
              <button
                className={menuItemClass}
                onClick={() => {
                  openNewFileDialog(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <FilePlus size={12} />
                  New File
                </span>
              </button>
              <div className="my-1 border-t border-[var(--bg-divider)]" />
              <button
                className={menuItemClass}
                onClick={() => {
                  Promise.resolve(onCopyDirectoryPath(contextMenu.path)).finally(() => setContextMenu(null));
                }}
              >
                Copy Directory Path
              </button>
              <button
                className={menuItemClass}
                onClick={() => {
                  Promise.resolve(onOpenDirectory(contextMenu.path)).finally(() => setContextMenu(null));
                }}
              >
                Open Directory
              </button>
              <button
                className={menuItemClass}
                onClick={() => {
                  Promise.resolve(handleRefreshDir(contextMenu.path)).finally(() => setContextMenu(null));
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <RefreshCw size={12} />
                  Refresh Directory
                </span>
              </button>
              <div className="my-1 border-t border-[var(--bg-divider)]" />
              {contextMenu.pinned && (
                <button
                  className={menuDangerItemClass}
                  onClick={() => {
                    onUnpinDir(contextMenu.path);
                    setContextMenu(null);
                  }}
                >
                  Unpin Directory
                </button>
              )}
            </>
          )}

          {contextMenu.kind === 'file' && (
            <>
              <button
                className={menuItemClass}
                onClick={() => {
                  openFile(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                Open
              </button>
              <button
                className={menuItemClass}
                onClick={() => {
                  openRenameDialog(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <Pencil size={12} />
                  Rename
                </span>
              </button>
              <button
                className={menuItemClass}
                onClick={() => {
                  openDuplicateDialog(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <CopyPlus size={12} />
                  Duplicate
                </span>
              </button>
              <button
                className={menuDangerItemClass}
                onClick={() => {
                  const target = contextMenu.path;
                  const name = pathName(target);
                  if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) {
                    setContextMenu(null);
                    return;
                  }
                  Promise.resolve(onDeleteFile(target))
                    .then(async () => {
                      const dir = parentDir(target);
                      if (dir) await handleRefreshDir(dir);
                    })
                    .finally(() => setContextMenu(null));
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <Trash2 size={12} />
                  Delete
                </span>
              </button>
              <button
                className={menuItemClass}
                onClick={() => {
                  onToggleFileStar(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                {contextMenu.starred ? 'Unstar' : 'Star'}
              </button>
              {contextMenu.source === 'files' && (
                <>
                  <div className="my-1 border-t border-[var(--bg-divider)]" />
                  <button
                    className={menuDangerItemClass}
                    onClick={() => {
                      Promise.resolve(onRemovePinnedFile(contextMenu.path)).finally(() => setContextMenu(null));
                    }}
                  >
                    Remove
                  </button>
                  <button
                    className={menuDangerItemClass}
                    onClick={() => {
                      Promise.resolve(onRemoveOtherPinnedFiles(contextMenu.path)).finally(() => setContextMenu(null));
                    }}
                  >
                    Remove Others
                  </button>
                  <button
                    className={`${menuItemClass} text-[var(--accent-warning)]`}
                    onClick={() => {
                      Promise.resolve(onClearUnstarredFiles()).finally(() => setContextMenu(null));
                    }}
                  >
                    Clear Unstarred
                  </button>
                </>
              )}
              <div className="my-1 border-t border-[var(--bg-divider)]" />
              <button
                className={menuItemClass}
                onClick={() => {
                  Promise.resolve(onCopyFullPath(contextMenu.path)).finally(() => setContextMenu(null));
                }}
              >
                Copy Full Path
              </button>
              <button
                className={menuItemClass}
                onClick={() => {
                  Promise.resolve(onOpenContainingFolder(contextMenu.path)).finally(() => setContextMenu(null));
                }}
              >
                Open Containing Folder
              </button>
            </>
          )}

          {contextMenu.kind === 'files-panel' && (
            <button
              className={`${menuItemClass} text-[var(--accent-warning)]`}
              onClick={() => {
                Promise.resolve(onClearUnstarredFiles()).finally(() => setContextMenu(null));
              }}
            >
              Clear Unstarred
            </button>
          )}
        </div>
      )}

      {renameDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
          onClick={() => setRenameDialog(null)}
        >
          <div
            className="w-[420px] max-w-[92vw] rounded border border-[var(--bg-divider)] bg-[var(--bg-surface)] p-3 shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-2 text-sm font-medium text-[var(--text-primary)]">Rename File</div>
            <div className="mb-2 text-xs text-[var(--text-muted)] truncate" title={renameDialog.path}>
              {renameDialog.path}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={renameInputRef}
                value={renameDialog.value}
                onChange={e => setRenameDialog(prev => prev ? { ...prev, value: e.target.value, error: null } : prev)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitRename();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenameDialog(null);
                  }
                }}
                className="w-full rounded border border-[var(--bg-divider)] bg-[var(--bg-base)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
              />
              {renameDialog.extension ? (
                <span className="shrink-0 rounded bg-[var(--bg-overlay)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                  {renameDialog.extension}
                </span>
              ) : null}
            </div>
            {renameDialog.error ? (
              <div className="mt-2 text-xs text-[var(--accent-error)]">{renameDialog.error}</div>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded border border-[var(--bg-divider)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]"
                onClick={() => setRenameDialog(null)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-[var(--accent-primary)] px-2.5 py-1 text-xs text-[var(--bg-base)]"
                onClick={() => { void submitRename(); }}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
          onClick={() => setDuplicateDialog(null)}
        >
          <div
            className="w-[420px] max-w-[92vw] rounded border border-[var(--bg-divider)] bg-[var(--bg-surface)] p-3 shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-2 text-sm font-medium text-[var(--text-primary)]">Duplicate File</div>
            <div className="mb-2 text-xs text-[var(--text-muted)] truncate" title={duplicateDialog.path}>
              {duplicateDialog.path}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={duplicateInputRef}
                value={duplicateDialog.value}
                onChange={e => setDuplicateDialog(prev => prev ? { ...prev, value: e.target.value, error: null } : prev)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitDuplicate();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setDuplicateDialog(null);
                  }
                }}
                className="w-full rounded border border-[var(--bg-divider)] bg-[var(--bg-base)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
              />
              {duplicateDialog.extension ? (
                <span className="shrink-0 rounded bg-[var(--bg-overlay)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                  {duplicateDialog.extension}
                </span>
              ) : null}
            </div>
            {duplicateDialog.error ? (
              <div className="mt-2 text-xs text-[var(--accent-error)]">{duplicateDialog.error}</div>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded border border-[var(--bg-divider)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]"
                onClick={() => setDuplicateDialog(null)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-[var(--accent-primary)] px-2.5 py-1 text-xs text-[var(--bg-base)]"
                onClick={() => { void submitDuplicate(); }}
              >
                Duplicate
              </button>
            </div>
          </div>
        </div>
      )}

      {newFileDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
          onClick={() => setNewFileDialog(null)}
        >
          <div
            className="w-[420px] max-w-[92vw] rounded border border-[var(--bg-divider)] bg-[var(--bg-surface)] p-3 shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-2 text-sm font-medium text-[var(--text-primary)]">New File</div>
            <div className="mb-2 text-xs text-[var(--text-muted)] truncate" title={newFileDialog.dirPath}>
              {newFileDialog.dirPath}
            </div>
            <input
              ref={newFileInputRef}
              value={newFileDialog.value}
              onChange={e => setNewFileDialog(prev => prev ? { ...prev, value: e.target.value, error: null } : prev)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitNewFile();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setNewFileDialog(null);
                }
              }}
              className="w-full rounded border border-[var(--bg-divider)] bg-[var(--bg-base)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
            />
            {newFileDialog.error ? (
              <div className="mt-2 text-xs text-[var(--accent-error)]">{newFileDialog.error}</div>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded border border-[var(--bg-divider)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]"
                onClick={() => setNewFileDialog(null)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-[var(--accent-primary)] px-2.5 py-1 text-xs text-[var(--bg-base)]"
                onClick={() => { void submitNewFile(); }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Tree, NodeApi, NodeRendererProps } from 'react-arborist';
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
  Files,
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
  onRenameFile: (path: string) => Promise<void> | void;
  expandedDirs: string[];
  onExpandedDirsChange: (paths: string[]) => void;
  onSelectFile: (path: string) => Promise<void> | void;
  activeFile?: string | null;
}

type ContextMenuState =
  | { x: number; y: number; kind: 'dir'; path: string; pinned: boolean }
  | { x: number; y: number; kind: 'file'; path: string; starred: boolean }
  | { x: number; y: number; kind: 'files-panel' }
  | null;

function pathName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx');
}

function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex h-full min-h-16 flex-col items-center justify-center px-3 py-3 text-center">
      <p className="text-[var(--text-muted)] text-sm">{title}</p>
      {subtitle ? <p className="text-[var(--text-muted)] text-xs mt-1">{subtitle}</p> : null}
    </div>
  );
}

function NodeRow({ node, style, starred = false }: NodeRendererProps<TreeNode> & { starred?: boolean }) {
  const isDir = node.data.isDirectory;
  const isOpen = node.isOpen;
  const Icon = isDir ? (isOpen ? FolderOpen : Folder) : File;

  return (
    <div
      style={style}
      className={cn(
        'grid w-full min-w-0 grid-cols-[12px_14px_minmax(0,1fr)_12px] items-center gap-1 overflow-hidden px-2 py-0.5 rounded cursor-pointer select-none text-sm',
        'hover:bg-[var(--explorer-row-hover)]',
        node.isSelected && 'bg-[var(--explorer-row-active)]',
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
      <span className="w-3 text-right">
        {!isDir && starred ? <Star size={12} className="text-[var(--accent-warning)] fill-current" /> : null}
      </span>
    </div>
  );
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
  onRenameFile,
  expandedDirs,
  onExpandedDirsChange,
  onSelectFile,
  activeFile,
}: FileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);
  const { getOrFetch, invalidate } = useFileTreeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMdOnly, setFilterMdOnly] = useState(false);
  const [filterStarOnly, setFilterStarOnly] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

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
    const updateHeight = (rawHeight: number) => {
      const next = Math.max(1, Math.round(rawHeight));
      setHeight(prev => (prev === next ? prev : next));
    };

    updateHeight(containerRef.current.getBoundingClientRect().height);

    const ro = new ResizeObserver(entries => {
      rafId = requestAnimationFrame(() => {
        updateHeight(entries[0]?.contentRect.height ?? 400);
      });
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  const handleToggle = useCallback(async (id: string) => {
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

  const hasQuickFilter = filterMdOnly || filterStarOnly;

  const pathMatchesQuickFilters = useCallback((path: string) => {
    if (filterMdOnly && !isMarkdownPath(path)) return false;
    if (filterStarOnly && !isStarredPath(path)) return false;
    return true;
  }, [filterMdOnly, filterStarOnly, isStarredPath]);

  const filterTreeByQuickFilters = useCallback((nodes: TreeNode[]): TreeNode[] => {
    if (!hasQuickFilter) return nodes;

    const visit = (node: TreeNode): TreeNode | null => {
      if (!node.isDirectory) {
        return pathMatchesQuickFilters(node.path) ? node : null;
      }

      if (node.children === null) {
        return node;
      }

      const nextChildren = node.children
        .map(visit)
        .filter((child): child is TreeNode => child !== null);
      if (nextChildren.length === 0) return null;

      return { ...node, children: nextChildren } as DirectoryNode;
    };

    return nodes
      .map(visit)
      .filter((node): node is TreeNode => node !== null);
  }, [hasQuickFilter, pathMatchesQuickFilters]);

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

  const menuItemClass = 'w-full text-left px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-divider)]';
  const menuDangerItemClass = `${menuItemClass} text-[var(--accent-error)]`;
  const sectionCardClass = 'rounded-md border border-[var(--explorer-card-border)] bg-[var(--explorer-card-bg)]';
  const sectionHeaderClass = 'w-full flex items-center gap-1 px-2 py-1 text-xs uppercase tracking-wide text-[var(--text-muted)] hover:bg-[var(--explorer-row-hover)]';
  const fileRowClass = 'grid min-w-0 grid-cols-[13px_minmax(0,1fr)_12px] items-center gap-1 px-1.5 py-1 rounded text-sm cursor-pointer text-[var(--text-secondary)]';

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--bg-divider)]">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Explorer</span>
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
      </div>

      <div className="px-2 py-1 border-b border-[var(--bg-divider)]">
        <input
          type="text"
          placeholder="Filter files..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-[var(--bg-overlay)] text-[var(--text-primary)] text-xs px-2 py-1 rounded outline-none placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--accent-primary)]"
        />
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFilterMdOnly(v => !v)}
            className={cn(
              'px-2 py-0.5 rounded-full text-[11px] leading-4 border transition-colors',
              filterMdOnly
                ? 'bg-[var(--accent-primary)] text-[var(--bg-base)] border-[var(--accent-primary)]'
                : 'bg-[var(--bg-overlay)] text-[var(--text-secondary)] border-[var(--bg-divider)] hover:bg-[var(--bg-divider)]'
            )}
            title="Only markdown"
          >
            MD
          </button>
          <button
            type="button"
            onClick={() => setFilterStarOnly(v => !v)}
            className={cn(
              'px-2 py-0.5 rounded-full text-[11px] leading-4 border transition-colors',
              filterStarOnly
                ? 'bg-[var(--accent-warning)] text-[var(--bg-base)] border-[var(--accent-warning)]'
                : 'bg-[var(--bg-overlay)] text-[var(--text-secondary)] border-[var(--bg-divider)] hover:bg-[var(--bg-divider)]'
            )}
            title="Only starred"
          >
            Star
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterMdOnly(false);
              setFilterStarOnly(false);
            }}
            disabled={!hasQuickFilter}
            className={cn(
              'ml-auto px-2 py-0.5 rounded-full text-[11px] leading-4 border transition-colors',
              hasQuickFilter
                ? 'bg-[var(--bg-overlay)] text-[var(--text-secondary)] border-[var(--bg-divider)] hover:bg-[var(--bg-divider)]'
                : 'bg-[var(--bg-overlay)] text-[var(--text-muted)] border-[var(--bg-divider)] opacity-60 cursor-not-allowed'
            )}
            title="Clear filters"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-2">
        <div className="flex h-full min-h-0 flex-col gap-2">
          <section className={sectionCardClass}>
            <button
              onClick={onToggleFilesPanel}
              onContextMenu={e => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, kind: 'files-panel' });
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
                    subtitle="Click +File to add"
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
                          'hover:bg-[var(--explorer-row-hover)]',
                          isActive && 'bg-[var(--explorer-row-active)]',
                        )}
                        title={path}
                        onClick={() => openFile(path)}
                        onContextMenu={e => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, kind: 'file', path, starred: isStarred });
                        }}
                      >
                        <File size={13} />
                        <span
                          className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                          title={path}
                        >
                          {pathName(path)}
                        </span>
                        <span className="w-3 text-right">
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
                <EmptyState title="No folders pinned." subtitle="Click +Dir to start" />
              ) : (
                <Tree<TreeNode>
                  data={visibleTreeData}
                  height={height}
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
                        'min-w-0 overflow-hidden rounded',
                        !props.node.data.isDirectory && normalizePath(props.node.data.path) === normalizedActive && 'bg-[var(--explorer-row-active)]'
                      )}
                      onClick={() => {
                        if (!props.node.data.isDirectory && isOpenablePath(props.node.data.path)) {
                          openFile(props.node.data.path);
                        }
                      }}
                      onContextMenu={e => {
                        if (props.node.data.isDirectory) {
                          e.preventDefault();
                          const normalized = normalizePath(props.node.data.path).toLowerCase();
                          const pinned = pinnedDirs.some(dir => normalizePath(dir).toLowerCase() === normalized);
                          setContextMenu({ x: e.clientX, y: e.clientY, kind: 'dir', path: props.node.data.path, pinned });
                        } else {
                          e.preventDefault();
                          const starred = isStarredPath(props.node.data.path);
                          setContextMenu({ x: e.clientX, y: e.clientY, kind: 'file', path: props.node.data.path, starred });
                        }
                      }}
                    >
                      <NodeRow
                        {...props}
                        starred={!props.node.data.isDirectory && isStarredPath(props.node.data.path)}
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
          className="fixed z-50 bg-[var(--bg-overlay)] border border-[var(--bg-divider)] rounded shadow-lg py-1 text-sm min-w-36"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.kind === 'dir' && (
            <>
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
                  Promise.resolve(onRenameFile(contextMenu.path)).finally(() => setContextMenu(null));
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
                  onToggleFileStar(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                {contextMenu.starred ? 'Unstar' : 'Star'}
              </button>
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
    </div>
  );
}

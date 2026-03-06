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

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function pathName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function NodeRow({ node, style }: NodeRendererProps<TreeNode>) {
  const isDir = node.data.isDirectory;
  const isOpen = node.isOpen;
  const Icon = isDir ? (isOpen ? FolderOpen : Folder) : File;

  return (
    <div
      style={style}
      className={cn(
        'flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer select-none text-sm',
        'hover:bg-[var(--bg-overlay)]',
        node.isSelected && 'bg-[var(--bg-overlay)]',
      )}
      onClick={() => {
        if (isDir) node.toggle();
      }}
    >
      <span className="w-3 flex-shrink-0">
        {isDir && (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </span>
      <Icon size={14} className={cn(isDir ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]', 'flex-shrink-0')} />
      <span className={cn('truncate', isDir ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
        <span title={node.data.path}>{node.data.name}</span>
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

  const searchMatch = useCallback((node: NodeApi<TreeNode>, term: string) => {
    if (!term) return true;
    return node.data.name.toLowerCase().includes(term.toLowerCase());
  }, []);

  const starredPathSet = useMemo(() => {
    return new Set(starredFiles.map(path => normalizePath(path).toLowerCase()));
  }, [starredFiles]);

  const filteredFiles = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();

    return pinnedFiles
      .map(normalizePath)
      .filter(isOpenablePath)
      .filter(path => {
        if (!term) return true;
        const name = pathName(path).toLowerCase();
        return path.toLowerCase().includes(term) || name.includes(term);
      })
      .sort((a, b) => {
        const aStar = starredPathSet.has(a.toLowerCase());
        const bStar = starredPathSet.has(b.toLowerCase());
        if (aStar !== bStar) return aStar ? -1 : 1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });
  }, [pinnedFiles, searchQuery, starredPathSet]);

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
      </div>

      <div className="border-b border-[var(--bg-divider)]">
        <button
          onClick={onToggleFilesPanel}
          onContextMenu={e => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, kind: 'files-panel' });
          }}
          className="w-full flex items-center gap-1 px-2 py-1 text-xs uppercase tracking-wide text-[var(--text-muted)] hover:bg-[var(--bg-overlay)]"
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
              <div className="px-2 py-2 text-xs text-[var(--text-muted)]">No imported files.</div>
            ) : (
              filteredFiles.map(path => {
                const isStarred = starredPathSet.has(path.toLowerCase());
                const isActive = normalizedActive === path;
                return (
                  <div
                    key={path}
                    ref={isActive ? activeRowRef : null}
                    className={cn(
                      'flex items-center gap-1 px-1.5 py-1 rounded text-sm cursor-pointer',
                      'hover:bg-[var(--bg-overlay)]',
                      isActive && 'bg-[var(--bg-overlay)]',
                    )}
                    title={path}
                    onClick={() => openFile(path)}
                    onContextMenu={e => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, kind: 'file', path, starred: isStarred });
                    }}
                  >
                    <File size={13} className="text-[var(--text-secondary)] flex-shrink-0" />
                    <span className="truncate text-[var(--text-secondary)]" title={path}>{pathName(path)}</span>
                    {isStarred && <Star size={12} className="text-[var(--accent-warning)] ml-1" />}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden app-scrollbar">
        {pinnedDirs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-[var(--text-muted)] text-sm">No folders pinned.</p>
            <p className="text-[var(--text-muted)] text-xs mt-1">Click + Dir to start</p>
          </div>
        ) : (
          <Tree<TreeNode>
            data={treeData}
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
                  !props.node.data.isDirectory && normalizePath(props.node.data.path) === normalizedActive && 'bg-[var(--bg-overlay)] rounded'
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
                    const normalized = normalizePath(props.node.data.path).toLowerCase();
                    const starred = starredPathSet.has(normalized);
                    setContextMenu({ x: e.clientX, y: e.clientY, kind: 'file', path: props.node.data.path, starred });
                  }
                }}
              >
                <NodeRow {...props} />
              </div>
            )}
          </Tree>
        )}
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

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Tree, NodeApi, NodeRendererProps } from 'react-arborist';
import { useFileTreeStore, TreeNode, DirectoryNode } from '../../stores/fileTreeStore';
import { pickDirectory } from '../../lib/fs';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Star, StarOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isMarkdownPath } from '../../lib/markdown';

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
  onSelectFile: (path: string) => Promise<void> | void;
  activeFile?: string | null;
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
      onClick={() => { if (isDir) node.toggle(); }}
    >
      <span className="w-3 flex-shrink-0">
        {isDir && (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </span>
      <Icon size={14} className={cn(isDir ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]', 'flex-shrink-0')} />
      <span className={cn('truncate', isDir ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
        {node.data.name}
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
  onSelectFile,
  activeFile,
}: FileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);
  const { getOrFetch } = useFileTreeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);

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
    const ro = new ResizeObserver(entries => {
      rafId = requestAnimationFrame(() => {
        setHeight(entries[0]?.contentRect.height ?? 400);
      });
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); cancelAnimationFrame(rafId); };
  }, []);

  const handleToggle = useCallback(async (id: string) => {
    const node = findNode(treeData, id);
    if (!node || !node.isDirectory || node.children !== null) return;
    try {
      const children = await getOrFetch(id);
      setTreeData(prev => updateNodeChildren(prev, id, children));
    } catch (err) {
      console.error('[FileTree] loadChildren failed', id, err);
    }
  }, [treeData, getOrFetch]);

  const handlePinDir = useCallback(async () => {
    const path = await pickDirectory();
    if (path) onPinDir(path.replace(/\\/g, '/'));
  }, [onPinDir]);

  const openMarkdownFile = useCallback((path: string) => {
    Promise.resolve(onSelectFile(path)).catch(err => {
      console.error('[FileTree] open file failed', path, err);
    });
  }, [onSelectFile]);

  const handleSelect = useCallback((nodes: NodeApi<TreeNode>[]) => {
    const node = nodes[0];
    if (node && !node.data.isDirectory && isMarkdownPath(node.data.path)) {
      openMarkdownFile(node.data.path);
    }
  }, [openMarkdownFile]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  useEffect(() => {
    if (contextMenu) {
      document.addEventListener('click', closeContextMenu);
      return () => document.removeEventListener('click', closeContextMenu);
    }
  }, [contextMenu, closeContextMenu]);

  const searchMatch = useCallback((node: NodeApi<TreeNode>, term: string) => {
    if (!term) return true;
    return node.data.name.toLowerCase().includes(term.toLowerCase());
  }, []);

  const filteredFiles = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const set = new Set(starredFiles);

    return pinnedFiles
      .filter(path => isMarkdownPath(path))
      .filter(path => {
        if (!term) return true;
        return path.toLowerCase().includes(term) || path.split(/[\\/]/).pop()?.toLowerCase().includes(term);
      })
      .sort((a, b) => {
        const aStar = set.has(a);
        const bStar = set.has(b);
        if (aStar !== bStar) return aStar ? -1 : 1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });
  }, [pinnedFiles, starredFiles, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--bg-divider)]">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Explorer</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onAddFiles}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1 py-0.5 rounded hover:bg-[var(--bg-overlay)]"
            title="Import Markdown Files"
          >
            <Plus size={12} /> File
          </button>
          <button
            onClick={handlePinDir}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1 py-0.5 rounded hover:bg-[var(--bg-overlay)]"
            title="Pin Directory"
          >
            <Plus size={12} /> Dir
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
          className="w-full flex items-center gap-1 px-2 py-1 text-xs uppercase tracking-wide text-[var(--text-muted)] hover:bg-[var(--bg-overlay)]"
          title={filesPanelOpen ? 'Collapse files' : 'Expand files'}
        >
          {filesPanelOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>Files</span>
          <span className="ml-auto normal-case">{filteredFiles.length}</span>
        </button>

        {filesPanelOpen && (
          <div className="max-h-44 overflow-auto px-1 pb-1">
            {filteredFiles.length === 0 ? (
              <div className="px-2 py-2 text-xs text-[var(--text-muted)]">No imported markdown files.</div>
            ) : (
              filteredFiles.map(path => {
                const name = path.split(/[\\/]/).pop() ?? path;
                const isStarred = starredFiles.includes(path);
                const isActive = activeFile === path;
                return (
                  <div
                    key={path}
                    className={cn(
                      'flex items-center gap-1 px-1.5 py-1 rounded text-sm cursor-pointer',
                      'hover:bg-[var(--bg-overlay)]',
                      isActive && 'bg-[var(--bg-overlay)]',
                    )}
                    title={path}
                    onClick={() => openMarkdownFile(path)}
                  >
                    <File size={13} className="text-[var(--text-secondary)] flex-shrink-0" />
                    <span className="truncate text-[var(--text-secondary)]">{name}</span>
                    <button
                      className="ml-auto p-0.5 rounded hover:bg-[var(--bg-divider)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFileStar(path);
                      }}
                      title={isStarred ? 'Unstar file' : 'Star file'}
                    >
                      {isStarred ? <Star size={13} className="text-[var(--accent-warning)]" /> : <StarOff size={13} className="text-[var(--text-muted)]" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden">
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
            disableDrag
            disableDrop
            disableEdit
          >
            {(props) => (
              <div
                data-id={props.node.data.path}
                onClick={() => {
                  if (!props.node.data.isDirectory && isMarkdownPath(props.node.data.path)) {
                    openMarkdownFile(props.node.data.path);
                  }
                }}
                onContextMenu={e => {
                  if (pinnedDirs.includes(props.node.data.path)) {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, path: props.node.data.path });
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
          className="fixed z-50 bg-[var(--bg-overlay)] border border-[var(--bg-divider)] rounded shadow-lg py-1 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1 hover:bg-[var(--bg-divider)]"
            style={{ color: 'var(--accent-error)' }}
            onClick={() => { onUnpinDir(contextMenu.path); setContextMenu(null); }}
          >
            Unpin Directory
          </button>
        </div>
      )}
    </div>
  );
}

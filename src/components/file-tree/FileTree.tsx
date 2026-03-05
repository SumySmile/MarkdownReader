import { useEffect, useRef, useState, useCallback } from 'react';
import { Tree, NodeApi, NodeRendererProps } from 'react-arborist';
import { useFileTreeStore, TreeNode, DirectoryNode } from '../../stores/fileTreeStore';
import { pickDirectory } from '../../lib/fs';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FileTreeProps {
  pinnedDirs: string[];
  onPinDir: (path: string) => void;
  onUnpinDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  activeFile?: string | null;
}

function NodeRow({ node, style }: NodeRendererProps<TreeNode>) {
  const isDir = node.data.isDirectory;
  const isMd = !isDir && node.data.name.endsWith('.md');
  const isOpen = node.isOpen;

  const Icon = isDir ? (isOpen ? FolderOpen : Folder) : File;

  return (
    <div
      style={style}
      className={cn(
        'flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer select-none text-sm',
        'hover:bg-[var(--bg-overlay)]',
        node.isSelected && 'bg-[var(--bg-overlay)]',
        !isMd && !isDir && 'opacity-40 pointer-events-none',
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

// Find a node by path in the tree (recursive)
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

export function FileTree({ pinnedDirs, onPinDir, onUnpinDir, onSelectFile }: FileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);
  const { getOrFetch } = useFileTreeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);

  // Tree data: roots with their loaded children
  const [treeData, setTreeData] = useState<TreeNode[]>([]);

  // Initialize root nodes from pinnedDirs
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
          children: [], // empty = expandable but not loaded
        } as DirectoryNode;
      });
    });
  }, [pinnedDirs]);

  // ResizeObserver with rAF
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

  // Load children on toggle (lazy loading)
  const handleToggle = useCallback(async (id: string) => {
    const node = findNode(treeData, id);
    if (!node || !node.isDirectory || node.children?.length) return;
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

  const handleSelect = useCallback((nodes: NodeApi<TreeNode>[]) => {
    const node = nodes[0];
    if (node && !node.data.isDirectory && node.data.name.endsWith('.md')) {
      onSelectFile(node.data.path);
    }
  }, [onSelectFile]);

  // Context menu
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  useEffect(() => {
    if (contextMenu) {
      document.addEventListener('click', closeContextMenu);
      return () => document.removeEventListener('click', closeContextMenu);
    }
  }, [contextMenu, closeContextMenu]);

  const searchMatch = useCallback((node: NodeApi<TreeNode>, term: string) => {
    if (node.data.isDirectory) return true;
    return node.data.name.toLowerCase().includes(term.toLowerCase());
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--bg-divider)]">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Explorer</span>
        <button
          onClick={handlePinDir}
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1 py-0.5 rounded hover:bg-[var(--bg-overlay)]"
          title="Pin Directory"
        >
          <Plus size={12} /> Pin Dir
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1 border-b border-[var(--bg-divider)]">
        <input
          type="text"
          placeholder="Filter files..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-[var(--bg-overlay)] text-[var(--text-primary)] text-xs px-2 py-1 rounded outline-none placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--accent-primary)]"
        />
      </div>

      {/* Tree */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        {pinnedDirs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-[var(--text-muted)] text-sm">No folders pinned.</p>
            <p className="text-[var(--text-muted)] text-xs mt-1">Click + Pin Dir to start</p>
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

      {/* Context Menu */}
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

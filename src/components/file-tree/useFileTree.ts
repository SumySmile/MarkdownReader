import { useState, useCallback } from 'react';
import { useFileTreeStore, TreeNode } from '../../stores/fileTreeStore';

export function useFileTree(pinnedDirs: string[]) {
  const { getOrFetch } = useFileTreeStore();
  const [roots, setRoots] = useState<Map<string, TreeNode[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');

  const loadDir = useCallback(async (path: string) => {
    const entries = await getOrFetch(path);
    setRoots(prev => new Map(prev).set(path, entries));
    return entries;
  }, [getOrFetch]);

  // Load all pinned root dirs
  const initPinnedDirs = useCallback(async () => {
    for (const dir of pinnedDirs) {
      await loadDir(dir);
    }
  }, [pinnedDirs, loadDir]);

  const filterNodes = useCallback((nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;
    const q = query.toLowerCase();
    return nodes.filter(n => {
      if (n.isDirectory) return true; // always show dirs
      return n.name.toLowerCase().includes(q);
    });
  }, []);

  return { roots, loadDir, initPinnedDirs, searchQuery, setSearchQuery, filterNodes };
}

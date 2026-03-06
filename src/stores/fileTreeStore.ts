import { create } from 'zustand';
import { listDirSorted } from '../lib/fs';
import { isMarkdownPath } from '../lib/markdown';

export type FileNode = { id: string; name: string; path: string; isDirectory: false; children?: never };
export type DirectoryNode = { id: string; name: string; path: string; isDirectory: true; children: TreeNode[] | null };
export type TreeNode = FileNode | DirectoryNode;

interface DirCacheEntry {
  entries: TreeNode[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 30_000;

function mapEntries(entries: { name: string; path: string; is_dir: boolean }[]): TreeNode[] {
  return entries
    .filter(e => e.name)
    .filter(e => e.is_dir || isMarkdownPath(e.name))
    .map(e => {
      const path = e.path;
      if (e.is_dir) {
        return { id: path, name: e.name, path, isDirectory: true, children: null } as DirectoryNode;
      }
      return { id: path, name: e.name, path, isDirectory: false } as FileNode;
    });
}

interface FileTreeStore {
  dirCache: Map<string, DirCacheEntry>;
  getOrFetch: (path: string) => Promise<TreeNode[]>;
  invalidate: (path: string) => void;
}

export const useFileTreeStore = create<FileTreeStore>((set, get) => ({
  dirCache: new Map(),

  getOrFetch: async (path: string) => {
    const cached = get().dirCache.get(path);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.entries;
    }
    const raw = await listDirSorted(path);
    const entries = mapEntries(raw);
    set(s => ({
      dirCache: new Map(s.dirCache).set(path, { entries, fetchedAt: Date.now() }),
    }));
    return entries;
  },

  invalidate: (path: string) =>
    set(s => {
      const m = new Map(s.dirCache);
      m.delete(path);
      return { dirCache: m };
    }),
}));

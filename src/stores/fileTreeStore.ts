import { create } from 'zustand';
import { inspectDirectoryContent, listDirSorted } from '../lib/fs';
import { isOpenablePath } from '../lib/markdown';
import { normalizePath } from '../lib/path';

export type FileNode = { id: string; name: string; path: string; isDirectory: false; children?: never };
export type DirectoryNode = { id: string; name: string; path: string; isDirectory: true; children: TreeNode[] | null; markdownHint?: boolean };
export type TreeNode = FileNode | DirectoryNode;

interface DirCacheEntry {
  entries: TreeNode[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 30_000;

async function mapEntries(entries: { name: string; path: string; is_dir: boolean }[]): Promise<TreeNode[]> {
  const named = entries.filter(e => e.name);
  const dirs = named.filter(e => e.is_dir);
  const files = named.filter(e => !e.is_dir && isOpenablePath(e.name));
  const dirChecks = await Promise.all(dirs.map(dir => inspectDirectoryContent(dir.path)));

  const mappedDirs = dirs
    .filter((_, idx) => dirChecks[idx]?.hasOpenable)
    .map((e, idx) => {
      const path = normalizePath(e.path);
      return { id: path, name: e.name, path, isDirectory: true, children: null, markdownHint: dirChecks[idx]?.hasMarkdown ?? false } as DirectoryNode;
    });

  const mappedFiles = files.map(e => {
    const path = normalizePath(e.path);
    return { id: path, name: e.name, path, isDirectory: false } as FileNode;
  });

  return [...mappedDirs, ...mappedFiles];
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
    const entries = await mapEntries(raw);
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

import { readDir, remove, rename, watch } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import { getOpenableExtensions, isMarkdownPath, isOpenablePath } from './markdown';

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export async function listDirSorted(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>('read_dir_sorted', { path });
}

export async function listDir(path: string) {
  return readDir(path);
}

export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke<void>('write_text_file', { path, content });
}

export async function pickDirectory(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title: 'Select Project Folder' });
  return result as string | null;
}

export async function pickOpenableTextFiles(): Promise<string[]> {
  const result = await open({
    directory: false,
    multiple: true,
    title: 'Open Markdown/Text File',
    filters: [{ name: 'Markdown/Text', extensions: getOpenableExtensions().map(ext => ext.slice(1)) }],
  });

  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function openContainingFolder(filePath: string): Promise<void> {
  const normalized = filePath.replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  const folder = slashIndex > 0 ? normalized.slice(0, slashIndex) : normalized;
  try {
    await invoke('open_containing_folder_native', { path: normalized });
  } catch {
    await openPath(folder);
  }
}

export async function openDirectory(path: string): Promise<void> {
  const normalized = path.replace(/\\/g, '/');
  try {
    await invoke('open_directory_native', { path: normalized });
  } catch {
    await openPath(normalized);
  }
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  await rename(oldPath.replace(/\\/g, '/'), newPath.replace(/\\/g, '/'));
}

export async function deletePath(path: string): Promise<void> {
  await remove(path.replace(/\\/g, '/'));
}

export async function hasOpenableFilesInDirectory(path: string): Promise<boolean> {
  const result = await inspectDirectoryContent(path);
  return result.hasOpenable;
}

export async function inspectDirectoryContent(path: string): Promise<{ hasOpenable: boolean; hasMarkdown: boolean }> {
  const stack: string[] = [path.replace(/\\/g, '/')];
  const visited = new Set<string>();
  let hasOpenable = false;
  let hasMarkdown = false;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    let entries: DirEntry[];
    try {
      entries = await listDirSorted(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const normalized = entry.path.replace(/\\/g, '/');
      if (entry.is_dir) {
        if (!visited.has(normalized)) stack.push(normalized);
      } else {
        if (!hasOpenable && isOpenablePath(normalized)) hasOpenable = true;
        if (!hasMarkdown && isMarkdownPath(normalized)) hasMarkdown = true;
        if (hasOpenable && hasMarkdown) {
          return { hasOpenable: true, hasMarkdown: true };
        }
      }
    }
  }

  return { hasOpenable, hasMarkdown };
}

export async function getLaunchArgs(): Promise<string[]> {
  return invoke<string[]>('get_launch_args');
}

export { watch };

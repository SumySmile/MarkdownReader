import { readDir, watch } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getMarkdownExtensions } from './markdown';

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

export async function pickMarkdownFiles(): Promise<string[]> {
  const result = await open({
    directory: false,
    multiple: true,
    title: 'Open Markdown File',
    filters: [{ name: 'Markdown', extensions: getMarkdownExtensions().map(ext => ext.slice(1)) }],
  });

  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function getLaunchArgs(): Promise<string[]> {
  return invoke<string[]>('get_launch_args');
}

export { watch };

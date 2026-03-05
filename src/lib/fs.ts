import { readDir, readTextFile, writeTextFile, watch } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

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
  return readTextFile(path);
}

export async function writeFile(path: string, content: string): Promise<void> {
  return writeTextFile(path, content);
}

export async function pickDirectory(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title: 'Select Project Folder' });
  return result as string | null;
}

export { watch };

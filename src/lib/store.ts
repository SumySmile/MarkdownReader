import { load, Store } from '@tauri-apps/plugin-store';

let _storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!_storePromise) {
    _storePromise = load('config.json', { defaults: {}, autoSave: true });
  }
  return _storePromise;
}

export async function storeGet<T>(key: string): Promise<T | null> {
  const store = await getStore();
  return (await store.get<T>(key)) ?? null;
}

export async function storeSet<T>(key: string, value: T): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
}

export async function storeSave(): Promise<void> {
  const store = await getStore();
  await store.save();
}

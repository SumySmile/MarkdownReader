export function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const existing = map.get(key);
  if (existing === undefined) return undefined;
  map.delete(key);
  map.set(key, existing);
  return existing;
}

export function lruSet<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldestKey = map.keys().next().value as K | undefined;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

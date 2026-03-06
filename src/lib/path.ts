export function normalizePath(path: string): string {
  const normalized = path
    .normalize('NFC')
    .replace(/^file:\/\//i, '')
    .replace(/\\/g, '/')
    .replace(/^\/\/\?\//, '')
    .replace(/^\/\?\//, '')
    .replace(/^\/([a-zA-Z]:\/)/, '$1')
    .replace(/\/+/g, '/');

  // Keep Windows drive roots stable as "X:/".
  if (/^[a-zA-Z]:\/?$/.test(normalized)) {
    return `${normalized[0]}:/`;
  }

  return normalized.replace(/\/+$/, '');
}

export function pathKey(path: string): string {
  return normalizePath(path).toLowerCase();
}

export function pathKeyNoDrive(path: string): string {
  return pathKey(path).replace(/^[a-z]:/, '');
}

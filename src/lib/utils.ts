export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function resolveRelativePath(baseFilePath: string, relativeSrc: string): string {
  const normalized = baseFilePath.replace(/\\/g, '/');
  const dir = normalized.substring(0, normalized.lastIndexOf('/'));
  return `${dir}/${relativeSrc}`;
}

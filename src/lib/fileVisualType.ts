export type FileVisualType =
  | 'markdown'
  | 'code'
  | 'config'
  | 'script'
  | 'data'
  | 'docs'
  | 'plain'
  | 'unknown';

export type FileVisualTheme = 'dark' | 'light' | 'mint' | 'gray';

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.java', '.kt', '.swift', '.cs', '.cpp', '.c', '.h',
]);

const CONFIG_EXTENSIONS = new Set([
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.properties',
]);

const SCRIPT_EXTENSIONS = new Set([
  '.sh', '.bash', '.zsh', '.ps1', '.cmd', '.bat',
]);

const DATA_EXTENSIONS = new Set([
  '.csv', '.xml', '.sql', '.log',
]);

const DOC_EXTENSIONS = new Set([
  '.txt', '.mdx', '.markdown', '.rst',
]);

function normalize(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function fileName(path: string): string {
  const normalized = normalize(path);
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function extension(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf('.');
  if (dot < 0) return '';
  return name.slice(dot);
}

export function getFileVisualType(path: string | null | undefined): FileVisualType {
  if (!path) return 'unknown';
  const name = fileName(path);
  const ext = extension(path);

  if (name.endsWith('.md')) return 'markdown';
  if (DOC_EXTENSIONS.has(ext)) return ext === '.mdx' || ext === '.markdown' ? 'markdown' : 'docs';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (CONFIG_EXTENSIONS.has(ext)) return 'config';
  if (SCRIPT_EXTENSIONS.has(ext)) return 'script';
  if (DATA_EXTENSIONS.has(ext)) return 'data';
  if (ext === '') return 'plain';
  return 'plain';
}

export function getShikiThemeForAppTheme(theme: FileVisualTheme): string {
  switch (theme) {
    case 'dark':
      return 'one-dark-pro';
    case 'light':
      return 'rose-pine-dawn';
    case 'mint':
      return 'everforest-light';
    case 'gray':
      return 'one-light';
    default:
      return 'github-light';
  }
}

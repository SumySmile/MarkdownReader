const MARKDOWN_EXTENSIONS = [
  '.md',
  '.markdown',
  '.mdown',
  '.mkd',
  '.mkdn',
  '.mdx',
  '.rmd',
  '.qmd',
];

const EDITABLE_TEXT_EXTENSIONS = [
  '.txt',
  '.py',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.env',
  '.properties',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.prompt',
  '.j2',
  '.tmpl',
];

const READONLY_PREVIEW_EXTENSIONS = [
  '.log',
  '.csv',
  '.xml',
  '.sql',
];

export type FileKind = 'markdown' | 'text' | 'unsupported';

const READONLY_FILE_NAMES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
];

const EDITABLE_SPECIAL_FILE_NAMES = [
  'skill.md',
  'agents.md',
  'readme.md',
  'claude.md',
];

function normalize(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function baseName(path: string): string {
  const normalized = normalize(path);
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function endsWithAny(path: string, extensions: string[]): boolean {
  return extensions.some(ext => path.endsWith(ext));
}

export function isInReadOnlyPath(path: string): boolean {
  const normalized = normalize(path);
  return normalized.includes('/node_modules/') || normalized.includes('/.git/');
}

export function isMarkdownPath(path: string): boolean {
  const normalized = normalize(path);
  return endsWithAny(normalized, MARKDOWN_EXTENSIONS);
}

export function getMarkdownExtensions(): string[] {
  return [...MARKDOWN_EXTENSIONS];
}

export function getPreviewTextExtensions(): string[] {
  return [...EDITABLE_TEXT_EXTENSIONS, ...READONLY_PREVIEW_EXTENSIONS];
}

export function getOpenableExtensions(): string[] {
  return [...MARKDOWN_EXTENSIONS, ...EDITABLE_TEXT_EXTENSIONS, ...READONLY_PREVIEW_EXTENSIONS];
}

export function isReadonlyPreviewPath(path: string): boolean {
  const normalized = normalize(path);
  const fileName = baseName(path);
  if (isInReadOnlyPath(normalized)) return true;
  if (READONLY_FILE_NAMES.includes(fileName)) return true;
  return endsWithAny(normalized, READONLY_PREVIEW_EXTENSIONS);
}

export function isEditablePath(path: string): boolean {
  const normalized = normalize(path);
  const fileName = baseName(path);
  if (isInReadOnlyPath(normalized)) return false;
  if (READONLY_FILE_NAMES.includes(fileName)) return false;
  if (EDITABLE_SPECIAL_FILE_NAMES.includes(fileName)) return true;
  return endsWithAny(normalized, MARKDOWN_EXTENSIONS) || endsWithAny(normalized, EDITABLE_TEXT_EXTENSIONS);
}

export function isSizeLimitExemptPath(path: string): boolean {
  const fileName = baseName(path);
  return fileName === 'skill.md';
}

export function isOpenablePath(path: string): boolean {
  const normalized = normalize(path);
  return (
    endsWithAny(normalized, MARKDOWN_EXTENSIONS) ||
    endsWithAny(normalized, EDITABLE_TEXT_EXTENSIONS) ||
    endsWithAny(normalized, READONLY_PREVIEW_EXTENSIONS)
  );
}

export function getFileKind(path: string): FileKind {
  const normalized = normalize(path);
  if (endsWithAny(normalized, MARKDOWN_EXTENSIONS)) return 'markdown';
  if (isOpenablePath(normalized)) return 'text';
  return 'unsupported';
}

export function isOpenableTextPath(path: string): boolean {
  return isOpenablePath(path);
}

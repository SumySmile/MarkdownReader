import type { Highlighter } from 'shiki';

let _highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!_highlighterPromise) {
    _highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark', 'github-light', 'material-theme-lighter', 'one-light'],
        langs: ['javascript', 'typescript', 'python', 'rust', 'go', 'bash', 'json', 'css', 'html', 'markdown', 'yaml', 'toml'],
      })
    );
  }
  return _highlighterPromise;
}

// Simple djb2 hash for cache keys
function hashCode(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const cache = new Map<string, string>();
const MAX_CACHE = 200;

export async function highlight(code: string, lang: string, theme: string = 'github-dark'): Promise<string> {
  const key = `${theme}::${lang}::${hashCode(code)}`;
  if (cache.has(key)) return cache.get(key)!;

  const hl = await getHighlighter();
  const themeId = theme;
  let html: string;
  try {
    html = hl.codeToHtml(code, { lang, theme: themeId });
  } catch {
    // Unknown language fallback
    try {
      html = hl.codeToHtml(code, { lang: 'text', theme: themeId });
    } catch {
      // Final fallback for unknown theme identifiers.
      html = hl.codeToHtml(code, { lang: 'text', theme: 'github-light' });
    }
  }

  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, html);
  return html;
}

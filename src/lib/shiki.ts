import { createBundledHighlighter, createSingletonShorthands } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

const createHighlighter = createBundledHighlighter({
  engine: createJavaScriptRegexEngine,
  themes: {
    'github-light': () => import('shiki/dist/themes/github-light.mjs'),
    'one-dark-pro': () => import('shiki/dist/themes/one-dark-pro.mjs'),
    'rose-pine-dawn': () => import('shiki/dist/themes/rose-pine-dawn.mjs'),
    'everforest-light': () => import('shiki/dist/themes/everforest-light.mjs'),
    'one-light': () => import('shiki/dist/themes/one-light.mjs'),
  },
  langs: {
    javascript: () => import('shiki/dist/langs/javascript.mjs'),
    typescript: () => import('shiki/dist/langs/typescript.mjs'),
    python: () => import('shiki/dist/langs/python.mjs'),
    rust: () => import('shiki/dist/langs/rust.mjs'),
    go: () => import('shiki/dist/langs/go.mjs'),
    bash: () => import('shiki/dist/langs/bash.mjs'),
    powershell: () => import('shiki/dist/langs/powershell.mjs'),
    json: () => import('shiki/dist/langs/json.mjs'),
    css: () => import('shiki/dist/langs/css.mjs'),
    html: () => import('shiki/dist/langs/html.mjs'),
    xml: () => import('shiki/dist/langs/xml.mjs'),
    markdown: () => import('shiki/dist/langs/markdown.mjs'),
    yaml: () => import('shiki/dist/langs/yaml.mjs'),
    toml: () => import('shiki/dist/langs/toml.mjs'),
    sql: () => import('shiki/dist/langs/sql.mjs'),
  },
});

const { codeToHtml } = createSingletonShorthands(createHighlighter);

const SUPPORTED_THEMES = new Set(['github-light', 'one-dark-pro', 'rose-pine-dawn', 'everforest-light', 'one-light']);

function normalizeTheme(theme: string): string {
  return SUPPORTED_THEMES.has(theme) ? theme : 'github-light';
}

function normalizeLang(lang: string): string {
  const next = (lang || '').trim().toLowerCase();
  if (!next) return 'text';
  if (next === 'js' || next === 'mjs' || next === 'cjs' || next === 'jsx') return 'javascript';
  if (next === 'ts' || next === 'tsx') return 'typescript';
  if (next === 'py') return 'python';
  if (next === 'sh' || next === 'zsh' || next === 'shell') return 'bash';
  if (next === 'ps1') return 'powershell';
  if (next === 'yml') return 'yaml';
  if (next === 'md') return 'markdown';
  if (next === 'htm') return 'html';
  if (next === 'jsonc') return 'json';
  if (next === 'plain' || next === 'plaintext') return 'text';
  return next;
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
  const resolvedTheme = normalizeTheme(theme);
  const resolvedLang = normalizeLang(lang);
  const key = `${resolvedTheme}::${resolvedLang}::${hashCode(code)}`;
  if (cache.has(key)) return cache.get(key)!;

  let html: string;
  try {
    html = await codeToHtml(code, { lang: resolvedLang, theme: resolvedTheme });
  } catch {
    // Unknown language fallback
    try {
      html = await codeToHtml(code, { lang: 'text', theme: resolvedTheme });
    } catch {
      // Final fallback for unknown theme identifiers.
      html = await codeToHtml(code, { lang: 'text', theme: 'github-light' });
    }
  }

  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, html);
  return html;
}

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ListTree, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { resolveRelativePath } from '../../lib/utils';
import { highlight } from '../../lib/shiki';
import { useDebouncedMarkdown } from '../../hooks/useDebouncedMarkdown';
import type { FileKind } from '../../lib/markdown';

interface PreviewPaneProps {
  content: string;
  filePath: string | null;
  fileKind?: FileKind | null;
  theme?: 'dark' | 'light' | 'mint' | 'gray';
}

interface CodeBlockProps {
  code: string;
  lang: string;
  shikiTheme: 'dark' | 'light';
}

interface TocHeading {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4;
}

const CodeBlock = memo(function CodeBlock({ code, lang, shikiTheme }: CodeBlockProps) {
  const [html, setHtml] = useState('');
  useEffect(() => {
    highlight(code, lang || 'text', shikiTheme).then(setHtml);
  }, [code, lang, shikiTheme]);
  if (!html) return <pre><code>{code}</code></pre>;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}, (prev, next) => prev.code === next.code && prev.lang === next.lang && prev.shikiTheme === next.shikiTheme);

function resolveImageSrc(src: string | undefined, filePath: string | null): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('http') || src.startsWith('data:')) return src;
  if (!filePath) return undefined;
  return convertFileSrc(resolveRelativePath(filePath, src));
}

function languageFromPath(filePath: string | null): string {
  if (!filePath) return 'text';
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const name = normalized.split('/').pop() ?? normalized;
  if (name.endsWith('.py')) return 'python';
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'typescript';
  if (name.endsWith('.js') || name.endsWith('.jsx') || name.endsWith('.mjs') || name.endsWith('.cjs')) return 'javascript';
  if (name.endsWith('.json') || name.endsWith('.jsonc')) return 'json';
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml';
  if (name.endsWith('.toml')) return 'toml';
  if (name.endsWith('.sh') || name.endsWith('.bash') || name.endsWith('.zsh')) return 'bash';
  if (name.endsWith('.ps1')) return 'powershell';
  if (name.endsWith('.sql')) return 'sql';
  if (name.endsWith('.xml')) return 'xml';
  if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.mdx')) return 'markdown';
  return 'text';
}

export function PreviewPane({ content, filePath, fileKind = 'markdown', theme = 'dark' }: PreviewPaneProps) {
  const debounced = useDebouncedMarkdown(content, 150);
  const normalizedContent = useMemo(() => normalizePreviewContent(debounced), [debounced]);
  const frontmatterSplit = useMemo(() => splitFrontmatter(normalizedContent), [normalizedContent]);
  const shikiTheme: 'dark' | 'light' = theme === 'dark' ? 'dark' : 'light';
  const [textPreviewHtml, setTextPreviewHtml] = useState('');
  const textPreviewLanguage = useMemo(() => languageFromPath(filePath), [filePath]);
  const [tocOpen, setTocOpen] = useState(true);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const [tocHeadings, setTocHeadings] = useState<TocHeading[]>([]);

  useEffect(() => {
    if (fileKind !== 'text') return;
    let cancelled = false;
    highlight(content, textPreviewLanguage, shikiTheme)
      .then(html => {
        if (!cancelled) setTextPreviewHtml(html);
      })
      .catch(() => {
        if (!cancelled) setTextPreviewHtml('');
      });
    return () => {
      cancelled = true;
    };
  }, [fileKind, content, textPreviewLanguage, shikiTheme]);

  useEffect(() => {
    if (fileKind !== 'markdown') {
      setTocHeadings([]);
      return;
    }
    const el = previewScrollRef.current;
    if (!el) return;
    const headingEls = Array.from(el.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')) as HTMLElement[];
    const nextHeadings: TocHeading[] = headingEls
      .map(item => {
        const levelRaw = Number(item.tagName.slice(1));
        if (Number.isNaN(levelRaw) || levelRaw < 1 || levelRaw > 4) return null;
        const id = item.id?.trim();
        const text = item.textContent?.trim() ?? '';
        if (!id || !text) return null;
        return { id, text, level: levelRaw as 1 | 2 | 3 | 4 };
      })
      .filter((item): item is TocHeading => item !== null);
    setTocHeadings(prev => {
      if (prev.length === nextHeadings.length && prev.every((item, index) => {
        const next = nextHeadings[index];
        return item.id === next.id && item.text === next.text && item.level === next.level;
      })) {
        return prev;
      }
      return nextHeadings;
    });
  }, [fileKind, normalizedContent, frontmatterSplit.body]);

  useEffect(() => {
    if (fileKind !== 'markdown' || tocHeadings.length === 0) {
      setActiveHeadingId(null);
      return;
    }
    const el = previewScrollRef.current;
    if (!el) return;
    let raf = 0;

    const updateActiveHeading = () => {
      raf = 0;
      const headingEls = Array.from(el.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')) as HTMLElement[];
      if (!headingEls.length) {
        setActiveHeadingId(null);
        return;
      }
      const top = el.scrollTop + 24;
      let current = headingEls[0].id;
      for (const item of headingEls) {
        if (item.offsetTop <= top) current = item.id;
        else break;
      }
      setActiveHeadingId(prev => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(updateActiveHeading);
    };

    updateActiveHeading();
    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fileKind, tocHeadings, normalizedContent]);

  if (fileKind === 'text') {
    return (
      <div
        className="h-full overflow-auto app-scrollbar px-8 py-6"
        style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-base)' }}
      >
        {textPreviewHtml ? (
          <div dangerouslySetInnerHTML={{ __html: textPreviewHtml }} />
        ) : (
          <pre
            className="whitespace-pre-wrap break-words text-sm leading-6"
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace' }}
          >
            {content}
          </pre>
        )}
      </div>
    );
  }

  const renderSlugSeen = new Map<string, number>();
  const nextHeadingId = (children: ReactNode) => {
    const text = extractTextFromReactNode(children).trim();
    const base = slugifyHeading(text || 'section');
    const count = renderSlugSeen.get(base) ?? 0;
    renderSlugSeen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  const jumpToHeading = (id: string) => {
    const el = previewScrollRef.current;
    if (!el) return;
    const headingEls = Array.from(el.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')) as HTMLElement[];
    const target = headingEls.find(item => item.id === id);
    if (!target) return;
    // Keep heading visible below top chrome (toolbar + pane padding).
    const TOP_SAFE_GAP = 64;
    el.scrollTo({ top: Math.max(0, target.offsetTop - TOP_SAFE_GAP), behavior: 'smooth' });
    setActiveHeadingId(id);
  };

  return (
    <div className="h-full flex min-w-0">
      <div
        ref={previewScrollRef}
        className="flex-1 overflow-auto app-scrollbar px-8 py-6 markdown-preview"
        style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-base)' }}
      >
        {frontmatterSplit.frontmatter ? (
          <pre className="markdown-frontmatter">{frontmatterSplit.frontmatter}</pre>
        ) : null}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1({ children }) { return <h1 id={nextHeadingId(children)}>{children}</h1>; },
            h2({ children }) { return <h2 id={nextHeadingId(children)}>{children}</h2>; },
            h3({ children }) { return <h3 id={nextHeadingId(children)}>{children}</h3>; },
            h4({ children }) { return <h4 id={nextHeadingId(children)}>{children}</h4>; },
            code({ children, className }) {
              const lang = (className || '').replace('language-', '');
              const code = String(children).replace(/\n$/, '');
              const isBlock = code.includes('\n') || lang;
              if (!isBlock) return <code style={{ color: 'var(--syntax-string)', background: 'var(--bg-surface)', padding: '0 4px', borderRadius: 3 }}>{children}</code>;
              return <CodeBlock code={code} lang={lang} shikiTheme={shikiTheme} />;
            },
            img({ src, alt }) {
              const resolved = resolveImageSrc(src, filePath);
              return <img src={resolved} alt={alt} style={{ maxWidth: '100%' }} />;
            },
            a({ href, children }) {
              return <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--text-link)' }}>{children}</a>;
            },
          }}
        >
          {frontmatterSplit.body}
        </ReactMarkdown>
      </div>
      {tocHeadings.length > 0 && (
        <aside
          className={`markdown-toc-pane ${tocOpen ? 'is-open' : 'is-collapsed'}`}
          style={{ borderColor: 'var(--bg-divider)', backgroundColor: 'var(--bg-surface)' }}
        >
          <div className="markdown-toc-toolbar" style={{ borderColor: 'var(--bg-divider)' }}>
            <button
              className="markdown-toc-toggle"
              onClick={() => setTocOpen(prev => !prev)}
              title={tocOpen ? 'Hide table of contents' : 'Show table of contents'}
              aria-label={tocOpen ? 'Hide table of contents' : 'Show table of contents'}
            >
              {tocOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            </button>
            {tocOpen && (
              <span className="markdown-toc-title">
                <ListTree size={13} />
                <span>TOC</span>
              </span>
            )}
          </div>
          {tocOpen && (
            <div className="markdown-toc-list app-scrollbar">
              {tocHeadings.map(item => (
                <button
                  key={item.id}
                  className={`markdown-toc-item ${activeHeadingId === item.id ? 'is-active' : ''}`}
                  style={{ paddingLeft: `${10 + (item.level - 1) * 12}px` }}
                  onClick={() => jumpToHeading(item.id)}
                  title={item.text}
                >
                  {item.text}
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function normalizePreviewContent(input: string): string {
  if (!input) return input;

  // 1) Try parse structured payload first (supports `ExitPlanMode` prefix and fenced blocks).
  const parsed = extractPlanPayload(input);
  if (parsed.length > 0) {
    return parsed.join('\n\n---\n\n');
  }

  // 2) Fallback: regex extraction from raw JSON-like text.
  const jsonFieldRe = /"(sendMessageToUser|plan)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  const sections: string[] = [];
  let m: RegExpExecArray | null = null;

  while ((m = jsonFieldRe.exec(input)) !== null) {
    const key = m[1];
    const raw = m[2];
    try {
      const decoded = JSON.parse(`"${raw}"`) as string;
      if (decoded.trim()) {
        sections.push(`## ${key}\n\n${decoded.trim()}`);
      }
    } catch {
      // Keep original rendering if decoding fails.
    }
  }

  if (sections.length > 0) {
    return sections.join('\n\n---\n\n');
  }

  return input;
}

function extractPlanPayload(input: string): string[] {
  let text = input.trim();
  if (!text) return [];

  // Strip optional ```json ... ``` wrappers.
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch?.[1]) {
    text = fenceMatch[1].trim();
  }

  // Strip optional command prefix line such as `ExitPlanMode`.
  if (!text.startsWith('{')) {
    const idx = text.indexOf('{');
    if (idx >= 0) text = text.slice(idx).trim();
  }

  if (!text.startsWith('{')) return [];

  try {
    const obj = JSON.parse(text) as { sendMessageToUser?: unknown; plan?: unknown };
    const sections: string[] = [];
    if (typeof obj.sendMessageToUser === 'string' && obj.sendMessageToUser.trim()) {
      sections.push(`## sendMessageToUser\n\n${obj.sendMessageToUser.trim()}`);
    }
    if (typeof obj.plan === 'string' && obj.plan.trim()) {
      sections.push(`## plan\n\n${obj.plan.trim()}`);
    }
    return sections;
  } catch {
    return [];
  }
}

function splitFrontmatter(input: string): { frontmatter: string | null; body: string } {
  if (!input.startsWith('---\n')) {
    return { frontmatter: null, body: input };
  }
  const matched = input.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!matched) {
    return { frontmatter: null, body: input };
  }
  const frontmatter = matched[1].trimEnd();
  const body = input.slice(matched[0].length);
  return { frontmatter, body };
}

function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return slug || 'section';
}

function extractTextFromReactNode(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractTextFromReactNode).join('');
  if (typeof node === 'object' && 'props' in node) {
    const maybeProps = (node as { props?: { children?: ReactNode } }).props;
    return extractTextFromReactNode(maybeProps?.children);
  }
  return '';
}

import { memo, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { convertFileSrc } from '@tauri-apps/api/core';
import { resolveRelativePath } from '../../lib/utils';
import { highlight } from '../../lib/shiki';
import { useDebouncedMarkdown } from '../../hooks/useDebouncedMarkdown';

interface PreviewPaneProps {
  content: string;
  filePath: string | null;
  theme?: 'dark' | 'light' | 'mint' | 'gray';
}

interface CodeBlockProps {
  code: string;
  lang: string;
  shikiTheme: 'dark' | 'light';
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

export function PreviewPane({ content, filePath, theme = 'dark' }: PreviewPaneProps) {
  const debounced = useDebouncedMarkdown(content, 150);
  const normalizedContent = useMemo(() => normalizePreviewContent(debounced), [debounced]);
  const shikiTheme: 'dark' | 'light' = theme === 'dark' ? 'dark' : 'light';

  return (
    <div className="h-full overflow-auto px-8 py-6 markdown-preview"
      style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-base)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
            return <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>{children}</a>;
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
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

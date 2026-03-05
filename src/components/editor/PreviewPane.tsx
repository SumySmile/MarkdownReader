import { memo, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { convertFileSrc } from '@tauri-apps/api/core';
import { resolveRelativePath } from '../../lib/utils';
import { highlight } from '../../lib/shiki';
import { useDebouncedMarkdown } from '../../hooks/useDebouncedMarkdown';

interface PreviewPaneProps {
  content: string;
  filePath: string | null;
}

interface CodeBlockProps {
  code: string;
  lang: string;
}

const CodeBlock = memo(function CodeBlock({ code, lang }: CodeBlockProps) {
  const [html, setHtml] = useState('');
  useEffect(() => {
    highlight(code, lang || 'text').then(setHtml);
  }, [code, lang]);
  if (!html) return <pre><code>{code}</code></pre>;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}, (prev, next) => prev.code === next.code && prev.lang === next.lang);

function resolveImageSrc(src: string | undefined, filePath: string | null): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('http') || src.startsWith('data:')) return src;
  if (!filePath) return undefined;
  return convertFileSrc(resolveRelativePath(filePath, src));
}

export function PreviewPane({ content, filePath }: PreviewPaneProps) {
  const debounced = useDebouncedMarkdown(content, 150);

  return (
    <div className="h-full overflow-auto px-8 py-6 markdown-preview prose prose-invert max-w-none"
      style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-base)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ children, className }) {
            const lang = (className || '').replace('language-', '');
            const code = String(children).replace(/\n$/, '');
            const isBlock = code.includes('\n') || lang;
            if (!isBlock) return <code style={{ color: 'var(--syntax-string)', background: 'var(--bg-surface)', padding: '0 4px', borderRadius: 3 }}>{children}</code>;
            return <CodeBlock code={code} lang={lang} />;
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
        {debounced}
      </ReactMarkdown>
    </div>
  );
}

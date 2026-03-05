import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/core';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { replaceAll } from '@milkdown/utils';

export interface WysiwygEditorHandle {
  getMarkdown: () => string;
}

interface WysiwygEditorInnerProps {
  content: string;
  onChange: (text: string) => void;
  editorRef: React.MutableRefObject<Editor | null>;
}

function WysiwygEditorInner({ content, onChange, editorRef }: WysiwygEditorInnerProps) {
  const { get } = useEditor(root =>
    Editor.make()
      .config(ctx => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        ctx.set(editorViewOptionsCtx, { attributes: { class: 'wysiwyg-editor' } });
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          onChange(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
  );

  // Keep editorRef current
  useEffect(() => {
    editorRef.current = get() ?? null;
  });

  return <Milkdown />;
}

export const WysiwygEditor = forwardRef<WysiwygEditorHandle, { content: string; onChange: (text: string) => void }>(
  function WysiwygEditor({ content, onChange }, ref) {
    const editorRef = useRef<Editor | null>(null);
    const latestContent = useRef(content);

    useEffect(() => { latestContent.current = content; }, [content]);

    useImperativeHandle(ref, () => ({
      getMarkdown: () => latestContent.current,
    }));

    // Sync content on external file open via replaceAll
    const prevContent = useRef(content);
    useEffect(() => {
      if (prevContent.current === content) return;
      prevContent.current = content;
      const ed = editorRef.current;
      if (ed) {
        ed.action(replaceAll(content));
      }
    }, [content]);

    return (
      <MilkdownProvider>
        <div className="h-full overflow-auto px-8 py-6" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-base)' }}>
          <WysiwygEditorInner content={content} onChange={onChange} editorRef={editorRef} />
        </div>
      </MilkdownProvider>
    );
  }
);

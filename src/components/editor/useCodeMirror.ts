import { RefObject, useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment, EditorSelection, Extension } from '@codemirror/state';

interface UseCodeMirrorOptions {
  containerRef: RefObject<HTMLElement | null>;
  value: string;
  onChange: (value: string) => void;
  extensions: Extension[];
}

export function useCodeMirror({ containerRef, value, onChange, extensions }: UseCodeMirrorOptions): RefObject<EditorView | null> {
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const extCompartment = useRef(new Compartment());
  const isApplyingExternalRef = useRef(false);

  // Keep onChange ref current without recreating the effect
  useEffect(() => { onChangeRef.current = onChange; });

  // Create EditorView once — guard against React 18 Strict Mode double-invoke
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;
    viewRef.current = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          extCompartment.current.of(extensions),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !isApplyingExternalRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: containerRef.current,
    });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external value (file switch)
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) {
      const sel = v.state.selection.main;
      const head = Math.min(sel.head, value.length);
      const anchor = Math.min(sel.anchor, value.length);
      isApplyingExternalRef.current = true;
      v.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: EditorSelection.range(anchor, head),
      });
      isApplyingExternalRef.current = false;
    }
  }, [value]);

  // Reconfigure extensions when they change
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: extCompartment.current.reconfigure(extensions),
    });
  }, [extensions]); // eslint-disable-line react-hooks/exhaustive-deps

  return viewRef;
}

import { RefObject, useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment, Extension } from '@codemirror/state';

interface UseCodeMirrorOptions {
  containerRef: RefObject<HTMLElement | null>;
  value: string;
  onChange: (value: string) => void;
  extensions: Extension[];
}

export function useCodeMirror({ containerRef, value, onChange, extensions }: UseCodeMirrorOptions): void {
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const extCompartment = useRef(new Compartment());

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
            if (update.docChanged) {
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
      v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // Reconfigure extensions when they change
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: extCompartment.current.reconfigure(extensions),
    });
  }, [extensions]); // eslint-disable-line react-hooks/exhaustive-deps
}

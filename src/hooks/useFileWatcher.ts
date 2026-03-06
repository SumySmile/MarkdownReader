import { useEffect, useRef, RefObject } from 'react';
import { watch } from '../lib/fs';

export function useFileWatcher(
  dirPath: string | null,
  filePath: string | null,
  isSelfWritingRef: RefObject<boolean>,
  onExternalChange: () => void,
): void {
  const onEventRef = useRef(onExternalChange);
  const activeFileRef = useRef(filePath);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { onEventRef.current = onExternalChange; });
  useEffect(() => { activeFileRef.current = filePath; }, [filePath]);

  useEffect(() => {
    if (!dirPath) return;
    let cancelled = false;
    let stopFn: (() => void) | null = null;

    watch(
      dirPath,
      (event) => {
        if (isSelfWritingRef.current) return;
        // event.type is an object { type: string } in Tauri v2
        const kind = (event.type as unknown as { type: string }).type;
        if (kind !== 'modify' && kind !== 'create') return;
        const activeFile = activeFileRef.current;
        if (activeFile) {
          const normalizedFile = activeFile.replace(/\\/g, '/');
          const paths = (event.paths || []).map((p: string) => p.replace(/\\/g, '/'));
          if (!paths.includes(normalizedFile)) return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          onEventRef.current();
        }, 120);
      },
      { recursive: false, delayMs: 300 } as Parameters<typeof watch>[2],
    ).then(stop => {
      if (cancelled) stop();
      else stopFn = stop;
    }).catch(err => console.error('[useFileWatcher]', err));

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      stopFn?.();
    };
  }, [dirPath]); // eslint-disable-line react-hooks/exhaustive-deps
}

import { useState, useCallback, useRef } from 'react';
import { readFile, writeFile } from '../lib/fs';
import { storeSet } from '../lib/store';

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export function useActiveFile() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const isSelfWritingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSeqRef = useRef(0);

  const openFile = useCallback(async (path: string) => {
    const seq = ++openSeqRef.current;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const text = await readFile(path);
    if (seq !== openSeqRef.current) return;
    setFilePath(path);
    setContent(text);
    setSaveState('clean');
    await storeSet('lastOpenedFile', path);
  }, []);

  const handleChange = useCallback((newText: string) => {
    setContent(newText);
    setSaveState('dirty');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!filePath) return;
      setSaveState('saving');
      isSelfWritingRef.current = true;
      try {
        await writeFile(filePath, newText);
        setSaveState('saved');
        setTimeout(() => setSaveState('clean'), 2000);
      } catch {
        setSaveState('error');
      }
      setTimeout(() => { isSelfWritingRef.current = false; }, 1000);
    }, 1000);
  }, [filePath]);

  const saveNow = useCallback(async () => {
    if (!filePath || saveState === 'clean') return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveState('saving');
    isSelfWritingRef.current = true;
    try {
      await writeFile(filePath, content);
      setSaveState('saved');
      setTimeout(() => setSaveState('clean'), 2000);
    } catch {
      setSaveState('error');
    }
    setTimeout(() => { isSelfWritingRef.current = false; }, 1000);
  }, [filePath, content, saveState]);

  return {
    filePath,
    content,
    saveState,
    isDirty: saveState === 'dirty',
    isSelfWritingRef,
    openFile,
    handleChange,
    saveNow,
    setContent,
  };
}

import { useState, useCallback, useRef } from 'react';
import { readFile, writeFile } from '../lib/fs';
import { storeSet } from '../lib/store';

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';
export interface OpenFileResult {
  opened: boolean;
  content?: string;
  error?: string;
}

export function useActiveFile() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [isOpening, setIsOpening] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const isSelfWritingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSeqRef = useRef(0);

  const openFile = useCallback(async (path: string): Promise<OpenFileResult> => {
    const seq = ++openSeqRef.current;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setIsOpening(true);
    setOpeningPath(path);
    try {
      const text = await readFile(path);
      if (seq !== openSeqRef.current) return { opened: false };
      setFilePath(path);
      setContent(text);
      setSaveState('clean');
      await storeSet('lastOpenedFile', path);
      return { opened: true, content: text };
    } catch (error) {
      if (seq !== openSeqRef.current) return { opened: false };
      const message = error instanceof Error ? error.message : 'Open file failed.';
      return { opened: false, error: message || 'Open file failed.' };
    } finally {
      if (seq === openSeqRef.current) {
        setIsOpening(false);
        setOpeningPath(null);
      }
    }
  }, []);

  const handleChange = useCallback((newText: string) => {
    if (isOpening) return;
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
  }, [filePath, isOpening]);

  const saveNow = useCallback(async () => {
    if (isOpening) return;
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
  }, [filePath, content, saveState, isOpening]);

  return {
    filePath,
    content,
    saveState,
    isOpening,
    openingPath,
    isDirty: saveState === 'dirty',
    isSelfWritingRef,
    openFile,
    handleChange,
    saveNow,
    setContent,
  };
}

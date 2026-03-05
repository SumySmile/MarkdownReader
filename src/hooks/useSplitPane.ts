import { useState, useCallback, useRef } from 'react';

const STORAGE_KEY = 'editor-split';
const DEFAULT_SPLIT = 50;
const MIN_LEFT_PCT = 20;
const MIN_RIGHT_PCT = 25;

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

export function useSplitPane() {
  const [splitPct, setSplitPct] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : DEFAULT_SPLIT;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = clamp(pct, MIN_LEFT_PCT, 100 - MIN_RIGHT_PCT);
      setSplitPct(clamped);
      localStorage.setItem(STORAGE_KEY, String(clamped));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const onDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      setSplitPct(p => {
        const next = clamp(p - 1, MIN_LEFT_PCT, 100 - MIN_RIGHT_PCT);
        localStorage.setItem(STORAGE_KEY, String(next));
        return next;
      });
    } else if (e.key === 'ArrowRight') {
      setSplitPct(p => {
        const next = clamp(p + 1, MIN_LEFT_PCT, 100 - MIN_RIGHT_PCT);
        localStorage.setItem(STORAGE_KEY, String(next));
        return next;
      });
    }
  }, []);

  return { splitPct, containerRef, onDividerMouseDown, onDividerKeyDown };
}

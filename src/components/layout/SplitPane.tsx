import { ReactNode, useEffect, useRef } from 'react';
import { useSplitPane } from '../../hooks/useSplitPane';

interface SplitPaneProps {
  syncScroll: boolean;
  left: ReactNode;
  right: ReactNode;
}

function getScrollRatio(el: HTMLElement): number {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return 0;
  return el.scrollTop / max;
}

function setScrollRatio(el: HTMLElement, ratio: number): void {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return;
  const nextTop = max * ratio;
  if (Math.abs(el.scrollTop - nextTop) < 1) return;
  el.scrollTop = nextTop;
}

export function SplitPane({ syncScroll, left, right }: SplitPaneProps) {
  const { splitPct, containerRef, onDividerMouseDown, onDividerKeyDown } = useSplitPane();
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!syncScroll) return;

    const sourceScroller = leftPaneRef.current?.querySelector<HTMLElement>('.cm-scroller');
    const previewScroller = rightPaneRef.current?.querySelector<HTMLElement>('.markdown-preview');
    if (!sourceScroller || !previewScroller) return;

    let activeSource: 'source' | 'preview' | null = null;
    let isProgrammaticSync = false;
    let rafId: number | null = null;

    const scheduleSync = (from: 'source' | 'preview') => {
      activeSource = from;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!activeSource) return;

        isProgrammaticSync = true;
        if (activeSource === 'source') {
          const sourceRatio = getScrollRatio(sourceScroller);
          const previewRatio = getScrollRatio(previewScroller);
          if (Math.abs(sourceRatio - previewRatio) > 0.002) {
            setScrollRatio(previewScroller, sourceRatio);
          }
        } else {
          const sourceRatio = getScrollRatio(sourceScroller);
          const previewRatio = getScrollRatio(previewScroller);
          if (Math.abs(sourceRatio - previewRatio) > 0.002) {
            setScrollRatio(sourceScroller, previewRatio);
          }
        }
        isProgrammaticSync = false;
        activeSource = null;
      });
    };

    const onSourceScroll = () => {
      if (isProgrammaticSync) return;
      scheduleSync('source');
    };

    const onPreviewScroll = () => {
      if (isProgrammaticSync) return;
      scheduleSync('preview');
    };

    sourceScroller.addEventListener('scroll', onSourceScroll, { passive: true });
    previewScroller.addEventListener('scroll', onPreviewScroll, { passive: true });
    return () => {
      sourceScroller.removeEventListener('scroll', onSourceScroll);
      previewScroller.removeEventListener('scroll', onPreviewScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [syncScroll]);

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div ref={leftPaneRef} style={{ width: `${splitPct}%` }} className="overflow-hidden flex-shrink-0">
        {left}
      </div>

      <div
        className="relative flex-shrink-0 cursor-col-resize group"
        style={{ width: 5, background: 'var(--bg-divider)' }}
        onMouseDown={onDividerMouseDown}
        onKeyDown={onDividerKeyDown}
        tabIndex={0}
        aria-label="Resize panes"
        role="separator"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-[var(--accent-primary)] group-hover:opacity-20 transition-colors" />
      </div>

      <div ref={rightPaneRef} style={{ flex: 1 }} className="overflow-hidden">
        {right}
      </div>
    </div>
  );
}

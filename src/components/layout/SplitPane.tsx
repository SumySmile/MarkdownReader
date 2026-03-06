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
  el.scrollTop = max * ratio;
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

    let syncingFrom: 'source' | 'preview' | null = null;

    const onSourceScroll = () => {
      if (syncingFrom === 'preview') return;
      syncingFrom = 'source';
      setScrollRatio(previewScroller, getScrollRatio(sourceScroller));
      syncingFrom = null;
    };

    const onPreviewScroll = () => {
      if (syncingFrom === 'source') return;
      syncingFrom = 'preview';
      setScrollRatio(sourceScroller, getScrollRatio(previewScroller));
      syncingFrom = null;
    };

    sourceScroller.addEventListener('scroll', onSourceScroll);
    previewScroller.addEventListener('scroll', onPreviewScroll);
    return () => {
      sourceScroller.removeEventListener('scroll', onSourceScroll);
      previewScroller.removeEventListener('scroll', onPreviewScroll);
    };
  }, [syncScroll]);

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div ref={leftPaneRef} style={{ width: `${splitPct}%` }} className="overflow-hidden flex-shrink-0">
        {left}
      </div>

      {/* Divider */}
      <div
        className="relative flex-shrink-0 cursor-col-resize group"
        style={{ width: 5, background: 'var(--bg-divider)' }}
        onMouseDown={onDividerMouseDown}
        onKeyDown={onDividerKeyDown}
        tabIndex={0}
        aria-label="Resize panes"
        role="separator"
      >
        {/* Wider hit area */}
        <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-[var(--accent-primary)] group-hover:opacity-20 transition-colors" />
      </div>

      <div ref={rightPaneRef} style={{ flex: 1 }} className="overflow-hidden">
        {right}
      </div>
    </div>
  );
}

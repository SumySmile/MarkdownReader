import { ReactNode } from 'react';
import { useSplitPane } from '../../hooks/useSplitPane';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
}

export function SplitPane({ left, right }: SplitPaneProps) {
  const { splitPct, containerRef, onDividerMouseDown, onDividerKeyDown } = useSplitPane();

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div style={{ width: `${splitPct}%` }} className="overflow-hidden flex-shrink-0">
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

      <div style={{ flex: 1 }} className="overflow-hidden">
        {right}
      </div>
    </div>
  );
}

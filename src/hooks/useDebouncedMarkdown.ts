import { useState, useEffect } from 'react';

export function useDebouncedMarkdown(content: string, delayMs = 150): string {
  const [debounced, setDebounced] = useState(content);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(content), delayMs);
    return () => clearTimeout(t);
  }, [content, delayMs]);
  return debounced;
}

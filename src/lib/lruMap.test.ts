import { describe, expect, it } from 'vitest';
import { lruGet, lruSet } from './lruMap';

describe('lruMap', () => {
  it('evicts oldest entries beyond limit', () => {
    const map = new Map<string, number>();
    lruSet(map, 'a', 1, 2);
    lruSet(map, 'b', 2, 2);
    lruSet(map, 'c', 3, 2);

    expect(map.has('a')).toBe(false);
    expect(map.has('b')).toBe(true);
    expect(map.has('c')).toBe(true);
  });

  it('refreshes recency when accessed', () => {
    const map = new Map<string, number>();
    lruSet(map, 'a', 1, 2);
    lruSet(map, 'b', 2, 2);

    expect(lruGet(map, 'a')).toBe(1); // a becomes most recent
    lruSet(map, 'c', 3, 2);

    expect(map.has('a')).toBe(true);
    expect(map.has('b')).toBe(false);
    expect(map.has('c')).toBe(true);
  });
});

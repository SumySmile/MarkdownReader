import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useActiveFile } from './useActiveFile';
import { readFile, writeFile } from '../lib/fs';
import { storeSet } from '../lib/store';

vi.mock('../lib/fs', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../lib/store', () => ({
  storeSet: vi.fn(),
}));

type Deferred = {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  promise: Promise<string>;
};

function createDeferred(): Deferred {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve, reject, promise };
}

describe('useActiveFile', () => {
  const readFileMock = vi.mocked(readFile);
  const writeFileMock = vi.mocked(writeFile);
  const storeSetMock = vi.mocked(storeSet);

  beforeEach(() => {
    readFileMock.mockReset();
    writeFileMock.mockReset();
    storeSetMock.mockReset();
  });

  it('applies only the latest open request during rapid A/B open', async () => {
    const deferredA = createDeferred();
    const deferredB = createDeferred();

    readFileMock.mockImplementation((path: string) => {
      if (path === '/a.md') return deferredA.promise;
      if (path === '/b.md') return deferredB.promise;
      return Promise.resolve('');
    });

    const { result } = renderHook(() => useActiveFile());

    act(() => {
      void result.current.openFile('/a.md');
      void result.current.openFile('/b.md');
    });

    await act(async () => {
      deferredA.resolve('A content');
      await deferredA.promise;
    });

    // A is stale and should not update active context.
    expect(result.current.filePath).toBeNull();
    expect(result.current.content).toBe('');
    expect(result.current.isOpening).toBe(true);

    await act(async () => {
      deferredB.resolve('B content');
      await deferredB.promise;
    });

    await waitFor(() => {
      expect(result.current.filePath).toBe('/b.md');
      expect(result.current.content).toBe('B content');
      expect(result.current.isOpening).toBe(false);
    });
  });

  it('keeps previous file context when next open fails', async () => {
    readFileMock
      .mockResolvedValueOnce('Seed content')
      .mockRejectedValueOnce(new Error('permission denied'));

    const { result } = renderHook(() => useActiveFile());

    await act(async () => {
      const openSeed = await result.current.openFile('/seed.md');
      expect(openSeed.opened).toBe(true);
    });

    expect(result.current.filePath).toBe('/seed.md');
    expect(result.current.content).toBe('Seed content');

    await act(async () => {
      const openFail = await result.current.openFile('/forbidden.md');
      expect(openFail.opened).toBe(false);
      expect(openFail.error).toContain('permission denied');
    });

    expect(result.current.filePath).toBe('/seed.md');
    expect(result.current.content).toBe('Seed content');
    expect(result.current.saveState).toBe('clean');
  });

  it('blocks edit and save writes while opening is in progress', async () => {
    const deferredOpen = createDeferred();

    readFileMock
      .mockResolvedValueOnce('Old content')
      .mockImplementationOnce(() => deferredOpen.promise);

    const { result } = renderHook(() => useActiveFile());

    await act(async () => {
      await result.current.openFile('/old.md');
    });

    expect(result.current.filePath).toBe('/old.md');
    expect(result.current.content).toBe('Old content');

    act(() => {
      void result.current.openFile('/next.md');
    });

    await waitFor(() => expect(result.current.isOpening).toBe(true));

    act(() => {
      result.current.handleChange('Blocked while opening');
    });

    await act(async () => {
      await result.current.saveNow();
    });

    // Content stays unchanged and no writes happen until open settles.
    expect(result.current.content).toBe('Old content');
    expect(writeFileMock).not.toHaveBeenCalled();

    await act(async () => {
      deferredOpen.resolve('Next content');
      await deferredOpen.promise;
    });

    await waitFor(() => {
      expect(result.current.filePath).toBe('/next.md');
      expect(result.current.content).toBe('Next content');
      expect(result.current.isOpening).toBe(false);
    });
  });
});

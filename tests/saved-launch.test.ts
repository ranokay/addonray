import { expect, it, vi } from 'bun:test';
import { openSavedLibrary, type SavedLaunchBrowser } from '../lib/saved-launch';

function api(
  tabs: ReadonlyArray<{ incognito?: boolean }>,
  create = vi.fn(async () => ({})),
): SavedLaunchBrowser & { create: typeof create } {
  return {
    runtime: {
      getURL: (path) => `moz-extension://addonray${path}`,
    },
    tabs: {
      query: vi.fn(async () => [...tabs]),
      create,
    },
    create,
  };
}

it('opens the local library only from a positively normal active tab', async () => {
  const create = vi.fn(async () => ({}));
  const current = api([{ incognito: false }], create);
  const result = await openSavedLibrary(current);
  expect(result).toEqual({ status: 'success', value: null });
  expect(current.tabs.query).toHaveBeenCalledWith({
    active: true,
    currentWindow: true,
  });
  expect(create).toHaveBeenCalledWith({
    url: 'moz-extension://addonray/library.html',
  });
});

it.each([
  ['private', [{ incognito: true }]],
  ['unknown', [{}]],
  ['missing', []],
] as const)(
  'refuses %s active tabs without opening a library',
  async (_name, tabs) => {
    const create = vi.fn(async () => ({}));
    const current = api(tabs, create);
    const result = await openSavedLibrary(current);
    expect(result.status).toBe('unavailable');
    expect(create).not.toHaveBeenCalled();
  },
);

it('reports a bounded failure without opening a library when the tabs API fails', async () => {
  const create = vi.fn(async () => ({}));
  const current = api([{ incognito: false }], create);
  current.tabs.query = vi.fn(async () => {
    throw new Error('tabs unavailable');
  });
  const result = await openSavedLibrary(current);
  expect(result.status).toBe('error');
  expect(create).not.toHaveBeenCalled();
});

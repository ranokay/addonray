import type { Result } from './inspector';

export interface SavedLaunchBrowser {
  runtime: {
    getURL(path: '/library.html'): string;
  };
  tabs: {
    query(query: {
      active: true;
      currentWindow: true;
    }): Promise<Array<{ incognito?: boolean }>>;
    create(createProperties: { url: string }): Promise<unknown>;
  };
}

const unavailable: Result<null> = {
  status: 'unavailable',
  reason:
    'Saved investigations are available only from verified normal windows. Open AddonRay from a normal window.',
};

// The toolbar popup is not a tab, so tabs.getCurrent() cannot classify it. Ask
// the browser for the active tab of the current window and require positive
// normal-window evidence before opening the library.
export async function openSavedLibrary(
  api: SavedLaunchBrowser,
): Promise<Result<null>> {
  try {
    const active = (
      await api.tabs.query({
        active: true,
        currentWindow: true,
      })
    )[0];
    if (!active || active.incognito !== false) return unavailable;
    await api.tabs.create({ url: api.runtime.getURL('/library.html') });
    return { status: 'success', value: null };
  } catch {
    return {
      status: 'error',
      reason:
        'The saved-investigation library could not be opened. Try again from a normal window.',
    };
  }
}

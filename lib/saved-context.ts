import type { Browser } from 'wxt/browser';

export interface SavedBrowser {
  tabs: {
    getCurrent(): Promise<Pick<Browser.tabs.Tab, 'incognito'> | undefined>;
  };
}

// Unknown, missing or thrown context fails closed. This is independent of any
// collection permission.
export async function normalContext(api: SavedBrowser): Promise<boolean> {
  try {
    const tab = await api.tabs.getCurrent();
    return tab?.incognito === false;
  } catch {
    return false;
  }
}

import { beforeEach, expect, it, vi } from 'bun:test';
import type { Browser } from 'wxt/browser';
import { browser } from './browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createSession } from '../lib/session';
import { getBrowserContext } from '../lib/browser-target';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(
    () => {},
  );
  vi.spyOn(browser.permissions.onRemoved, 'removeListener').mockImplementation(
    () => {},
  );
});

it.each(['firefox', 'chrome'])(
  'keeps %s context through inventory and page operations',
  async (target) => {
    const context = getBrowserContext(target);
    const session = createSession(browser, context);
    expect(session.context).toEqual(context);
    vi.spyOn(browser.permissions, 'request').mockRejectedValue(
      new Error('private details'),
    );
    vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [{ id: 7 }]);
    await session.loadInventory();
    expect(JSON.stringify(session.getSnapshot().inventory)).toContain(
      `${context.name} could not provide`,
    );
    await session.inspectPage();
    expect(JSON.stringify(session.getSnapshot().page)).toContain(
      `${context.name} refused`,
    );
    expect(JSON.stringify(session.getSnapshot())).not.toContain(
      'private details',
    );
  },
);

it.each(['firefox', 'chrome'])(
  'starts empty without requesting access or reading data (%s)',
  (target) => {
    const request = vi.spyOn(browser.permissions, 'request');
    const inventory = vi.spyOn(browser.management, 'getAll');
    const session = createSession(browser, getBrowserContext(target));
    expect(session.getSnapshot()).toEqual({
      inventory: null,
      page: null,
      inventoryBusy: false,
      pageBusy: false,
    });
    expect(request).not.toHaveBeenCalled();
    expect(inventory).not.toHaveBeenCalled();
  },
);

it.each(['firefox', 'chrome'])(
  'discards a late inventory response after clear (%s)',
  async (target) => {
    const grant = Promise.withResolvers<boolean>();
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      () => grant.promise,
    );
    vi.spyOn(browser.management, 'getAll').mockImplementation(async () => []);
    const session = createSession(browser, getBrowserContext(target));
    const pending = session.loadInventory();
    session.clear();
    grant.resolve(true);
    await pending;
    expect(session.getSnapshot().inventory).toBeNull();
    expect(session.getSnapshot().inventoryBusy).toBe(false);
    expect(browser.management.getAll).not.toHaveBeenCalled();
  },
);

it.each(['firefox', 'chrome'])(
  'clears results on relevant permission revocation and discards pending work (%s)',
  async (target) => {
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => true,
    );
    const entries = Promise.withResolvers<Browser.management.ExtensionInfo[]>();
    vi.spyOn(browser.management, 'getAll').mockImplementation(
      () => entries.promise,
    );
    const addListener = vi.spyOn(browser.permissions.onRemoved, 'addListener');
    const session = createSession(browser, getBrowserContext(target));
    const unsubscribe = session.subscribe(vi.fn());
    const pending = session.loadInventory();
    addListener.mock.calls[0]?.[0]({ permissions: ['management'] });
    entries.resolve([]);
    await pending;
    expect(session.getSnapshot().inventory).toBeNull();
    unsubscribe();
  },
);

it.each(['firefox', 'chrome'])(
  'discards a late page response when the interface closes (%s)',
  async (target) => {
    const grant = Promise.withResolvers<boolean>();
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      () => grant.promise,
    );
    vi.spyOn(browser.tabs, 'query').mockImplementation(async () => []);
    const session = createSession(browser, getBrowserContext(target));
    const unsubscribe = session.subscribe(vi.fn());
    const pending = session.inspectPage();
    unsubscribe();
    grant.resolve(true);
    await pending;
    expect(session.getSnapshot().page).toBeNull();
    expect(
      createSession(browser, getBrowserContext(target)).getSnapshot().page,
    ).toBeNull();
  },
);

it.each(['firefox', 'chrome'])(
  'does not start injection when consent arrives after clear (%s)',
  async (target) => {
    const grant = Promise.withResolvers<boolean>();
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      () => grant.promise,
    );
    vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
      {
        id: 7,
        index: 0,
        active: true,
        highlighted: true,
        pinned: false,
        incognito: false,
      },
    ]);
    const execute = vi.spyOn(browser.scripting, 'executeScript');
    const session = createSession(browser, getBrowserContext(target));
    const pending = session.inspectPage();
    session.clear();
    grant.resolve(true);
    await pending;
    expect(execute).not.toHaveBeenCalled();
  },
);

it.each(['firefox', 'chrome'])(
  'drops an inventory response already in flight when cleared (%s)',
  async (target) => {
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => true,
    );
    const entries = Promise.withResolvers<Browser.management.ExtensionInfo[]>();
    const started = Promise.withResolvers<void>();
    const getAll = vi
      .spyOn(browser.management, 'getAll')
      .mockImplementation(() => {
        started.resolve();
        return entries.promise;
      });
    const session = createSession(browser, getBrowserContext(target));
    const pending = session.loadInventory();
    await started.promise;
    expect(getAll).toHaveBeenCalledTimes(1);
    session.clear();
    entries.resolve([]);
    await pending;
    expect(session.getSnapshot().inventory).toBeNull();
  },
);

it.each(['firefox', 'chrome'])(
  'ignores repeated inventory clicks while consent is pending (%s)',
  async (target) => {
    const grant = Promise.withResolvers<boolean>();
    const request = vi
      .spyOn(browser.permissions, 'request')
      .mockImplementation(() => grant.promise);
    const session = createSession(browser, getBrowserContext(target));
    const first = session.loadInventory();
    await session.loadInventory();
    expect(request).toHaveBeenCalledTimes(1);
    grant.resolve(false);
    await first;
    expect(session.getSnapshot().inventory?.status).toBe('denied');
  },
);

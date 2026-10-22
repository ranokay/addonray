import { beforeEach, expect, it, vi } from 'bun:test';
import type { Browser } from 'wxt/browser';
import { browser } from './browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createSession } from '../lib/session';

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

it('starts empty without requesting access or reading data', () => {
  const request = vi.spyOn(browser.permissions, 'request');
  const inventory = vi.spyOn(browser.management, 'getAll');
  const session = createSession(browser);
  expect(session.getSnapshot()).toEqual({
    inventory: null,
    page: null,
    inventoryBusy: false,
    pageBusy: false,
  });
  expect(request).not.toHaveBeenCalled();
  expect(inventory).not.toHaveBeenCalled();
});

it('discards a late inventory response after clear', async () => {
  const grant = Promise.withResolvers<boolean>();
  vi.spyOn(browser.permissions, 'request').mockImplementation(
    () => grant.promise,
  );
  vi.spyOn(browser.management, 'getAll').mockImplementation(async () => []);
  const session = createSession(browser);
  const pending = session.loadInventory();
  session.clear();
  grant.resolve(true);
  await pending;
  expect(session.getSnapshot().inventory).toBeNull();
  expect(session.getSnapshot().inventoryBusy).toBe(false);
  expect(browser.management.getAll).not.toHaveBeenCalled();
});

it('clears results on relevant permission revocation and discards pending work', async () => {
  vi.spyOn(browser.permissions, 'request').mockImplementation(async () => true);
  const entries = Promise.withResolvers<Browser.management.ExtensionInfo[]>();
  vi.spyOn(browser.management, 'getAll').mockImplementation(
    () => entries.promise,
  );
  const addListener = vi.spyOn(browser.permissions.onRemoved, 'addListener');
  const session = createSession(browser);
  const unsubscribe = session.subscribe(vi.fn());
  const pending = session.loadInventory();
  addListener.mock.calls[0]?.[0]({ permissions: ['management'] });
  entries.resolve([]);
  await pending;
  expect(session.getSnapshot().inventory).toBeNull();
  unsubscribe();
});

it('discards a late page response when the interface closes', async () => {
  const grant = Promise.withResolvers<boolean>();
  vi.spyOn(browser.permissions, 'request').mockImplementation(
    () => grant.promise,
  );
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => []);
  const session = createSession(browser);
  const unsubscribe = session.subscribe(vi.fn());
  const pending = session.inspectPage();
  unsubscribe();
  grant.resolve(true);
  await pending;
  expect(session.getSnapshot().page).toBeNull();
  expect(createSession(browser).getSnapshot().page).toBeNull();
});

it('does not start injection when consent arrives after clear', async () => {
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
  const session = createSession(browser);
  const pending = session.inspectPage();
  session.clear();
  grant.resolve(true);
  await pending;
  expect(execute).not.toHaveBeenCalled();
});

it('drops an inventory response already in flight when cleared', async () => {
  vi.spyOn(browser.permissions, 'request').mockImplementation(async () => true);
  const entries = Promise.withResolvers<Browser.management.ExtensionInfo[]>();
  const started = Promise.withResolvers<void>();
  const getAll = vi
    .spyOn(browser.management, 'getAll')
    .mockImplementation(() => {
      started.resolve();
      return entries.promise;
    });
  const session = createSession(browser);
  const pending = session.loadInventory();
  await started.promise;
  expect(getAll).toHaveBeenCalledTimes(1);
  session.clear();
  entries.resolve([]);
  await pending;
  expect(session.getSnapshot().inventory).toBeNull();
});

it('ignores repeated inventory clicks while consent is pending', async () => {
  const grant = Promise.withResolvers<boolean>();
  const request = vi
    .spyOn(browser.permissions, 'request')
    .mockImplementation(() => grant.promise);
  const session = createSession(browser);
  const first = session.loadInventory();
  await session.loadInventory();
  expect(request).toHaveBeenCalledTimes(1);
  grant.resolve(false);
  await first;
  expect(session.getSnapshot().inventory?.status).toBe('denied');
});

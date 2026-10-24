import { beforeEach, afterEach, expect, it, vi } from 'bun:test';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from './browser';
import { getBrowserContext } from '../lib/browser-target';
import {
  createPageErrorCheck,
  type PageErrorDriver,
} from '../lib/page-error-check';
import {
  createPageErrorLauncher,
  installPageErrorBinding,
  type ErrorLaunchView,
  type PageErrorLaunchBrowser,
} from '../lib/page-error-launch';

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
afterEach(() => {
  vi.restoreAllMocks();
});

function fixture() {
  const source = { id: 17, incognito: false };
  let metadataReads = 0;
  Object.defineProperty(source, 'url', {
    get() {
      metadataReads++;
      throw new Error('private');
    },
  });
  Object.defineProperty(source, 'title', {
    get() {
      metadataReads++;
      throw new Error('private');
    },
  });
  const popup: ErrorLaunchView = {
    location: { href: 'moz-extension://fixture/popup.html' },
  };
  const owner: ErrorLaunchView = {
    location: { href: 'moz-extension://fixture/page-error.html' },
  };
  const driver: PageErrorDriver = {
    start: vi.fn<PageErrorDriver['start']>(async () => ({
      status: 'interrupted',
    })),
    stop: vi.fn(() => {}),
  };
  const check = createPageErrorCheck(
    browser,
    driver,
    getBrowserContext('firefox'),
  );
  const api: PageErrorLaunchBrowser = {
    runtime: { getURL: (path) => `moz-extension://fixture${path}` },
    extension: {
      getViews: ({ type }) => (type === 'popup' ? [popup] : [owner]),
    },
    tabs: {
      query: vi.fn(async () => [source]),
      create: vi.fn(async () => ({ id: 88, active: false })),
      getCurrent: vi.fn(async () => ({
        id: 88,
        active: false,
        incognito: false,
      })),
      update: vi.fn(async () => {
        expect(check.getSnapshot().phase).toBe('ready');
        return {};
      }),
    },
  };
  const launcher = createPageErrorLauncher(api, popup);
  const remove = installPageErrorBinding(api, check, owner);
  return {
    source,
    popup,
    owner,
    driver,
    check,
    api,
    launcher,
    remove,
    metadataReads: () => metadataReads,
  };
}

it('creates an inactive own tab, binds only the original numeric ID, then activates without collecting', async () => {
  const current = fixture();
  expect(current.check.getSnapshot().phase).toBe('unbound');
  expect(current.driver.start).not.toHaveBeenCalled();
  vi.spyOn(current.api.tabs, 'create').mockImplementation(async () => {
    current.source.id = 99;
    return { id: 88, active: false };
  });
  expect(await current.launcher.open()).toEqual({
    status: 'success',
    value: null,
  });
  expect(current.api.tabs.create).toHaveBeenCalledWith({
    url: 'moz-extension://fixture/page-error.html',
    active: false,
  });
  expect(current.api.tabs.update).toHaveBeenCalledWith(88, { active: true });
  expect(current.metadataReads()).toBe(0);
  expect(current.popup.addonrayErrorSource?.current()).toBeNull();
  expect(current.driver.start).not.toHaveBeenCalled();
  await current.check.start();
  expect(current.driver.start).toHaveBeenCalledWith(
    17,
    expect.any(AbortSignal),
    expect.any(Function),
  );
});

it('the expected popup closure after activation preserves the receiver binding and a successful launch', async () => {
  const current = fixture();
  vi.spyOn(current.api.tabs, 'update').mockImplementation(async () => {
    current.launcher.dispose();
    return {};
  });
  expect(await current.launcher.open()).toEqual({
    status: 'success',
    value: null,
  });
  expect(current.check.getSnapshot().phase).toBe('ready');
  expect(current.popup.addonrayErrorSource).toBeUndefined();
});

for (const selected of [
  [{ id: 17, incognito: true }],
  [{ id: 17 }],
  [{ incognito: false }],
  [],
]) {
  it(`fails closed before tab creation for private or unclassifiable source ${JSON.stringify(selected)}`, async () => {
    const current = fixture();
    vi.spyOn(current.api.tabs, 'query').mockResolvedValue(selected);
    expect((await current.launcher.open()).status).toBe('unavailable');
    expect(current.api.tabs.create).not.toHaveBeenCalled();
    expect(current.check.getSnapshot().phase).toBe('unbound');
  });
}

it('ignores duplicate open and cancels a pending source lookup on popup teardown', async () => {
  const current = fixture();
  const selected =
    Promise.withResolvers<
      Awaited<ReturnType<PageErrorLaunchBrowser['tabs']['query']>>
    >();
  vi.spyOn(current.api.tabs, 'query').mockReturnValue(selected.promise);
  const opening = current.launcher.open();
  expect((await current.launcher.open()).status).toBe('unavailable');
  expect(current.api.tabs.query).toHaveBeenCalledTimes(1);
  current.launcher.dispose();
  expect((await opening).status).toBe('unavailable');
  selected.resolve([{ id: 17, incognito: false }]);
  await Promise.resolve();
  expect(current.api.tabs.create).not.toHaveBeenCalled();
});

it('a readiness timeout prevents a later source lookup from creating or binding a tab', async () => {
  const current = fixture();
  const selected =
    Promise.withResolvers<
      Awaited<ReturnType<PageErrorLaunchBrowser['tabs']['query']>>
    >();
  vi.spyOn(current.api.tabs, 'query').mockReturnValue(selected.promise);
  expect((await current.launcher.open()).status).toBe('unavailable');
  selected.resolve([{ id: 17, incognito: false }]);
  await Promise.resolve();
  expect(current.api.tabs.create).not.toHaveBeenCalled();
}, 8000);

it('popup closure during asynchronous receiver verification cannot bind or activate', async () => {
  const current = fixture();
  const entered = Promise.withResolvers<void>();
  const own =
    Promise.withResolvers<
      Awaited<ReturnType<PageErrorLaunchBrowser['tabs']['getCurrent']>>
    >();
  vi.spyOn(current.api.tabs, 'getCurrent').mockImplementationOnce(() => {
    entered.resolve();
    return own.promise;
  });
  const opening = current.launcher.open();
  await entered.promise;
  current.launcher.dispose();
  expect((await opening).status).toBe('unavailable');
  own.resolve({ id: 88, active: false, incognito: false });
  await Promise.resolve();
  expect(current.check.getSnapshot().phase).toBe('unbound');
  expect(current.api.tabs.update).not.toHaveBeenCalled();
});

it('a stale binding cannot use a later popup launch for the same source ID', async () => {
  const current = fixture();
  const created =
    Promise.withResolvers<
      Awaited<ReturnType<PageErrorLaunchBrowser['tabs']['create']>>
    >();
  const entered = Promise.withResolvers<void>();
  vi.spyOn(current.api.tabs, 'create').mockImplementationOnce(() => {
    entered.resolve();
    return created.promise;
  });
  const opening = current.launcher.open();
  await entered.promise;
  const marker = current.popup.addonrayErrorSource;
  const before = marker?.current();
  expect(before).not.toBeNull();
  const own =
    Promise.withResolvers<
      Awaited<ReturnType<PageErrorLaunchBrowser['tabs']['getCurrent']>>
    >();
  vi.spyOn(current.api.tabs, 'getCurrent').mockReturnValueOnce(own.promise);
  const binding = current.owner.addonrayErrorCheck?.bind(88, 17, current.popup);
  current.popup.addonrayErrorSource = {
    current: () => ({
      sourceTabId: 17,
      normal: true,
      launchId: crypto.randomUUID(),
    }),
  };
  own.resolve({ id: 88, active: false, incognito: false });
  expect(await binding).toBe(false);
  current.launcher.dispose();
  created.resolve({ id: 88, active: false });
  await opening;
  expect(current.check.getSnapshot().phase).toBe('unbound');
});

for (const own of [
  { id: 88, active: true, incognito: false },
  { id: 88, active: false, incognito: true },
  { id: 88, active: false },
]) {
  it(`refuses an active, private or unknown receiver ${JSON.stringify(own)}`, async () => {
    const current = fixture();
    const entered = Promise.withResolvers<void>();
    const created =
      Promise.withResolvers<
        Awaited<ReturnType<PageErrorLaunchBrowser['tabs']['create']>>
      >();
    vi.spyOn(current.api.tabs, 'create').mockImplementationOnce(() => {
      entered.resolve();
      return created.promise;
    });
    vi.spyOn(current.api.tabs, 'getCurrent').mockResolvedValue(own);
    const opening = current.launcher.open();
    await entered.promise;
    expect(
      await current.owner.addonrayErrorCheck?.matches(88, current.popup),
    ).toBe(false);
    current.launcher.dispose();
    created.resolve({ id: 88, active: false });
    await opening;
    expect(current.api.tabs.update).not.toHaveBeenCalled();
  });
}

it('same-extension non-popup senders cannot bind a manually opened check', async () => {
  const current = fixture();
  const sender: ErrorLaunchView = {
    location: { href: current.api.runtime.getURL('/popup.html') },
    addonrayErrorSource: {
      current: () => ({
        sourceTabId: 17,
        normal: true,
        launchId: crypto.randomUUID(),
      }),
    },
  };
  expect(await current.owner.addonrayErrorCheck?.bind(88, 17, sender)).toBe(
    false,
  );
  expect(current.check.getSnapshot().phase).toBe('unbound');
});

it('owner reload during verification cannot bind the replacement document or activate it', async () => {
  const current = fixture();
  const entered = Promise.withResolvers<void>();
  const own =
    Promise.withResolvers<
      Awaited<ReturnType<PageErrorLaunchBrowser['tabs']['getCurrent']>>
    >();
  vi.spyOn(current.api.tabs, 'getCurrent').mockImplementationOnce(() => {
    entered.resolve();
    return own.promise;
  });
  const opening = current.launcher.open();
  await entered.promise;
  current.remove();
  current.check.dispose();
  const replacement = createPageErrorCheck(
    browser,
    current.driver,
    getBrowserContext('firefox'),
  );
  const removeReplacement = installPageErrorBinding(
    current.api,
    replacement,
    current.owner,
  );
  own.resolve({ id: 88, active: false, incognito: false });
  expect((await opening).status).toBe('unavailable');
  expect(replacement.getSnapshot().phase).toBe('unbound');
  expect(current.api.tabs.update).not.toHaveBeenCalled();
  expect(current.driver.start).not.toHaveBeenCalled();
  removeReplacement();
  replacement.dispose();
});

it('owner replacement immediately after binding prevents activation of the unbound replacement', async () => {
  const current = fixture();
  const endpoint = current.owner.addonrayErrorCheck;
  if (!endpoint) throw new Error('Missing fixture endpoint');
  const bind = endpoint.bind;
  const replacement = createPageErrorCheck(
    browser,
    current.driver,
    getBrowserContext('firefox'),
  );
  let removeReplacement = () => {};
  vi.spyOn(endpoint, 'bind').mockImplementation(async (...args) => {
    const bound = await bind(...args);
    current.remove();
    current.check.dispose();
    removeReplacement = installPageErrorBinding(
      current.api,
      replacement,
      current.owner,
    );
    return bound;
  });
  expect((await current.launcher.open()).status).toBe('unavailable');
  expect(replacement.getSnapshot().phase).toBe('unbound');
  expect(current.api.tabs.update).not.toHaveBeenCalled();
  removeReplacement();
  replacement.dispose();
});

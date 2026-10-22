import { beforeEach, describe, expect, it, vi } from 'bun:test';
import type { Browser } from 'wxt/browser';
import { browser } from './browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { capabilityLimits, inspectPage, loadInventory } from '../lib/inspector';
import { getBrowserContext } from '../lib/browser-target';

type ExtensionInfo = Browser.management.ExtensionInfo;

function extension(overrides: Partial<ExtensionInfo> = {}): ExtensionInfo {
  return {
    id: 'fixture@example.test',
    name: 'Fixture',
    description: 'Controlled fixture',
    permissions: [],
    hostPermissions: [],
    shortName: 'Fixture',
    offlineEnabled: false,
    isApp: false,
    version: '1.0',
    enabled: true,
    mayDisable: true,
    type: 'extension',
    installType: 'development',
    optionsUrl: '',
    ...overrides,
  };
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('inventory consent and metadata', () => {
  it('does not read inventory until the user grants access', async () => {
    const grant = Promise.withResolvers<boolean>();
    const request = vi
      .spyOn(browser.permissions, 'request')
      .mockImplementation(() => grant.promise);
    const getAll = vi
      .spyOn(browser.management, 'getAll')
      .mockImplementation(async () => []);
    const result = loadInventory(browser);
    expect(request).toHaveBeenCalledWith({ permissions: ['management'] });
    expect(getAll).not.toHaveBeenCalled();
    grant.resolve(true);
    await expect(result).resolves.toEqual({ status: 'success', value: [] });
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it('makes no inventory call after denial', async () => {
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => false,
    );
    const getAll = vi.spyOn(browser.management, 'getAll');
    expect((await loadInventory(browser)).status).toBe('denied');
    expect(getAll).not.toHaveBeenCalled();
  });

  it('preserves unknown disabled metadata and excludes themes', async () => {
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => true,
    );
    const disabled = extension({ id: 'disabled@test', enabled: false });
    // Firefox omits this field for disabled extensions despite the browser typings.
    Reflect.deleteProperty(disabled, 'permissions');
    Reflect.deleteProperty(disabled, 'hostPermissions');
    vi.spyOn(browser.management, 'getAll').mockImplementation(async () => [
      disabled,
      extension({ id: 'enabled@test', permissions: [], hostPermissions: [] }),
      extension({ id: 'theme@test', type: 'theme' }),
    ]);
    const result = await loadInventory(browser);
    expect(result).toMatchObject({ status: 'success' });
    if (result.status !== 'success') throw new Error('Expected inventory');
    expect(result.value).toHaveLength(2);
    expect(
      result.value.find((entry) => entry.id === 'disabled@test'),
    ).toMatchObject({
      enabled: false,
      permissions: null,
      hostPermissions: null,
    });
    expect(
      result.value.find((entry) => entry.id === 'enabled@test'),
    ).toMatchObject({
      permissions: [],
      hostPermissions: [],
    });
    expect(result.value[0]).not.toHaveProperty('mayDisable');
  });

  it('explains an unavailable API after a grant', async () => {
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => true,
    );
    const { management: _management, ...withoutManagement } = browser;
    expect((await loadInventory(withoutManagement)).status).toBe('unavailable');
  });

  it('does not expose raw browser errors', async () => {
    vi.spyOn(browser.permissions, 'request').mockRejectedValue(
      new Error('private details'),
    );
    const result = await loadInventory(browser);
    expect(result.status).toBe('error');
    expect(JSON.stringify(result)).not.toContain('private details');
  });
});

describe('selected-page probes', () => {
  beforeEach(() => {
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
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => true,
    );
  });

  it('captures the selected tab before consent settles and targets only its top frame', async () => {
    const grant = Promise.withResolvers<boolean>();
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      () => grant.promise,
    );
    const execute = vi
      .spyOn(browser.scripting, 'executeScript')
      .mockImplementation(async () => [
        {
          frameId: 0,
          result: {
            readyState: 'complete',
            performanceEntryTypes: ['navigation'],
          },
        },
      ]);
    const result = inspectPage(browser);
    expect(browser.tabs.query).toHaveBeenCalledTimes(1);
    expect(browser.permissions.request).toHaveBeenCalledWith({
      permissions: ['scripting'],
    });
    expect(execute).not.toHaveBeenCalled();
    vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
      {
        id: 99,
        index: 0,
        active: true,
        highlighted: true,
        pinned: false,
        incognito: false,
      },
    ]);
    grant.resolve(true);
    await expect(result).resolves.toMatchObject({ status: 'success' });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 7, frameIds: [0] } }),
    );
    expect(browser.tabs.query).toHaveBeenCalledTimes(1);
  });

  it('does not inject after denied consent', async () => {
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => false,
    );
    const execute = vi.spyOn(browser.scripting, 'executeScript');
    expect((await inspectPage(browser)).status).toBe('denied');
    expect(execute).not.toHaveBeenCalled();
  });

  it('explains an absent selected tab', async () => {
    vi.spyOn(browser.tabs, 'query').mockImplementation(async () => []);
    expect((await inspectPage(browser)).status).toBe('unavailable');
  });

  it('explains unavailable scripting', async () => {
    const { scripting: _scripting, ...withoutScripting } = browser;
    expect((await inspectPage(withoutScripting)).status).toBe('unavailable');
  });

  it('explains restricted-page or navigation rejection without exposing details', async () => {
    vi.spyOn(browser.scripting, 'executeScript').mockRejectedValue(
      new Error('Cannot access about:addons secret'),
    );
    const result = await inspectPage(browser);
    expect(result.status).toBe('error');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it.each([
    undefined,
    { readyState: 'complete' },
    { readyState: 'other', performanceEntryTypes: [] },
    { readyState: ['complete'], performanceEntryTypes: [] },
    { readyState: { value: 'complete' }, performanceEntryTypes: [] },
    { readyState: 'complete', performanceEntryTypes: ['<script>'] },
    {
      readyState: 'complete',
      performanceEntryTypes: Array.from({ length: 65 }, () => 'navigation'),
    },
  ])('rejects a malformed or oversized page response: %j', async (payload) => {
    vi.spyOn(browser.scripting, 'executeScript').mockImplementation(
      async () => [{ frameId: 0, result: payload }],
    );
    expect((await inspectPage(browser)).status).toBe('error');
  });

  it('preserves unsupported performance observation and drops extra page data', async () => {
    vi.spyOn(browser.scripting, 'executeScript').mockImplementation(
      async () => [
        {
          frameId: 0,
          result: {
            readyState: 'complete',
            performanceEntryTypes: null,
            secret: 'page content',
          },
        },
      ],
    );
    expect(await inspectPage(browser)).toEqual({
      status: 'success',
      value: { readyState: 'complete', performanceEntryTypes: null },
    });
  });
});

it('keeps unsupported controls and attribution explicitly gated', () => {
  for (const capability of capabilityLimits().slice(0, 4)) {
    expect(capability.status).toBe('Unsupported');
  }
});

it('distinguishes the Chrome API from AddonRay’s inspection-only policy', () => {
  const chrome = capabilityLimits(getBrowserContext('chrome'));
  expect(chrome[0]).toMatchObject({ status: 'Not offered' });
  expect(chrome[0].reason).toContain(
    "Chrome's management API can enable or disable",
  );
  expect(chrome[0].reason).toContain('AddonRay is inspection-only');
  expect(chrome[1].status).toBe('Unsupported');
  expect(chrome[1].reason).toContain('Use Chrome');
  expect(chrome[2].reason).toContain('Chrome does not expose');
  expect(JSON.stringify(chrome)).not.toContain('Firefox');
});

describe('Chrome inventory boundary', () => {
  const context = getBrowserContext('chrome');

  it('preserves reported disabled metadata and never changes extensions', async () => {
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => true,
    );
    const unknown = extension({ id: 'unknown@test', enabled: false });
    Reflect.deleteProperty(unknown, 'permissions');
    Reflect.deleteProperty(unknown, 'hostPermissions');
    const management = {
      getAll: vi.fn(async () => [
        extension({
          id: 'disabled@test',
          enabled: false,
          permissions: ['storage'],
        }),
        extension({ id: 'empty@test' }),
        unknown,
      ]),
      setEnabled: vi.fn(),
      uninstall: vi.fn(),
    };
    const result = await loadInventory(
      { ...browser, management },
      undefined,
      context,
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected inventory');
    expect(
      result.value.find((entry) => entry.id === 'disabled@test'),
    ).toMatchObject({
      enabled: false,
      permissions: ['storage'],
    });
    expect(
      result.value.find((entry) => entry.id === 'empty@test'),
    ).toMatchObject({
      permissions: [],
      hostPermissions: [],
    });
    expect(
      result.value.find((entry) => entry.id === 'unknown@test'),
    ).toMatchObject({
      permissions: null,
      hostPermissions: null,
    });
    expect(management.setEnabled).not.toHaveBeenCalled();
    expect(management.uninstall).not.toHaveBeenCalled();
  });

  it('does not read Chrome inventory after denied consent', async () => {
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => false,
    );
    const getAll = vi.spyOn(browser.management, 'getAll');
    expect((await loadInventory(browser, undefined, context)).status).toBe(
      'denied',
    );
    expect(getAll).not.toHaveBeenCalled();
  });

  it('names Chrome when inventory access is unavailable or fails', async () => {
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => true,
    );
    const { management: _management, ...withoutManagement } = browser;
    expect(await loadInventory(withoutManagement, undefined, context)).toEqual({
      status: 'unavailable',
      reason: 'Chrome inventory access is unavailable.',
    });
    vi.spyOn(browser.management, 'getAll').mockRejectedValue(
      new Error('private Chrome details'),
    );
    const failure = await loadInventory(browser, undefined, context);
    expect(failure).toMatchObject({ status: 'error' });
    expect(JSON.stringify(failure)).toContain('Chrome could not provide');
    expect(JSON.stringify(failure)).not.toContain('private Chrome details');
  });

  it('names Chrome when scripting is unavailable or a protected page refuses access', async () => {
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      async () => true,
    );
    vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [{ id: 9 }]);
    const { scripting: _scripting, ...withoutScripting } = browser;
    expect(await inspectPage(withoutScripting, undefined, context)).toEqual({
      status: 'unavailable',
      reason: 'Chrome scripting is unavailable.',
    });
    vi.spyOn(browser.scripting, 'executeScript').mockRejectedValue(
      new Error('chrome://settings private details'),
    );
    const failure = await inspectPage(browser, undefined, context);
    expect(failure).toMatchObject({ status: 'error' });
    expect(JSON.stringify(failure)).toContain('Chrome refused');
    expect(JSON.stringify(failure)).not.toContain('private details');
  });
});

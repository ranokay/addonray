import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser, type Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { capabilityLimits, inspectPage, loadInventory } from '../lib/inspector';

type ExtensionInfo = Browser.management.ExtensionInfo;

export function extension(
  overrides: Partial<ExtensionInfo> = {},
): ExtensionInfo {
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
    expect(getAll).toHaveBeenCalledOnce();
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
    vi.mocked(browser.permissions.request).mockImplementation(
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
    expect(browser.tabs.query).toHaveBeenCalledOnce();
    expect(browser.permissions.request).toHaveBeenCalledWith({
      permissions: ['scripting'],
    });
    expect(execute).not.toHaveBeenCalled();
    vi.mocked(browser.tabs.query).mockImplementation(async () => [
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
    expect(browser.tabs.query).toHaveBeenCalledOnce();
  });

  it('does not inject after denied consent', async () => {
    vi.mocked(browser.permissions.request).mockImplementation(
      async () => false,
    );
    const execute = vi.spyOn(browser.scripting, 'executeScript');
    expect((await inspectPage(browser)).status).toBe('denied');
    expect(execute).not.toHaveBeenCalled();
  });

  it('explains an absent selected tab', async () => {
    vi.mocked(browser.tabs.query).mockImplementation(async () => []);
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
  for (const capability of capabilityLimits.slice(0, 4)) {
    expect(capability.status).toBe('Unsupported');
  }
});

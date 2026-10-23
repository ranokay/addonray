import { beforeEach, expect, it, vi } from 'bun:test';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from './browser';
import { createInvestigation } from '../lib/investigation';
import { getBrowserContext } from '../lib/browser-target';
import { createSession } from '../lib/session';

function extension(
  overrides: Partial<Browser.management.ExtensionInfo> = {},
): Browser.management.ExtensionInfo {
  return {
    id: 'fixture@example.test',
    name: 'Fixture',
    description: 'Controlled',
    permissions: ['storage'],
    hostPermissions: ['https://private.invalid/*'],
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
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(
    () => {},
  );
  vi.spyOn(browser.permissions.onRemoved, 'removeListener').mockImplementation(
    () => {},
  );
});

for (const target of ['firefox', 'chrome']) {
  const context = getBrowserContext(target);
  const investigation = () => createInvestigation(browser, context);

  it(`starts empty, rejects After/assessment before Before, and makes no page calls (${target})`, async () => {
    const request = vi.spyOn(browser.permissions, 'request');
    const getAll = vi.spyOn(browser.management, 'getAll');
    const query = vi.spyOn(browser.tabs, 'query');
    const execute = vi.spyOn(browser.scripting, 'executeScript');
    const current = investigation();
    await current.captureAfter();
    current.setAssessment('better');
    expect(current.getSnapshot()).toEqual({
      before: null,
      after: null,
      busy: null,
      assessment: null,
    });
    expect(request).not.toHaveBeenCalled();
    expect(getAll).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it(`waits for explicit consent and does not capture after denial (${target})`, async () => {
    const grant = Promise.withResolvers<boolean>();
    const request = vi
      .spyOn(browser.permissions, 'request')
      .mockImplementation(() => grant.promise);
    const getAll = vi.spyOn(browser.management, 'getAll');
    const current = investigation();
    const capture = current.captureBefore();
    expect(request).toHaveBeenCalledWith({ permissions: ['management'] });
    expect(getAll).not.toHaveBeenCalled();
    await current.captureBefore();
    await current.captureAfter();
    expect(request).toHaveBeenCalledTimes(1);
    grant.resolve(false);
    await capture;
    expect(current.getSnapshot().before?.status).toBe('denied');
    expect(current.getSnapshot().busy).toBeNull();
    expect(getAll).not.toHaveBeenCalled();
  });

  it(`captures a fixed minimized pair and requires an explicit assessment (${target})`, async () => {
    vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
    const fixture = extension();
    const getAll = vi
      .spyOn(browser.management, 'getAll')
      .mockResolvedValue([fixture]);
    const current = investigation();
    await current.captureBefore();
    fixture.enabled = false;
    await current.captureAfter();
    expect(current.getSnapshot()).toEqual({
      before: {
        status: 'success',
        value: [
          { id: fixture.id, name: 'Fixture', version: '1.0', enabled: true },
        ],
      },
      after: {
        status: 'success',
        value: [
          { id: fixture.id, name: 'Fixture', version: '1.0', enabled: false },
        ],
      },
      busy: null,
      assessment: null,
    });
    current.setAssessment('better');
    current.setAssessment('uncertain');
    expect(current.getSnapshot().assessment).toBe('uncertain');
    await current.captureBefore();
    await current.captureAfter();
    expect(getAll).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(current.getSnapshot())).not.toContain(
      'private.invalid',
    );
    expect(JSON.stringify(current.getSnapshot())).not.toContain('permissions');
    current.startOver();
    expect(current.getSnapshot()).toEqual({
      before: null,
      after: null,
      busy: null,
      assessment: null,
    });
    await current.captureBefore();
    expect(getAll).toHaveBeenCalledTimes(3);
  });

  it(`keeps Before when After fails, bounds the error and permits retry (${target})`, async () => {
    vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
    const getAll = vi
      .spyOn(browser.management, 'getAll')
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('private browser detail'))
      .mockResolvedValueOnce([]);
    const current = investigation();
    await current.captureBefore();
    await current.captureAfter();
    expect(current.getSnapshot().before).toEqual({
      status: 'success',
      value: [],
    });
    expect(current.getSnapshot().after?.status).toBe('error');
    expect(JSON.stringify(current.getSnapshot())).toContain(
      `${context.name} could not provide`,
    );
    expect(JSON.stringify(current.getSnapshot())).not.toContain(
      'private browser detail',
    );
    current.setAssessment('worse');
    expect(current.getSnapshot().assessment).toBeNull();
    await current.captureAfter();
    expect(current.getSnapshot().after).toEqual({
      status: 'success',
      value: [],
    });
    expect(getAll).toHaveBeenCalledTimes(3);
  });

  it(`preserves empty and unavailable as distinct capture outcomes (${target})`, async () => {
    vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
    const { management: _management, ...withoutManagement } = browser;
    const unavailable = createInvestigation(withoutManagement, context);
    await unavailable.captureBefore();
    expect(unavailable.getSnapshot().before?.status).toBe('unavailable');
    const current = investigation();
    vi.spyOn(browser.management, 'getAll').mockResolvedValue([]);
    await current.captureBefore();
    await current.captureAfter();
    expect(current.getSnapshot().after).toEqual({
      status: 'success',
      value: [],
    });
  });

  it(`Start over stops delayed consent from starting collection (${target})`, async () => {
    const grant = Promise.withResolvers<boolean>();
    vi.spyOn(browser.permissions, 'request').mockImplementation(
      () => grant.promise,
    );
    const getAll = vi.spyOn(browser.management, 'getAll');
    const current = investigation();
    const pending = current.captureBefore();
    current.startOver();
    grant.resolve(true);
    await pending;
    expect(current.getSnapshot().before).toBeNull();
    expect(getAll).not.toHaveBeenCalled();
  });

  it(`revocation erases a Before snapshot and blocks a late After result (${target})`, async () => {
    vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
    const started = Promise.withResolvers<void>();
    const entries = Promise.withResolvers<Browser.management.ExtensionInfo[]>();
    vi.spyOn(browser.management, 'getAll')
      .mockResolvedValueOnce([extension()])
      .mockImplementationOnce(() => {
        started.resolve();
        return entries.promise;
      });
    const addListener = vi.spyOn(browser.permissions.onRemoved, 'addListener');
    const current = investigation();
    const unsubscribe = current.subscribe(vi.fn());
    await current.captureBefore();
    const pending = current.captureAfter();
    await started.promise;
    const listener = addListener.mock.calls[0]?.[0];
    listener?.({ permissions: ['management'] });
    entries.resolve([extension({ enabled: false })]);
    await pending;
    expect(current.getSnapshot()).toEqual({
      before: null,
      after: null,
      busy: null,
      assessment: null,
    });
    unsubscribe();
  });

  it(`revocation erases a completed pair and assessment (${target})`, async () => {
    vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
    vi.spyOn(browser.management, 'getAll').mockResolvedValue([]);
    const addListener = vi.spyOn(browser.permissions.onRemoved, 'addListener');
    const current = investigation();
    const unsubscribe = current.subscribe(vi.fn());
    await current.captureBefore();
    await current.captureAfter();
    current.setAssessment('unchanged');
    addListener.mock.calls[0]?.[0]({
      permissions: ['management'],
    });
    expect(current.getSnapshot()).toEqual({
      before: null,
      after: null,
      busy: null,
      assessment: null,
    });
    unsubscribe();
  });

  it(`closing the view discards pending work and a new document starts empty (${target})`, async () => {
    const entries = Promise.withResolvers<Browser.management.ExtensionInfo[]>();
    const started = Promise.withResolvers<void>();
    vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
    vi.spyOn(browser.management, 'getAll').mockImplementation(() => {
      started.resolve();
      return entries.promise;
    });
    const current = investigation();
    const unsubscribe = current.subscribe(vi.fn());
    const pending = current.captureBefore();
    await started.promise;
    unsubscribe();
    entries.resolve([extension()]);
    await pending;
    expect(current.getSnapshot().before).toBeNull();
    expect(investigation().getSnapshot()).toEqual({
      before: null,
      after: null,
      busy: null,
      assessment: null,
    });
  });

  it(`independent investigations and popup Clear cannot erase each other (${target})`, async () => {
    vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
    vi.spyOn(browser.management, 'getAll').mockResolvedValue([]);
    const first = investigation();
    const second = investigation();
    const popup = createSession(browser, context);
    await first.captureBefore();
    await second.captureBefore();
    await popup.loadInventory();
    first.startOver();
    expect(second.getSnapshot().before?.status).toBe('success');
    expect(popup.getSnapshot().inventory?.status).toBe('success');
    popup.clear();
    expect(second.getSnapshot().before?.status).toBe('success');
    expect(first.getSnapshot().before).toBeNull();
  });
}

import { beforeEach, expect, it, vi } from 'bun:test';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getBrowserContext } from '../lib/browser-target';
import {
  createPageErrorDriver,
  type PageErrorBrowserApi,
  type PageErrorFrame,
  type PageErrorInjection,
  type PageErrorPort,
} from '../lib/page-error-browser';
import {
  installErrorSupervisor,
  observeMainErrors,
} from '../lib/page-error-observer';
import type { PageErrorSummary } from '../lib/page-error-check';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

const summary = (
  overrides: Partial<PageErrorSummary> = {},
): PageErrorSummary => ({
  scriptErrors: 1,
  unhandledRejections: 2,
  total: 3,
  finish: 'stop',
  observedMs: 1200,
  ...overrides,
});

function portFixture() {
  const messages = new Set<(message: unknown) => void>();
  const disconnects = new Set<() => void>();
  const post = vi.fn((_message: unknown) => {});
  const port: PageErrorPort = {
    postMessage: post,
    disconnect: vi.fn(() => {}),
    onMessage: {
      addListener: (listener) => {
        messages.add(listener);
      },
      removeListener: (listener) => {
        messages.delete(listener);
      },
    },
    onDisconnect: {
      addListener: (listener) => {
        disconnects.add(listener);
      },
      removeListener: (listener) => {
        disconnects.delete(listener);
      },
    },
  };
  return {
    port,
    post,
    listening: () => messages.size > 0,
    send: (message: unknown) => {
      for (const listener of [...messages]) listener(message);
    },
    disconnect: () => {
      for (const listener of [...disconnects]) listener();
    },
  };
}

async function until(condition: () => boolean) {
  for (let index = 0; index < 100; index++) {
    if (condition()) return;
    await Promise.resolve();
  }
  expect(condition()).toBe(true);
}

function fixture(target: 'firefox' | 'chrome' = 'firefox') {
  const ports = [portFixture(), portFixture()];
  let connected = 0;
  const main =
    Promise.withResolvers<Array<{ frameId: number; result: unknown }>>();
  const execute = vi.fn(
    async (injection: PageErrorInjection): Promise<PageErrorFrame[]> => {
      if (injection.func === observeMainErrors) return main.promise;
      return [
        {
          frameId: 0,
          result: { installed: true, topFrame: true, incognito: false },
        },
      ];
    },
  );
  const api: PageErrorBrowserApi = {
    permissions: {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
    },
    tabs: {
      get: vi.fn(async (id) => ({ id, incognito: false })),
      getCurrent: vi.fn(async () => ({ id: 80, incognito: false })),
      connect: vi.fn(() => {
        const value = ports[connected++];
        if (!value) throw new Error('No fixture port');
        return value.port;
      }),
    },
    runtime: { getURL: (path) => `moz-extension://fixture${path}` },
    scripting: { executeScript: execute },
  };
  const driver = createPageErrorDriver(api, getBrowserContext(target));
  const controller = new AbortController();
  const observing = vi.fn(() => {});
  const first = ports[0]!;
  async function observe() {
    await until(first.listening);
    first.send({ kind: 'supervisor-ready' });
    await until(() =>
      target === 'chrome'
        ? execute.mock.calls.some(
            ([injection]) => injection.func === observeMainErrors,
          )
        : first.post.mock.calls.some(
            ([message]) =>
              typeof message === 'object' &&
              message !== null &&
              'kind' in message &&
              message.kind === 'start',
          ),
    );
    first.send({ kind: 'observing' });
    expect(observing).toHaveBeenCalledTimes(1);
  }
  return {
    api,
    driver,
    controller,
    observing,
    execute,
    main,
    first,
    ports,
    observe,
  };
}

it('is structurally compatible with the real browser API without widening product permissions', () => {
  const api: PageErrorBrowserApi = fakeBrowser;
  expect(typeof api.tabs.connect).toBe('function');
});

it('requests consent in Start before other work and can abort while the prompt remains open', async () => {
  const current = fixture();
  const grant = Promise.withResolvers<boolean>();
  vi.spyOn(current.api.permissions, 'request').mockReturnValue(grant.promise);
  let reads = 0;
  Object.defineProperty(current.api, 'scripting', {
    get() {
      reads++;
      return { executeScript: current.execute };
    },
  });
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  expect(current.api.permissions.request).toHaveBeenCalledWith({
    permissions: ['scripting'],
  });
  expect(current.api.tabs.get).not.toHaveBeenCalled();
  expect(reads).toBe(0);
  current.controller.abort();
  expect(await pending).toEqual({ status: 'interrupted' });
  grant.resolve(true);
  await Promise.resolve();
  expect(reads).toBe(0);
  expect(current.execute).not.toHaveBeenCalled();
});

it('does no browser work after denied or already-cancelled consent', async () => {
  const current = fixture();
  vi.spyOn(current.api.permissions, 'request').mockResolvedValue(false);
  expect(
    await current.driver.start(
      17,
      current.controller.signal,
      current.observing,
    ),
  ).toEqual({ status: 'denied' });
  expect(current.api.tabs.get).not.toHaveBeenCalled();
  current.controller.abort();
  expect(
    await current.driver.start(
      17,
      current.controller.signal,
      current.observing,
    ),
  ).toEqual({ status: 'interrupted' });
  expect(current.api.permissions.request).toHaveBeenCalledTimes(1);
});

it('checks optional scripting availability after the permission grant', async () => {
  const current = fixture();
  const grant = Promise.withResolvers<boolean>();
  vi.spyOn(current.api.permissions, 'request').mockReturnValue(grant.promise);
  delete current.api.scripting;
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  current.api.scripting = { executeScript: current.execute };
  grant.resolve(true);
  await current.observe();
  current.controller.abort();
  expect(await pending).toEqual({ status: 'interrupted' });
});

for (const incognito of [true, undefined]) {
  it(`rejects private or unclassified source context (${incognito}) before injection`, async () => {
    const current = fixture();
    vi.spyOn(current.api.tabs, 'get').mockResolvedValue(
      incognito === undefined ? { id: 17 } : { id: 17, incognito },
    );
    expect(
      await current.driver.start(
        17,
        current.controller.signal,
        current.observing,
      ),
    ).toEqual({ status: 'normal-window-required' });
    expect(current.execute).not.toHaveBeenCalled();
  });
  it(`rejects private or unclassified owner context (${incognito}) before injection`, async () => {
    const current = fixture();
    vi.spyOn(current.api.tabs, 'getCurrent').mockResolvedValue(
      incognito === undefined ? { id: 80 } : { id: 80, incognito },
    );
    expect(
      await current.driver.start(
        17,
        current.controller.signal,
        current.observing,
      ),
    ).toEqual({ status: 'normal-window-required' });
    expect(current.execute).not.toHaveBeenCalled();
  });
}

it('rejects a changed source or unknown owner without retargeting', async () => {
  const current = fixture();
  vi.spyOn(current.api.tabs, 'get').mockResolvedValueOnce({
    id: 18,
    incognito: false,
  });
  expect(
    await current.driver.start(
      17,
      current.controller.signal,
      current.observing,
    ),
  ).toEqual({ status: 'source-unavailable' });
  vi.spyOn(current.api.tabs, 'getCurrent').mockResolvedValueOnce(undefined);
  expect(
    await current.driver.start(
      17,
      current.controller.signal,
      current.observing,
    ),
  ).toEqual({ status: 'source-unavailable' });
  expect(current.execute).not.toHaveBeenCalled();
});

it('never reads page URL/title fields while copying tab classification', async () => {
  const current = fixture();
  let reads = 0;
  const source = Object.defineProperties(
    { id: 17, incognito: false },
    {
      url: {
        get() {
          reads++;
          throw new Error('Private URL');
        },
      },
      title: {
        get() {
          reads++;
          throw new Error('Private title');
        },
      },
    },
  );
  vi.spyOn(current.api.tabs, 'get').mockResolvedValue(source);
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await current.observe();
  current.driver.stop();
  current.first.send({ kind: 'result', value: summary() });
  expect((await pending).status).toBe('success');
  expect(reads).toBe(0);
});

it('installs only in frame zero of the original source, keeps Stop synchronous and copies a confirmed Firefox result', async () => {
  const current = fixture();
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await current.observe();
  expect(current.execute.mock.calls[0]?.[0]).toMatchObject({
    target: { tabId: 17, frameIds: [0] },
    world: 'ISOLATED',
    func: installErrorSupervisor,
  });
  expect(current.api.tabs.connect).toHaveBeenCalledWith(17, {
    frameId: 0,
    name: expect.any(String),
  });
  expect(current.driver.stop()).toBeUndefined();
  expect(current.first.port.postMessage).toHaveBeenCalledWith({ kind: 'stop' });
  const value = summary();
  current.first.send({ kind: 'result', value });
  const result = await pending;
  value.scriptErrors = 99;
  expect(result).toEqual({ status: 'success', value: summary() });
  expect(current.first.port.disconnect).toHaveBeenCalledTimes(1);
});

it('rejects a wrong-frame supervisor response', async () => {
  const current = fixture();
  current.execute.mockResolvedValueOnce([
    {
      frameId: 1,
      result: { installed: true, topFrame: true, incognito: false },
    },
  ]);
  expect(
    await current.driver.start(
      17,
      current.controller.signal,
      current.observing,
    ),
  ).toEqual({ status: 'invalid-result' });
  expect(current.api.tabs.connect).not.toHaveBeenCalled();
});

it('accepts Chrome counts only from its MAIN injection result and rejects a forged port result', async () => {
  const current = fixture('chrome');
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await current.observe();
  current.first.send({ kind: 'result', value: summary() });
  expect(await pending).toEqual({ status: 'invalid-result' });
  current.main.resolve([{ frameId: 0, result: summary() }]);
});

it('does not describe a Chrome page-forged stop as a user action', async () => {
  const current = fixture('chrome');
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await current.observe();
  current.main.resolve([{ frameId: 0, result: summary() }]);
  expect(await pending).toEqual({ status: 'interrupted' });
});

it('accepts a canonical Chrome summary after the owner requested Stop', async () => {
  const current = fixture('chrome');
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await current.observe();
  current.driver.stop();
  current.main.resolve([{ frameId: 0, result: summary() }]);
  expect(await pending).toEqual({ status: 'success', value: summary() });
});

it('rejects wrong-frame or malformed Chrome results without counts', async () => {
  const current = fixture('chrome');
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await current.observe();
  current.driver.stop();
  current.main.resolve([{ frameId: 1, result: summary() }]);
  expect(await pending).toEqual({ status: 'invalid-result' });
});

it('cleans up through its existing port when aborted before readiness', async () => {
  const current = fixture();
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await until(current.first.listening);
  current.controller.abort();
  current.first.send({ kind: 'supervisor-ready' });
  expect(await pending).toEqual({ status: 'interrupted' });
  expect(current.first.port.postMessage).toHaveBeenCalledWith({
    kind: 'discard',
  });
  expect(current.first.port.disconnect).toHaveBeenCalledTimes(1);
  expect(current.execute).toHaveBeenCalledTimes(1);
  expect(current.observing).not.toHaveBeenCalled();
});

it('disconnects a port created after a synchronous cancellation and bounds cleanup exceptions', async () => {
  const current = fixture();
  vi.spyOn(current.api.tabs, 'connect').mockImplementation(() => {
    current.controller.abort();
    return current.first.port;
  });
  vi.spyOn(current.first.port.onMessage, 'removeListener').mockImplementation(
    () => {
      throw new Error('Invalidated extension API');
    },
  );
  expect(
    await current.driver.start(
      17,
      current.controller.signal,
      current.observing,
    ),
  ).toEqual({ status: 'interrupted' });
  await until(() => current.first.post.mock.calls.length > 0);
  expect(current.first.port.postMessage).toHaveBeenCalledWith({
    kind: 'discard',
  });
  expect(current.first.port.disconnect).toHaveBeenCalledTimes(1);
  expect(current.observing).not.toHaveBeenCalled();
});

it('maps navigation or source disconnection to interruption without cleanup injection', async () => {
  const current = fixture('chrome');
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await current.observe();
  current.first.disconnect();
  expect(await pending).toEqual({ status: 'interrupted' });
  current.main.resolve([{ frameId: 0, result: { finish: 'interrupted' } }]);
  expect(current.execute).toHaveBeenCalledTimes(2);
});

it('rechecks permissions before accepting confirmed counts', async () => {
  const current = fixture();
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await current.observe();
  vi.spyOn(current.api.permissions, 'contains').mockResolvedValue(false);
  current.driver.stop();
  current.first.send({ kind: 'result', value: summary() });
  expect(await pending).toEqual({ status: 'interrupted' });
});

it('does not install or start an observer after permission is lost during setup', async () => {
  const beforeInstall = fixture();
  vi.spyOn(beforeInstall.api.permissions, 'contains').mockResolvedValue(false);
  expect(
    await beforeInstall.driver.start(
      17,
      beforeInstall.controller.signal,
      beforeInstall.observing,
    ),
  ).toEqual({ status: 'interrupted' });
  expect(beforeInstall.execute).not.toHaveBeenCalled();

  const beforeMain = fixture('chrome');
  const pending = beforeMain.driver.start(
    17,
    beforeMain.controller.signal,
    beforeMain.observing,
  );
  await until(beforeMain.first.listening);
  vi.spyOn(beforeMain.api.permissions, 'contains').mockResolvedValue(false);
  beforeMain.first.send({ kind: 'supervisor-ready' });
  expect(await pending).toEqual({ status: 'interrupted' });
  expect(beforeMain.execute).toHaveBeenCalledTimes(1);
  expect(beforeMain.observing).not.toHaveBeenCalled();
});

it('rejects raw metadata or inconsistent counts in a Chrome result', async () => {
  const current = fixture('chrome');
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await current.observe();
  current.driver.stop();
  current.main.resolve([
    { frameId: 0, result: { ...summary(), message: 'SENSITIVE' } },
  ]);
  expect(await pending).toEqual({ status: 'invalid-result' });
});

it('keeps a restarted attempt independent of an old late MAIN completion', async () => {
  const current = fixture('chrome');
  const first = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await current.observe();
  current.controller.abort();
  expect(await first).toEqual({ status: 'interrupted' });
  const secondMain =
    Promise.withResolvers<Array<{ frameId: number; result: unknown }>>();
  current.execute.mockImplementation(async (injection) =>
    injection.func === observeMainErrors
      ? secondMain.promise
      : [
          {
            frameId: 0,
            result: { installed: true, topFrame: true, incognito: false },
          },
        ],
  );
  const controller = new AbortController();
  const nextObserving = vi.fn(() => {});
  const second = current.driver.start(17, controller.signal, nextObserving);
  const nextPort = current.ports[1]!;
  await until(nextPort.listening);
  nextPort.send({ kind: 'supervisor-ready' });
  await until(
    () =>
      current.execute.mock.calls.filter(
        ([injection]) => injection.func === observeMainErrors,
      ).length === 2,
  );
  nextPort.send({ kind: 'observing' });
  current.main.resolve([{ frameId: 0, result: summary() }]);
  await Promise.resolve();
  expect(nextPort.port.disconnect).not.toHaveBeenCalled();
  current.driver.stop();
  expect(nextPort.port.postMessage).toHaveBeenCalledWith({ kind: 'stop' });
  secondMain.resolve([{ frameId: 0, result: summary() }]);
  expect(await second).toEqual({ status: 'success', value: summary() });
});

it('starts its setup timeout after consent and resolves a stalled setup without collecting', async () => {
  const current = fixture();
  const consent = Promise.withResolvers<boolean>();
  const source = Promise.withResolvers<{ id: number; incognito: boolean }>();
  vi.spyOn(current.api.permissions, 'request').mockReturnValue(consent.promise);
  vi.spyOn(current.api.tabs, 'get').mockReturnValue(source.promise);
  const timer = vi.spyOn(globalThis, 'setTimeout');
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  expect(timer).not.toHaveBeenCalled();
  consent.resolve(true);
  expect(await pending).toEqual({ status: 'connection-failed' });
  expect(timer).toHaveBeenCalledWith(expect.any(Function), 5000);
  source.resolve({ id: 17, incognito: false });
  expect(current.execute).not.toHaveBeenCalled();
}, 8000);

it('buffers a validated Chrome completion until isolated readiness arrives on its separate channel', async () => {
  const current = fixture('chrome');
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await until(current.first.listening);
  current.first.send({ kind: 'supervisor-ready' });
  await until(() =>
    current.execute.mock.calls.some(
      ([injection]) => injection.func === observeMainErrors,
    ),
  );
  const value = summary({
    scriptErrors: 200,
    unhandledRejections: 0,
    total: 200,
    finish: 'limit',
    observedMs: 2,
  });
  current.main.resolve([{ frameId: 0, result: value }]);
  for (let index = 0; index < 10; index++) await Promise.resolve();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  expect(current.observing).not.toHaveBeenCalled();
  expect(current.first.port.disconnect).not.toHaveBeenCalled();
  value.scriptErrors = 99;
  current.first.send({ kind: 'observing' });
  expect(await pending).toEqual({
    status: 'success',
    value: summary({
      scriptErrors: 200,
      unhandledRejections: 0,
      total: 200,
      finish: 'limit',
      observedMs: 2,
    }),
  });
});

it('discard while a Chrome summary awaits isolated readiness cannot restore counts', async () => {
  const current = fixture('chrome');
  const pending = current.driver.start(
    17,
    current.controller.signal,
    current.observing,
  );
  await until(current.first.listening);
  current.first.send({ kind: 'supervisor-ready' });
  await until(() =>
    current.execute.mock.calls.some(
      ([injection]) => injection.func === observeMainErrors,
    ),
  );
  current.main.resolve([
    { frameId: 0, result: summary({ finish: 'timeout', observedMs: 30000 }) },
  ]);
  for (let index = 0; index < 10; index++) await Promise.resolve();
  current.controller.abort();
  current.first.send({ kind: 'observing' });
  expect(await pending).toEqual({ status: 'interrupted' });
  expect(current.observing).not.toHaveBeenCalled();
  expect(current.first.port.disconnect).toHaveBeenCalledTimes(1);
});

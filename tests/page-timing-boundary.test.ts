import { beforeEach, expect, it, vi } from 'bun:test';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from './browser';
import { inspectPage } from '../lib/inspector';
import { createSession } from '../lib/session';

function page() {
  return {
    readyState: 'complete',
    performanceEntryTypes: ['navigation', 'paint'],
    timings: {
      domContentLoaded: { status: 'measured', milliseconds: 12.5 },
      loadEvent: { status: 'measured', milliseconds: 23.75 },
      firstContentfulPaint: { status: 'measured', milliseconds: 0 },
    },
  };
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [{ id: 7 }]);
  vi.spyOn(browser.permissions, 'request').mockImplementation(async () => true);
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(
    () => {},
  );
  vi.spyOn(browser.permissions.onRemoved, 'removeListener').mockImplementation(
    () => {},
  );
});

it.each([
  null,
  [],
  {},
  { status: 'missing' },
  { status: 'measured' },
  { status: 'measured', milliseconds: -1 },
  { status: 'measured', milliseconds: 0 },
  { status: 'measured', milliseconds: NaN },
  { status: 'measured', milliseconds: Infinity },
  { status: 'measured', milliseconds: Number.MAX_SAFE_INTEGER + 1 },
  { status: 'measured', milliseconds: '123' },
])('rejects an invalid event-end protocol value: %j', async (invalid) => {
  const payload = page();
  vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async () => [
    {
      frameId: 0,
      result: {
        ...payload,
        timings: { ...payload.timings, loadEvent: invalid },
      },
    },
  ]);
  expect((await inspectPage(browser)).status).toBe('error');
});

it('rejects an absent timing block and a paint result falsely marked unrecorded', async () => {
  const payload = page();
  const execute = vi.spyOn(browser.scripting, 'executeScript');
  for (const timings of [
    undefined,
    { loadEvent: payload.timings.loadEvent },
    { ...payload.timings, firstContentfulPaint: { status: 'unrecorded' } },
  ]) {
    execute.mockImplementation(async () => [
      { frameId: 0, result: { ...payload, timings } },
    ]);
    expect((await inspectPage(browser)).status).toBe('error');
  }
});

it('copies only fixed measurement fields and does not retain mutable browser objects', async () => {
  const payload = page();
  const secret = 'https://private.invalid/?token=never-retain';
  vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async () => [
    {
      frameId: 0,
      result: {
        ...payload,
        name: secret,
        timings: {
          ...payload.timings,
          name: secret,
          loadEvent: { status: 'unrecorded', milliseconds: secret },
          firstContentfulPaint: {
            ...payload.timings.firstContentfulPaint,
            name: secret,
          },
        },
      },
    },
  ]);
  const result = await inspectPage(browser);
  expect(result).toEqual({
    status: 'success',
    value: {
      readyState: 'complete',
      performanceEntryTypes: ['navigation', 'paint'],
      timings: {
        domContentLoaded: { status: 'measured', milliseconds: 12.5 },
        loadEvent: { status: 'unrecorded' },
        firstContentfulPaint: { status: 'measured', milliseconds: 0 },
      },
    },
  });
  expect(JSON.stringify(result)).not.toContain(secret);
  payload.timings.domContentLoaded.milliseconds = 999;
  expect(JSON.stringify(result)).not.toContain('999');
});

it.each(['clear', 'close', 'management', 'scripting'])(
  'discards timing results already in flight after %s',
  async (action) => {
    const started = Promise.withResolvers<void>();
    const observation =
      Promise.withResolvers<
        Array<{ frameId: number; result: ReturnType<typeof page> }>
      >();
    vi.spyOn(browser.scripting, 'executeScript').mockImplementation(() => {
      started.resolve();
      return observation.promise;
    });
    const listener = vi.spyOn(browser.permissions.onRemoved, 'addListener');
    const session = createSession(browser);
    const unsubscribe = session.subscribe(vi.fn());
    const pending = session.inspectPage();
    await started.promise;
    if (action === 'clear') session.clear();
    else if (action === 'close') unsubscribe();
    else listener.mock.calls[0]?.[0]({ permissions: [action] });
    observation.resolve([{ frameId: 0, result: page() }]);
    await pending;
    expect(session.getSnapshot().page).toBeNull();
    expect(session.getSnapshot().pageBusy).toBe(false);
    if (action !== 'close') unsubscribe();
  },
);

it('ignores duplicate page actions while busy and replaces a completed snapshot on a later action', async () => {
  const consent = Promise.withResolvers<boolean>();
  const request = vi
    .spyOn(browser.permissions, 'request')
    .mockImplementation(() => consent.promise);
  const payload = page();
  const execute = vi
    .spyOn(browser.scripting, 'executeScript')
    .mockImplementation(async () => [{ frameId: 0, result: payload }]);
  const session = createSession(browser);
  const first = session.inspectPage();
  await session.inspectPage();
  expect(request).toHaveBeenCalledTimes(1);
  consent.resolve(true);
  await first;
  expect(session.getSnapshot().page?.status).toBe('success');
  const later = Promise.withResolvers<boolean>();
  request.mockImplementation(() => later.promise);
  const pending = session.inspectPage();
  expect(session.getSnapshot().page).toBeNull();
  later.resolve(false);
  await pending;
  expect(session.getSnapshot().page?.status).toBe('denied');
  expect(execute).toHaveBeenCalledTimes(1);
});

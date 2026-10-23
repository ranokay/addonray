import { beforeEach, expect, it, vi } from 'bun:test';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { runInNewContext } from 'node:vm';
import { browser } from './browser';
import { firefoxContext } from '../lib/browser-target';
import { copyTimingSnapshot, type TimingSnapshot } from '../lib/inspector';
import { createInvestigation } from '../lib/investigation';
import { createSession } from '../lib/session';
import {
  createPopupTimingHandoff,
  installInvestigationTimingHandoff,
  type TimingHandoffBrowser,
  type TimingView,
} from '../lib/timing-handoff';

const timings = (): TimingSnapshot => ({
  domContentLoaded: { status: 'measured', milliseconds: 12.5 },
  loadEvent: { status: 'unrecorded' },
  firstContentfulPaint: { status: 'measured', milliseconds: 0 },
});

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(
    () => {},
  );
  vi.spyOn(browser.permissions.onRemoved, 'removeListener').mockImplementation(
    () => {},
  );
  vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
  vi.spyOn(browser.management, 'getAll').mockResolvedValue([]);
  vi.spyOn(browser.tabs, 'query').mockResolvedValue([
    { id: 17, incognito: false },
  ]);
  vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async () => [
    {
      result: {
        readyState: 'complete',
        performanceEntryTypes: ['navigation', 'paint'],
        timings: timings(),
      },
    },
  ]);
});

async function fixture(
  sourcePrivate: boolean | null = false,
  targetPrivate: boolean | null = false,
) {
  const investigation = createInvestigation(browser, firefoxContext);
  const other = createInvestigation(browser, firefoxContext);
  await investigation.captureBefore();
  await other.captureBefore();
  const session = createSession(browser);
  vi.spyOn(browser.tabs, 'query').mockResolvedValue([
    {
      id: 17,
      ...(sourcePrivate === null ? {} : { incognito: sourcePrivate }),
    },
  ]);
  await session.inspectPage();
  const popup: TimingView = {
    location: { href: 'extension://own/popup.html' },
  };
  const first: TimingView = {
    location: { href: 'extension://own/investigation.html' },
  };
  const second: TimingView = {
    location: { href: 'extension://own/investigation.html' },
  };
  const tabs: TimingView[] = [first, second];
  const popups: TimingView[] = [popup];
  const api: TimingHandoffBrowser = {
    extension: {
      getViews: vi.fn(({ type }) => (type === 'tab' ? tabs : popups)),
    },
    runtime: { getURL: (path) => `extension://own${path}` },
    permissions: { contains: vi.fn(async () => true) },
    tabs: {
      getCurrent: vi.fn(async () =>
        targetPrivate === null ? undefined : { incognito: targetPrivate },
      ),
    },
  };
  const cleanup = installInvestigationTimingHandoff(api, investigation, first);
  installInvestigationTimingHandoff(api, other, second);
  const handoff = createPopupTimingHandoff(api, session, popup);
  async function selected() {
    const result = await handoff.listDestinations();
    if (result.status !== 'success') throw new Error(result.reason);
    const destination = result.value.find(
      (entry) => entry.identity === investigation.identity,
    );
    if (!destination) throw new Error('Expected an eligible investigation');
    return destination;
  }
  return {
    investigation,
    other,
    session,
    popup,
    first,
    api,
    handoff,
    tabs,
    popups,
    cleanup,
    selected,
  };
}

it('discovers only primitive eligibility metadata, then delivers solely to the selected investigation', async () => {
  const f = await fixture();
  const list = await f.handoff.listDestinations();
  expect(list.status).toBe('success');
  if (list.status !== 'success') throw new Error('Discovery failed');
  expect(list.value).toHaveLength(2);
  expect(Object.keys(list.value[0]!).sort()).toEqual([
    'generation',
    'identity',
    'label',
    'sides',
  ]);
  expect(f.investigation.getSnapshot().timingBefore).toBeNull();
  expect(await f.handoff.attach(await f.selected(), 'before')).toEqual({
    status: 'success',
    value: null,
  });
  expect(f.investigation.getSnapshot().timingBefore).toEqual(timings());
  expect(f.other.getSnapshot().timingBefore).toBeNull();
  expect(
    f.session.isTimingCaptureCurrent(f.session.getTimingCapture()!.id),
  ).toBe(false);
});

it('owns independent canonical timing data after popup clear and sender mutation', async () => {
  const f = await fixture();
  const capture = f.session.getTimingCapture();
  if (!capture) throw new Error('Missing capture');
  await f.handoff.attach(await f.selected(), 'before');
  capture.timings.domContentLoaded = { status: 'measured', milliseconds: 999 };
  f.session.clear();
  expect(f.investigation.getSnapshot().timingBefore).toEqual(timings());
  expect(JSON.stringify(f.investigation.getSnapshot())).not.toContain(
    'sourceTabId',
  );
  expect(JSON.stringify(f.investigation.getSnapshot())).not.toContain(
    'performanceEntryTypes',
  );
});

it('owns discovery arrays in the popup realm even when the destination supplies a foreign array', async () => {
  const f = await fixture();
  const foreign: unknown = runInNewContext("['before']");
  if (
    !Array.isArray(foreign) ||
    foreign.length !== 1 ||
    foreign[0] !== 'before'
  )
    throw new Error('Expected foreign fixture array');
  if (!f.first.addonrayTimingInvestigation) throw new Error('Missing endpoint');
  vi.spyOn(f.first.addonrayTimingInvestigation, 'metadata').mockResolvedValue({
    identity: f.investigation.identity,
    label: f.investigation.label,
    generation: f.investigation.getGeneration(),
    sides: foreign,
  });
  const selected = await f.selected();
  expect(Object.getPrototypeOf(selected.sides)).toBe(Array.prototype);
  expect(selected.sides).toEqual(['before']);
  f.cleanup();
  expect(selected.sides.includes('before')).toBe(true);
  expect((await f.handoff.attach(selected, 'before')).status).toBe('error');
});

it('never reuses one capture for another investigation or filled side', async () => {
  const f = await fixture();
  const chosen = await f.selected();
  await f.handoff.attach(chosen, 'before');
  expect((await f.handoff.attach(chosen, 'before')).status).toBe('error');
  expect((await f.handoff.listDestinations()).status).toBe('unavailable');
  expect(f.other.getSnapshot().timingBefore).toBeNull();
});

it('keeps Before fixed and accepts After only from its source tab', async () => {
  const f = await fixture();
  await f.handoff.attach(await f.selected(), 'before');
  await f.investigation.captureAfter();
  vi.spyOn(browser.tabs, 'query').mockResolvedValue([
    { id: 18, incognito: false },
  ]);
  await f.session.inspectPage();
  const wrong = await f.handoff.attach(await f.selected(), 'after');
  expect(wrong.status).toBe('error');
  if (wrong.status !== 'success')
    expect(wrong.reason).toContain('same browser tab');
  expect(f.investigation.getSnapshot().timingAfter).toBeNull();
  expect(
    f.session.isTimingCaptureCurrent(f.session.getTimingCapture()!.id),
  ).toBe(true);
  vi.spyOn(browser.tabs, 'query').mockResolvedValue([
    { id: 17, incognito: false },
  ]);
  await f.session.inspectPage();
  expect((await f.handoff.attach(await f.selected(), 'after')).status).toBe(
    'success',
  );
  expect(f.investigation.getSnapshot().timingAfter).toEqual(timings());
  expect(f.investigation.timingSides()).toEqual([]);
});

it('closes Before timing when After inventory starts, even when that inventory fails', async () => {
  const f = await fixture();
  const selected = await f.selected();
  vi.spyOn(browser.management, 'getAll').mockRejectedValueOnce(
    new Error('private diagnostic'),
  );
  await f.investigation.captureAfter();
  expect(f.investigation.getSnapshot().afterStarted).toBe(true);
  expect((await f.handoff.attach(selected, 'before')).status).toBe('error');
  expect(f.investigation.getSnapshot().before?.status).toBe('success');
  await f.investigation.captureAfter();
  expect(f.investigation.getSnapshot().after?.status).toBe('success');
  expect(f.investigation.timingSides()).toEqual([]);
});

for (const action of ['reset', 'reload', 'close'] as const) {
  it(`rejects a ${action} destination without retargeting another view`, async () => {
    const f = await fixture();
    const selected = await f.selected();
    if (action === 'reset') {
      f.investigation.startOver();
      await f.investigation.captureBefore();
    } else {
      f.cleanup();
      f.tabs.splice(0, 1);
      if (action === 'reload') {
        const replacement = createInvestigation(browser, firefoxContext);
        await replacement.captureBefore();
        const view: TimingView = { location: { href: f.first.location.href } };
        installInvestigationTimingHandoff(f.api, replacement, view);
        f.tabs.push(view);
      }
    }
    expect((await f.handoff.attach(selected, 'before')).status).toBe('error');
    expect(f.investigation.getSnapshot().timingBefore).toBeNull();
    expect(f.other.getSnapshot().timingBefore).toBeNull();
  });
}

for (const action of ['reset', 'clear', 'replace', 'close'] as const) {
  it(`rejects late attachment after ${action} during permission confirmation`, async () => {
    const f = await fixture();
    const selected = await f.selected();
    const permissions = Promise.withResolvers<boolean>();
    const entered = Promise.withResolvers<void>();
    vi.spyOn(f.api.permissions, 'contains').mockImplementation(() => {
      entered.resolve();
      return permissions.promise;
    });
    const pending = f.handoff.attach(selected, 'before');
    await entered.promise;
    if (action === 'reset') f.investigation.startOver();
    if (action === 'clear') f.session.clear();
    if (action === 'replace') await f.session.inspectPage();
    if (action === 'close') f.popups.splice(0);
    permissions.resolve(true);
    expect((await pending).status).not.toBe('success');
    expect(f.investigation.getSnapshot().timingBefore).toBeNull();
  });
}

it('clears all investigation data if permission confirmation observes revocation', async () => {
  const f = await fixture();
  const selected = await f.selected();
  vi.spyOn(f.api.permissions, 'contains').mockResolvedValue(false);
  expect((await f.handoff.attach(selected, 'before')).status).toBe('error');
  expect(f.investigation.getSnapshot().before).toBeNull();
  expect(f.other.getSnapshot().before?.status).toBe('success');
});

for (const permission of ['management', 'scripting'] as const) {
  it(`resets all investigation fields and pending generation on ${permission} revocation`, async () => {
    const f = await fixture();
    const listener = vi.spyOn(browser.permissions.onRemoved, 'addListener');
    const unsubscribe = f.investigation.subscribe(vi.fn());
    await f.handoff.attach(await f.selected(), 'before');
    await f.investigation.captureAfter();
    f.investigation.setAssessment('better');
    const generation = f.investigation.getGeneration();
    listener.mock.calls[0]?.[0]({ permissions: [permission] });
    expect(f.investigation.getSnapshot().before).toBeNull();
    expect(f.investigation.getSnapshot().timingBefore).toBeNull();
    expect(f.investigation.getSnapshot().timingAfter).toBeNull();
    expect(f.investigation.getSnapshot().assessment).toBeNull();
    expect(f.investigation.getSnapshot().afterStarted).toBe(false);
    expect(f.investigation.getGeneration()).toBeGreaterThan(generation);
    unsubscribe();
  });
}

for (const privateFlag of [true, null]) {
  it(`fails closed before destination discovery for ${privateFlag} source classification`, async () => {
    const f = await fixture(privateFlag);
    expect((await f.handoff.listDestinations()).status).toBe('unavailable');
    expect(f.api.extension.getViews).not.toHaveBeenCalled();
  });
  it(`excludes ${privateFlag} receiver classification from discovery and acceptance`, async () => {
    const f = await fixture(false, privateFlag);
    expect(await f.handoff.listDestinations()).toEqual({
      status: 'success',
      value: [],
    });
    const capture = f.session.getTimingCapture()!;
    const result = await f.first.addonrayTimingInvestigation?.receive(
      {
        identity: f.investigation.identity,
        generation: 0,
        side: 'before',
        sourceTabId: 17,
        captureId: capture.id,
        timings: timings(),
      },
      f.popup,
    );
    expect(result?.status).toBe('error');
    expect(f.investigation.getSnapshot().timingBefore).toBeNull();
  });
}

it('rejects classification exceptions and a non-popup sender without retaining data', async () => {
  const f = await fixture();
  vi.spyOn(f.api.tabs, 'getCurrent').mockRejectedValue(
    new Error('private implementation detail'),
  );
  expect(await f.handoff.listDestinations()).toEqual({
    status: 'success',
    value: [],
  });
  const otherView: TimingView = {
    location: { href: 'extension://own/other.html' },
  };
  const result = await f.first.addonrayTimingInvestigation?.receive(
    {},
    otherView,
  );
  expect(result?.status).toBe('error');
  expect(JSON.stringify(result)).not.toContain('private implementation detail');
  expect(f.investigation.getSnapshot().timingBefore).toBeNull();
});

it('bounds discovery and never enumerates browser tabs or observations', async () => {
  const f = await fixture();
  for (let i = 0; i < 33; i++)
    f.tabs.push({ location: { href: 'extension://own/other.html' } });
  expect((await f.handoff.listDestinations()).status).toBe('unavailable');
  expect(f.api.tabs.getCurrent).not.toHaveBeenCalled();
});

it('canonical copying rejects malformed values and ignores metadata serialization', () => {
  const metadata = vi.fn(() => {
    throw new Error('Must not read metadata');
  });
  const supplied = {
    ...timings(),
    get url() {
      return metadata();
    },
    toJSON: metadata,
  };
  expect(copyTimingSnapshot(supplied)).toEqual(timings());
  expect(metadata).not.toHaveBeenCalled();
  expect(
    copyTimingSnapshot({
      ...timings(),
      loadEvent: { status: 'measured', milliseconds: 0 },
    }),
  ).toBeNull();
  expect(
    copyTimingSnapshot({
      ...timings(),
      firstContentfulPaint: { status: 'unrecorded' },
    }),
  ).toBeNull();
  expect(
    copyTimingSnapshot({
      ...timings(),
      domContentLoaded: { status: 'measured', milliseconds: Infinity },
    }),
  ).toBeNull();
});

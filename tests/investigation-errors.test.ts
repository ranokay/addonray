import { beforeEach, expect, it, vi } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from './browser';
import { getBrowserContext } from '../lib/browser-target';
import { createInvestigation, type Investigation } from '../lib/investigation';
import { type TimingSnapshot } from '../lib/inspector';
import {
  createPageErrorCheck,
  type PageErrorDriver,
  type PageErrorSummary,
} from '../lib/page-error-check';

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
const timings = (): TimingSnapshot => ({
  domContentLoaded: { status: 'measured', milliseconds: 12.5 },
  loadEvent: { status: 'unrecorded' },
  firstContentfulPaint: { status: 'measured', milliseconds: 0 },
});
type PermissionListener = Parameters<
  typeof browser.permissions.onRemoved.addListener
>[0];
const listeners = new Set<PermissionListener>();

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  listeners.clear();
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(
    (listener) => {
      listeners.add(listener);
    },
  );
  vi.spyOn(browser.permissions.onRemoved, 'removeListener').mockImplementation(
    (listener) => {
      listeners.delete(listener);
    },
  );
  vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
  vi.spyOn(browser.management, 'getAll').mockResolvedValue([]);
});

function fixture(target = 'firefox') {
  const current = createInvestigation(browser, getBrowserContext(target));
  const unsubscribe = current.subscribe(() => {});
  return { current, unsubscribe };
}
async function ready(target = 'firefox') {
  const value = fixture(target);
  await value.current.captureBefore();
  return value;
}
function attach(
  current: Investigation,
  side: 'before' | 'after',
  sourceTabId = 17,
  input: unknown = summary(),
) {
  return current.attachError(
    side,
    sourceTabId,
    input,
    current.getGeneration(),
    (commit) => commit(),
  );
}

for (const target of ['firefox', 'chrome']) {
  for (const value of [
    summary(),
    summary({ finish: 'timeout', observedMs: 30_000 }),
    summary({
      scriptErrors: 199,
      unhandledRejections: 1,
      total: 200,
      finish: 'limit',
    }),
  ]) {
    it(`retains independent fixed ${value.finish} summaries beside its inventories (${target})`, async () => {
      const { current } = await ready(target);
      expect(current.errorSides()).toEqual(['before']);
      expect(attach(current, 'before', 17, value).status).toBe('success');
      const before = current.getSnapshot().errorBefore;
      expect(before).toEqual(value);
      expect(before).not.toBe(value);
      expect(current.errorSides()).toEqual([]);
      expect(attach(current, 'before').status).toBe('error');
      expect(attach(current, 'after').status).toBe('error');
      await current.captureAfter();
      expect(current.errorSides()).toEqual(['after']);
      expect(attach(current, 'after', 17, value).status).toBe('success');
      expect(current.getSnapshot().errorAfter).toEqual(value);
      expect(current.getSnapshot().errorAfter).not.toBe(before);
      expect(current.errorSides()).toEqual([]);
      expect(attach(current, 'after').status).toBe('error');
      expect(current.getSnapshot().errorBefore).toBe(before);
      expect(current.getSnapshot().assessment).toBeNull();
      expect(current.getSnapshot().timingBefore).toBeNull();
      expect(current.getSnapshot().timingAfter).toBeNull();
    });
  }

  it(`keeps errors, timings and the manual assessment independently optional (${target})`, async () => {
    const errorOnly = (await ready(target)).current;
    const timingOnly = (await ready(target)).current;
    const mixed = (await ready(target)).current;
    expect(attach(errorOnly, 'before').status).toBe('success');
    expect(
      timingOnly.attachTiming(
        'before',
        17,
        timings(),
        timingOnly.getGeneration(),
      ).status,
    ).toBe('success');
    expect(attach(mixed, 'before').status).toBe('success');
    expect(
      mixed.attachTiming('before', 17, timings(), mixed.getGeneration()).status,
    ).toBe('success');
    await Promise.all([
      errorOnly.captureAfter(),
      timingOnly.captureAfter(),
      mixed.captureAfter(),
    ]);
    expect(attach(errorOnly, 'after').status).toBe('success');
    expect(
      timingOnly.attachTiming(
        'after',
        17,
        timings(),
        timingOnly.getGeneration(),
      ).status,
    ).toBe('success');
    expect(attach(mixed, 'after').status).toBe('success');
    expect(
      mixed.attachTiming('after', 17, timings(), mixed.getGeneration()).status,
    ).toBe('success');
    expect(errorOnly.getSnapshot().timingBefore).toBeNull();
    expect(errorOnly.getSnapshot().timingAfter).toBeNull();
    expect(timingOnly.getSnapshot().errorBefore).toBeNull();
    expect(timingOnly.getSnapshot().errorAfter).toBeNull();
    for (const current of [errorOnly, timingOnly, mixed]) {
      expect(current.getSnapshot().assessment).toBeNull();
      current.setAssessment('uncertain');
      expect(current.getSnapshot().assessment).toBe('uncertain');
      expect(JSON.stringify(current.getSnapshot())).not.toContain(
        'sourceTabId',
      );
    }
  });

  it(`shares one source binding in either kind order, including a later timing Before (${target})`, async () => {
    const errorFirst = (await ready(target)).current;
    const timingFirst = (await ready(target)).current;
    expect(attach(errorFirst, 'before').status).toBe('success');
    const consume = vi.fn(() => true);
    const errorState = errorFirst.getSnapshot();
    expect(
      errorFirst.attachTiming(
        'before',
        18,
        timings(),
        errorFirst.getGeneration(),
        consume,
      ).status,
    ).toBe('error');
    expect(consume).not.toHaveBeenCalled();
    expect(errorFirst.getSnapshot()).toBe(errorState);
    expect(
      errorFirst.attachTiming(
        'before',
        17,
        timings(),
        errorFirst.getGeneration(),
      ).status,
    ).toBe('success');
    timingFirst.attachTiming(
      'before',
      17,
      timings(),
      timingFirst.getGeneration(),
    );
    const commit = vi.fn((write: () => boolean) => write());
    const timingState = timingFirst.getSnapshot();
    expect(
      timingFirst.attachError(
        'before',
        18,
        summary(),
        timingFirst.getGeneration(),
        commit,
      ).status,
    ).toBe('error');
    expect(commit).not.toHaveBeenCalled();
    expect(timingFirst.getSnapshot()).toBe(timingState);
    expect(attach(timingFirst, 'before').status).toBe('success');
    for (const current of [errorFirst, timingFirst]) {
      await current.captureAfter();
      const before = current.getSnapshot();
      expect(attach(current, 'after', 18).status).toBe('error');
      expect(
        current.attachTiming('after', 18, timings(), current.getGeneration())
          .status,
      ).toBe('error');
      expect(current.getSnapshot()).toBe(before);
      expect(attach(current, 'after', 17).status).toBe('success');
      expect(
        current.attachTiming('after', 17, timings(), current.getGeneration())
          .status,
      ).toBe('success');
    }
  });
}

it('requires a successful Before and closes its error slot as soon as After inventory starts, even on failure', async () => {
  const { current } = fixture();
  expect(current.errorSides()).toEqual([]);
  expect(attach(current, 'before').status).toBe('error');
  await current.captureBefore();
  const grant = Promise.withResolvers<boolean>();
  vi.spyOn(browser.permissions, 'request').mockImplementationOnce(
    () => grant.promise,
  );
  const pending = current.captureAfter();
  expect(current.getSnapshot().busy).toBe('after');
  expect(current.errorSides()).toEqual([]);
  expect(attach(current, 'before').status).toBe('error');
  grant.resolve(false);
  await pending;
  expect(current.getSnapshot().after?.status).toBe('denied');
  expect(current.getSnapshot().afterStarted).toBe(true);
  expect(current.errorSides()).toEqual([]);
  expect(attach(current, 'before').status).toBe('error');
  expect(attach(current, 'after').status).toBe('error');
  expect(current.getSnapshot().before?.status).toBe('success');
});

it('preserves attached Before through failed After inventory and allows its After only after a successful retry', async () => {
  const { current } = await ready();
  attach(current, 'before');
  const before = current.getSnapshot().errorBefore;
  vi.spyOn(browser.management, 'getAll').mockRejectedValueOnce(
    new Error('fixture failure'),
  );
  await current.captureAfter();
  expect(current.errorSides()).toEqual([]);
  expect(attach(current, 'after').status).toBe('error');
  expect(current.getSnapshot().errorBefore).toBe(before);
  await current.captureAfter();
  expect(current.errorSides()).toEqual(['after']);
  expect(attach(current, 'after').status).toBe('success');
});

it('makes its own canonical copy of a foreign summary without retaining metadata or the foreign realm', async () => {
  const { current } = await ready();
  const foreign: unknown = runInNewContext(`(${JSON.stringify(summary())})`);
  if (typeof foreign !== 'object' || foreign === null)
    throw new Error('Expected foreign fixture');
  expect(Object.getPrototypeOf(foreign)).not.toBe(Object.prototype);
  expect(attach(current, 'before', 17, foreign).status).toBe('success');
  const retained = current.getSnapshot().errorBefore;
  expect(retained).toEqual(summary());
  expect(Object.getPrototypeOf(retained)).toBe(Object.prototype);
  Reflect.set(foreign, 'scriptErrors', 99);
  expect(current.getSnapshot().errorBefore).toEqual(summary());
  expect(Object.keys(retained!).sort()).toEqual([
    'finish',
    'observedMs',
    'scriptErrors',
    'total',
    'unhandledRejections',
  ]);
});

it('rejects invalid summaries and source IDs before asking the donor to commit, without invoking getters', async () => {
  const { current } = await ready();
  const before = current.getSnapshot();
  const commit = vi.fn((write: () => boolean) => write());
  let reads = 0;
  const getter = Object.defineProperty(summary(), 'total', {
    get() {
      reads++;
      return 3;
    },
  });
  for (const input of [
    null,
    getter,
    { ...summary(), message: 'RAW_SENTINEL' },
    summary({ total: 4 }),
    summary({ observedMs: 30_001 }),
  ]) {
    expect(
      current.attachError('before', 17, input, current.getGeneration(), commit)
        .status,
    ).toBe('error');
  }
  for (const id of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(
      current.attachError(
        'before',
        id,
        summary(),
        current.getGeneration(),
        commit,
      ).status,
    ).toBe('error');
  }
  expect(reads).toBe(0);
  expect(commit).not.toHaveBeenCalled();
  expect(current.getSnapshot()).toBe(before);
});

it('retains a real donor transaction copy after donor reset or disposal, independently of another investigation', async () => {
  const { current } = await ready();
  const other = (await ready()).current;
  const driver: PageErrorDriver = {
    start: vi.fn(async (): ReturnType<PageErrorDriver['start']> => ({
      status: 'success',
      value: summary(),
    })),
    stop: () => {},
  };
  const donor = createPageErrorCheck(
    browser,
    driver,
    getBrowserContext('firefox'),
  );
  donor.subscribe(() => {});
  donor.bindSource(17);
  await donor.start();
  const capture = donor.getAttachmentCapture();
  if (!capture) throw new Error('Expected completed donor');
  expect(
    current.attachError(
      'before',
      capture.sourceTabId,
      capture.value,
      current.getGeneration(),
      (commit) =>
        donor.commitAttachment(
          capture.identity,
          capture.generation,
          capture.sourceTabId,
          (stillCurrent) => stillCurrent() && commit(),
        ),
    ).status,
  ).toBe('success');
  expect(donor.isAttachmentUsed()).toBe(true);
  expect(donor.getSnapshot().outcome?.status).toBe('success');
  expect(
    donor.commitAttachment(
      capture.identity,
      capture.generation,
      17,
      () => true,
    ),
  ).toBe(false);
  capture.value.scriptErrors = 99;
  donor.startOver();
  donor.dispose();
  expect(current.getSnapshot().errorBefore).toEqual(summary());
  expect(other.getSnapshot().errorBefore).toBeNull();
});

for (const reset of [
  'startOver',
  'management',
  'scripting',
  'unsubscribe',
] as const) {
  it(`${reset} clears every observation, invalidates old transfers and releases the shared source binding`, async () => {
    const { current, unsubscribe } = await ready();
    const generation = current.getGeneration();
    attach(current, 'before');
    current.attachTiming('before', 17, timings(), generation);
    await current.captureAfter();
    attach(current, 'after');
    current.attachTiming('after', 17, timings(), generation);
    current.setAssessment('better');
    if (reset === 'startOver') current.startOver();
    else if (reset === 'unsubscribe') unsubscribe();
    else
      for (const listener of [...listeners]) listener({ permissions: [reset] });
    expect(current.getGeneration()).toBeGreaterThan(generation);
    const empty = current.getSnapshot();
    expect(empty.before).toBeNull();
    expect(empty.after).toBeNull();
    expect(empty.errorBefore).toBeNull();
    expect(empty.errorAfter).toBeNull();
    expect(empty.timingBefore).toBeNull();
    expect(empty.timingAfter).toBeNull();
    expect(empty.assessment).toBeNull();
    const commit = vi.fn((write: () => boolean) => write());
    expect(
      current.attachError('before', 17, summary(), generation, commit).status,
    ).toBe('error');
    expect(commit).not.toHaveBeenCalled();
    await current.captureBefore();
    expect(attach(current, 'before', 18).status).toBe('success');
    expect(
      current.attachTiming('before', 18, timings(), current.getGeneration())
        .status,
    ).toBe('success');
  });
}

it('expires an unaccepted deferred commit and accepts a later explicit attempt', async () => {
  const { current } = await ready();
  let delayed = () => false;
  expect(
    current.attachError(
      'before',
      17,
      summary(),
      current.getGeneration(),
      (write) => {
        delayed = write;
        return false;
      },
    ).status,
  ).toBe('cancelled');
  expect(delayed()).toBe(false);
  expect(current.getSnapshot().errorBefore).toBeNull();
  expect(attach(current, 'before').status).toBe('success');
});

it('writes at most once in a synchronous donor callback and preserves acceptance after a lost acknowledgment', async () => {
  const { current } = await ready();
  const observed: boolean[] = [];
  const result = current.attachError(
    'before',
    17,
    summary(),
    current.getGeneration(),
    (write) => {
      observed.push(write(), write());
      throw new Error('The donor acknowledgment was lost after acceptance');
    },
  );
  expect(result.status).toBe('success');
  expect(observed).toEqual([true, false]);
  expect(current.getSnapshot().errorBefore).toEqual(summary());
  expect(attach(current, 'before').status).toBe('error');
});

it('rejects a throwing donor before acceptance and preserves all existing data', async () => {
  const { current } = await ready();
  current.attachTiming('before', 17, timings(), current.getGeneration());
  const before = current.getSnapshot();
  expect(
    current.attachError(
      'before',
      17,
      summary(),
      current.getGeneration(),
      () => {
        throw new Error('Dead sender before acceptance');
      },
    ).status,
  ).toBe('cancelled');
  expect(current.getSnapshot()).toBe(before);
  expect(attach(current, 'before').status).toBe('success');
});

it('does not restore a reset destination or overwrite a source binding established inside the donor callback', async () => {
  const first = (await ready()).current;
  expect(
    first.attachError(
      'before',
      17,
      summary(),
      first.getGeneration(),
      (write) => {
        first.startOver();
        return write();
      },
    ).status,
  ).toBe('cancelled');
  expect(first.getSnapshot().before).toBeNull();
  expect(first.getSnapshot().errorBefore).toBeNull();
  const second = (await ready()).current;
  expect(
    second.attachError(
      'before',
      17,
      summary(),
      second.getGeneration(),
      (write) => {
        second.attachTiming('before', 18, timings(), second.getGeneration());
        return write();
      },
    ).status,
  ).toBe('cancelled');
  expect(second.getSnapshot().timingBefore).toEqual(timings());
  expect(second.getSnapshot().errorBefore).toBeNull();
});

it('rejects error data invalidated by a reentrant copy before asking the donor to commit', async () => {
  const { current } = await ready();
  const commit = vi.fn((write: () => boolean) => write());
  const input = new Proxy(summary(), {
    ownKeys(target) {
      current.startOver();
      return Reflect.ownKeys(target);
    },
  });
  expect(
    current.attachError('before', 17, input, current.getGeneration(), commit)
      .status,
  ).toBe('error');
  expect(commit).not.toHaveBeenCalled();
  expect(current.getSnapshot().errorBefore).toBeNull();
  expect(current.getSnapshot().before).toBeNull();
});

for (const interleave of ['copy', 'consume'] as const) {
  it(`rechecks the source binding after reentrant timing ${interleave} without replacing accepted errors`, async () => {
    const { current } = await ready();
    let bound = false;
    const bind = () => {
      if (!bound) {
        bound = true;
        expect(attach(current, 'before', 18).status).toBe('success');
      }
    };
    const timing =
      interleave === 'copy'
        ? Object.defineProperty(timings(), 'domContentLoaded', {
            get() {
              bind();
              return { status: 'measured', milliseconds: 12.5 };
            },
          })
        : timings();
    const consume = vi.fn(() => {
      if (interleave === 'consume') bind();
      return true;
    });
    const result = current.attachTiming(
      'before',
      17,
      timing,
      current.getGeneration(),
      consume,
    );
    expect(result.status).toBe(interleave === 'copy' ? 'error' : 'cancelled');
    if (interleave === 'copy') expect(consume).not.toHaveBeenCalled();
    else expect(consume).toHaveBeenCalledTimes(1);
    expect(current.getSnapshot().timingBefore).toBeNull();
    expect(current.getSnapshot().errorBefore).toEqual(summary());
    expect(
      current.attachTiming('before', 18, timings(), current.getGeneration())
        .status,
    ).toBe('success');
  });
}

import { beforeEach, expect, it, vi } from 'bun:test';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from './browser';
import { getBrowserContext } from '../lib/browser-target';
import {
  copyPageErrorSummary,
  createPageErrorCheck,
  pageErrorLimits,
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

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

function checkFixture() {
  const result =
    Promise.withResolvers<Awaited<ReturnType<PageErrorDriver['start']>>>();
  let ready = () => {};
  let signal: AbortSignal | undefined;
  let removed: Parameters<
    typeof browser.permissions.onRemoved.addListener
  >[0] = () => {};
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(
    (listener) => {
      removed = listener;
    },
  );
  vi.spyOn(browser.permissions.onRemoved, 'removeListener').mockImplementation(
    () => {},
  );
  const driver: PageErrorDriver = {
    start: vi.fn((_id, cancellation, onObserving) => {
      signal = cancellation;
      ready = onObserving;
      return result.promise;
    }),
    stop: vi.fn(() => {}),
  };
  const check = createPageErrorCheck(
    browser,
    driver,
    getBrowserContext('firefox'),
  );
  const unsubscribe = check.subscribe(() => {});
  return {
    check,
    driver,
    result,
    observing: () => ready(),
    aborted: () => signal?.aborted,
    revoke: (permission: 'management' | 'scripting') =>
      removed({ permissions: [permission] }),
    unsubscribe,
  };
}

it('opens unbound without starting, binds the original numeric ID once and requires an explicit Start', async () => {
  const { check, driver } = checkFixture();
  expect(check.getSnapshot()).toEqual({ phase: 'unbound', outcome: null });
  await check.start();
  expect(driver.start).not.toHaveBeenCalled();
  expect(check.bindSource(-1)).toBe(false);
  expect(check.bindSource(Number.NaN)).toBe(false);
  expect(check.bindSource(17)).toBe(true);
  expect(check.bindSource(18)).toBe(false);
  expect(check.getSnapshot()).toEqual({ phase: 'ready', outcome: null });
  expect(driver.start).not.toHaveBeenCalled();
});

it('waits for readiness and final counts, ignores duplicate Start and Stop, and keeps the result fixed', async () => {
  const { check, driver, result, observing } = checkFixture();
  check.bindSource(17);
  const started = check.start();
  expect(check.getSnapshot().phase).toBe('starting');
  check.stop();
  expect(driver.stop).not.toHaveBeenCalled();
  await check.start();
  expect(driver.start).toHaveBeenCalledTimes(1);
  observing();
  expect(check.getSnapshot()).toEqual({ phase: 'observing', outcome: null });
  check.stop();
  check.stop();
  observing();
  expect(check.getSnapshot()).toEqual({ phase: 'stopping', outcome: null });
  expect(driver.stop).toHaveBeenCalledTimes(1);
  const value = summary();
  result.resolve({ status: 'success', value });
  await started;
  value.scriptErrors = 99;
  expect(check.getSnapshot()).toEqual({
    phase: 'finished',
    outcome: { status: 'success', value: summary() },
  });
  await check.start();
  expect(driver.start).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(check.getSnapshot())).not.toContain('sourceTabId');
});

it('distinguishes confirmed zero counts from an interrupted attempt', async () => {
  const zero = checkFixture();
  zero.check.bindSource(17);
  const pending = zero.check.start();
  zero.result.resolve({
    status: 'success',
    value: summary({ scriptErrors: 0, unhandledRejections: 0, total: 0 }),
  });
  await pending;
  expect(zero.check.getSnapshot().outcome?.status).toBe('success');
  const interrupted = checkFixture();
  interrupted.check.bindSource(18);
  const other = interrupted.check.start();
  interrupted.result.resolve({ status: 'interrupted' });
  await other;
  expect(interrupted.check.getSnapshot().outcome).toEqual({
    status: 'interrupted',
  });
});

for (const finish of [
  'clear',
  'startOver',
  'dispose',
  'unsubscribe',
] as const) {
  it(`${finish} cancels an active attempt and cannot restore late readiness or counts`, async () => {
    const current = checkFixture();
    current.check.bindSource(17);
    const pending = current.check.start();
    if (finish === 'unsubscribe') current.unsubscribe();
    else current.check[finish]();
    expect(current.aborted()).toBe(true);
    current.observing();
    current.result.resolve({ status: 'success', value: summary() });
    await pending;
    expect(current.check.getSnapshot()).toEqual({
      phase: finish === 'dispose' ? 'unbound' : 'ready',
      outcome: null,
    });
  });
}

for (const permission of ['scripting', 'management'] as const) {
  it(`${permission} revocation discards results and invalidates the active attempt`, async () => {
    const current = checkFixture();
    current.check.bindSource(17);
    const pending = current.check.start();
    current.observing();
    current.revoke(permission);
    expect(current.aborted()).toBe(true);
    current.result.resolve({ status: 'success', value: summary() });
    await pending;
    expect(current.check.getSnapshot()).toEqual({
      phase: 'ready',
      outcome: null,
    });
  });
}

it('Start over permits a fresh explicit attempt on the original source and keeps other checks independent', async () => {
  const first = checkFixture();
  const second = checkFixture();
  first.check.bindSource(17);
  second.check.bindSource(18);
  const pending = first.check.start();
  first.result.resolve({ status: 'success', value: summary() });
  await pending;
  first.check.startOver();
  expect(second.check.getSnapshot()).toEqual({ phase: 'ready', outcome: null });
  await first.check.start();
  expect(first.driver.start).toHaveBeenNthCalledWith(
    2,
    17,
    expect.any(AbortSignal),
    expect.any(Function),
  );
});

it('does not begin side effects if a starting-state subscriber clears the check', async () => {
  const { check, driver } = checkFixture();
  check.bindSource(17);
  check.subscribe(() => {
    if (check.getSnapshot().phase === 'starting') check.clear();
  });
  await check.start();
  expect(driver.start).not.toHaveBeenCalled();
});

it('bounds driver errors and invalid results without exposing error details', async () => {
  const current = checkFixture();
  current.check.bindSource(17);
  const start = vi.spyOn(current.driver, 'start');
  start.mockRejectedValueOnce(new Error('SENSITIVE_STACK_SENTINEL'));
  await current.check.start();
  expect(current.check.getSnapshot().outcome).toEqual({
    status: 'connection-failed',
  });
  current.check.startOver();
  start.mockResolvedValueOnce({ status: 'success', value: { url: 'private' } });
  await current.check.start();
  expect(current.check.getSnapshot().outcome).toEqual({
    status: 'invalid-result',
  });
  expect(JSON.stringify(current.check.getSnapshot())).not.toContain(
    'SENSITIVE',
  );
});

it('cancels a failed Stop and ignores any later completion', async () => {
  const current = checkFixture();
  current.check.bindSource(17);
  const pending = current.check.start();
  current.observing();
  vi.spyOn(current.driver, 'stop').mockImplementation(() => {
    throw new Error('private');
  });
  current.check.stop();
  expect(current.aborted()).toBe(true);
  current.result.resolve({ status: 'success', value: summary() });
  await pending;
  expect(current.check.getSnapshot().outcome).toEqual({
    status: 'connection-failed',
  });
});

it('does not send an old Stop or restore its failure after a stopping-state subscriber clears and restarts', async () => {
  const current = checkFixture();
  current.check.bindSource(17);
  const pending = current.check.start();
  current.observing();
  const next =
    Promise.withResolvers<Awaited<ReturnType<PageErrorDriver['start']>>>();
  vi.spyOn(current.driver, 'start').mockImplementationOnce(() => next.promise);
  vi.spyOn(current.driver, 'stop').mockImplementation(() => {
    throw new Error('Old connection was cancelled');
  });
  let restarted: Promise<void> | undefined;
  current.check.subscribe(() => {
    if (current.check.getSnapshot().phase === 'stopping') {
      current.check.clear();
      restarted = current.check.start();
    }
  });
  current.check.stop();
  expect(current.driver.stop).not.toHaveBeenCalled();
  expect(current.check.getSnapshot()).toEqual({
    phase: 'starting',
    outcome: null,
  });
  current.result.resolve({ status: 'success', value: summary() });
  await pending;
  expect(current.check.getSnapshot()).toEqual({
    phase: 'starting',
    outcome: null,
  });
  next.resolve({ status: 'interrupted' });
  await restarted;
  expect(current.check.getSnapshot().outcome).toEqual({
    status: 'interrupted',
  });
});

it('does not restore counts when inspecting an untrusted result clears the check', async () => {
  const current = checkFixture();
  current.check.bindSource(17);
  const pending = current.check.start();
  const input = new Proxy(summary(), {
    ownKeys(target) {
      current.check.clear();
      return Reflect.ownKeys(target);
    },
  });
  current.result.resolve({ status: 'success', value: input });
  await pending;
  expect(current.check.getSnapshot()).toEqual({
    phase: 'ready',
    outcome: null,
  });
});

it('copies fixed summary fields without invoking getters or accepting raw metadata', () => {
  const value = summary();
  expect(copyPageErrorSummary(value)).toEqual(value);
  expect(copyPageErrorSummary(value)).not.toBe(value);
  let reads = 0;
  const getter = Object.defineProperty(summary(), 'scriptErrors', {
    get() {
      reads++;
      return 1;
    },
  });
  expect(copyPageErrorSummary(getter)).toBeNull();
  expect(copyPageErrorSummary({ ...value, message: 'SENSITIVE' })).toBeNull();
  expect(reads).toBe(0);
});

for (const value of [
  summary({ total: 9 }),
  summary({ scriptErrors: -1 }),
  summary({ scriptErrors: 0.5 }),
  summary({ observedMs: Number.POSITIVE_INFINITY }),
  summary({ observedMs: 30_001 }),
  summary({ finish: 'timeout', observedMs: 29_999 }),
  summary({ finish: 'limit' }),
  summary({ finish: 'stop', observedMs: 30_000 }),
]) {
  it(`rejects an inconsistent or unbounded summary ${JSON.stringify(value)}`, () => {
    expect(copyPageErrorSummary(value)).toBeNull();
  });
}

it('keeps maximal accepted summaries within the approved 1 KiB bound', () => {
  for (const value of [
    summary({ finish: 'timeout', observedMs: 30_000 }),
    summary({
      scriptErrors: 199,
      unhandledRejections: 1,
      total: 200,
      finish: 'limit',
      observedMs: 29_999.999999,
    }),
  ]) {
    const copy = copyPageErrorSummary(value);
    expect(copy).toEqual(value);
    expect(new TextEncoder().encode(JSON.stringify(copy)).length).toBeLessThan(
      pageErrorLimits.summaryBytes,
    );
  }
});

async function completedAttachment(value: PageErrorSummary = summary()) {
  const current = checkFixture();
  current.check.bindSource(17);
  const pending = current.check.start();
  current.observing();
  current.result.resolve({ status: 'success', value });
  await pending;
  const capture = current.check.getAttachmentCapture();
  if (!capture) throw new Error('Expected a confirmed attachment fixture');
  return { ...current, capture };
}

it('offers no attachment before a confirmed successful completion', async () => {
  const current = checkFixture();
  expect(current.check.getAttachmentCapture()).toBeNull();
  current.check.bindSource(17);
  expect(current.check.getAttachmentCapture()).toBeNull();
  const pending = current.check.start();
  expect(current.check.getAttachmentCapture()).toBeNull();
  current.observing();
  expect(current.check.getAttachmentCapture()).toBeNull();
  current.check.stop();
  expect(current.check.getAttachmentCapture()).toBeNull();
  current.result.resolve({ status: 'interrupted' });
  await pending;
  expect(current.check.getAttachmentCapture()).toBeNull();
  expect(current.check.isAttachmentUsed()).toBe(false);
});

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
  it(`offers an independent confirmed ${value.finish} summary with the original source binding`, async () => {
    const { check, capture } = await completedAttachment(value);
    expect(capture).toEqual({
      identity: check.identity,
      generation: check.getGeneration(),
      sourceTabId: 17,
      value,
    });
    expect(
      check.isAttachmentCurrent(capture.identity, capture.generation, 17),
    ).toBe(true);
    capture.value.scriptErrors = 87;
    capture.generation = 77;
    capture.sourceTabId = 18;
    expect(check.getAttachmentCapture()).toEqual({
      identity: check.identity,
      generation: check.getGeneration(),
      sourceTabId: 17,
      value,
    });
    expect(JSON.stringify(check.getSnapshot())).not.toContain('sourceTabId');
  });
}

it('uses a completed check once while retaining its readable summary and publishing a fresh snapshot', async () => {
  const { check, capture } = await completedAttachment();
  const before = check.getSnapshot();
  let publishedUsed = false;
  let publishedSnapshot = before;
  check.subscribe(() => {
    if (check.isAttachmentUsed()) {
      publishedUsed = true;
      publishedSnapshot = check.getSnapshot();
    }
  });
  expect(
    check.commitAttachment(
      capture.identity,
      capture.generation,
      capture.sourceTabId,
      (current) => current(),
    ),
  ).toBe(true);
  expect(check.isAttachmentUsed()).toBe(true);
  expect(check.getAttachmentCapture()).toBeNull();
  expect(
    check.isAttachmentCurrent(
      capture.identity,
      capture.generation,
      capture.sourceTabId,
    ),
  ).toBe(false);
  expect(publishedUsed).toBe(true);
  expect(publishedSnapshot).not.toBe(before);
  expect(publishedSnapshot).toEqual(before);
  expect(Object.keys(publishedSnapshot).sort()).toEqual(['outcome', 'phase']);
  const repeated = vi.fn(() => true);
  expect(
    check.commitAttachment(
      capture.identity,
      capture.generation,
      capture.sourceTabId,
      repeated,
    ),
  ).toBe(false);
  expect(repeated).not.toHaveBeenCalled();
});

it('rejects mismatched identity, generation or source without invoking the destination', async () => {
  const { check, capture } = await completedAttachment();
  const commit = vi.fn(() => true);
  expect(
    check.commitAttachment(crypto.randomUUID(), capture.generation, 17, commit),
  ).toBe(false);
  expect(
    check.commitAttachment(
      capture.identity,
      capture.generation + 1,
      17,
      commit,
    ),
  ).toBe(false);
  expect(
    check.commitAttachment(capture.identity, capture.generation, 18, commit),
  ).toBe(false);
  expect(commit).not.toHaveBeenCalled();
  expect(check.getAttachmentCapture()).not.toBeNull();
  expect(check.isAttachmentUsed()).toBe(false);
});

for (const failure of ['rejected', 'throws'] as const) {
  it(`keeps the result available after a destination ${failure} before commit`, async () => {
    const { check, capture } = await completedAttachment();
    const before = check.getSnapshot();
    expect(
      check.commitAttachment(
        capture.identity,
        capture.generation,
        17,
        (current) => {
          if (!current()) return false;
          if (failure === 'throws') throw new Error('Destination went away');
          return false;
        },
      ),
    ).toBe(false);
    expect(check.getAttachmentCapture()).toEqual(capture);
    expect(check.getSnapshot()).toBe(before);
    expect(check.isAttachmentUsed()).toBe(false);
  });
}

it('reserves the current attempt against nested confirmation and expires its synchronous guard', async () => {
  const { check, capture } = await completedAttachment();
  let savedGuard = () => false;
  let nested: boolean | undefined;
  expect(
    check.commitAttachment(
      capture.identity,
      capture.generation,
      17,
      (current) => {
        savedGuard = current;
        nested = check.commitAttachment(
          capture.identity,
          capture.generation,
          17,
          () => true,
        );
        expect(
          check.isAttachmentCurrent(capture.identity, capture.generation, 17),
        ).toBe(false);
        expect(check.getAttachmentCapture()).toBeNull();
        return current();
      },
    ),
  ).toBe(true);
  expect(nested).toBe(false);
  expect(savedGuard()).toBe(false);
  expect(check.isAttachmentUsed()).toBe(true);
});

it('does not revive a retained guard during a later reservation for the same generation', async () => {
  const { check, capture } = await completedAttachment();
  let previous = () => false;
  check.commitAttachment(
    capture.identity,
    capture.generation,
    17,
    (current) => {
      previous = current;
      return false;
    },
  );
  let observedPrevious: boolean | undefined;
  expect(
    check.commitAttachment(
      capture.identity,
      capture.generation,
      17,
      (current) => {
        observedPrevious = previous();
        return current();
      },
    ),
  ).toBe(true);
  expect(observedPrevious).toBe(false);
});

for (const reset of [
  'clear',
  'startOver',
  'dispose',
  'unsubscribe',
  'scripting',
  'management',
] as const) {
  it(`${reset} invalidates the reserved old capture before destination commit`, async () => {
    const current = await completedAttachment();
    const { check, capture } = current;
    expect(
      check.commitAttachment(
        capture.identity,
        capture.generation,
        17,
        (guard) => {
          if (reset === 'unsubscribe') current.unsubscribe();
          else if (reset === 'scripting' || reset === 'management')
            current.revoke(reset);
          else check[reset]();
          return guard();
        },
      ),
    ).toBe(false);
    expect(check.getGeneration()).toBeGreaterThan(capture.generation);
    expect(check.getAttachmentCapture()).toBeNull();
    expect(check.isAttachmentUsed()).toBe(false);
    expect(check.getSnapshot()).toEqual({
      phase: reset === 'dispose' ? 'unbound' : 'ready',
      outcome: null,
    });
  });
}

it('never consumes the fresh attempt started while an older reservation is invalidated', async () => {
  const { check, driver, capture } = await completedAttachment();
  const nextValue = summary({
    scriptErrors: 2,
    unhandledRejections: 0,
    total: 2,
    observedMs: 25,
  });
  vi.spyOn(driver, 'start').mockResolvedValueOnce({
    status: 'success',
    value: nextValue,
  });
  let next: Promise<void> | undefined;
  expect(
    check.commitAttachment(
      capture.identity,
      capture.generation,
      17,
      (current) => {
        check.startOver();
        next = check.start();
        return current();
      },
    ),
  ).toBe(false);
  await next;
  const fresh = check.getAttachmentCapture();
  expect(fresh?.generation).toBeGreaterThan(capture.generation);
  expect(fresh?.value).toEqual(nextValue);
  expect(check.isAttachmentUsed()).toBe(false);
  expect(
    check.commitAttachment(
      capture.identity,
      capture.generation,
      17,
      () => true,
    ),
  ).toBe(false);
});

it('keeps a committed capture used and notifies other subscribers when one view subscriber throws', async () => {
  const { check, capture } = await completedAttachment();
  check.subscribe(() => {
    if (check.isAttachmentUsed()) throw new Error('A view subscriber failed');
  });
  let observedUsed = false;
  check.subscribe(() => {
    observedUsed = check.isAttachmentUsed();
  });
  expect(
    check.commitAttachment(
      capture.identity,
      capture.generation,
      17,
      (current) => current(),
    ),
  ).toBe(true);
  expect(observedUsed).toBe(true);
  expect(check.isAttachmentUsed()).toBe(true);
  expect(check.getAttachmentCapture()).toBeNull();
});

it('does not overwrite a fresh attempt started by a post-commit subscriber', async () => {
  const { check, driver, capture } = await completedAttachment();
  const nextValue = summary({
    scriptErrors: 0,
    unhandledRejections: 0,
    total: 0,
  });
  vi.spyOn(driver, 'start').mockResolvedValueOnce({
    status: 'success',
    value: nextValue,
  });
  let reset = false;
  let next: Promise<void> | undefined;
  check.subscribe(() => {
    if (check.isAttachmentUsed() && !reset) {
      reset = true;
      check.startOver();
      next = check.start();
    }
  });
  expect(
    check.commitAttachment(
      capture.identity,
      capture.generation,
      17,
      (current) => current(),
    ),
  ).toBe(true);
  await next;
  expect(reset).toBe(true);
  expect(check.isAttachmentUsed()).toBe(false);
  expect(check.getAttachmentCapture()?.value).toEqual(nextValue);
  expect(check.getGeneration()).toBeGreaterThan(capture.generation);
});

it('does not invoke payload getters or return a capture erased while its summary is copied', async () => {
  const getter = await completedAttachment();
  const outcome = getter.check.getSnapshot().outcome;
  if (outcome?.status !== 'success')
    throw new Error('Missing confirmed result');
  let reads = 0;
  Object.defineProperty(outcome.value, 'scriptErrors', {
    get() {
      reads++;
      return 1;
    },
  });
  expect(getter.check.getAttachmentCapture()).toBeNull();
  expect(reads).toBe(0);

  const stale = await completedAttachment();
  const before = stale.check.getSnapshot().outcome;
  if (before?.status !== 'success') throw new Error('Missing confirmed result');
  before.value = new Proxy(summary(), {
    ownKeys(target) {
      stale.check.clear();
      return Reflect.ownKeys(target);
    },
  });
  expect(stale.check.getAttachmentCapture()).toBeNull();
  expect(stale.check.getSnapshot()).toEqual({ phase: 'ready', outcome: null });
});

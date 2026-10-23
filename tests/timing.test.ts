import { afterEach, expect, it, vi } from 'bun:test';
import { collectPageObservation } from '../lib/inspector';

const originalGlobals = ['document', 'performance', 'PerformanceObserver'].map(
  (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
);

afterEach(() => {
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

function environment(navigation: unknown[] = [], paint: unknown[] = []) {
  const timeline = {
    getEntriesByType: vi.fn((type: string) =>
      type === 'navigation' ? navigation : [],
    ),
    getEntriesByName: vi.fn((name: string, type: string) =>
      name === 'first-contentful-paint' && type === 'paint' ? paint : [],
    ),
  };
  for (const [name, value] of [
    ['document', { readyState: 'complete' }],
    ['performance', timeline],
    ['PerformanceObserver', { supportedEntryTypes: ['navigation', 'paint'] }],
  ] as const) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  return timeline;
}

it('returns only the three approved milestones, preserving fractional elapsed values', () => {
  const timeline = environment(
    [{ domContentLoadedEventEnd: 153.125, loadEventEnd: 271.75 }],
    [{ startTime: 98.5 }],
  );
  expect(collectPageObservation()).toEqual({
    readyState: 'complete',
    performanceEntryTypes: ['navigation', 'paint'],
    timings: {
      domContentLoaded: { status: 'measured', milliseconds: 153.125 },
      loadEvent: { status: 'measured', milliseconds: 271.75 },
      firstContentfulPaint: { status: 'measured', milliseconds: 98.5 },
    },
  });
  expect(timeline.getEntriesByType.mock.calls).toEqual([['navigation']]);
  expect(timeline.getEntriesByName.mock.calls).toEqual([
    ['first-contentful-paint', 'paint'],
  ]);
});

it('distinguishes zero event-end values from a reported zero paint timestamp', () => {
  environment(
    [{ domContentLoadedEventEnd: 0, loadEventEnd: 0 }],
    [{ startTime: 0 }],
  );
  expect(collectPageObservation().timings).toEqual({
    domContentLoaded: { status: 'unrecorded' },
    loadEvent: { status: 'unrecorded' },
    firstContentfulPaint: { status: 'measured', milliseconds: 0 },
  });
});

it('keeps missing entries unavailable even when their entry types are supported', () => {
  environment();
  expect(collectPageObservation().timings).toEqual({
    domContentLoaded: { status: 'unavailable' },
    loadEvent: { status: 'unavailable' },
    firstContentfulPaint: { status: 'unavailable' },
  });
});

it('keeps the largest allowed timing values within the fixed timing-block budget', () => {
  environment(
    [
      {
        domContentLoadedEventEnd: Number.MAX_SAFE_INTEGER,
        loadEventEnd: Number.MAX_SAFE_INTEGER,
      },
    ],
    [{ startTime: Number.MAX_SAFE_INTEGER }],
  );
  const timings = collectPageObservation().timings;
  expect(timings.loadEvent).toEqual({
    status: 'measured',
    milliseconds: Number.MAX_SAFE_INTEGER,
  });
  expect(Buffer.byteLength(JSON.stringify(timings))).toBeLessThanOrEqual(1024);
});

it('does not require performance APIs to preserve document readiness', () => {
  environment();
  Object.defineProperty(globalThis, 'performance', { value: undefined });
  Object.defineProperty(globalThis, 'PerformanceObserver', {
    value: undefined,
  });
  expect(collectPageObservation()).toEqual({
    readyState: 'complete',
    performanceEntryTypes: null,
    timings: {
      domContentLoaded: { status: 'unavailable' },
      loadEvent: { status: 'unavailable' },
      firstContentfulPaint: { status: 'unavailable' },
    },
  });
});

it('does not read entry names, page content, or entry serialization methods', () => {
  const forbidden = () => {
    throw new Error('This property is outside the collection boundary');
  };
  const entry = {
    startTime: 8,
    domContentLoadedEventEnd: 12,
    loadEventEnd: 24,
    get name() {
      return forbidden();
    },
    toJSON: forbidden,
    secret: 'https://private.invalid/?token=private-page-content',
  };
  environment([entry], [entry]);
  const result = collectPageObservation();
  expect(JSON.stringify(result)).not.toContain('private');
  expect(Object.keys(result.timings)).toEqual([
    'domContentLoaded',
    'loadEvent',
    'firstContentfulPaint',
  ]);
  expect(Buffer.byteLength(JSON.stringify(result.timings))).toBeLessThanOrEqual(
    1024,
  );
});

it.each([-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '12', null])(
  'refuses an invalid timing instead of coercing it: %j',
  (value) => {
    environment([{ domContentLoadedEventEnd: value, loadEventEnd: 12 }]);
    expect(() => collectPageObservation()).toThrow();
  },
);

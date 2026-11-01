import { beforeEach, expect, it, vi } from 'bun:test';
import type { SavedBrowser } from '../lib/saved-context';
import type { SavedExportSource } from '../lib/saved-export';
import { createSavedExport } from '../lib/saved-export';
import { pageErrorLimits } from '../lib/page-error-check';
import {
  serializeExchange,
  SAVED_RETENTION_MS,
  type SavedRecord,
} from '../lib/saved-record';
import type {
  SavedStore,
  SavedStoreEntry,
  SavedStoreState,
} from '../lib/saved-store';

const key = '11111111-1111-1111-1111-111111111111';
const now = Date.now();

function record(overrides: Partial<SavedRecord> = {}): SavedRecord {
  return {
    schemaVersion: 1,
    recordId: key,
    origin: 'captured',
    savedAt: now,
    expiresAt: now + SAVED_RETENTION_MS,
    report: {
      before: {
        extensions: [{ name: 'Example', version: '1.0', enabled: true }],
      },
      after: {
        extensions: [{ name: 'Example', version: '1.0', enabled: false }],
      },
      changes: [
        { kind: 'disabled', name: 'Example', version: '1.0', enabled: false },
      ],
      assessment: 'worse',
      timing: {
        before: null,
        after: {
          domContentLoaded: { status: 'measured', milliseconds: 12.5 },
          loadEvent: { status: 'unrecorded' },
          firstContentfulPaint: { status: 'unavailable' },
        },
      },
      pageErrors: {
        before: null,
        after: {
          scriptErrors: 1,
          unhandledRejections: 0,
          total: 1,
          finish: 'stop',
          observedMs: 1200,
        },
      },
      observationLimits: {
        pageErrorWindowMs: pageErrorLimits.durationMs,
        pageErrorEvents: pageErrorLimits.events,
        pageErrorSummaryBytes: pageErrorLimits.summaryBytes,
      },
    },
    ...overrides,
  };
}

class MemoryStore implements SavedStore {
  state: SavedStoreState = { storeId: 'store-identity-0123456789', epoch: 0 };
  entries = new Map<IDBValidKey, unknown>([[key, record()]]);
  getCalls = 0;
  getWait: Promise<void> | null = null;
  getStarted = Promise.withResolvers<void>();
  failGet: Error | null = null;
  async ready() {
    return this.state;
  }
  async readState() {
    return this.state;
  }
  async list(): Promise<SavedStoreEntry[]> {
    return [...this.entries].map(([entryKey, value]) => ({
      key: entryKey,
      value,
    }));
  }
  async get(entryKey: IDBValidKey) {
    this.getCalls += 1;
    this.getStarted.resolve();
    if (this.getWait) await this.getWait;
    if (this.failGet) throw this.failGet;
    return this.entries.get(entryKey);
  }
  async save(): Promise<never> {
    throw new Error('Saved export must never save');
  }
  async delete() {
    throw new Error('Saved export must never delete');
  }
  async deleteMany() {
    throw new Error('Saved export must never delete');
  }
  async deleteAll() {
    throw new Error('Saved export must never delete');
  }
  close() {}
}

function fixture({ normal = true }: { normal?: boolean } = {}) {
  const store = new MemoryStore();
  const subscribers = new Set<() => void>();
  let snapshot = {
    phase: 'ready' as const,
    selected: record() as SavedRecord | null,
    selectedKey: key as IDBValidKey | null,
    busy: false,
  };
  const source: SavedExportSource = {
    getSnapshot: () => snapshot,
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
  const publish = (next: Partial<typeof snapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const subscriber of subscribers) subscriber();
  };
  const context = { normal };
  const api = {
    tabs: {
      getCurrent: vi.fn<SavedBrowser['tabs']['getCurrent']>(async () =>
        context.normal ? { incognito: false } : { incognito: true },
      ),
    },
  };
  const handoff = vi.fn<(json: string) => void>();
  const exporter = createSavedExport(api, store, source, handoff);
  return {
    store,
    api,
    handoff,
    exporter,
    context,
    publish,
    select(selected: SavedRecord | null, selectedKey: IDBValidKey | null) {
      publish({ selected, selectedKey });
    },
  };
}

beforeEach(() => vi.restoreAllMocks());

it('prepares the exact stored JSON and hands it off only after a fresh read', async () => {
  const { store, api, handoff, exporter } = fixture();
  await exporter.prepare();
  const expected = serializeExchange(record());
  expect(exporter.getSnapshot()).toEqual({
    preview: expected,
    busy: false,
    message: null,
  });
  const parsed = JSON.parse(expected) as Record<string, unknown>;
  expect(Object.keys(parsed)).toEqual([
    'schemaVersion',
    'provenance',
    'report',
  ]);
  expect(expected).not.toContain('recordId');
  expect(expected).not.toContain('savedAt');
  expect(expected).not.toContain('expiresAt');
  expect(handoff).not.toHaveBeenCalled();
  await exporter.download();
  expect(handoff.mock.calls).toEqual([[expected]]);
  expect(store.getCalls).toBe(2);
  expect(api.tabs.getCurrent).toHaveBeenCalledTimes(4);
  expect(exporter.getSnapshot().message).toContain('Download requested');
  expect(exporter.getSnapshot().preview).toBe(expected);
});

for (const context of ['private', 'unknown'] as const) {
  it(`fails closed in a ${context} context before touching saved storage`, async () => {
    const { store, exporter, api } = fixture();
    api.tabs.getCurrent.mockResolvedValue(
      context === 'private' ? { incognito: true } : undefined,
    );
    await exporter.prepare();
    expect(exporter.getSnapshot()).toMatchObject({
      preview: null,
      busy: false,
      message:
        'Saved archive export is available only in verified normal windows.',
    });
    expect(store.getCalls).toBe(0);
    expect(api.tabs.getCurrent).toHaveBeenCalledTimes(1);
  });
}

it('fails closed when the context check throws', async () => {
  const { api, store, exporter } = fixture();
  api.tabs.getCurrent.mockRejectedValue(new Error('SECRET_CONTEXT'));
  await exporter.prepare();
  expect(exporter.getSnapshot().busy).toBe(false);
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().message).not.toContain('SECRET');
  expect(store.getCalls).toBe(0);
});

it('rejects deleted, expired, unsupported, invalid and changed records', async () => {
  const cases: Array<{
    value: unknown | undefined;
    message: string;
  }> = [
    { value: undefined, message: 'no longer available' },
    {
      value: record({ savedAt: now - 2000, expiresAt: now - 1 }),
      message: 'expired',
    },
    { value: { ...record(), schemaVersion: 2 }, message: 'Unsupported' },
    { value: { ...record(), extra: true }, message: 'unreadable' },
  ];
  for (const current of cases) {
    const { store, exporter, handoff } = fixture();
    if (current.value === undefined) store.entries.clear();
    else store.entries.set(key, current.value);
    await exporter.prepare();
    expect(exporter.getSnapshot().busy).toBe(false);
    expect(exporter.getSnapshot().preview).toBeNull();
    expect(exporter.getSnapshot().message).toContain(current.message);
    await exporter.download();
    expect(handoff).not.toHaveBeenCalled();
  }
});

it('rejects deletion and expiry between preview and download', async () => {
  for (const change of ['delete', 'expire', 'replace'] as const) {
    const { store, exporter, handoff } = fixture();
    await exporter.prepare();
    expect(exporter.getSnapshot().preview).not.toBeNull();
    if (change === 'delete') store.entries.clear();
    if (change === 'expire')
      store.entries.set(
        key,
        record({ savedAt: Date.now() - 2000, expiresAt: Date.now() - 1 }),
      );
    if (change === 'replace')
      store.entries.set(
        key,
        record({
          report: {
            ...record().report,
            assessment: 'better',
          },
        }),
      );
    await exporter.download();
    expect(handoff).not.toHaveBeenCalled();
    expect(exporter.getSnapshot().busy).toBe(false);
    expect(exporter.getSnapshot().preview).toBeNull();
    expect(exporter.getSnapshot().message).toMatch(
      /no longer available|expired|changed|prepare/i,
    );
  }
});

for (const interruption of [
  'cancel',
  'dispose',
  'selection',
  'context',
] as const) {
  it(`does not publish a preview after ${interruption} during a deferred read`, async () => {
    const { store, exporter, publish, context } = fixture();
    const held = Promise.withResolvers<void>();
    store.getWait = held.promise;
    const pending = exporter.prepare();
    await store.getStarted.promise;
    if (interruption === 'cancel') exporter.cancel();
    if (interruption === 'dispose') exporter.dispose();
    if (interruption === 'selection')
      publish({ selected: null, selectedKey: null });
    if (interruption === 'context') context.normal = false;
    held.resolve();
    await pending;
    expect(exporter.getSnapshot().preview).toBeNull();
    expect(exporter.getSnapshot().busy).toBe(false);
  });
}

it('does not hand off after selection or context changes during a deferred download read', async () => {
  for (const interruption of [
    'selection',
    'context',
    'expire',
    'delete',
    'cancel',
  ] as const) {
    const { store, exporter, handoff, publish, context } = fixture();
    await exporter.prepare();
    const held = Promise.withResolvers<void>();
    store.getWait = held.promise;
    store.getStarted = Promise.withResolvers<void>();
    const pending = exporter.download();
    await store.getStarted.promise;
    if (interruption === 'selection')
      publish({ selected: null, selectedKey: null });
    if (interruption === 'context') context.normal = false;
    if (interruption === 'expire')
      store.entries.set(
        key,
        record({ savedAt: Date.now() - 2000, expiresAt: Date.now() - 1 }),
      );
    if (interruption === 'delete') store.entries.clear();
    if (interruption === 'cancel') exporter.cancel();
    held.resolve();
    await pending;
    expect(handoff).not.toHaveBeenCalled();
    expect(exporter.getSnapshot().preview).toBeNull();
    expect(exporter.getSnapshot().busy).toBe(false);
  }
});

it('discards a preview when the selected archive changes or disappears', async () => {
  const { exporter, select } = fixture();
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).not.toBeNull();
  select(null, null);
  expect(exporter.getSnapshot().preview).toBeNull();
});

it('returns bounded storage and handoff failures without claiming success', async () => {
  const { store, exporter, handoff } = fixture();
  store.failGet = new Error('SECRET_STORAGE');
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().busy).toBe(false);
  expect(exporter.getSnapshot().message).not.toContain('SECRET');
  store.failGet = null;
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  handoff.mockImplementation(() => {
    throw new Error('SECRET_DOWNLOAD');
  });
  await exporter.download();
  expect(exporter.getSnapshot().preview).toBe(reviewed);
  expect(exporter.getSnapshot().busy).toBe(false);
  expect(exporter.getSnapshot().message).toContain('could not be requested');
  expect(exporter.getSnapshot().message).not.toContain('SECRET');
  expect(exporter.getSnapshot().message).not.toContain('Download requested');
});

it('refuses preparation while the library reports another action in progress', async () => {
  const { store, exporter, publish } = fixture();
  publish({ busy: true });
  await exporter.prepare();
  expect(exporter.getSnapshot()).toMatchObject({
    preview: null,
    busy: false,
    message: 'Another saved-history action is in progress. Try again.',
  });
  expect(store.getCalls).toBe(0);
});

it('refuses download while the library reports another action in progress', async () => {
  const { exporter, handoff, publish, store } = fixture();
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  publish({ busy: true });
  await exporter.download();
  expect(handoff).not.toHaveBeenCalled();
  expect(store.getCalls).toBe(1);
  expect(exporter.getSnapshot().preview).toBe(reviewed);
  expect(exporter.getSnapshot().message).toContain(
    'Another saved-history action is in progress.',
  );
});

it('refuses download when no preview was prepared', async () => {
  const { exporter, handoff, store } = fixture();
  await exporter.download();
  expect(handoff).not.toHaveBeenCalled();
  expect(store.getCalls).toBe(0);
});

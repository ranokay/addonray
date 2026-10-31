import { beforeEach, expect, it, vi } from 'bun:test';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from './browser';
import { firefoxContext } from '../lib/browser-target';
import { createInvestigation } from '../lib/investigation';
import { createSavedSave, type SavedSaveBrowser } from '../lib/saved-save';
import { SavedStoreError } from '../lib/saved-store';
import type {
  SavedStore,
  SavedStoreEntry,
  SavedStoreSaveResult,
  SavedStoreState,
} from '../lib/saved-store';
import type { SavedRecord } from '../lib/saved-record';
import type { TimingSnapshot } from '../lib/inspector';

const timings: TimingSnapshot = {
  domContentLoaded: { status: 'measured', milliseconds: 10 },
  loadEvent: { status: 'unrecorded' },
  firstContentfulPaint: { status: 'unavailable' },
};

class MemoryStore implements SavedStore {
  state: SavedStoreState = {
    storeId: 'store-identity-0123456789',
    epoch: 0,
  };
  records = new Map<IDBValidKey, SavedRecord>();
  saveCalls = 0;
  readyCalls = 0;
  readyError: Error | null = null;
  result: SavedStoreSaveResult | null = null;
  pending: Promise<SavedStoreSaveResult> | null = null;
  started = Promise.withResolvers<void>();

  async ready() {
    this.readyCalls += 1;
    if (this.readyError) throw this.readyError;
    return this.state;
  }
  async readState() {
    return this.state;
  }
  async list(): Promise<SavedStoreEntry[]> {
    return [...this.records].map(([key, value]) => ({ key, value }));
  }
  async get(key: IDBValidKey) {
    return this.records.get(key);
  }
  async save(
    record: SavedRecord,
    expected: SavedStoreState,
    signal?: AbortSignal,
  ) {
    this.saveCalls += 1;
    this.started.resolve();
    if (this.pending) {
      signal?.addEventListener(
        'abort',
        () => {
          this.pending?.then(() => {});
        },
        { once: true },
      );
      return this.pending;
    }
    if (expected.storeId !== this.state.storeId) return 'stale-store';
    if (expected.epoch !== this.state.epoch) return 'stale';
    if (this.result) return this.result;
    this.records.set(record.recordId, record);
    return 'saved';
  }
  async delete(key: IDBValidKey) {
    this.records.delete(key);
    this.state = { ...this.state, epoch: this.state.epoch + 1 };
  }
  close() {}
}

function api(overrides: Partial<SavedSaveBrowser> = {}): SavedSaveBrowser {
  return {
    tabs: {
      getCurrent: vi.fn(async () => ({ incognito: false })),
    },
    permissions: {
      contains: vi.fn(async () => true),
    },
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

async function fixture({
  complete = true,
  timing = false,
  currentApi = api(),
  store = new MemoryStore(),
}: {
  complete?: boolean;
  timing?: boolean;
  currentApi?: SavedSaveBrowser;
  store?: MemoryStore;
} = {}) {
  vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
  vi.spyOn(browser.management, 'getAll').mockResolvedValue([]);
  const model = createInvestigation(browser, firefoxContext);
  const notifier = { notify: vi.fn() };
  const saver = createSavedSave(
    currentApi,
    model,
    store,
    notifier,
    firefoxContext,
  );
  await saver.ready;
  if (complete) {
    await model.captureBefore();
    if (timing)
      model.attachTiming('before', 42, timings, model.getGeneration());
    await model.captureAfter();
  }
  return { model, store, notifier, saver, currentApi };
}

it('does not save automatically and refuses an incomplete investigation', async () => {
  const { store, saver } = await fixture({ complete: false });
  expect(store.saveCalls).toBe(0);
  await saver.save();
  expect(store.saveCalls).toBe(0);
  expect(saver.getSnapshot().message).toBe(
    'Capture both inventories before saving.',
  );
});

it('saves a completed investigation and keeps the live pair', async () => {
  const { model, store, notifier, saver, currentApi } = await fixture({
    timing: true,
  });
  const before = model.getSnapshot();
  await saver.save();
  expect(store.saveCalls).toBe(1);
  expect(store.records.size).toBe(1);
  const record = [...store.records.values()][0]!;
  expect(record.report.before.extensions).toHaveLength(0);
  expect(JSON.stringify(record)).not.toContain('fixture@test');
  expect(record.report.timing.before).toEqual(timings);
  expect(model.getSnapshot()).toBe(before);
  expect(notifier.notify).toHaveBeenCalledTimes(1);
  expect(saver.getSnapshot().message).toContain('Saved locally.');
  expect(currentApi.permissions.contains).toHaveBeenLastCalledWith({
    permissions: ['management', 'scripting'],
  });
});

it('retries a failed initial storage check once without autosaving or losing the live pair', async () => {
  const store = new MemoryStore();
  store.readyError = new SavedStoreError(
    'blocked',
    'Saved storage is blocked.',
  );
  const { saver, model } = await fixture({ store });
  const before = model.getSnapshot();
  expect(saver.getSnapshot().ready).toBe(false);
  expect(saver.getSnapshot().message).toContain('blocked');
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  store.readyError = null;
  const readiness = vi
    .spyOn(store, 'ready')
    .mockImplementationOnce(async () => {
      started.resolve();
      await pending.promise;
      return store.state;
    });
  const first = saver.retryStorage();
  const second = saver.retryStorage();
  await started.promise;
  expect(readiness).toHaveBeenCalledTimes(1);
  expect(saver.getSnapshot().ready).toBe(false);
  pending.resolve();
  await Promise.all([first, second]);
  expect(saver.getSnapshot().ready).toBe(true);
  expect(store.saveCalls).toBe(0);
  expect(model.getSnapshot()).toBe(before);
  await saver.save();
  expect(store.records.size).toBe(1);
});

it('keeps a failed readiness retry bounded and preserves the live investigation', async () => {
  const store = new MemoryStore();
  store.readyError = new SavedStoreError('timeout', 'Saved storage timed out.');
  const { saver, model } = await fixture({ store });
  const before = model.getSnapshot();
  await saver.retryStorage();
  expect(store.readyCalls).toBe(2);
  expect(saver.getSnapshot()).toMatchObject({
    ready: false,
    busy: false,
    message: 'Saved storage timed out.',
  });
  expect(store.saveCalls).toBe(0);
  expect(model.getSnapshot()).toBe(before);
});

it('does not open storage after disposal during a retry context check', async () => {
  const store = new MemoryStore();
  store.readyError = new SavedStoreError('timeout', 'Saved storage timed out.');
  const { saver, currentApi } = await fixture({ store });
  const context = Promise.withResolvers<{ incognito: boolean }>();
  const started = Promise.withResolvers<void>();
  currentApi.tabs.getCurrent = vi.fn(() => {
    started.resolve();
    return context.promise;
  });
  const retrying = saver.retryStorage();
  await started.promise;
  saver.dispose();
  context.resolve({ incognito: false });
  await retrying;
  expect(store.readyCalls).toBe(1);
  expect(store.saveCalls).toBe(0);
  expect(saver.getSnapshot().ready).toBe(false);
});

it('offers storage retry after a lost connection without retrying the failed save', async () => {
  const { saver, model, store } = await fixture();
  const before = model.getSnapshot();
  vi.spyOn(store, 'readState').mockRejectedValueOnce(
    new SavedStoreError('unavailable', 'Saved storage is unavailable.'),
  );
  await saver.save();
  expect(saver.getSnapshot().ready).toBe(false);
  expect(saver.getSnapshot().message).toContain('Retry saved storage');
  await saver.retryStorage();
  expect(saver.getSnapshot().ready).toBe(true);
  expect(store.saveCalls).toBe(0);
  expect(model.getSnapshot()).toBe(before);
  await saver.save();
  expect(store.records.size).toBe(1);
});

it('reports a committed save even when the optional hint throws', async () => {
  vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
  vi.spyOn(browser.management, 'getAll').mockResolvedValue([]);
  const model = createInvestigation(browser, firefoxContext);
  await model.captureBefore();
  await model.captureAfter();
  const store = new MemoryStore();
  const saver = createSavedSave(
    api(),
    model,
    store,
    {
      notify() {
        throw new Error('hint failed');
      },
    },
    firefoxContext,
  );
  await saver.ready;
  await saver.save();
  expect(store.records.size).toBe(1);
  expect(saver.getSnapshot().message).toContain('Saved locally.');
});

it('creates a separate record for each explicit save', async () => {
  const { store, saver } = await fixture();
  await saver.save();
  await saver.save();
  expect(store.records.size).toBe(2);
  expect(new Set([...store.records.keys()]).size).toBe(2);
});

it('refuses to overlap a pending capture, attachment or report action', async () => {
  const { model, store, saver } = await fixture();
  const lease = model.activity.tryBegin('report');
  await saver.save();
  expect(store.saveCalls).toBe(0);
  expect(saver.getSnapshot().message).toContain('Another investigation action');
  lease?.release();
});

it('refuses private and unknown contexts before opening storage', async () => {
  for (const tab of [{ incognito: true }, undefined]) {
    const currentApi = api({
      tabs: { getCurrent: vi.fn(async () => tab) },
    });
    const { model, store, saver } = await fixture({ currentApi });
    const before = model.getSnapshot();
    expect(store.readyCalls).toBe(0);
    await saver.save();
    expect(store.saveCalls).toBe(0);
    expect(model.getSnapshot()).toBe(before);
    expect(saver.getSnapshot().message).toContain('verified normal windows');
  }
});

it('clears the live investigation when access is no longer granted', async () => {
  const currentApi = api({
    permissions: { contains: vi.fn(async () => false) },
  });
  const { model, store, saver } = await fixture({ currentApi });
  await saver.save();
  expect(store.saveCalls).toBe(0);
  expect(model.getSnapshot().before).toBeNull();
  expect(saver.getSnapshot().message).toContain(
    'Access changed. The investigation was cleared.',
  );
});

it('cancels a pending save when the investigation resets', async () => {
  const { model, store, saver } = await fixture();
  const pending = Promise.withResolvers<SavedStoreSaveResult>();
  store.pending = pending.promise;
  const saving = saver.save();
  await store.started.promise;
  model.startOver();
  pending.resolve('cancelled');
  await saving;
  expect(store.records.size).toBe(0);
  expect(saver.getSnapshot().message).toContain(
    'The investigation changed before the save completed.',
  );
  expect(model.getSnapshot().before).toBeNull();
});

it('refuses when normal context is lost during the permission wait', async () => {
  const grant = Promise.withResolvers<boolean>();
  const permissionStarted = Promise.withResolvers<void>();
  let tabCalls = 0;
  const currentApi = api({
    tabs: {
      getCurrent: vi.fn(async () => {
        tabCalls += 1;
        return { incognito: tabCalls >= 3 };
      }),
    },
    permissions: {
      contains: vi.fn(() => {
        permissionStarted.resolve();
        return grant.promise;
      }),
    },
  });
  const { model, store, saver } = await fixture({ currentApi });
  const before = model.getSnapshot();
  const pending = saver.save();
  await permissionStarted.promise;
  grant.resolve(true);
  await pending;
  expect(store.saveCalls).toBe(0);
  expect(model.getSnapshot()).toBe(before);
  expect(saver.getSnapshot().message).toContain('verified normal windows');
});

it('cancels when the investigation resets during the permission wait', async () => {
  const grant = Promise.withResolvers<boolean>();
  const permissionStarted = Promise.withResolvers<void>();
  const currentApi = api({
    permissions: {
      contains: vi.fn(() => {
        permissionStarted.resolve();
        return grant.promise;
      }),
    },
  });
  const { model, store, saver } = await fixture({ currentApi });
  const pending = saver.save();
  await permissionStarted.promise;
  model.startOver();
  grant.resolve(true);
  await pending;
  expect(store.saveCalls).toBe(0);
  expect(saver.getSnapshot().message).toContain(
    'investigation changed before the save completed',
  );
});

it('releases the save lease when the barrier times out', async () => {
  const { model, store, saver } = await fixture();
  store.readState = async () => {
    throw new SavedStoreError('timeout', 'Saved storage timed out.');
  };
  await saver.save();
  expect(saver.getSnapshot().message).toContain('Saved storage timed out.');
  const lease = model.activity.tryBegin('save');
  expect(lease).not.toBeNull();
  lease?.release();
});

it('removes page permission requirements when no page data is attached', async () => {
  const { saver, currentApi } = await fixture();
  await saver.save();
  expect(currentApi.permissions.contains).toHaveBeenLastCalledWith({
    permissions: ['management'],
  });
});

it('reports quota, timeout and size failures without discarding live results', async () => {
  const cases = [
    ['quota', 'quota was exceeded'],
    ['timeout', 'did not respond'],
    ['records', '50 saved records'],
    ['record', '1 mib saved-record limit'],
    ['total', '5 mib limit'],
    ['exhausted', 'deletion counter is exhausted'],
    ['stale', 'local storage changed'],
    ['stale-store', 'local storage changed'],
    ['cancelled', 'cancelled'],
    ['unavailable', 'storage is unavailable'],
    ['duplicate', 'already exists'],
  ] as const;
  for (const [result, message] of cases) {
    const { model, store, saver } = await fixture();
    store.result = result;
    const before = model.getSnapshot();
    await saver.save();
    expect(store.records.size).toBe(0);
    expect(model.getSnapshot()).toBe(before);
    expect(saver.getSnapshot().message?.toLowerCase()).toContain(message);
  }
});

it('refuses an oversized record before opening a storage transaction', async () => {
  vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
  vi.spyOn(browser.management, 'getAll').mockResolvedValue([]);
  const model = createInvestigation(browser, firefoxContext);
  await model.captureBefore();
  await model.captureAfter();
  // Replace the captured pair with large, valid strings.
  const large = Array.from({ length: 300 }, (_, index) => ({
    id: `large-${index}`,
    name: `${String(index).padStart(4, '0')}-${'x'.repeat(4092)}`,
    version: '1',
    enabled: true,
  }));
  const current = model.getSnapshot();
  const mutated = {
    ...current,
    before: { status: 'success' as const, value: large },
    after: { status: 'success' as const, value: large },
  };
  Object.defineProperty(model, 'getSnapshot', { value: () => mutated });
  const store = new MemoryStore();
  const saver = createSavedSave(api(), model, store, undefined, firefoxContext);
  await saver.ready;
  await saver.save();
  expect(store.saveCalls).toBe(0);
  expect(saver.getSnapshot().message).toContain('1 MiB');
});

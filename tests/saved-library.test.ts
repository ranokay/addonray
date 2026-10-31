import { expect, it, vi } from 'bun:test';
import {
  createSavedLibrary,
  type SavedLibraryHint,
} from '../lib/saved-library';
import type { SavedBrowser } from '../lib/saved-context';
import type {
  SavedStore,
  SavedStoreEntry,
  SavedStoreState,
} from '../lib/saved-store';
import { SAVED_RETENTION_MS, type SavedRecord } from '../lib/saved-record';
import { pageErrorLimits } from '../lib/page-error-check';

const now = Date.now();

function record(id: string, savedAt = now): SavedRecord {
  return {
    schemaVersion: 1,
    recordId: id,
    origin: 'captured',
    savedAt,
    expiresAt: savedAt + SAVED_RETENTION_MS,
    report: {
      before: { extensions: [] },
      after: { extensions: [] },
      changes: [],
      assessment: null,
      timing: { before: null, after: null },
      pageErrors: { before: null, after: null },
      observationLimits: {
        pageErrorWindowMs: pageErrorLimits.durationMs,
        pageErrorEvents: pageErrorLimits.events,
        pageErrorSummaryBytes: pageErrorLimits.summaryBytes,
      },
    },
  };
}

const validId = '11111111-1111-1111-1111-111111111111';
const expiredId = '22222222-2222-2222-2222-222222222222';

class MemoryStore implements SavedStore {
  state: SavedStoreState = {
    storeId: 'store-identity-0123456789',
    epoch: 0,
  };
  entries = new Map<IDBValidKey, unknown>();
  listCalls = 0;
  getCalls = 0;
  deleteCalls: IDBValidKey[] = [];
  deleteManyCalls: IDBValidKey[][] = [];
  deleteAllCalls = 0;
  failList: Error | null = null;
  failDelete: Error | null = null;
  listWait: Promise<void> | null = null;
  getWait: Promise<void> | null = null;
  listStarted = Promise.withResolvers<void>();
  getStarted = Promise.withResolvers<void>();

  async ready() {
    return this.state;
  }
  async readState() {
    return this.state;
  }
  async list(): Promise<SavedStoreEntry[]> {
    this.listCalls += 1;
    this.listStarted.resolve();
    if (this.listWait) await this.listWait;
    if (this.failList) throw this.failList;
    return [...this.entries].map(([key, value]) => ({ key, value }));
  }
  async get(key: IDBValidKey) {
    this.getCalls += 1;
    this.getStarted.resolve();
    if (this.getWait) await this.getWait;
    return this.entries.get(key);
  }
  async save(): Promise<never> {
    throw new Error('Library must never save');
  }
  async delete(key: IDBValidKey) {
    if (this.failDelete) throw this.failDelete;
    this.deleteCalls.push(key);
    this.entries.delete(key);
    this.state = { ...this.state, epoch: this.state.epoch + 1 };
  }
  async deleteMany(keys: readonly IDBValidKey[]) {
    if (this.failDelete) throw this.failDelete;
    if (keys.length === 0) return;
    this.deleteManyCalls.push([...keys]);
    for (const key of keys) this.entries.delete(key);
    this.state = { ...this.state, epoch: this.state.epoch + 1 };
  }
  async deleteAll() {
    if (this.failDelete) throw this.failDelete;
    this.deleteAllCalls += 1;
    this.entries.clear();
    this.state = { ...this.state, epoch: this.state.epoch + 1 };
  }
  close() {}
}

function hintFixture() {
  const subscribers = new Set<() => void>();
  const hint: SavedLibraryHint = {
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    notify: vi.fn(() => {
      for (const subscriber of subscribers) subscriber();
    }),
    notifyRemote: vi.fn(),
  };
  return {
    hint,
    fire: () => {
      for (const subscriber of subscribers) subscriber();
    },
    count: () => subscribers.size,
  };
}

function fixture(normal = true) {
  const store = new MemoryStore();
  const context = { normal };
  const api: SavedBrowser = {
    tabs: {
      getCurrent: vi.fn(async () =>
        context.normal ? { incognito: false } : { incognito: true },
      ),
    },
  };
  const hint = hintFixture();
  const library = createSavedLibrary(api, store, hint.hint);
  return { store, api, context, hint, library };
}

async function finalContextFixture() {
  const store = new MemoryStore();
  const hint = hintFixture();
  const finalGuard = Promise.withResolvers<{ incognito: boolean }>();
  const finalGuardStarted = Promise.withResolvers<void>();
  let calls = 0;
  const api: SavedBrowser = {
    tabs: {
      getCurrent: vi.fn(async () => {
        calls += 1;
        if (calls === 4) {
          finalGuardStarted.resolve();
          return finalGuard.promise;
        }
        return { incognito: false };
      }),
    },
  };
  const library = createSavedLibrary(api, store, hint.hint);
  store.entries.set(validId, record(validId));
  await library.refresh();
  return {
    store,
    hint,
    library,
    finalGuard,
    finalGuardStarted,
    contextCalls: () => calls,
  };
}

function seed(store: MemoryStore) {
  store.entries.set(validId, record(validId));
  store.entries.set('future-row', { schemaVersion: 2, recordId: 'future-row' });
  store.entries.set('bad-row', { recordId: 'bad-row', extra: true });
  store.entries.set(expiredId, record(expiredId, now - SAVED_RETENTION_MS * 2));
}

it('checks context before listing and exposes no saved rows in private windows', async () => {
  const { store, library } = fixture(false);
  seed(store);
  await library.refresh();
  expect(store.listCalls).toBe(0);
  expect(library.getSnapshot()).toMatchObject({
    phase: 'denied',
    entries: [],
    selected: null,
    message: expect.stringContaining('verified normal windows'),
  });
});

it('lists valid, unsupported and unreadable rows and lazily removes only expired valid rows', async () => {
  const { store, library } = fixture();
  seed(store);
  await library.refresh();
  expect(store.listCalls).toBe(1);
  expect(store.deleteManyCalls).toEqual([[expiredId]]);
  expect(store.deleteCalls).toEqual([]);
  const snapshot = library.getSnapshot();
  expect(snapshot.phase).toBe('ready');
  expect(snapshot.entries.map((entry) => entry.status)).toEqual([
    'valid',
    'unsupported',
    'invalid',
  ]);
  expect(snapshot.entries[1]).toEqual({
    key: 'future-row',
    status: 'unsupported',
  });
  expect(snapshot.entries[2]).toEqual({ key: 'bad-row', status: 'invalid' });
  expect(JSON.stringify(snapshot)).not.toContain('extra');
});

it('opens a valid record only after re-reading storage and rechecking context', async () => {
  const { store, library } = fixture();
  seed(store);
  await library.refresh();
  await library.open(validId);
  expect(store.getCalls).toBe(1);
  expect(library.getSnapshot().selected).toEqual(record(validId));
  expect(library.getSnapshot().selectedKey).toBe(validId);
});

it('fails an open when the record disappeared and refuses unsupported rows', async () => {
  const { store, library } = fixture();
  seed(store);
  await library.refresh();
  store.entries.delete(validId);
  await library.open(validId);
  expect(library.getSnapshot().selected).toBeNull();
  expect(library.getSnapshot().message).toContain('no longer available');

  await library.refresh();
  await library.open('future-row');
  expect(library.getSnapshot().selected).toBeNull();
  expect(library.getSnapshot().message).toContain('Unsupported saved record');

  await library.open('bad-row');
  expect(library.getSnapshot().selected).toBeNull();
  expect(library.getSnapshot().message).toContain('unreadable');
});

it('removes an expired record when it is opened', async () => {
  const { store, library } = fixture();
  await library.refresh();
  store.entries.set(expiredId, record(expiredId, now - SAVED_RETENTION_MS * 2));
  await library.open(expiredId);
  expect(store.deleteCalls).toEqual([expiredId]);
  expect(library.getSnapshot().selected).toBeNull();
  expect(library.getSnapshot().message).toContain('expired');
});

it('confirms a single delete, updates the list and notifies other views', async () => {
  const { store, library, hint } = fixture();
  seed(store);
  await library.refresh();
  library.requestDelete(validId);
  expect(library.getSnapshot().pendingDeleteKey).toBe(validId);
  library.cancelDelete();
  expect(library.getSnapshot().pendingDeleteKey).toBeNull();
  library.requestDelete(validId);
  await library.delete();
  expect(store.deleteCalls).toContain(validId);
  expect(library.getSnapshot().entries).toHaveLength(2);
  expect(library.getSnapshot().message).toBe('Saved record deleted.');
  expect(hint.hint.notifyRemote).toHaveBeenCalledTimes(1);
});

it('clears an open record when that record is deleted', async () => {
  const { store, library } = fixture();
  seed(store);
  await library.refresh();
  await library.open(validId);
  library.requestDelete(validId);
  await library.delete();
  expect(library.getSnapshot().selected).toBeNull();
  expect(library.getSnapshot().selectedKey).toBeNull();
});

it('keeps the row when deletion fails and reports that it may remain', async () => {
  const { store, library } = fixture();
  seed(store);
  await library.refresh();
  store.failDelete = new Error('transaction failed');
  library.requestDelete(validId);
  await library.delete();
  expect(library.getSnapshot().entries).toHaveLength(3);
  expect(library.getSnapshot().message).toContain('may still exist');
});

it('freezes a selected set, confirms it and deletes unsupported rows in bulk', async () => {
  const { store, library, hint } = fixture();
  seed(store);
  await library.refresh();
  library.toggleChecked(validId);
  library.toggleChecked('future-row');
  expect(library.getSnapshot().checkedKeys).toEqual([validId, 'future-row']);
  library.requestBulkDelete();
  expect(library.getSnapshot().pendingBulk).toEqual({
    kind: 'selected',
    keys: [validId, 'future-row'],
  });

  library.toggleChecked('bad-row');
  expect(library.getSnapshot().checkedKeys).toEqual([validId, 'future-row']);

  await library.deleteChecked();
  expect(store.deleteManyCalls).toEqual([[expiredId], [validId, 'future-row']]);
  expect(library.getSnapshot().entries).toEqual([
    { key: 'bad-row', status: 'invalid' },
  ]);
  expect(library.getSnapshot().checkedKeys).toEqual([]);
  expect(library.getSnapshot().pendingBulk).toBeNull();
  expect(library.getSnapshot().message).toBe('2 saved records deleted.');
  expect(hint.hint.notifyRemote).toHaveBeenCalledTimes(1);
});

it('cancels a frozen bulk confirmation when its set changes on refresh', async () => {
  const { store, library } = fixture();
  seed(store);
  await library.refresh();
  library.toggleChecked(validId);
  library.requestBulkDelete();
  store.entries.delete(validId);
  await library.refresh();
  expect(library.getSnapshot().pendingBulk).toBeNull();
  expect(library.getSnapshot().checkedKeys).toEqual([]);
});

it('delete-all clears the actual store, including rows saved after the list', async () => {
  const { store, library } = fixture();
  store.entries.set(validId, record(validId));
  await library.refresh();
  store.entries.set(
    'unseen-record',
    record('33333333-3333-3333-3333-333333333333'),
  );
  await library.open(validId);
  library.toggleChecked(validId);

  library.requestDeleteAll();
  expect(library.getSnapshot().pendingBulk).toEqual({ kind: 'all' });
  await library.deleteAll();
  expect(store.deleteAllCalls).toBe(1);
  expect(store.entries.size).toBe(0);
  expect(library.getSnapshot()).toMatchObject({
    phase: 'ready',
    entries: [],
    selected: null,
    selectedKey: null,
    checkedKeys: [],
    pendingBulk: null,
    message: 'All saved records deleted.',
  });
});

it('delete-all advances the epoch even when the visible list is empty', async () => {
  const { store, library } = fixture();
  await library.refresh();
  const before = store.state.epoch;
  library.requestDeleteAll();
  await library.deleteAll();
  expect(store.deleteAllCalls).toBe(1);
  expect(store.state.epoch).toBe(before + 1);
  expect(library.getSnapshot().entries).toEqual([]);
});

it('clears selection and confirmation on suspend', async () => {
  const { store, library } = fixture();
  seed(store);
  await library.refresh();
  library.toggleChecked(validId);
  library.requestBulkDelete();
  library.suspend();
  expect(library.getSnapshot()).toMatchObject({
    phase: 'checking',
    entries: [],
    checkedKeys: [],
    pendingBulk: null,
    pendingDeleteKey: null,
  });
});

it('clears selection and confirmation on a denied context transition', async () => {
  const { store, library, context } = fixture();
  seed(store);
  await library.refresh();
  library.toggleChecked(validId);
  library.requestBulkDelete();
  context.normal = false;
  await library.refresh();
  expect(library.getSnapshot()).toMatchObject({
    phase: 'denied',
    entries: [],
    checkedKeys: [],
    pendingBulk: null,
    pendingDeleteKey: null,
  });
});

it('clears selection and confirmation when storage becomes unavailable', async () => {
  const { store, library } = fixture();
  seed(store);
  await library.refresh();
  library.toggleChecked(validId);
  library.requestBulkDelete();
  store.failList = new Error('storage failed');
  await library.refresh();
  expect(library.getSnapshot()).toMatchObject({
    phase: 'unavailable',
    entries: [],
    checkedKeys: [],
    pendingBulk: null,
    pendingDeleteKey: null,
  });
});

it('cannot open a record after delete-all clears the store', async () => {
  const { store, library } = fixture();
  store.entries.set(validId, record(validId));
  await library.refresh();
  library.requestDeleteAll();
  await library.deleteAll();
  await library.open(validId);
  expect(library.getSnapshot().selected).toBeNull();
  expect(library.getSnapshot().message).toContain('no longer available');
});

it('a fresh library instance cannot see records after delete-all', async () => {
  const store = new MemoryStore();
  store.entries.set(validId, record(validId));
  const api: SavedBrowser = {
    tabs: { getCurrent: vi.fn(async () => ({ incognito: false })) },
  };
  const first = createSavedLibrary(api, store);
  await first.refresh();
  first.requestDeleteAll();
  await first.deleteAll();
  const reopened = createSavedLibrary(api, store);
  await reopened.refresh();
  expect(reopened.getSnapshot().entries).toEqual([]);
  expect(reopened.getSnapshot().selected).toBeNull();
});

it('fails closed when context is lost after the list was rendered', async () => {
  const { store, library, context } = fixture();
  seed(store);
  await library.refresh();
  context.normal = false;
  const before = store.getCalls;
  await library.open(validId);
  expect(store.getCalls).toBe(before);
  expect(library.getSnapshot()).toMatchObject({
    phase: 'denied',
    entries: [],
    selected: null,
  });
});

it('treats a cross-view change signal as a hint and re-reads storage', async () => {
  const { store, library, hint } = fixture();
  await library.refresh();
  expect(library.getSnapshot().entries).toHaveLength(0);
  store.entries.set(validId, record(validId));
  hint.fire();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(library.getSnapshot().entries).toHaveLength(1);
});

it('reports unavailable storage without exposing rows', async () => {
  const { store, library } = fixture();
  seed(store);
  store.failList = new Error('storage failed');
  await library.refresh();
  expect(library.getSnapshot()).toMatchObject({
    phase: 'unavailable',
    entries: [],
    selected: null,
  });
  expect(library.getSnapshot().message).toContain('unavailable');
});

it('unsubscribes hints and storage on close', async () => {
  const { store, library, hint } = fixture();
  await library.refresh();
  expect(hint.count()).toBe(1);
  library.close();
  expect(hint.count()).toBe(0);
  const calls = store.listCalls;
  hint.fire();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.listCalls).toBe(calls);
});

it('lists an oversized structurally valid row as unreadable and refuses to open it', async () => {
  const { store, library } = fixture();
  const oversized = record(validId);
  oversized.report.before.extensions = Array.from({ length: 300 }, () => ({
    name: 'x'.repeat(4096),
    version: '1',
    enabled: true,
  }));
  store.entries.set(validId, oversized);
  await library.refresh();
  expect(library.getSnapshot().entries).toEqual([
    { key: validId, status: 'invalid' },
  ]);
  await library.open(validId);
  expect(library.getSnapshot().selected).toBeNull();
  expect(library.getSnapshot().message).toContain('unreadable');
});

it('invalidates a delayed open when a hint arrives during the read', async () => {
  const { store, library, hint } = fixture();
  seed(store);
  await library.refresh();
  const hold = Promise.withResolvers<void>();
  store.getWait = hold.promise;
  const pending = library.open(validId);
  await store.getStarted.promise;
  hint.fire();
  store.entries.delete(validId);
  hold.resolve();
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(library.getSnapshot().selected).toBeNull();
  expect(
    library.getSnapshot().entries.filter((entry) => entry.status === 'valid'),
  ).toHaveLength(0);
  expect(library.getSnapshot().busy).toBe(false);
});

it('invalidates a delayed refresh when a hint arrives during the list', async () => {
  const { store, library, hint } = fixture();
  seed(store);
  const hold = Promise.withResolvers<void>();
  store.listWait = hold.promise;
  const pending = library.refresh();
  await store.listStarted.promise;
  store.entries.delete(validId);
  hint.fire();
  hold.resolve();
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(
    library.getSnapshot().entries.filter((entry) => entry.status === 'valid'),
  ).toHaveLength(0);
  expect(library.getSnapshot().busy).toBe(false);
});

it('clears displayed archive data on suspend and revalidates after resume', async () => {
  const { store, library, hint } = fixture();
  seed(store);
  await library.refresh();
  await library.open(validId);
  expect(library.getSnapshot().selected).toEqual(record(validId));

  library.suspend();
  expect(library.getSnapshot()).toMatchObject({
    phase: 'checking',
    entries: [],
    selected: null,
    selectedKey: null,
    pendingDeleteKey: null,
    busy: false,
  });
  hint.fire();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(library.getSnapshot().entries).toHaveLength(0);

  store.entries.delete(validId);
  library.resume();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(
    library.getSnapshot().entries.filter((entry) => entry.status === 'valid'),
  ).toHaveLength(0);
  expect(library.getSnapshot().selected).toBeNull();
});

it('tears down displayed data and ignores hints after close', async () => {
  const { store, library, hint } = fixture();
  seed(store);
  await library.refresh();
  await library.open(validId);
  library.close();
  expect(library.getSnapshot()).toMatchObject({
    entries: [],
    selected: null,
    selectedKey: null,
    busy: false,
  });
  const calls = store.listCalls;
  hint.fire();
  library.resume();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.listCalls).toBe(calls);
});

it('lists an inconsistent page-error summary as unreadable', async () => {
  const { store, library } = fixture();
  const inconsistent = record(validId);
  inconsistent.report.pageErrors.after = {
    scriptErrors: 0,
    unhandledRejections: 0,
    total: 0,
    finish: 'limit',
    observedMs: 0,
  };
  store.entries.set(validId, inconsistent);
  await library.refresh();
  expect(library.getSnapshot().entries).toEqual([
    { key: validId, status: 'invalid' },
  ]);
  await library.open(validId);
  expect(library.getSnapshot().selected).toBeNull();
  expect(library.getSnapshot().message).toContain('unreadable');
});

it('does not publish a delayed open after a hint during the final context check', async () => {
  const { hint, library, finalGuard, finalGuardStarted, contextCalls } =
    await finalContextFixture();
  const opening = library.open(validId);
  await finalGuardStarted.promise;
  expect(contextCalls()).toBe(4);
  hint.fire();
  finalGuard.resolve({ incognito: false });
  await opening;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(library.getSnapshot().selected).toBeNull();
});

it('clears a delayed open when the view is suspended during the final context check', async () => {
  const { library, finalGuard, finalGuardStarted, contextCalls } =
    await finalContextFixture();
  const opening = library.open(validId);
  await finalGuardStarted.promise;
  expect(contextCalls()).toBe(4);
  library.suspend();
  finalGuard.resolve({ incognito: false });
  await opening;
  expect(library.getSnapshot()).toMatchObject({
    phase: 'checking',
    entries: [],
    selected: null,
    busy: false,
  });
});

it('does not let an old action clear a newer resumed action busy state', async () => {
  const { store, library, finalGuard, finalGuardStarted, contextCalls } =
    await finalContextFixture();
  const opening = library.open(validId);
  await finalGuardStarted.promise;
  expect(contextCalls()).toBe(4);
  library.suspend();
  const newerList = Promise.withResolvers<void>();
  store.listWait = newerList.promise;
  store.listStarted = Promise.withResolvers<void>();
  library.resume();
  await store.listStarted.promise;
  finalGuard.resolve({ incognito: false });
  await opening;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(library.getSnapshot().busy).toBe(true);
  newerList.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(library.getSnapshot().selected).toBeNull();
  expect(library.getSnapshot().busy).toBe(false);
});

it('does not let an obsolete delete failure publish or clear a newer resumed action', async () => {
  const { store, library, finalGuard, finalGuardStarted, contextCalls } =
    await finalContextFixture();
  store.failDelete = new Error('delete failed');
  library.requestDelete(validId);
  const deleting = library.delete();
  await finalGuardStarted.promise;
  expect(contextCalls()).toBe(4);
  library.suspend();
  const newerList = Promise.withResolvers<void>();
  store.listWait = newerList.promise;
  store.listStarted = Promise.withResolvers<void>();
  library.resume();
  await store.listStarted.promise;
  finalGuard.resolve({ incognito: false });
  await deleting;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(library.getSnapshot().busy).toBe(true);
  expect(library.getSnapshot().message).toBeNull();
  newerList.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(library.getSnapshot().busy).toBe(false);
  expect(library.getSnapshot().message ?? '').not.toContain(
    'record may still exist',
  );
});

it('does not publish a delayed open after close during the final context check', async () => {
  const { library, finalGuard, finalGuardStarted, contextCalls } =
    await finalContextFixture();
  const opening = library.open(validId);
  await finalGuardStarted.promise;
  expect(contextCalls()).toBe(4);
  library.close();
  finalGuard.resolve({ incognito: false });
  await opening;
  expect(library.getSnapshot()).toMatchObject({
    entries: [],
    selected: null,
    selectedKey: null,
    busy: false,
  });
});

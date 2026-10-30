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
  failList: Error | null = null;
  failDelete: Error | null = null;

  async ready() {
    return this.state;
  }
  async readState() {
    return this.state;
  }
  async list(): Promise<SavedStoreEntry[]> {
    this.listCalls += 1;
    if (this.failList) throw this.failList;
    return [...this.entries].map(([key, value]) => ({ key, value }));
  }
  async get(key: IDBValidKey) {
    this.getCalls += 1;
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
  expect(store.deleteCalls).toEqual([expiredId]);
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
  expect(hint.hint.notify).toHaveBeenCalledTimes(1);
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

import { beforeEach, expect, it, vi } from 'bun:test';
import type { SavedBrowser } from '../lib/saved-context';
import type { SavedExportSource } from '../lib/saved-export';
import { createSavedExport } from '../lib/saved-export';
import type { ClipboardOutcome } from '../lib/report-clipboard';
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
  const handoff =
    vi.fn<(text: string, format: 'markdown' | 'json' | 'html') => void>();
  const printHandoff =
    vi.fn<(text: string, format: 'markdown' | 'json' | 'html') => void>();
  const copyHandoff = vi.fn(
    async (_text: string): Promise<ClipboardOutcome> => ({
      status: 'success',
      message: 'Copied the exact Markdown report.',
    }),
  );
  const exporter = createSavedExport(api, store, source, {
    download: handoff,
    print: printHandoff,
    copy: copyHandoff,
  });
  return {
    store,
    api,
    handoff,
    printHandoff,
    copyHandoff,
    exporter,
    context,
    publish,
    select(selected: SavedRecord | null, selectedKey: IDBValidKey | null) {
      publish({ selected, selectedKey });
    },
  };
}

beforeEach(() => vi.restoreAllMocks());

it('prepares an exact Markdown clipboard representation without offering a download', async () => {
  const { store, exporter, handoff, copyHandoff } = fixture();
  exporter.setFormat('markdown');
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  if (reviewed === null) throw new Error('Missing Markdown preview');
  expect(reviewed.startsWith('# AddonRay investigation report')).toBe(true);
  expect(reviewed).toContain('Captured report.');
  expect(reviewed).toContain('Example');
  expect(reviewed).not.toContain('recordId');
  expect(reviewed).not.toContain('savedAt');
  expect(store.getCalls).toBe(2);
  await exporter.download();
  expect(handoff).not.toHaveBeenCalled();
  expect(copyHandoff).not.toHaveBeenCalled();
});

it('copies exact Markdown only after the final storage read and write resolution', async () => {
  const { exporter, copyHandoff } = fixture();
  const write = Promise.withResolvers<ClipboardOutcome>();
  copyHandoff.mockImplementation(() => write.promise);
  exporter.setFormat('markdown');
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  if (reviewed === null) throw new Error('Missing Markdown preview');
  const calls = copyHandoff.mock.calls.length;
  const pending = exporter.copy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(copyHandoff.mock.calls).toHaveLength(calls + 1);
  expect(copyHandoff.mock.calls.at(-1)).toEqual([reviewed]);
  expect(exporter.getSnapshot().busy).toBe(true);
  write.resolve({
    status: 'success',
    message: 'Copied the exact Markdown report.',
  });
  await pending;
  expect(exporter.getSnapshot()).toEqual({
    format: 'markdown',
    preview: reviewed,
    busy: false,
    message: 'Copied the exact Markdown report.',
  });
});

it('reports saved Markdown denial and suppresses a success that lost the deletion race', async () => {
  const denied = fixture();
  denied.exporter.setFormat('markdown');
  await denied.exporter.prepare();
  const reviewed = denied.exporter.getSnapshot().preview;
  denied.copyHandoff.mockResolvedValueOnce({
    status: 'denied',
    message: 'Clipboard access was denied by the browser.',
  });
  await denied.exporter.copy();
  expect(denied.exporter.getSnapshot()).toMatchObject({
    preview: reviewed,
    message: 'Clipboard access was denied by the browser.',
  });

  const stale = fixture();
  const write = Promise.withResolvers<ClipboardOutcome>();
  stale.copyHandoff.mockImplementation(() => write.promise);
  stale.exporter.setFormat('markdown');
  await stale.exporter.prepare();
  const pending = stale.exporter.copy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  stale.select(null, null);
  write.resolve({ status: 'success', message: 'Copied the exact Markdown.' });
  await pending;
  expect(stale.exporter.getSnapshot().preview).toBeNull();
  expect(stale.exporter.getSnapshot().message).not.toContain('Copied');
});

it('prepares the exact stored JSON and hands it off only after a fresh read', async () => {
  const { store, api, handoff, exporter } = fixture();
  await exporter.prepare();
  const expected = serializeExchange(record());
  expect(exporter.getSnapshot()).toEqual({
    format: 'json',
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
  expect(handoff.mock.calls).toEqual([[expected, 'json']]);
  expect(store.getCalls).toBe(4);
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
    const { store, exporter, handoff, publish, context, api } = fixture();
    await exporter.prepare();
    const contextCalls = api.tabs.getCurrent.mock.calls.length;
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
    if (interruption === 'cancel' || interruption === 'selection')
      expect(api.tabs.getCurrent).toHaveBeenCalledTimes(contextCalls + 1);
  }
});

it('rechecks expiry after the final context await before publishing a preview', async () => {
  const { api, store, exporter } = fixture();
  const base = Date.now();
  store.entries.set(key, record({ savedAt: base, expiresAt: base + 5000 }));
  const second = Promise.withResolvers<void>();
  const held =
    Promise.withResolvers<
      Awaited<ReturnType<SavedBrowser['tabs']['getCurrent']>>
    >();
  let calls = 0;
  api.tabs.getCurrent.mockImplementation(async () => {
    calls += 1;
    if (calls === 1) return { incognito: false };
    second.resolve();
    return held.promise;
  });
  const now = vi.spyOn(Date, 'now').mockReturnValue(base);
  const pending = exporter.prepare();
  await second.promise;
  now.mockReturnValue(base + 6000);
  held.resolve({ incognito: false });
  await pending;
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().busy).toBe(false);
  expect(exporter.getSnapshot().message).toContain('expired');
});

it('does not let an obsolete private context clear a newer preview', async () => {
  const { api, store, exporter } = fixture();
  const stale =
    Promise.withResolvers<
      Awaited<ReturnType<SavedBrowser['tabs']['getCurrent']>>
    >();
  let calls = 0;
  api.tabs.getCurrent.mockImplementation(async () => {
    calls += 1;
    return calls === 1 ? stale.promise : { incognito: false };
  });
  const first = exporter.prepare();
  exporter.cancel();
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  expect(reviewed).not.toBeNull();
  stale.resolve({ incognito: true });
  await first;
  expect(exporter.getSnapshot().preview).toBe(reviewed);
  expect(store.getCalls).toBe(2);
});

it('does not let an obsolete download context clear a newer preview', async () => {
  const { api, store, exporter, handoff } = fixture();
  await exporter.prepare();
  const stale =
    Promise.withResolvers<
      Awaited<ReturnType<SavedBrowser['tabs']['getCurrent']>>
    >();
  let calls = 0;
  api.tabs.getCurrent.mockImplementation(async () => {
    calls += 1;
    return calls === 1 ? stale.promise : { incognito: false };
  });
  const firstDownload = exporter.download();
  exporter.cancel();
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  expect(reviewed).not.toBeNull();
  stale.resolve({ incognito: true });
  await firstDownload;
  expect(exporter.getSnapshot().preview).toBe(reviewed);
  expect(handoff).not.toHaveBeenCalled();
  expect(store.getCalls).toBe(4);
});
it('discards a preview when the selected archive changes or disappears', async () => {
  const { exporter, select } = fixture();
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).not.toBeNull();
  select(null, null);
  expect(exporter.getSnapshot().preview).toBeNull();
});

it('can prepare again after cancellation without losing the live controller', async () => {
  const { exporter, handoff } = fixture();
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  exporter.cancel();
  expect(exporter.getSnapshot().preview).toBeNull();
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).toBe(reviewed);
  await exporter.download();
  expect(handoff).toHaveBeenCalledTimes(1);
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
  expect(store.getCalls).toBe(2);
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

// Hold the second normal-context call. By then the first storage read has
// returned, so mutations below model another view deleting, delete-alling,
// replacing the store or changing a record without a delivered notification.
function holdFinalContext(api: ReturnType<typeof fixture>['api']) {
  const started = Promise.withResolvers<void>();
  const released = Promise.withResolvers<{ incognito: false }>();
  let calls = 0;
  api.tabs.getCurrent.mockImplementation(async () => {
    calls += 1;
    if (calls < 2) return { incognito: false };
    started.resolve();
    return released.promise;
  });
  return {
    started: started.promise,
    release: () => released.resolve({ incognito: false }),
  };
}

it('refuses a saved HTML preview when the record is deleted during the final context wait', async () => {
  const { api, store, exporter } = fixture();
  exporter.setFormat('html');
  const hold = holdFinalContext(api);
  const pending = exporter.prepare();
  await hold.started;
  expect(store.getCalls).toBe(1);
  store.entries.clear();
  hold.release();
  await pending;
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().message).toContain('no longer available');
});

it('refuses a saved JSON preview when the record is replaced during the final context wait', async () => {
  const { api, store, exporter } = fixture();
  const hold = holdFinalContext(api);
  const pending = exporter.prepare();
  await hold.started;
  expect(store.getCalls).toBe(1);
  store.entries.set(
    key,
    record({ report: { ...record().report, assessment: 'better' } }),
  );
  hold.release();
  await pending;
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().message).toContain('changed');
});

for (const scenario of [
  { action: 'download', format: 'html', mutation: 'delete' },
  { action: 'print', format: 'html', mutation: 'delete-all' },
  { action: 'download', format: 'json', mutation: 'replace' },
  { action: 'download', format: 'html', mutation: 'store-replacement' },
] as const) {
  it(`refuses ${scenario.format} ${scenario.action} after ${scenario.mutation} during the final context wait`, async () => {
    const { api, store, exporter, handoff, printHandoff } = fixture();
    exporter.setFormat(scenario.format);
    await exporter.prepare();
    const readsBefore = store.getCalls;
    const hold = holdFinalContext(api);
    const pending =
      scenario.action === 'download' ? exporter.download() : exporter.print();
    await hold.started;
    expect(store.getCalls).toBe(readsBefore + 1);
    if (scenario.mutation === 'delete') store.entries.clear();
    if (scenario.mutation === 'delete-all') {
      store.entries.clear();
      store.state = { storeId: 'replaced-store-0123456789', epoch: 1 };
    }
    if (scenario.mutation === 'replace')
      store.entries.set(
        key,
        record({ report: { ...record().report, assessment: 'better' } }),
      );
    if (scenario.mutation === 'store-replacement') {
      store.entries.clear();
      store.state = { storeId: 'replacement-store-9876543210', epoch: 2 };
    }
    hold.release();
    await pending;
    expect(handoff).not.toHaveBeenCalled();
    expect(printHandoff).not.toHaveBeenCalled();
    expect(exporter.getSnapshot().preview).toBeNull();
    expect(exporter.getSnapshot().message).toMatch(
      /no longer available|changed|unreadable|unavailable/i,
    );
  });
}

it('prepares, downloads and prints the exact stored printable HTML', async () => {
  const { store, api, handoff, printHandoff, exporter } = fixture();
  exporter.setFormat('html');
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  if (reviewed === null) throw new Error('Missing printable HTML preview');
  expect(exporter.getSnapshot().format).toBe('html');
  expect(reviewed.startsWith('<!doctype html>')).toBe(true);
  expect(reviewed).toContain('Captured report.');
  expect(reviewed).not.toContain('<script');
  expect(reviewed).not.toContain('recordId');
  expect(handoff).not.toHaveBeenCalled();
  expect(printHandoff).not.toHaveBeenCalled();
  await exporter.download();
  expect(handoff.mock.calls).toEqual([[reviewed, 'html']]);
  expect(store.getCalls).toBe(4);
  await exporter.print();
  expect(printHandoff.mock.calls).toEqual([[reviewed, 'html']]);
  expect(exporter.getSnapshot().preview).toBe(reviewed);
  expect(exporter.getSnapshot().message).toContain('Print dialog requested');
  expect(exporter.getSnapshot().message).not.toContain('printed successfully');
  expect(api.tabs.getCurrent).toHaveBeenCalledTimes(6);
});

it('keeps imported provenance in a saved printable report', async () => {
  const { store, exporter } = fixture();
  store.entries.set(
    key,
    record({ origin: 'imported', importedAt: now, report: record().report }),
  );
  exporter.setFormat('html');
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  if (reviewed === null) throw new Error('Missing imported printable preview');
  expect(reviewed).toContain('Imported report');
  expect(reviewed).toContain('did not observe this content');
  expect(reviewed).not.toContain('Captured report.');
  expect(reviewed).not.toContain('importedAt');
});

it('refuses printable HTML above 1 MiB while the same saved JSON stays available', async () => {
  const { store, exporter } = fixture();
  const extensions = Array.from({ length: 1000 }, () => ({
    name: '&'.repeat(400),
    version: '1',
    enabled: true,
  }));
  store.entries.set(
    key,
    record({
      report: {
        ...record().report,
        before: { extensions },
        after: { extensions },
        changes: [],
      },
    }),
  );
  exporter.setFormat('html');
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().message).toContain('1 MiB');
  expect(exporter.getSnapshot().message).toContain('JSON remains available');
  exporter.setFormat('json');
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).not.toBeNull();
});

it('rejects deletion, expiry and replacement between HTML preview and print', async () => {
  for (const change of ['delete', 'expire', 'replace'] as const) {
    const { store, exporter, printHandoff } = fixture();
    exporter.setFormat('html');
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
          report: { ...record().report, assessment: 'better' },
        }),
      );
    await exporter.print();
    expect(printHandoff).not.toHaveBeenCalled();
    expect(exporter.getSnapshot().preview).toBeNull();
    expect(exporter.getSnapshot().busy).toBe(false);
    expect(exporter.getSnapshot().message).toMatch(
      /no longer available|expired|changed|prepare/i,
    );
  }
});

it('does not print HTML after context is lost during the deferred read', async () => {
  const { store, exporter, printHandoff, context } = fixture();
  exporter.setFormat('html');
  await exporter.prepare();
  const held = Promise.withResolvers<void>();
  store.getWait = held.promise;
  store.getStarted = Promise.withResolvers<void>();
  const pending = exporter.print();
  await store.getStarted.promise;
  context.normal = false;
  held.resolve();
  await pending;
  expect(printHandoff).not.toHaveBeenCalled();
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().message).toContain('normal windows');
});

it('discards an HTML preview when the format changes and never prints JSON', async () => {
  const { exporter, printHandoff } = fixture();
  exporter.setFormat('html');
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).not.toBeNull();
  exporter.setFormat('json');
  expect(exporter.getSnapshot()).toMatchObject({
    format: 'json',
    preview: null,
    busy: false,
    message: null,
  });
  await exporter.print();
  expect(printHandoff).not.toHaveBeenCalled();
});

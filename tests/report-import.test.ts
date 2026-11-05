import { expect, it } from 'bun:test';
import {
  SAVED_LIMITS,
  serializeExchange,
  type SavedReport,
} from '../lib/saved-record';
import { exampleReport as report } from './saved-report-fixture';
import { parseImportedReport } from '../lib/report-import';

const limitBytes = 1024 * 1024;

function document(
  reportValue: SavedReport = report(),
  topLevel: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    provenance: 'captured',
    report: reportValue,
    ...topLevel,
  };
}

function encoded(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function rejected(value: unknown, pattern: RegExp) {
  const result = parseImportedReport(encoded(value));
  expect(result.status).toBe('error');
  if (result.status === 'success') throw new Error('Expected rejection');
  expect(result.reason).toMatch(pattern);
}

function rejectedText(text: string, pattern: RegExp) {
  const result = parseImportedReport(new TextEncoder().encode(text));
  expect(result.status).toBe('error');
  if (result.status === 'success') throw new Error('Expected rejection');
  expect(result.reason).toMatch(pattern);
}

function modifiedReport(change: (value: SavedReport) => void) {
  const value = structuredClone(report());
  change(value);
  return document(value);
}

it('accepts a valid schema version 1 report and preserves every captured state', () => {
  const source = report();
  const result = parseImportedReport(encoded(document(source)));
  expect(result).toEqual({
    status: 'success',
    value: { report: source, claimedProvenance: 'captured' },
  });
  if (result.status !== 'success') return;
  expect(result.value.report.timing.before).toBeNull();
  expect(result.value.report.timing.after).toEqual({
    domContentLoaded: { status: 'measured', milliseconds: 120.5 },
    loadEvent: { status: 'unrecorded' },
    firstContentfulPaint: { status: 'unavailable' },
  });
  expect(result.value.report.pageErrors.before).toBeNull();
  expect(result.value.report.pageErrors.after?.total).toBe(1);
  expect(result.value.report.assessment).toBe('worse');
});

it('preserves precomputed changes without recomputing them from names', () => {
  const value = report({
    before: { extensions: [{ name: 'Same', version: '1', enabled: true }] },
    after: { extensions: [{ name: 'Same', version: '1', enabled: true }] },
    changes: [
      {
        kind: 'removed',
        name: 'Not in either inventory',
        version: '9',
        enabled: false,
      },
      { kind: 'added', name: 'Also absent', version: '2', enabled: true },
    ],
  });
  const result = parseImportedReport(encoded(document(value)));
  expect(result.status).toBe('success');
  if (result.status !== 'success') return;
  expect(result.value.report.changes).toEqual(value.changes);
});

it('accepts an existing exact JSON export and round-trips it for read-only inspection', () => {
  const exported = serializeExchange({
    schemaVersion: 1,
    origin: 'captured',
    report: report(),
  });
  const parsed = parseImportedReport(new TextEncoder().encode(exported));
  expect(parsed.status).toBe('success');
  if (parsed.status !== 'success') return;
  const reexported = serializeExchange({
    schemaVersion: 1,
    origin: 'imported',
    report: parsed.value.report,
  });
  expect(reexported).toBe(
    exported.replace('"provenance":"captured"', '"provenance":"imported"'),
  );
  expect(reexported).not.toContain('recordId');
  expect(reexported).not.toContain('savedAt');
  expect(reexported).not.toContain('expiresAt');
  expect(reexported).not.toContain('importedAt');
});

it('rejects unsupported versions without migration or coercion', () => {
  rejected(document(report(), { schemaVersion: 2 }), /schema version/i);
  rejected(document(report(), { schemaVersion: '1' }), /schema version/i);
  rejected(document(report(), { schemaVersion: 1.5 }), /schema version/i);
});

it('rejects duplicate keys at every level, including escaped spellings', () => {
  rejectedText(
    '{"schemaVersion":1,"schemaVersion":1,"provenance":"captured","report":{}}',
    /duplicate/i,
  );
  const nested = JSON.stringify(document()).replace(
    '"name":"Example"',
    '"name":"Example","\\u006eame":"Other"',
  );
  rejectedText(nested, /duplicate/i);
});

it('rejects prototype-affecting property names at every level, including escaped forms', () => {
  const unsafe = ['__proto__', 'prototype', 'constructor'];
  for (const key of unsafe) {
    rejectedText(
      `{"schemaVersion":1,"provenance":"captured","${key}":{},"report":${JSON.stringify(report())}}`,
      /forbidden|property/i,
    );
    const nested = JSON.stringify(document()).replace(
      '"extensions":[',
      `"${key}":{},"extensions":[`,
    );
    rejectedText(nested, /forbidden|property/i);
  }
  rejectedText(
    '{"schemaVersion":1,"provenance":"captured","__pro\\u0074o__":{},"report":{}}',
    /forbidden|property/i,
  );
  rejectedText(
    '{"schemaVersion":1,"provenance":"captured","prototy\\u0070e":{},"report":{}}',
    /forbidden|property/i,
  );
  rejectedText(
    '{"schemaVersion":1,"provenance":"captured","construc\\u0074or":{},"report":{}}',
    /forbidden|property/i,
  );
});

it('rejects unknown fields at every nested level', () => {
  const cases = [
    document(report(), { extra: true }),
    modifiedReport((value) => {
      (value as unknown as Record<string, unknown>).extra = true;
    }),
    modifiedReport((value) => {
      (value.before as unknown as Record<string, unknown>).extra = true;
    }),
    modifiedReport((value) => {
      (value.before.extensions[0] as unknown as Record<string, unknown>).extra =
        true;
    }),
    modifiedReport((value) => {
      (value.timing as unknown as Record<string, unknown>).extra = true;
    }),
    modifiedReport((value) => {
      (
        value.timing.after!.domContentLoaded as unknown as Record<
          string,
          unknown
        >
      ).extra = true;
    }),
    modifiedReport((value) => {
      (value.pageErrors as unknown as Record<string, unknown>).extra = true;
    }),
    modifiedReport((value) => {
      (value.pageErrors.after as unknown as Record<string, unknown>).extra =
        true;
    }),
    modifiedReport((value) => {
      (value.observationLimits as unknown as Record<string, unknown>).extra =
        true;
    }),
  ];
  for (const value of cases) rejected(value, /schema|unknown|match/i);
});

it('rejects malformed JSON, non-finite numbers and trailing content', () => {
  for (const text of [
    '',
    ' ',
    '{"schemaVersion":1,}',
    "{'schemaVersion':1}",
    '{"schemaVersion":NaN}',
    '{"schemaVersion":Infinity}',
    '{"schemaVersion":1} trailing',
    '{"schemaVersion":1}{"schemaVersion":1}',
  ])
    rejectedText(text, /JSON/i);
  rejectedText(
    '{"schemaVersion":1,"provenance":"captured","report":{"before":{"extensions":[{"name":"x","version":"1","enabled":true}]},"after":{"extensions":[]},"changes":[],"assessment":null,"timing":{"before":null,"after":null},"pageErrors":{"before":null,"after":null},"observationLimits":{"pageErrorWindowMs":30000,"pageErrorEvents":200,"pageErrorSummaryBytes":1024}},"milliseconds":1e400}',
    /finite|JSON/i,
  );
});

it('rejects wrong top-level and report types', () => {
  const cases: unknown[] = [
    document(report(), { provenance: 'trusted' }),
    document(report(), { provenance: null }),
    { schemaVersion: 1, provenance: 'captured', report: [] },
    { schemaVersion: 1, provenance: 'captured', report: null },
    document(report(), { report: { ...report(), assessment: 'good' } }),
    modifiedReport((value) => {
      value.before.extensions[0]!.enabled = 'true' as never;
    }),
    modifiedReport((value) => {
      value.before.extensions[0]!.name = 1 as never;
    }),
    modifiedReport((value) => {
      value.assessment = 'likely' as never;
    }),
    modifiedReport((value) => {
      (value.timing as unknown as Record<string, unknown>).after = [];
    }),
    modifiedReport((value) => {
      value.pageErrors.after!.observedMs = '12000' as never;
    }),
  ];
  for (const value of cases)
    rejected(value, /schema|match|type|version|provenance/i);
});

it('rejects non-finite and out-of-range durations and counts', () => {
  const invalid: Array<(value: SavedReport) => void> = [
    (value) => {
      value.timing.after!.domContentLoaded = {
        status: 'measured',
        milliseconds: -1,
      };
    },
    (value) => {
      value.timing.after!.domContentLoaded = {
        status: 'measured',
        milliseconds: Number.MAX_SAFE_INTEGER + 1,
      };
    },
    (value) => {
      value.timing.after!.domContentLoaded = {
        status: 'measured',
        milliseconds: Infinity,
      };
    },
    (value) => {
      value.timing.after!.loadEvent = {
        status: 'measured',
        milliseconds: 0,
      };
    },
    (value) => {
      value.pageErrors.after!.observedMs = -1;
    },
    (value) => {
      value.pageErrors.after!.observedMs = 30_001;
    },
    (value) => {
      value.pageErrors.after!.scriptErrors = 201;
      value.pageErrors.after!.total = 201;
      value.pageErrors.after!.unhandledRejections = 0;
    },
    (value) => {
      value.pageErrors.after!.total = 2;
    },
    (value) => {
      value.pageErrors.after!.finish = 'cancel' as never;
    },
    (value) => {
      value.pageErrors.after!.finish = 'limit';
    },
    (value) => {
      value.pageErrors.after!.finish = 'timeout';
    },
    (value) => {
      value.pageErrors.after!.total = 200;
      value.pageErrors.after!.finish = 'stop';
      value.pageErrors.after!.scriptErrors = 200;
    },
  ];
  for (const change of invalid)
    rejected(modifiedReport(change), /schema|match/i);
  rejectedText(
    JSON.stringify(document()).replace(
      '"milliseconds":120.5',
      '"milliseconds":1e400',
    ),
    /finite|JSON/i,
  );
});

it('enforces inventory, change and string bounds without truncation', () => {
  rejected(
    modifiedReport((value) => {
      value.before.extensions = Array.from(
        { length: SAVED_LIMITS.inventoryEntries + 1 },
        (_, index) => ({
          name: `Entry ${index}`,
          version: '1',
          enabled: true,
        }),
      );
    }),
    /schema|match/i,
  );
  rejected(
    modifiedReport((value) => {
      value.changes = Array.from(
        { length: SAVED_LIMITS.changes + 1 },
        (_, index) => ({
          kind: 'added',
          name: `Entry ${index}`,
          version: '1',
          enabled: true,
        }),
      );
    }),
    /schema|match/i,
  );
  const overlong = modifiedReport((value) => {
    value.before.extensions[0]!.name = 'x'.repeat(
      SAVED_LIMITS.stringCodePoints + 1,
    );
  });
  rejected(overlong, /schema|match/i);
  const emojiBoundary = modifiedReport((value) => {
    value.before.extensions[0]!.name = '🧪'.repeat(
      SAVED_LIMITS.stringCodePoints,
    );
  });
  const result = parseImportedReport(encoded(emojiBoundary));
  expect(result.status).toBe('success');
  if (result.status === 'success')
    expect(result.value.report.before.extensions[0]!.name).toBe(
      '🧪'.repeat(SAVED_LIMITS.stringCodePoints),
    );
});

it('enforces nesting depth before recursive parsing completes', () => {
  const deep = `{"schemaVersion":1,"provenance":"captured","report":{},"deep":${'['.repeat(9)}0${']'.repeat(9)}}`;
  rejectedText(deep, /nesting depth|depth/i);
});

it('accepts a complete document padded to exactly the 1 MiB import cap', () => {
  const text = JSON.stringify(document());
  const encodedText = new TextEncoder().encode(text);
  const padded = `${text}${' '.repeat(limitBytes - encodedText.byteLength)}`;
  expect(new TextEncoder().encode(padded).byteLength).toBe(limitBytes);
  const result = parseImportedReport(new TextEncoder().encode(padded));
  expect(result.status).toBe('success');
  if (result.status === 'success')
    expect(result.value.report).toEqual(report());
});

it('rejects an incomplete UTF-8 file and a file above 1 MiB before parsing', () => {
  const invalidUtf8 = Uint8Array.from([0x7b, 0x22, 0xff, 0x7d]);
  const utf8 = parseImportedReport(invalidUtf8);
  expect(utf8.status).toBe('error');
  if (utf8.status === 'error') expect(utf8.reason).toMatch(/UTF-8/i);

  const oversized = new Uint8Array(limitBytes + 1).fill(0x20);
  const large = parseImportedReport(oversized);
  expect(large.status).toBe('error');
  if (large.status === 'error') expect(large.reason).toMatch(/1 MiB/i);
});

it('rejects a file whose claimed provenance is not an approved value', () => {
  rejected(document(report(), { provenance: 'trusted' }), /provenance|schema/i);
  rejected(document(report(), { provenance: true }), /provenance|schema/i);
});

it('preserves a file claim of captured while marking the local import as imported', () => {
  const result = parseImportedReport(
    encoded(document(report(), { provenance: 'captured' })),
  );
  expect(result.status).toBe('success');
  if (result.status !== 'success') return;
  expect(result.value.claimedProvenance).toBe('captured');
});

// Controller tests use the same public exchange document as the parser tests.
import { beforeEach, vi } from 'bun:test';
import type { SavedBrowser } from '../lib/saved-context';
import {
  createReportImport,
  type ReportImportFile,
} from '../lib/report-import';
import { serializeStoredRecord, type SavedRecord } from '../lib/saved-record';
import type {
  SavedStore,
  SavedStoreEntry,
  SavedStoreSaveResult,
  SavedStoreState,
} from '../lib/saved-store';

class MemoryImportStore implements SavedStore {
  state: SavedStoreState = {
    storeId: 'store-identity-0123456789',
    epoch: 0,
  };
  records = new Map<IDBValidKey, SavedRecord>();
  readStateCalls = 0;
  saveCalls = 0;
  readStateFailure: Error | null = null;
  saveResult: SavedStoreSaveResult = 'saved';
  readStateGate: Promise<void> | null = null;
  saveGate: Promise<void> | null = null;
  saveStarted = Promise.withResolvers<void>();
  lastRecord: SavedRecord | null = null;

  async ready() {
    return this.state;
  }
  async readState() {
    this.readStateCalls += 1;
    if (this.readStateGate) await this.readStateGate;
    if (this.readStateFailure) throw this.readStateFailure;
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
    this.lastRecord = record;
    this.saveStarted.resolve();
    if (this.saveGate) await this.saveGate;
    if (signal?.aborted) return 'cancelled';
    if (expected.storeId !== this.state.storeId) return 'stale-store';
    if (expected.epoch !== this.state.epoch) return 'stale';
    if (this.saveResult !== 'saved') return this.saveResult;
    this.records.set(record.recordId, record);
    return 'saved';
  }
  async delete(key: IDBValidKey) {
    this.records.delete(key);
    this.state = { ...this.state, epoch: this.state.epoch + 1 };
  }
  async deleteMany(keys: readonly IDBValidKey[]) {
    for (const key of keys) this.records.delete(key);
    this.state = { ...this.state, epoch: this.state.epoch + 1 };
  }
  async deleteAll() {
    this.records.clear();
    this.state = { ...this.state, epoch: this.state.epoch + 1 };
  }
  close() {}
}

function importedFile(
  text: string,
  name = 'private-report-name.json',
): ReportImportFile {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

function documentText(provenance: 'captured' | 'imported' = 'captured') {
  return JSON.stringify({
    schemaVersion: 1,
    provenance,
    report: report(),
  });
}

function controllerFixture() {
  const store = new MemoryImportStore();
  const context = { mode: 'normal' as 'normal' | 'private' | 'unknown' };
  const api = {
    tabs: {
      getCurrent: vi.fn<SavedBrowser['tabs']['getCurrent']>(async () => {
        if (context.mode === 'normal') return { incognito: false };
        if (context.mode === 'private') return { incognito: true };
        return undefined;
      }),
    },
  };
  const notify = vi.fn();
  const importer = createReportImport(api, store, { notify });
  return { store, context, api, notify, importer };
}

function readCalls(file: ReportImportFile) {
  let calls = 0;
  return {
    file: {
      ...file,
      arrayBuffer: async () => {
        calls += 1;
        return file.arrayBuffer();
      },
    },
    calls: () => calls,
  };
}

beforeEach(() => vi.restoreAllMocks());

it('starts with no imported report, no retention change and no persistence', () => {
  const { importer, store } = controllerFixture();
  expect(importer.getSnapshot()).toEqual({
    report: null,
    claimedProvenance: null,
    importedAt: null,
    busy: false,
    saveable: false,
    retentionDays: 30,
    message: null,
  });
  expect(store.readStateCalls).toBe(0);
  expect(store.saveCalls).toBe(0);
});

it('accepts a selected file into memory only and preserves its provenance claim', async () => {
  const { importer, store, notify } = controllerFixture();
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  await importer.select(importedFile(documentText('captured')));
  expect(store.readStateCalls).toBe(0);
  expect(store.saveCalls).toBe(0);
  expect(notify).not.toHaveBeenCalled();
  expect(importer.getSnapshot()).toMatchObject({
    claimedProvenance: 'captured',
    importedAt: 1_800_000_000_000,
    busy: false,
    saveable: true,
    message: null,
  });
  expect(importer.getSnapshot().report).toEqual(report());
});

it('rejects a file above 1 MiB before reading it and keeps a valid imported view', async () => {
  const { importer } = controllerFixture();
  await importer.select(importedFile(documentText()));
  const previous = importer.getSnapshot().report;
  const large = readCalls({
    name: 'large.json',
    size: SAVED_LIMITS.jsonBytes + 1,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  await importer.select(large.file);
  expect(large.calls()).toBe(0);
  expect(importer.getSnapshot().report).toBe(previous);
  expect(importer.getSnapshot().message).toMatch(/1 MiB/i);
});

it('fails closed in private and unknown contexts before reading a selected file', async () => {
  for (const mode of ['private', 'unknown'] as const) {
    const { importer, context, store } = controllerFixture();
    context.mode = mode;
    const selected = readCalls(importedFile(documentText()));
    await importer.select(selected.file);
    expect(selected.calls()).toBe(0);
    expect(importer.getSnapshot()).toMatchObject({
      report: null,
      busy: false,
    });
    expect(importer.getSnapshot().message).toMatch(/normal windows/i);
    expect(store.readStateCalls).toBe(0);
  }
});

it('keeps the previous valid view after a hostile validation failure and can retry', async () => {
  const { importer } = controllerFixture();
  await importer.select(importedFile(documentText()));
  const previous = importer.getSnapshot().report;
  await importer.select(
    importedFile(
      '{"schemaVersion":1,"schemaVersion":1,"provenance":"captured","report":{}}',
      'duplicate.json',
    ),
  );
  expect(importer.getSnapshot().report).toBe(previous);
  expect(importer.getSnapshot().message).toMatch(/duplicate|JSON/i);
  await importer.select(importedFile(documentText('imported'), 'retry.json'));
  expect(importer.getSnapshot().report).toEqual(report());
  expect(importer.getSnapshot().message).toBeNull();
});

it('saves an imported record with local importedAt, imported origin and default retention', async () => {
  const { importer, store, notify } = controllerFixture();
  const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  await importer.select(importedFile(documentText('captured')));
  now.mockReturnValue(1_800_000_100_000);
  await importer.save();
  expect(store.saveCalls).toBe(1);
  expect(notify).toHaveBeenCalledTimes(1);
  const record = store.lastRecord;
  expect(record).not.toBeNull();
  if (!record) return;
  expect(record).toMatchObject({
    origin: 'imported',
    importedAt: 1_800_000_000_000,
    savedAt: 1_800_000_100_000,
  });
  expect(record.expiresAt - record.savedAt).toBe(30 * 24 * 60 * 60 * 1000);
  expect(serializeStoredRecord(record)).not.toContain('private-report-name');
  expect(serializeExchange(record)).toContain('"provenance":"imported"');
  expect(serializeExchange(record)).not.toContain('importedAt');
  expect(importer.getSnapshot()).toMatchObject({
    busy: false,
    message: expect.stringContaining('Saved imported report locally.'),
  });
  expect(importer.getSnapshot().report).not.toBeNull();
});

it('uses the selected 7, 30 or 90-day retention for an imported save', async () => {
  for (const days of [7, 30, 90] as const) {
    const { importer, store } = controllerFixture();
    await importer.select(importedFile(documentText()));
    importer.setRetentionDays(days);
    await importer.save();
    const record = store.lastRecord;
    expect(record).not.toBeNull();
    if (record)
      expect(record.expiresAt - record.savedAt).toBe(
        days * 24 * 60 * 60 * 1000,
      );
  }
});

it('keeps the view and writes nothing on storage, quota, time or size failure', async () => {
  for (const result of [
    'quota',
    'timeout',
    'unavailable',
    'records',
    'total',
    'exhausted',
    'duplicate',
  ] as const) {
    const { importer, store } = controllerFixture();
    await importer.select(importedFile(documentText()));
    store.saveResult = result;
    await importer.save();
    expect(store.saveCalls).toBe(1);
    expect(importer.getSnapshot().report).not.toBeNull();
    expect(importer.getSnapshot().busy).toBe(false);
    expect(importer.getSnapshot().message).toBeTruthy();
  }
});

it('retries an imported save after an ordinary storage failure', async () => {
  const { importer, store } = controllerFixture();
  await importer.select(importedFile(documentText()));
  store.saveResult = 'quota';
  await importer.save();
  expect(importer.getSnapshot().report).not.toBeNull();
  store.saveResult = 'saved';
  await importer.save();
  expect(store.records.size).toBe(1);
  expect(importer.getSnapshot().message).toContain(
    'Saved imported report locally.',
  );
});

it('makes a report view-only when the local envelope would exceed the stored-record cap', async () => {
  const entries: SavedReport['before']['extensions'] = [];
  for (let count = 200; count <= 260; count += 1) {
    const base = Array.from({ length: count }, () => ({
      name: '',
      version: '1',
      enabled: true,
    }));
    const candidate = report({
      before: { extensions: base },
      after: { extensions: [] },
      changes: [],
    });
    const baseBytes = new TextEncoder().encode(
      serializeExchange({
        schemaVersion: 1,
        origin: 'imported',
        report: candidate,
      }),
    ).byteLength;
    const target = SAVED_LIMITS.jsonBytes - 60;
    const needed = target - baseBytes;
    if (needed <= 0 || needed > count * SAVED_LIMITS.stringCodePoints) continue;
    const per = Math.floor(needed / count);
    const remainder = needed % count;
    for (let index = 0; index < count; index += 1) {
      const length = per + (index < remainder ? 1 : 0);
      entries.push({ name: 'x'.repeat(length), version: '1', enabled: true });
    }
    break;
  }
  expect(entries.length).toBeGreaterThan(0);
  const large = report({
    before: { extensions: entries },
    after: { extensions: [] },
    changes: [],
  });
  const text = JSON.stringify({
    schemaVersion: 1,
    provenance: 'captured',
    report: large,
  });
  expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(
    SAVED_LIMITS.jsonBytes,
  );
  const { importer, store } = controllerFixture();
  await importer.select(importedFile(text, 'boundary.json'));
  expect(importer.getSnapshot().report).not.toBeNull();
  expect(importer.getSnapshot().saveable).toBe(false);
  await importer.save();
  expect(store.saveCalls).toBe(0);
  expect(importer.getSnapshot().message).toMatch(/view-only|1 MiB/i);
  expect(importer.getSnapshot().report).not.toBeNull();
});

it('rejects a deletion epoch change while a save is pending and cannot resurrect a row', async () => {
  const { importer, store } = controllerFixture();
  await importer.select(importedFile(documentText()));
  store.saveGate = Promise.withResolvers<void>().promise;
  const held = Promise.withResolvers<void>();
  store.saveGate = held.promise;
  const pending = importer.save();
  await store.saveStarted.promise;
  store.state = { ...store.state, epoch: store.state.epoch + 1 };
  held.resolve();
  await pending;
  expect(store.records.size).toBe(0);
  expect(importer.getSnapshot().report).not.toBeNull();
  expect(importer.getSnapshot().message).toMatch(/storage changed|try saving/i);
});

it('binds the store barrier before a delayed first save context check', async () => {
  for (const change of ['deleteAll', 'replaceStore'] as const) {
    const { importer, store, api } = controllerFixture();
    await importer.select(importedFile(documentText()));
    const held =
      Promise.withResolvers<
        Awaited<ReturnType<SavedBrowser['tabs']['getCurrent']>>
      >();
    const contextStarted = Promise.withResolvers<void>();
    let firstSaveContext = true;
    api.tabs.getCurrent.mockImplementation(async () => {
      if (firstSaveContext) {
        firstSaveContext = false;
        contextStarted.resolve();
        return held.promise;
      }
      return { incognito: false };
    });

    const pending = importer.save();
    await contextStarted.promise;
    // The store identity/epoch must be bound before the first async context
    // check; otherwise a deletion can slip in and be adopted as the barrier.
    expect(store.readStateCalls).toBe(1);
    if (change === 'deleteAll') await store.deleteAll();
    else
      store.state = {
        ...store.state,
        storeId: 'replacement-store-identity-0123456789',
      };
    held.resolve({ incognito: false });
    await pending;

    expect(store.records.size).toBe(0);
    expect(importer.getSnapshot().report).not.toBeNull();
    expect(importer.getSnapshot().message).toMatch(
      /storage changed|try saving/i,
    );

    await importer.save();
    expect(store.records.size).toBe(1);
  }
});

it('fails closed when normal context is lost before an imported save commits', async () => {
  const { importer, store, context, api } = controllerFixture();
  await importer.select(importedFile(documentText()));
  context.mode = 'private';
  await importer.save();
  expect(store.saveCalls).toBe(0);
  expect(importer.getSnapshot().report).toBeNull();
  expect(importer.getSnapshot().message).toMatch(/normal windows/i);
  expect(api.tabs.getCurrent).toHaveBeenCalled();
});

it('clears pending imported work on suspension, disposal and clear', async () => {
  for (const action of ['suspend', 'dispose', 'clear'] as const) {
    const { importer, store } = controllerFixture();
    const held = Promise.withResolvers<ArrayBuffer>();
    const file: ReportImportFile = {
      name: 'held.json',
      size: 100,
      arrayBuffer: async () => held.promise,
    };
    const pending = importer.select(file);
    if (action === 'suspend') importer.suspend();
    if (action === 'dispose') importer.dispose();
    if (action === 'clear') importer.clear();
    held.resolve(new TextEncoder().encode(documentText()).buffer);
    await pending;
    expect(importer.getSnapshot().report).toBeNull();
    expect(importer.getSnapshot().busy).toBe(false);
    expect(store.saveCalls).toBe(0);
  }
});

it('clears pending imported work when the page is suspended during save', async () => {
  const { importer, store } = controllerFixture();
  await importer.select(importedFile(documentText()));
  const held = Promise.withResolvers<void>();
  store.saveGate = held.promise;
  const pending = importer.save();
  await store.saveStarted.promise;
  importer.suspend();
  held.resolve();
  await pending;
  expect(store.records.size).toBe(0);
  expect(importer.getSnapshot().report).toBeNull();
  expect(importer.getSnapshot().busy).toBe(false);
});

it('does not claim a save after disposal during a pending store write', async () => {
  const { importer, store, notify } = controllerFixture();
  await importer.select(importedFile(documentText()));
  const held = Promise.withResolvers<void>();
  store.saveGate = held.promise;
  const pending = importer.save();
  await store.saveStarted.promise;
  importer.dispose();
  held.resolve();
  await pending;
  expect(store.records.size).toBe(0);
  expect(notify).not.toHaveBeenCalled();
});

it('never touches a collection permission or a live investigation', async () => {
  const { importer, api } = controllerFixture();
  expect('permissions' in api).toBe(false);
  await importer.select(importedFile(documentText()));
  await importer.save();
  expect('permissions' in api).toBe(false);
});

it('imports without storage availability and leaves storage failure to the separate save', async () => {
  const { importer, store } = controllerFixture();
  store.readStateFailure = new Error('SECRET_STORAGE');
  await importer.select(importedFile(documentText()));
  expect(importer.getSnapshot().report).not.toBeNull();
  expect(importer.getSnapshot().busy).toBe(false);
  await importer.save();
  expect(store.saveCalls).toBe(0);
  expect(importer.getSnapshot().report).not.toBeNull();
  expect(importer.getSnapshot().message).not.toContain('SECRET');
});

it('ignores a superseded file read after clear and a newer selection', async () => {
  const { importer } = controllerFixture();
  const started = Promise.withResolvers<void>();
  const held = Promise.withResolvers<ArrayBuffer>();
  const first: ReportImportFile = {
    name: 'first.json',
    size: 100,
    arrayBuffer: async () => {
      started.resolve();
      return held.promise;
    },
  };
  const pending = importer.select(first);
  await started.promise;
  importer.clear();
  await importer.select(importedFile(documentText('imported'), 'second.json'));
  held.resolve(new TextEncoder().encode(documentText('captured')).buffer);
  await pending;
  expect(importer.getSnapshot().claimedProvenance).toBe('imported');
  expect(importer.getSnapshot().message).toBeNull();
});

it('fails closed when context changes while a selected file is being read', async () => {
  const { importer, context } = controllerFixture();
  const started = Promise.withResolvers<void>();
  const held = Promise.withResolvers<ArrayBuffer>();
  const file: ReportImportFile = {
    name: 'held.json',
    size: 100,
    arrayBuffer: async () => {
      started.resolve();
      return held.promise;
    },
  };
  const pending = importer.select(file);
  await started.promise;
  context.mode = 'private';
  held.resolve(new TextEncoder().encode(documentText()).buffer);
  await pending;
  expect(importer.getSnapshot().report).toBeNull();
  expect(importer.getSnapshot().message).toMatch(/normal windows/i);
});

it('does not replace an in-flight save with a later file selection', async () => {
  const { importer, store } = controllerFixture();
  await importer.select(importedFile(documentText('captured'), 'first.json'));
  const held = Promise.withResolvers<void>();
  store.saveGate = held.promise;
  const pending = importer.save();
  await store.saveStarted.promise;
  const readsBefore = store.readStateCalls;
  await importer.select(importedFile(documentText('imported'), 'second.json'));
  expect(store.readStateCalls).toBe(readsBefore);
  held.resolve();
  await pending;
  expect(store.records.size).toBe(1);
  expect([...store.records.values()][0]?.origin).toBe('imported');
});

it('keeps a resumed imported view empty after suspension', () => {
  const { importer } = controllerFixture();
  importer.suspend();
  expect(importer.getSnapshot().report).toBeNull();
  importer.resume();
  expect(importer.getSnapshot().report).toBeNull();
  expect(importer.getSnapshot().busy).toBe(false);
});

it('retries after a file read failure without losing the controller', async () => {
  const { importer } = controllerFixture();
  const failing: ReportImportFile = {
    name: 'unreadable.json',
    size: 100,
    arrayBuffer: async () => {
      throw new Error('SECRET_READ');
    },
  };
  await importer.select(failing);
  expect(importer.getSnapshot().report).toBeNull();
  expect(importer.getSnapshot().message).not.toContain('SECRET');
  await importer.select(importedFile(documentText()));
  expect(importer.getSnapshot().report).not.toBeNull();
});

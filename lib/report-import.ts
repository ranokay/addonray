import type { SavedBrowser } from './saved-context';
import { normalContext } from './saved-context';
import type { SavedReport } from './saved-record';
import {
  copyErrorSnapshot,
  createImportedRecord,
  exchangeBytes,
  inspectStoredRecord,
  isRetentionDays,
  recordLabel,
  SAVED_DEFAULT_RETENTION_DAYS,
  SAVED_LIMITS,
  storedRecordBytes,
  validateReport,
  type SavedRecord,
  type SavedRetentionDays,
} from './saved-record';
import { copyTimingSnapshot, exactKeys, isRecord } from './report-shape';
import {
  SavedStoreError,
  type SavedStore,
  type SavedStoreSaveResult,
} from './saved-store';
import type { Result } from './inspector';

export type ImportedProvenance = 'captured' | 'imported';

export interface ImportedReport {
  report: SavedReport;
  claimedProvenance: ImportedProvenance;
}

const forbiddenPropertyNames = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

class StrictJsonFailure extends Error {}

const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const digitPattern = /\d/;
const simpleEscapes: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

function fail(reason: string): never {
  throw new StrictJsonFailure(reason);
}

// This parser owns the import boundary rather than JSON.parse: JSON.parse
// silently keeps the last duplicate key and materializes prototype keys before
// a reviver can inspect them. The grammar and depth are bounded while reading.
class StrictJsonParser {
  private index = 0;
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  parse(): unknown {
    const value = this.parseValue(1);
    this.skipWhitespace();
    if (this.index !== this.text.length) fail('unexpected trailing content');
    return value;
  }

  private skipWhitespace() {
    while (this.index < this.text.length) {
      const code = this.text.charCodeAt(this.index);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d)
        this.index += 1;
      else return;
    }
  }

  private parseString(): string {
    if (this.text[this.index] !== '"') fail('expected a string');
    this.index += 1;
    let value = '';
    while (this.index < this.text.length) {
      const character = this.text[this.index]!;
      this.index += 1;
      if (character === '"') return value;
      if (character === '\\') {
        if (this.index >= this.text.length) fail('unterminated string escape');
        const escape = this.text[this.index]!;
        this.index += 1;
        if (escape === 'u') {
          const hex = this.text.slice(this.index, this.index + 4);
          if (!/^[0-9a-f]{4}$/i.test(hex)) fail('invalid Unicode escape');
          value += String.fromCharCode(Number.parseInt(hex, 16));
          this.index += 4;
          continue;
        }
        const mapped = simpleEscapes[escape];
        if (mapped === undefined) fail('invalid string escape');
        value += mapped;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) fail('unescaped control character');
      value += character;
    }
    fail('unterminated string');
  }

  private parseNumber(): number {
    numberPattern.lastIndex = this.index;
    const match = numberPattern.exec(this.text);
    if (!match) fail('invalid number');
    this.index = numberPattern.lastIndex;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail('non-finite number');
    return value;
  }

  private parseObject(depth: number): Record<string, unknown> {
    this.index += 1;
    const value = Object.create(null) as Record<string, unknown>;
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.text[this.index] === '}') {
      this.index += 1;
      return value;
    }
    while (true) {
      this.skipWhitespace();
      const key = this.parseString();
      if (forbiddenPropertyNames.has(key)) fail('forbidden property name');
      if (keys.has(key)) fail('duplicate property name');
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.index] !== ':') fail('expected a colon');
      this.index += 1;
      value[key] = this.parseValue(depth + 1);
      this.skipWhitespace();
      if (this.text[this.index] === ',') {
        this.index += 1;
        continue;
      }
      if (this.text[this.index] === '}') {
        this.index += 1;
        return value;
      }
      fail('expected a comma or closing brace');
    }
  }

  private parseArray(depth: number): unknown[] {
    this.index += 1;
    const value: unknown[] = [];
    this.skipWhitespace();
    if (this.text[this.index] === ']') {
      this.index += 1;
      return value;
    }
    while (true) {
      value.push(this.parseValue(depth + 1));
      this.skipWhitespace();
      if (this.text[this.index] === ',') {
        this.index += 1;
        continue;
      }
      if (this.text[this.index] === ']') {
        this.index += 1;
        return value;
      }
      fail('expected a comma or closing bracket');
    }
  }

  private parseValue(depth: number): unknown {
    if (depth > SAVED_LIMITS.depth) fail('nesting depth limit of 8');
    this.skipWhitespace();
    const character = this.text[this.index];
    if (character === '{') return this.parseObject(depth);
    if (character === '[') return this.parseArray(depth);
    if (character === '"') return this.parseString();
    if (
      character === '-' ||
      (character !== undefined && digitPattern.test(character))
    )
      return this.parseNumber();
    if (this.text.startsWith('true', this.index)) {
      this.index += 4;
      return true;
    }
    if (this.text.startsWith('false', this.index)) {
      this.index += 5;
      return false;
    }
    if (this.text.startsWith('null', this.index)) {
      this.index += 4;
      return null;
    }
    fail('unexpected token');
  }
}

// Copy only approved fields into ordinary data objects. The strict parser
// already rejects prototype keys, but a canonical copy keeps the imported model
// independent of the parsed container's prototype and property order.
function copyReport(value: SavedReport): SavedReport {
  return {
    before: {
      extensions: value.before.extensions.map((entry) => ({
        name: entry.name,
        version: entry.version,
        enabled: entry.enabled,
      })),
    },
    after: {
      extensions: value.after.extensions.map((entry) => ({
        name: entry.name,
        version: entry.version,
        enabled: entry.enabled,
      })),
    },
    changes: value.changes.map((change) => ({
      kind: change.kind,
      name: change.name,
      version: change.version,
      enabled: change.enabled,
    })),
    assessment: value.assessment,
    timing: {
      before: copyTimingSnapshot(value.timing.before),
      after: copyTimingSnapshot(value.timing.after),
    },
    pageErrors: {
      before: copyErrorSnapshot(value.pageErrors.before),
      after: copyErrorSnapshot(value.pageErrors.after),
    },
    observationLimits: {
      pageErrorWindowMs: value.observationLimits.pageErrorWindowMs,
      pageErrorEvents: value.observationLimits.pageErrorEvents,
      pageErrorSummaryBytes: value.observationLimits.pageErrorSummaryBytes,
    },
  };
}

export function parseImportedReport(bytes: Uint8Array): Result<ImportedReport> {
  if (bytes.byteLength > SAVED_LIMITS.jsonBytes)
    return {
      status: 'error',
      reason: 'The selected file exceeds the 1 MiB import limit.',
    };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return {
      status: 'error',
      reason: 'The selected file is not complete UTF-8.',
    };
  }
  let parsed: unknown;
  try {
    parsed = new StrictJsonParser(text).parse();
  } catch (error) {
    const detail =
      error instanceof StrictJsonFailure
        ? error.message
        : 'unknown parsing failure';
    return {
      status: 'error',
      reason: `The selected file is not valid JSON: ${detail}.`,
    };
  }
  return readImportedReport(parsed);
}

function readImportedReport(parsed: unknown): Result<ImportedReport> {
  if (
    !isRecord(parsed) ||
    !exactKeys(parsed, ['schemaVersion', 'provenance', 'report'])
  )
    return {
      status: 'error',
      reason:
        'The selected file does not match the schema version 1 top-level fields.',
    };
  if (parsed.schemaVersion !== 1)
    return {
      status: 'error',
      reason: Number.isSafeInteger(parsed.schemaVersion)
        ? 'Unsupported report schema version. Only version 1 is accepted.'
        : 'The report schema version must be the integer 1.',
    };
  const provenance = parsed.provenance;
  if (provenance !== 'captured' && provenance !== 'imported')
    return {
      status: 'error',
      reason: 'The report provenance must be captured or imported.',
    };
  const reportValue = parsed.report;
  if (!validateReport(reportValue))
    return {
      status: 'error',
      reason:
        'The selected file does not match the schema version 1 report fields and value rules.',
    };
  return {
    status: 'success',
    value: {
      report: copyReport(reportValue),
      claimedProvenance: provenance,
    },
  };
}

export interface ReportImportFile {
  readonly name?: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ReportImportSnapshot {
  report: SavedReport | null;
  claimedProvenance: ImportedProvenance | null;
  importedAt: number | null;
  busy: boolean;
  saveable: boolean;
  retentionDays: SavedRetentionDays;
  message: string | null;
}

export interface ReportImportNotifier {
  notify(): void;
}

const contextMessage =
  'Imported reports are available only in verified normal windows.';
const fileReadFailure =
  'The selected file could not be read. Try another file.';
const viewOnlyMessage =
  'This report is view-only because its complete stored record would exceed the 1 MiB limit including the local envelope.';
const storageMessage =
  'Saved storage is unavailable. The imported report was kept.';

function computedSaveable(
  report: SavedReport,
  importedAt: number,
  retentionDays: SavedRetentionDays,
) {
  const result = createImportedRecord(report, {
    now: Date.now(),
    recordId: '00000000-0000-0000-0000-000000000000',
    importedAt,
    retentionDays,
  });
  if (result.status !== 'success') return false;
  return (
    storedRecordBytes(result.value) <= SAVED_LIMITS.recordBytes &&
    exchangeBytes(result.value) <= SAVED_LIMITS.jsonBytes
  );
}

type PreparedImportedRecord =
  | { status: 'ready'; record: SavedRecord }
  | { status: 'view-only' }
  | { status: 'error'; reason: string };

function prepareImportedRecord(
  reportValue: SavedReport,
  importedAt: number,
  retentionDays: SavedRetentionDays,
): PreparedImportedRecord {
  const result = createImportedRecord(reportValue, {
    now: Date.now(),
    recordId: crypto.randomUUID(),
    importedAt,
    retentionDays,
  });
  if (result.status !== 'success')
    return { status: 'error', reason: result.reason };
  const record = result.value;
  if (
    storedRecordBytes(record) > SAVED_LIMITS.recordBytes ||
    exchangeBytes(record) > SAVED_LIMITS.jsonBytes
  )
    return { status: 'view-only' };
  if (inspectStoredRecord(record).status !== 'valid')
    return {
      status: 'error',
      reason: 'The imported record could not be validated.',
    };
  return { status: 'ready', record };
}

const saveResultMessages: Record<string, string> = {
  records:
    'The library already contains 50 saved records. Delete one before saving.',
  total:
    'The library would exceed its 5 MiB limit. Delete a saved record before saving.',
  exhausted:
    'Saved storage cannot accept another record because its deletion counter is exhausted.',
  quota: 'Browser storage quota was exceeded. The imported report was kept.',
  timeout: 'Saved storage did not respond. The imported report was kept.',
  cancelled: 'The save was cancelled. The imported report was kept.',
  duplicate:
    'A saved record with this ID already exists. The imported report was kept.',
};

export function createReportImport(
  api: SavedBrowser,
  store: SavedStore,
  notifier?: ReportImportNotifier,
) {
  let state: ReportImportSnapshot = {
    report: null,
    claimedProvenance: null,
    importedAt: null,
    busy: false,
    saveable: false,
    retentionDays: SAVED_DEFAULT_RETENTION_DAYS,
    message: null,
  };
  let live = true;
  let suspended = false;
  let operation = 0;
  let activeController: AbortController | null = null;
  const subscribers = new Set<() => void>();
  const publish = (next: ReportImportSnapshot) => {
    state = next;
    subscribers.forEach((subscriber) => subscriber());
  };
  const current = (ticket: number) =>
    live && !suspended && ticket === operation;
  const discard = (message: string | null) => {
    operation += 1;
    activeController?.abort();
    activeController = null;
    publish({
      ...state,
      report: null,
      claimedProvenance: null,
      importedAt: null,
      busy: false,
      saveable: false,
      message,
    });
  };
  const keep = (message: string) => publish({ ...state, busy: false, message });
  const verifyContext = async (ticket: number) => {
    if (!(await normalContext(api))) {
      if (current(ticket)) discard(contextMessage);
      return false;
    }
    return current(ticket);
  };
  const showViewOnly = () =>
    publish({
      ...state,
      busy: false,
      saveable: false,
      message: viewOnlyMessage,
    });

  return {
    getSnapshot: () => state,
    subscribe(subscriber: () => void) {
      if (!live) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    async select(file: ReportImportFile) {
      if (!live || suspended || state.busy) return;
      if (file.size > SAVED_LIMITS.jsonBytes) {
        keep('The selected file exceeds the 1 MiB import limit.');
        return;
      }
      const ticket = ++operation;
      publish({ ...state, busy: true, message: null });
      try {
        // Check the owning context before reading selected bytes. Import never
        // opens storage; the separate save owns all storage checks.
        if (!(await normalContext(api))) {
          if (current(ticket)) discard(contextMessage);
          return;
        }
        if (!current(ticket)) return;
        let buffer: ArrayBuffer;
        try {
          buffer = await file.arrayBuffer();
        } catch {
          if (current(ticket)) keep(fileReadFailure);
          return;
        }
        if (!current(ticket)) return;
        if (!(await normalContext(api))) {
          if (current(ticket)) discard(contextMessage);
          return;
        }
        if (!current(ticket)) return;
        const parsed = parseImportedReport(new Uint8Array(buffer));
        if (!current(ticket)) return;
        if (parsed.status !== 'success') {
          keep(parsed.reason);
          return;
        }
        const importedAt = Date.now();
        publish({
          ...state,
          report: parsed.value.report,
          claimedProvenance: parsed.value.claimedProvenance,
          importedAt,
          busy: false,
          saveable: computedSaveable(
            parsed.value.report,
            importedAt,
            state.retentionDays,
          ),
          message: null,
        });
      } catch {
        if (current(ticket)) keep(fileReadFailure);
      }
    },
    setRetentionDays(days: SavedRetentionDays) {
      if (!live || suspended || state.busy || !isRetentionDays(days)) return;
      publish({
        ...state,
        retentionDays: days,
        saveable:
          state.report && state.importedAt !== null
            ? computedSaveable(state.report, state.importedAt, days)
            : false,
      });
    },
    async save() {
      const reportValue = state.report;
      const importedAt = state.importedAt;
      if (
        !live ||
        suspended ||
        state.busy ||
        !reportValue ||
        importedAt === null
      )
        return;
      if (!state.saveable) {
        keep(viewOnlyMessage);
        return;
      }
      const ticket = ++operation;
      const controller = new AbortController();
      activeController = controller;
      const retentionDays = state.retentionDays;
      publish({ ...state, busy: true, message: null });
      try {
        // Bind the pending write to the current store identity and deletion
        // epoch before the first asynchronous context check. Otherwise a
        // delayed context response could let a delete commit first and this
        // save adopt the post-delete barrier.
        const expected = await store.readState();
        if (!current(ticket)) return;
        if (!(await verifyContext(ticket))) return;
        const prepared = prepareImportedRecord(
          reportValue,
          importedAt,
          retentionDays,
        );
        if (prepared.status === 'view-only') {
          showViewOnly();
          return;
        }
        if (prepared.status === 'error') {
          keep(prepared.reason);
          return;
        }
        const record = prepared.record;
        if (!(await verifyContext(ticket))) return;
        const result: SavedStoreSaveResult = await store.save(
          record,
          expected,
          controller.signal,
        );
        if (!current(ticket)) return;
        if (result === 'saved') {
          try {
            notifier?.notify();
          } catch {
            /* A liveness hint cannot turn a committed save into a failure. */
          }
          publish({
            ...state,
            busy: false,
            message: `Saved imported report locally. ${recordLabel(record)}`,
          });
          return;
        }
        if (result === 'stale' || result === 'stale-store') {
          keep('Saved storage changed. Try saving the imported report again.');
          return;
        }
        if (result === 'record') {
          showViewOnly();
          return;
        }
        keep(saveResultMessages[result] ?? storageMessage);
      } catch (error) {
        if (!current(ticket)) return;
        if (error instanceof SavedStoreError)
          keep(`${error.message} The imported report was kept.`);
        else keep(storageMessage);
      } finally {
        if (activeController === controller) activeController = null;
        if (live && !suspended && ticket === operation && state.busy)
          publish({ ...state, busy: false });
      }
    },
    clear() {
      if (!live) return;
      discard(null);
    },
    suspend() {
      if (!live || suspended) return;
      suspended = true;
      discard('Imported report cleared because this page was suspended.');
    },
    resume() {
      if (!live || !suspended) return;
      suspended = false;
    },
    dispose() {
      if (!live) return;
      live = false;
      suspended = false;
      discard(null);
      subscribers.clear();
    },
  };
}

export type ReportImport = ReturnType<typeof createReportImport>;

import type { SavedBrowser } from './saved-context';
import { normalContext } from './saved-context';
import type { SavedReport } from './saved-record';
import {
  createImportedRecord,
  exchangeBytes,
  inspectStoredRecord,
  isRetentionDays,
  recordLabel,
  SAVED_DEFAULT_RETENTION_DAYS,
  SAVED_LIMITS,
  storedRecordBytes,
  validateReport,
  type SavedRetentionDays,
} from './saved-record';
import {
  SavedStoreError,
  type SavedStore,
  type SavedStoreSaveResult,
} from './saved-store';
import type { Result, TimingMeasurement, TimingSnapshot } from './inspector';
import type { PageErrorSummary } from './page-error-check';

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

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: object, keys: readonly string[]) {
  const present = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    present.length === expected.length &&
    present.every((key, index) => key === expected[index])
  );
}

function fail(reason: string): never {
  throw new StrictJsonFailure(reason);
}

// This parser owns the import boundary rather than JSON.parse: JSON.parse
// silently keeps the last duplicate key and materializes prototype keys before
// a reviver can inspect them. The grammar and depth are bounded while reading.
function parseStrictJson(text: string): unknown {
  let index = 0;

  const skipWhitespace = () => {
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d)
        index += 1;
      else break;
    }
  };

  const parseString = (): string => {
    if (text[index] !== '"') fail('expected a string');
    index += 1;
    let value = '';
    while (index < text.length) {
      const character = text[index]!;
      index += 1;
      if (character === '"') return value;
      if (character === '\\') {
        if (index >= text.length) fail('unterminated string escape');
        const escape = text[index]!;
        index += 1;
        if (escape === '"') value += '"';
        else if (escape === '\\') value += '\\';
        else if (escape === '/') value += '/';
        else if (escape === 'b') value += '\b';
        else if (escape === 'f') value += '\f';
        else if (escape === 'n') value += '\n';
        else if (escape === 'r') value += '\r';
        else if (escape === 't') value += '\t';
        else if (escape === 'u') {
          const hex = text.slice(index, index + 4);
          if (!/^[0-9a-f]{4}$/i.test(hex)) fail('invalid Unicode escape');
          value += String.fromCharCode(Number.parseInt(hex, 16));
          index += 4;
        } else fail('invalid string escape');
        continue;
      }
      if (character.charCodeAt(0) < 0x20) fail('unescaped control character');
      value += character;
    }
    fail('unterminated string');
  };

  const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const parseNumber = (): number => {
    numberPattern.lastIndex = index;
    const match = numberPattern.exec(text);
    if (!match) fail('invalid number');
    index = numberPattern.lastIndex;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail('non-finite number');
    return value;
  };

  const parseObject = (depth: number): JsonObject => {
    index += 1;
    const value = Object.create(null) as JsonObject;
    const keys = new Set<string>();
    skipWhitespace();
    if (text[index] === '}') {
      index += 1;
      return value;
    }
    for (;;) {
      skipWhitespace();
      const key = parseString();
      if (forbiddenPropertyNames.has(key)) fail('forbidden property name');
      if (keys.has(key)) fail('duplicate property name');
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ':') fail('expected a colon');
      index += 1;
      value[key] = parseValue(depth + 1);
      skipWhitespace();
      if (text[index] === ',') {
        index += 1;
        continue;
      }
      if (text[index] === '}') {
        index += 1;
        return value;
      }
      fail('expected a comma or closing brace');
    }
  };

  const parseArray = (depth: number): unknown[] => {
    index += 1;
    const value: unknown[] = [];
    skipWhitespace();
    if (text[index] === ']') {
      index += 1;
      return value;
    }
    for (;;) {
      value.push(parseValue(depth + 1));
      skipWhitespace();
      if (text[index] === ',') {
        index += 1;
        continue;
      }
      if (text[index] === ']') {
        index += 1;
        return value;
      }
      fail('expected a comma or closing bracket');
    }
  };

  const parseValue = (depth: number): unknown => {
    if (depth > SAVED_LIMITS.depth) fail('nesting depth limit of 8');
    skipWhitespace();
    const character = text[index];
    if (character === '{') return parseObject(depth);
    if (character === '[') return parseArray(depth);
    if (character === '"') return parseString();
    if (character === '-' || (character !== undefined && /\d/.test(character)))
      return parseNumber();
    if (text.startsWith('true', index)) {
      index += 4;
      return true;
    }
    if (text.startsWith('false', index)) {
      index += 5;
      return false;
    }
    if (text.startsWith('null', index)) {
      index += 4;
      return null;
    }
    fail('unexpected token');
  };

  const value = parseValue(1);
  skipWhitespace();
  if (index !== text.length) fail('unexpected trailing content');
  return value;
}

function copyMeasurement(value: TimingMeasurement): TimingMeasurement {
  return value.status === 'measured'
    ? { status: 'measured', milliseconds: value.milliseconds }
    : { status: value.status };
}

function copyTiming(value: TimingSnapshot | null): TimingSnapshot | null {
  if (!value) return null;
  return {
    domContentLoaded: copyMeasurement(value.domContentLoaded),
    loadEvent: copyMeasurement(value.loadEvent),
    firstContentfulPaint: copyMeasurement(value.firstContentfulPaint),
  };
}

function copyError(value: PageErrorSummary | null): PageErrorSummary | null {
  if (!value) return null;
  return {
    scriptErrors: value.scriptErrors,
    unhandledRejections: value.unhandledRejections,
    total: value.total,
    finish: value.finish,
    observedMs: value.observedMs,
  };
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
      before: copyTiming(value.timing.before),
      after: copyTiming(value.timing.after),
    },
    pageErrors: {
      before: copyError(value.pageErrors.before),
      after: copyError(value.pageErrors.after),
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
    parsed = parseStrictJson(text);
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
        if (!(await normalContext(api))) {
          if (current(ticket)) discard(contextMessage);
          return;
        }
        if (!current(ticket)) return;
        const recordResult = createImportedRecord(reportValue, {
          now: Date.now(),
          recordId: crypto.randomUUID(),
          importedAt,
          retentionDays,
        });
        if (recordResult.status !== 'success') {
          keep(recordResult.reason);
          return;
        }
        const record = recordResult.value;
        if (
          storedRecordBytes(record) > SAVED_LIMITS.recordBytes ||
          exchangeBytes(record) > SAVED_LIMITS.jsonBytes
        ) {
          publish({
            ...state,
            busy: false,
            saveable: false,
            message: viewOnlyMessage,
          });
          return;
        }
        if (inspectStoredRecord(record).status !== 'valid') {
          keep('The imported record could not be validated.');
          return;
        }
        if (!(await normalContext(api))) {
          if (current(ticket)) discard(contextMessage);
          return;
        }
        if (!current(ticket)) return;
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
          publish({
            ...state,
            busy: false,
            saveable: false,
            message: viewOnlyMessage,
          });
          return;
        }
        if (result === 'records') {
          keep(
            'The library already contains 50 saved records. Delete one before saving.',
          );
          return;
        }
        if (result === 'total') {
          keep(
            'The library would exceed its 5 MiB limit. Delete a saved record before saving.',
          );
          return;
        }
        if (result === 'exhausted') {
          keep(
            'Saved storage cannot accept another record because its deletion counter is exhausted.',
          );
          return;
        }
        if (result === 'quota') {
          keep(
            'Browser storage quota was exceeded. The imported report was kept.',
          );
          return;
        }
        if (result === 'timeout') {
          keep('Saved storage did not respond. The imported report was kept.');
          return;
        }
        if (result === 'cancelled') {
          keep('The save was cancelled. The imported report was kept.');
          return;
        }
        if (result === 'duplicate') {
          keep(
            'A saved record with this ID already exists. The imported report was kept.',
          );
          return;
        }
        keep(storageMessage);
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

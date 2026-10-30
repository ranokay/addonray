import {
  compareInventories,
  pageAssessments,
  type InventorySnapshot,
  type PageAssessment,
} from './comparison';
import type { Result, TimingMeasurement, TimingSnapshot } from './inspector';
import type { Investigation } from './investigation';
import { pageErrorLimits, type PageErrorSummary } from './page-error-check';

export const SAVED_SCHEMA_VERSION = 1;
export const SAVED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SAVED_MAX_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const SAVED_LIMITS = {
  records: 50,
  totalBytes: 5 * 1024 * 1024,
  recordBytes: 1024 * 1024,
  jsonBytes: 1024 * 1024,
  inventoryEntries: 1000,
  changes: 2000,
  stringCodePoints: 4096,
  depth: 8,
} as const;

export interface SavedInventoryEntry {
  name: string;
  version: string;
  enabled: boolean;
}

export interface SavedChange extends SavedInventoryEntry {
  kind: 'added' | 'removed' | 'enabled' | 'disabled';
}

export interface SavedObservationLimits {
  pageErrorWindowMs: number;
  pageErrorEvents: number;
  pageErrorSummaryBytes: number;
}

export interface SavedReport {
  before: { extensions: SavedInventoryEntry[] };
  after: { extensions: SavedInventoryEntry[] };
  changes: SavedChange[];
  assessment: PageAssessment | null;
  timing: {
    before: TimingSnapshot | null;
    after: TimingSnapshot | null;
  };
  pageErrors: {
    before: PageErrorSummary | null;
    after: PageErrorSummary | null;
  };
  observationLimits: SavedObservationLimits;
}

export interface SavedRecord {
  schemaVersion: 1;
  recordId: string;
  origin: 'captured' | 'imported';
  savedAt: number;
  expiresAt: number;
  report: SavedReport;
}

export type StoredRecordInspection =
  | { status: 'valid'; record: SavedRecord }
  | { status: 'unsupported'; recordId: string | null }
  | { status: 'invalid'; recordId: string | null };

const encoder = new TextEncoder();
const recordIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const maxDateMilliseconds = 8_640_000_000_000_000;

type InvestigationState = ReturnType<Investigation['getSnapshot']>;

function codePoints(value: string) {
  return [...value].length;
}

function exactKeys(value: object, keys: readonly string[]) {
  const present = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    present.length === expected.length &&
    present.every((key, index) => key === expected[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown) {
  return (
    typeof value === 'string' &&
    codePoints(value) <= SAVED_LIMITS.stringCodePoints
  );
}

function withinDepth(value: unknown, depth = 1): boolean {
  if (depth > SAVED_LIMITS.depth) return false;
  if (Array.isArray(value))
    return value.every((item) => withinDepth(item, depth + 1));
  if (isRecord(value))
    return Object.values(value).every((item) => withinDepth(item, depth + 1));
  return true;
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

function entry(value: InventorySnapshot[number]): SavedInventoryEntry {
  return { name: value.name, version: value.version, enabled: value.enabled };
}

export function createSavedRecord(
  state: InvestigationState,
  options: { now: number; recordId: string },
): Result<SavedRecord> {
  if (
    state.busy !== null ||
    state.before?.status !== 'success' ||
    state.after?.status !== 'success'
  )
    return {
      status: 'unavailable',
      reason:
        'Capture both inventories and wait for any capture to finish before saving.',
    };
  const before = state.before.value;
  const after = state.after.value;
  if (
    before.length > SAVED_LIMITS.inventoryEntries ||
    after.length > SAVED_LIMITS.inventoryEntries
  )
    return {
      status: 'error',
      reason: 'An inventory exceeds the 1,000-entry archive limit.',
    };
  const changes = compareInventories(before, after);
  if (changes.length > SAVED_LIMITS.changes)
    return {
      status: 'error',
      reason:
        'The inventory change list exceeds the 2,000-entry archive limit.',
    };
  const report: SavedReport = {
    before: { extensions: before.map(entry) },
    after: { extensions: after.map(entry) },
    changes: changes.map((change) => ({
      kind: change.kind,
      ...entry(change.entry),
    })),
    assessment: state.assessment,
    timing: {
      before: copyTiming(state.timingBefore),
      after: copyTiming(state.timingAfter),
    },
    pageErrors: {
      before: copyError(state.errorBefore),
      after: copyError(state.errorAfter),
    },
    observationLimits: {
      pageErrorWindowMs: pageErrorLimits.durationMs,
      pageErrorEvents: pageErrorLimits.events,
      pageErrorSummaryBytes: pageErrorLimits.summaryBytes,
    },
  };
  return {
    status: 'success',
    value: {
      schemaVersion: SAVED_SCHEMA_VERSION,
      recordId: options.recordId,
      origin: 'captured',
      savedAt: options.now,
      expiresAt: options.now + SAVED_RETENTION_MS,
      report,
    },
  };
}

export function serializeStoredRecord(record: SavedRecord) {
  return JSON.stringify({
    schemaVersion: record.schemaVersion,
    recordId: record.recordId,
    origin: record.origin,
    savedAt: record.savedAt,
    expiresAt: record.expiresAt,
    report: record.report,
  });
}

export function serializeExchange(record: SavedRecord) {
  return JSON.stringify({
    schemaVersion: record.schemaVersion,
    provenance: record.origin,
    report: record.report,
  });
}

export function byteLength(text: string) {
  return encoder.encode(text).length;
}

export function storedRecordBytes(record: SavedRecord) {
  return byteLength(serializeStoredRecord(record));
}

export function exchangeBytes(record: SavedRecord) {
  return byteLength(serializeExchange(record));
}

function validateEntry(value: unknown): value is SavedInventoryEntry {
  return (
    isRecord(value) &&
    exactKeys(value, ['name', 'version', 'enabled']) &&
    boundedString(value.name) &&
    boundedString(value.version) &&
    typeof value.enabled === 'boolean'
  );
}

function validateExtensions(value: unknown) {
  return (
    isRecord(value) &&
    exactKeys(value, ['extensions']) &&
    Array.isArray(value.extensions) &&
    value.extensions.length <= SAVED_LIMITS.inventoryEntries &&
    value.extensions.every(validateEntry)
  );
}

function validateChange(value: unknown): value is SavedChange {
  return (
    isRecord(value) &&
    exactKeys(value, ['kind', 'name', 'version', 'enabled']) &&
    (value.kind === 'added' ||
      value.kind === 'removed' ||
      value.kind === 'enabled' ||
      value.kind === 'disabled') &&
    boundedString(value.name) &&
    boundedString(value.version) &&
    typeof value.enabled === 'boolean'
  );
}

function validateMeasurement(value: unknown, eventEnd: boolean) {
  if (!isRecord(value) || !('status' in value)) return false;
  if (value.status === 'unavailable') return exactKeys(value, ['status']);
  if (value.status === 'unrecorded')
    return eventEnd && exactKeys(value, ['status']);
  return (
    value.status === 'measured' &&
    exactKeys(value, ['status', 'milliseconds']) &&
    typeof value.milliseconds === 'number' &&
    Number.isFinite(value.milliseconds) &&
    value.milliseconds >= 0 &&
    (!eventEnd || value.milliseconds > 0) &&
    value.milliseconds <= Number.MAX_SAFE_INTEGER
  );
}

function validateTiming(value: unknown): value is TimingSnapshot {
  return (
    isRecord(value) &&
    exactKeys(value, [
      'domContentLoaded',
      'loadEvent',
      'firstContentfulPaint',
    ]) &&
    validateMeasurement(value.domContentLoaded, true) &&
    validateMeasurement(value.loadEvent, true) &&
    validateMeasurement(value.firstContentfulPaint, false)
  );
}

function validateError(value: unknown): value is PageErrorSummary {
  return (
    isRecord(value) &&
    exactKeys(value, [
      'scriptErrors',
      'unhandledRejections',
      'total',
      'finish',
      'observedMs',
    ]) &&
    Number.isSafeInteger(value.scriptErrors) &&
    Number.isSafeInteger(value.unhandledRejections) &&
    Number.isSafeInteger(value.total) &&
    (value.scriptErrors as number) >= 0 &&
    (value.unhandledRejections as number) >= 0 &&
    (value.scriptErrors as number) <= pageErrorLimits.events &&
    (value.unhandledRejections as number) <= pageErrorLimits.events &&
    value.total ===
      (value.scriptErrors as number) + (value.unhandledRejections as number) &&
    (value.total as number) <= pageErrorLimits.events &&
    (value.finish === 'stop' ||
      value.finish === 'timeout' ||
      value.finish === 'limit') &&
    typeof value.observedMs === 'number' &&
    Number.isFinite(value.observedMs) &&
    value.observedMs >= 0 &&
    value.observedMs <= pageErrorLimits.durationMs
  );
}

function validateReport(value: unknown): value is SavedReport {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'before',
      'after',
      'changes',
      'assessment',
      'timing',
      'pageErrors',
      'observationLimits',
    ])
  )
    return false;
  if (
    !validateExtensions(value.before) ||
    !validateExtensions(value.after) ||
    !Array.isArray(value.changes) ||
    value.changes.length > SAVED_LIMITS.changes ||
    !value.changes.every(validateChange) ||
    !(
      value.assessment === null ||
      pageAssessments.includes(value.assessment as PageAssessment)
    )
  )
    return false;
  const timing = value.timing;
  if (
    !isRecord(timing) ||
    !exactKeys(timing, ['before', 'after']) ||
    !(timing.before === null || validateTiming(timing.before)) ||
    !(timing.after === null || validateTiming(timing.after))
  )
    return false;
  const errors = value.pageErrors;
  if (
    !isRecord(errors) ||
    !exactKeys(errors, ['before', 'after']) ||
    !(errors.before === null || validateError(errors.before)) ||
    !(errors.after === null || validateError(errors.after))
  )
    return false;
  const limits = value.observationLimits;
  return (
    isRecord(limits) &&
    exactKeys(limits, [
      'pageErrorWindowMs',
      'pageErrorEvents',
      'pageErrorSummaryBytes',
    ]) &&
    limits.pageErrorWindowMs === pageErrorLimits.durationMs &&
    limits.pageErrorEvents === pageErrorLimits.events &&
    limits.pageErrorSummaryBytes === pageErrorLimits.summaryBytes
  );
}

export function inspectStoredRecord(value: unknown): StoredRecordInspection {
  const recordId =
    isRecord(value) && typeof value.recordId === 'string'
      ? value.recordId
      : null;
  try {
    if (!isRecord(value)) return { status: 'invalid', recordId };
    if (
      'schemaVersion' in value &&
      Number.isSafeInteger(value.schemaVersion) &&
      value.schemaVersion !== SAVED_SCHEMA_VERSION
    )
      return { status: 'unsupported', recordId };
    if (
      !exactKeys(value, [
        'schemaVersion',
        'recordId',
        'origin',
        'savedAt',
        'expiresAt',
        'report',
      ]) ||
      value.schemaVersion !== SAVED_SCHEMA_VERSION ||
      typeof value.recordId !== 'string' ||
      !recordIdPattern.test(value.recordId) ||
      (value.origin !== 'captured' && value.origin !== 'imported') ||
      !Number.isSafeInteger(value.savedAt) ||
      !Number.isSafeInteger(value.expiresAt) ||
      (value.savedAt as number) < 0 ||
      (value.savedAt as number) > maxDateMilliseconds ||
      (value.expiresAt as number) > maxDateMilliseconds ||
      (value.expiresAt as number) <= (value.savedAt as number) ||
      (value.expiresAt as number) - (value.savedAt as number) >
        SAVED_MAX_RETENTION_MS ||
      !withinDepth(value) ||
      !validateReport(value.report)
    )
      return { status: 'invalid', recordId };
    return { status: 'valid', record: value as unknown as SavedRecord };
  } catch {
    return { status: 'invalid', recordId };
  }
}

export function isExpired(record: SavedRecord, now: number) {
  return record.expiresAt <= now;
}

export function recordLabel(record: SavedRecord) {
  const assessment =
    record.report.assessment === null
      ? 'No assessment'
      : record.report.assessment.charAt(0).toUpperCase() +
        record.report.assessment.slice(1);
  const date = new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(record.savedAt));
  return `${date} · ${assessment} · ${record.recordId.slice(0, 8)}`;
}

export interface SavePlan {
  cleanupIds: string[];
  count: number;
  totalBytes: number;
  outcome: 'ok' | 'records' | 'record' | 'total';
}

export function planSave(
  existing: readonly unknown[],
  candidateBytes: number,
  now: number,
  limits = SAVED_LIMITS,
): SavePlan {
  const cleanupIds: string[] = [];
  let count = 0;
  let totalBytes = 0;
  for (const raw of existing) {
    const inspection = inspectStoredRecord(raw);
    if (inspection.status === 'valid') {
      if (isExpired(inspection.record, now)) {
        cleanupIds.push(inspection.record.recordId);
        continue;
      }
      count += 1;
      totalBytes += storedRecordBytes(inspection.record);
      continue;
    }
    count += 1;
    try {
      totalBytes += byteLength(JSON.stringify(raw));
    } catch {
      totalBytes = limits.totalBytes + 1;
    }
  }
  if (count >= limits.records)
    return { cleanupIds, count, totalBytes, outcome: 'records' };
  if (candidateBytes > limits.recordBytes)
    return { cleanupIds, count, totalBytes, outcome: 'record' };
  if (totalBytes + candidateBytes > limits.totalBytes)
    return { cleanupIds, count, totalBytes, outcome: 'total' };
  return { cleanupIds, count, totalBytes, outcome: 'ok' };
}
